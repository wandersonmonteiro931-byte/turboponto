import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Lock, Unlock, CheckCircle2, AlertTriangle } from "lucide-react";
import { carregarCartao, NOMES_MES, formatMin } from "@/lib/cartao";

export const Route = createFileRoute("/app/empresa/fechamento")({
  component: FechamentoPage,
});

type Func = { id: string; nome: string };
type Linha = { func: Func; atraso: number; faltas: number; trab: number; ext: number; pendencias: number; status: string };

function FechamentoPage() {
  const { empresaId, role, user } = useAuth();
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [funcs, setFuncs] = useState<Func[]>([]);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [loading, setLoading] = useState(false);
  const [fech, setFech] = useState<{ id: string; status: string; fechado_em: string | null } | null>(null);

  const podeAdmin = role === "admin";

  const carregar = async () => {
    if (!empresaId) return;
    setLoading(true);
    const [{ data: fs }, { data: fechData }] = await Promise.all([
      supabase.from("funcionarios").select("id,nome").eq("empresa_id", empresaId).eq("status", "ativo").order("nome"),
      supabase.from("fechamentos_mensais").select("id,status,fechado_em").eq("empresa_id", empresaId).eq("ano_referencia", ano).eq("mes_referencia", mes).maybeSingle(),
    ]);
    setFuncs((fs ?? []) as Func[]);
    setFech((fechData ?? null) as typeof fech);

    const ids = (fs ?? []).map((f) => f.id);
    const { data: cartoes } = await supabase.from("cartoes_ponto")
      .select("funcionario_id,status,total_atraso_minutos,total_faltas,total_horas_trabalhadas_minutos,total_horas_extras_minutos")
      .eq("empresa_id", empresaId).eq("ano_referencia", ano).eq("mes_referencia", mes).in("funcionario_id", ids);
    const mapCart = new Map((cartoes ?? []).map((c) => [c.funcionario_id, c]));

    const linhas: Linha[] = [];
    for (const f of (fs ?? []) as Func[]) {
      const cart = mapCart.get(f.id);
      if (cart) {
        linhas.push({
          func: f, atraso: cart.total_atraso_minutos, faltas: cart.total_faltas,
          trab: cart.total_horas_trabalhadas_minutos, ext: cart.total_horas_extras_minutos,
          pendencias: 0, status: cart.status,
        });
      } else {
        const r = await carregarCartao(f.id, ano, mes);
        const pendencias = r.dias.filter((d) => d.trabalha && !d.falta && (!d.registrado.entrada || !d.registrado.saida_final)).length;
        linhas.push({
          func: f, atraso: r.totalAtraso, faltas: r.totalFaltas, trab: r.totalTrabalhado, ext: r.totalExtras,
          pendencias, status: "aberto",
        });
      }
    }
    setLinhas(linhas);
    setLoading(false);
  };

  useEffect(() => { carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [empresaId, ano, mes]);

  const upsertCartao = async (l: Linha, status: "fechado" | "liberado" | "aberto") => {
    if (!empresaId) return;
    await supabase.from("cartoes_ponto").upsert({
      empresa_id: empresaId, funcionario_id: l.func.id, ano_referencia: ano, mes_referencia: mes,
      total_atraso_minutos: l.atraso, total_faltas: l.faltas,
      total_horas_trabalhadas_minutos: l.trab, total_horas_extras_minutos: l.ext,
      status,
      fechado_em: status === "fechado" || status === "liberado" ? new Date().toISOString() : null,
      liberado_em: status === "liberado" ? new Date().toISOString() : null,
    }, { onConflict: "funcionario_id,ano_referencia,mes_referencia" });
  };

  const fecharIndividual = async (l: Linha) => {
    await upsertCartao(l, "fechado");
    toast.success(`Cartão de ${l.func.nome} fechado.`);
    carregar();
  };

  const fecharTodos = async () => {
    if (!podeAdmin || !empresaId || !user) return;
    if (linhas.some((l) => l.pendencias > 0)) {
      if (!confirm("Existem pendências de ponto. Deseja fechar mesmo assim?")) return;
    }
    await Promise.all(linhas.filter((l) => l.status === "aberto").map((l) => upsertCartao(l, "fechado")));
    await supabase.from("fechamentos_mensais").upsert({
      empresa_id: empresaId, ano_referencia: ano, mes_referencia: mes,
      status: "fechado", fechado_por: user.id, fechado_em: new Date().toISOString(),
    }, { onConflict: "empresa_id,ano_referencia,mes_referencia" });
    toast.success("Mês fechado.");
    carregar();
  };

  const liberarTodos = async () => {
    if (!podeAdmin || !empresaId) return;
    await Promise.all(linhas.map((l) => upsertCartao(l, "liberado")));
    await supabase.from("fechamentos_mensais").upsert({
      empresa_id: empresaId, ano_referencia: ano, mes_referencia: mes,
      status: "liberado", liberado_em: new Date().toISOString(),
    }, { onConflict: "empresa_id,ano_referencia,mes_referencia" });
    toast.success("Cartões liberados para os funcionários.");
    carregar();
  };

  const reabrirMes = async () => {
    if (!podeAdmin || !empresaId || !user) return;
    if (!confirm("Reabrir o mês permitirá ajustes. Deseja continuar?")) return;
    await Promise.all(linhas.map((l) => upsertCartao(l, "aberto")));
    await supabase.from("fechamentos_mensais").upsert({
      empresa_id: empresaId, ano_referencia: ano, mes_referencia: mes,
      status: "aberto", reaberto_por: user.id, reaberto_em: new Date().toISOString(),
      fechado_em: null, liberado_em: null,
    }, { onConflict: "empresa_id,ano_referencia,mes_referencia" });
    toast.success("Mês reaberto.");
    carregar();
  };

  if (!empresaId) return <p className="text-sm text-muted-foreground">Cadastre primeiro a empresa.</p>;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Fechamento mensal</h2>
        <p className="text-sm text-muted-foreground">Fechar, liberar e reabrir o mês de todos os funcionários.</p>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap gap-3 items-end">
          <div>
            <Label className="text-xs">Mês</Label>
            <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>{NOMES_MES.map((n, i) => <SelectItem key={i} value={String(i + 1)}>{n}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Ano</Label>
            <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>{[hoje.getFullYear(), hoje.getFullYear() - 1, hoje.getFullYear() - 2].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Status do mês:</span>
            <span className={`text-xs uppercase font-bold px-2 py-1 rounded ${fech?.status === "liberado" ? "bg-green-500/20 text-green-700" : fech?.status === "fechado" ? "bg-blue-500/20 text-blue-700" : "bg-muted text-muted-foreground"}`}>
              {fech?.status ?? "aberto"}
            </span>
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            {podeAdmin && (fech?.status === "aberto" || !fech) && (
              <Button onClick={fecharTodos}><Lock className="h-4 w-4 mr-1" />Fechar mês</Button>
            )}
            {podeAdmin && fech?.status === "fechado" && (
              <Button onClick={liberarTodos}><CheckCircle2 className="h-4 w-4 mr-1" />Liberar para funcionários</Button>
            )}
            {podeAdmin && (fech?.status === "fechado" || fech?.status === "liberado") && (
              <Button variant="outline" onClick={reabrirMes}><Unlock className="h-4 w-4 mr-1" />Reabrir mês</Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div> :
            funcs.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">Nenhum funcionário ativo.</div> :
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-2 text-left">Funcionário</th>
                  <th className="p-2 text-left">Status</th>
                  <th className="p-2 text-left">Pendências</th>
                  <th className="p-2 text-left">Atraso</th>
                  <th className="p-2 text-left">Faltas</th>
                  <th className="p-2 text-left">Trabalhadas</th>
                  <th className="p-2 text-left">Extras</th>
                  <th className="p-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {linhas.map((l) => (
                  <tr key={l.func.id}>
                    <td className="p-2 font-medium">{l.func.nome}</td>
                    <td className="p-2">
                      <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${l.status === "liberado" ? "bg-green-500/20 text-green-700" : l.status === "fechado" ? "bg-blue-500/20 text-blue-700" : "bg-muted"}`}>{l.status}</span>
                    </td>
                    <td className="p-2">
                      {l.pendencias > 0 ? <span className="inline-flex items-center gap-1 text-orange-600"><AlertTriangle className="h-3 w-3" />{l.pendencias}</span> : "—"}
                    </td>
                    <td className="p-2">{l.atraso} min</td>
                    <td className="p-2">{l.faltas}</td>
                    <td className="p-2">{formatMin(l.trab)}</td>
                    <td className="p-2 text-orange-600">{formatMin(l.ext)}</td>
                    <td className="p-2 text-right">
                      {podeAdmin && l.status === "aberto" && (
                        <Button size="sm" variant="outline" onClick={() => fecharIndividual(l)}><Lock className="h-3 w-3 mr-1" />Fechar</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        </CardContent>
      </Card>
    </div>
  );
}
