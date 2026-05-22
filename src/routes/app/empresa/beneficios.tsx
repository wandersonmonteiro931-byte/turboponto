import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  STATUS_BENEFICIO, fmtBRL, mesNome, recalcularMes,
  type Beneficio,
} from "@/lib/beneficios";
import { AlertCircle, CheckCircle2, FileText, RefreshCw, Truck } from "lucide-react";

export const Route = createFileRoute("/app/empresa/beneficios")({
  component: BeneficiosPage,
});

type Func = { id: string; nome: string; cargo: string | null };

type LinhaCalc = {
  id: string;
  funcionario_id: string;
  total_atraso_minutos: number;
  dias_com_atraso: number;
  faltas_injustificadas: number;
  tem_direito: boolean;
  status: string;
  motivo_perda: string | null;
  valor_estimado: number;
  funcionarios: { nome: string; cargo: string | null } | null;
};

function BeneficiosPage() {
  const { empresaId, role, user } = useAuth();
  const podeEditar = role === "admin" || role === "gerente";
  const ehAdmin = role === "admin";

  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());
  const [funcionarioId, setFuncionarioId] = useState("todos");
  const [filtroStatus, setFiltroStatus] = useState("todos");

  const [funcs, setFuncs] = useState<Func[]>([]);
  const [beneficios, setBeneficios] = useState<Beneficio[]>([]);
  const [beneficioId, setBeneficioId] = useState<string>("");
  const [calculos, setCalculos] = useState<LinhaCalc[]>([]);
  const [loading, setLoading] = useState(true);
  const [recalculando, setRecalculando] = useState(false);
  const [novoOpen, setNovoOpen] = useState(false);

  useEffect(() => {
    if (!empresaId) return;
    void (async () => {
      const [{ data: f }, { data: b }] = await Promise.all([
        supabase.from("funcionarios").select("id,nome,cargo").eq("empresa_id", empresaId).order("nome"),
        supabase.from("beneficios").select("*").eq("empresa_id", empresaId).order("created_at"),
      ]);
      setFuncs((f ?? []) as Func[]);
      setBeneficios((b ?? []) as Beneficio[]);
      if (b && b.length > 0 && !beneficioId) setBeneficioId(b[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  const beneficioAtual = useMemo(
    () => beneficios.find((b) => b.id === beneficioId) ?? null,
    [beneficios, beneficioId],
  );

  const carregar = async () => {
    if (!empresaId || !beneficioId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("beneficios_calculos")
      .select("id,funcionario_id,total_atraso_minutos,dias_com_atraso,faltas_injustificadas,tem_direito,status,motivo_perda,valor_estimado,funcionarios(nome,cargo)")
      .eq("empresa_id", empresaId)
      .eq("beneficio_id", beneficioId)
      .eq("mes_referencia", mes)
      .eq("ano_referencia", ano);
    if (error) toast.error(error.message);
    setCalculos((data ?? []) as unknown as LinhaCalc[]);
    setLoading(false);
  };

  useEffect(() => { void carregar(); /* eslint-disable-next-line */ }, [empresaId, beneficioId, mes, ano]);

  const recalcular = async () => {
    if (!empresaId || !beneficioAtual) return;
    setRecalculando(true);
    try {
      const r = await recalcularMes(empresaId, beneficioAtual, mes, ano);
      toast.success(`${r.atualizados} cálculo(s) atualizado(s)`);
      await carregar();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao recalcular");
    } finally {
      setRecalculando(false);
    }
  };

  const mudarStatus = async (linha: LinhaCalc, novoStatus: string, justificativa: string) => {
    if (!empresaId || !user) return;
    const anterior = linha.status;
    const { error } = await supabase.from("beneficios_calculos")
      .update({ status: novoStatus })
      .eq("id", linha.id);
    if (error) return toast.error(error.message);

    await supabase.from("beneficios_logs").insert({
      empresa_id: empresaId,
      funcionario_id: linha.funcionario_id,
      beneficio_id: beneficioId,
      usuario_id: user.id,
      acao: `status: ${anterior} -> ${novoStatus}`,
      status_anterior: anterior,
      status_novo: novoStatus,
      justificativa,
    });

    if (novoStatus === "entregue") {
      await supabase.from("beneficios_entregas").upsert({
        empresa_id: empresaId,
        funcionario_id: linha.funcionario_id,
        beneficio_id: beneficioId,
        mes_referencia: mes,
        ano_referencia: ano,
        data_entrega: new Date().toISOString().slice(0, 10),
        valor_estimado: linha.valor_estimado,
        entregue: true,
        entregue_por: user.id,
        observacao: justificativa,
      }, { onConflict: "funcionario_id,beneficio_id,mes_referencia,ano_referencia" });
    }

    toast.success("Atualizado");
    await carregar();
  };

  const linhasFiltradas = useMemo(() => {
    return calculos.filter((c) => {
      if (funcionarioId !== "todos" && c.funcionario_id !== funcionarioId) return false;
      if (filtroStatus === "todos") return true;
      if (filtroStatus === "tem_direito") return c.tem_direito;
      if (filtroStatus === "nao_tem_direito") return !c.tem_direito;
      if (filtroStatus === "proximo_limite") {
        return beneficioAtual
          ? c.total_atraso_minutos >= beneficioAtual.limite_alerta_minutos &&
            c.total_atraso_minutos <= beneficioAtual.limite_atraso_minutos
          : false;
      }
      return c.status === filtroStatus;
    });
  }, [calculos, funcionarioId, filtroStatus, beneficioAtual]);

  const totais = useMemo(() => {
    const total = calculos.length;
    const comDireito = calculos.filter((c) => c.tem_direito).length;
    const semDireito = total - comDireito;
    const proximos = beneficioAtual
      ? calculos.filter((c) => c.total_atraso_minutos >= beneficioAtual.limite_alerta_minutos && c.total_atraso_minutos <= beneficioAtual.limite_atraso_minutos).length
      : 0;
    const aEntregar = calculos.filter((c) => c.status === "liberado").length;
    return { total, comDireito, semDireito, proximos, aEntregar };
  }, [calculos, beneficioAtual]);

  const diaEntrega = beneficioAtual
    ? new Date(ano, mes - 1, beneficioAtual.dia_entrega).toLocaleDateString("pt-BR")
    : "—";

  if (!empresaId) return <p className="text-sm text-muted-foreground">Cadastre primeiro os dados da empresa.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold">Benefícios</h2>
          <p className="text-sm text-muted-foreground">Controle de cesta básica por assiduidade e demais benefícios.</p>
        </div>
        {ehAdmin && <Button onClick={() => setNovoOpen(true)}>Novo benefício</Button>}
      </div>

      {/* Seleção benefício/mês/ano */}
      <Card>
        <CardContent className="p-4 grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Fld label="Benefício">
            <Select value={beneficioId} onValueChange={setBeneficioId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {beneficios.map((b) => <SelectItem key={b.id} value={b.id}>{b.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </Fld>
          <Fld label="Mês">
            <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) =>
                  <SelectItem key={m} value={String(m)}>{mesNome(m)}</SelectItem>)}
              </SelectContent>
            </Select>
          </Fld>
          <Fld label="Ano">
            <Input type="number" value={ano} onChange={(e) => setAno(Number(e.target.value))} />
          </Fld>
          <Fld label="Funcionário">
            <Select value={funcionarioId} onValueChange={setFuncionarioId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {funcs.map((f) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </Fld>
          <Fld label="Status">
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="tem_direito">Com direito</SelectItem>
                <SelectItem value="nao_tem_direito">Sem direito</SelectItem>
                <SelectItem value="proximo_limite">Próximo do limite</SelectItem>
                <SelectItem value="liberado">Liberado</SelectItem>
                <SelectItem value="entregue">Entregue</SelectItem>
              </SelectContent>
            </Select>
          </Fld>
        </CardContent>
      </Card>

      {/* Resumo do benefício */}
      {beneficioAtual && (
        <Card>
          <CardContent className="p-4 grid sm:grid-cols-4 gap-3">
            <Resumo label="Limite de atraso" value={`${beneficioAtual.limite_atraso_minutos} min`} hint={`Alerta: ${beneficioAtual.limite_alerta_minutos} min`} />
            <Resumo label="Valor máximo" value={fmtBRL(beneficioAtual.valor_maximo)} />
            <Resumo label="Data prevista" value={diaEntrega} hint={`Dia ${beneficioAtual.dia_entrega} do mês`} />
            <div className="flex items-end">
              <Button onClick={recalcular} disabled={recalculando} variant="outline" className="w-full">
                <RefreshCw className={`h-4 w-4 mr-2 ${recalculando ? "animate-spin" : ""}`} />
                Recalcular mês
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Alertas */}
      {beneficioAtual && totais.proximos > 0 && (
        <Alerta tone="amber" icon={<AlertCircle className="h-4 w-4" />}
          texto={`${totais.proximos} funcionário(s) próximo(s) do limite de atraso.`} />
      )}
      {beneficioAtual && totais.aEntregar > 0 && (
        <Alerta tone="blue" icon={<Truck className="h-4 w-4" />}
          texto={`${totais.aEntregar} cesta(s) liberada(s) aguardando entrega.`} />
      )}
      {beneficioAtual && hoje.getDate() >= beneficioAtual.dia_entrega && totais.aEntregar > 0 && (
        <Alerta tone="red" icon={<AlertCircle className="h-4 w-4" />}
          texto={`Dia ${beneficioAtual.dia_entrega} chegou e ainda há cestas pendentes.`} />
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Stat label="Funcionários" value={totais.total} />
        <Stat label="Com direito" value={totais.comDireito} color="text-green-600" />
        <Stat label="Sem direito" value={totais.semDireito} color="text-red-600" />
        <Stat label="Próx. limite" value={totais.proximos} color="text-amber-600" />
        <Stat label="A entregar" value={totais.aEntregar} color="text-blue-600" />
      </div>

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div>
          ) : linhasFiltradas.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground space-y-2">
              <p>Nenhum cálculo para esse período.</p>
              {podeEditar && <Button size="sm" onClick={recalcular}>Calcular agora</Button>}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left p-2">Funcionário</th>
                    <th className="text-left p-2">Cargo</th>
                    <th className="text-left p-2">Atraso (min)</th>
                    <th className="text-left p-2">Dias c/ atraso</th>
                    <th className="text-left p-2">Faltas inj.</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Valor</th>
                    <th className="text-left p-2">Motivo</th>
                    {podeEditar && <th className="text-right p-2">Ações</th>}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {linhasFiltradas.map((c) => {
                    const st = STATUS_BENEFICIO[c.status] ?? { label: c.status, color: "bg-muted" };
                    const proxLimite = beneficioAtual && c.total_atraso_minutos >= beneficioAtual.limite_alerta_minutos && c.total_atraso_minutos <= beneficioAtual.limite_atraso_minutos;
                    return (
                      <tr key={c.id} className="hover:bg-muted/30">
                        <td className="p-2 font-medium">{c.funcionarios?.nome ?? "—"}</td>
                        <td className="p-2 text-muted-foreground">{c.funcionarios?.cargo ?? "—"}</td>
                        <td className={`p-2 font-mono ${proxLimite ? "text-amber-600 font-bold" : ""}`}>
                          {c.total_atraso_minutos}
                          {proxLimite && <span className="ml-1 text-[10px]">⚠</span>}
                        </td>
                        <td className="p-2">{c.dias_com_atraso}</td>
                        <td className="p-2">{c.faltas_injustificadas}</td>
                        <td className="p-2">
                          <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${st.color}`}>{st.label}</span>
                        </td>
                        <td className="p-2 font-mono">{fmtBRL(c.valor_estimado)}</td>
                        <td className="p-2 text-xs text-muted-foreground">{c.motivo_perda ?? "—"}</td>
                        {podeEditar && (
                          <td className="p-2 text-right space-x-1 whitespace-nowrap">
                            {c.tem_direito && c.status === "tem_direito" && (
                              <Button size="sm" variant="outline" onClick={() => {
                                const j = prompt("Justificativa para liberar:") ?? "";
                                void mudarStatus(c, "liberado", j);
                              }}>
                                <CheckCircle2 className="h-3 w-3 mr-1" />Liberar
                              </Button>
                            )}
                            {c.status === "liberado" && (
                              <Button size="sm" onClick={() => {
                                const j = prompt("Observação da entrega (opcional):") ?? "";
                                void mudarStatus(c, "entregue", j);
                              }}>
                                <Truck className="h-3 w-3 mr-1" />Entregue
                              </Button>
                            )}
                            {(c.status === "entregue" || c.status === "liberado") && (
                              <Link
                                to="/app/empresa/beneficios/recibo/$calcId"
                                params={{ calcId: c.id }}
                                target="_blank"
                              >
                                <Button size="sm" variant="ghost"><FileText className="h-3 w-3 mr-1" />Recibo</Button>
                              </Link>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {ehAdmin && <NovoBeneficioDialog open={novoOpen} onClose={() => setNovoOpen(false)} empresaId={empresaId}
        onSaved={async () => {
          const { data } = await supabase.from("beneficios").select("*").eq("empresa_id", empresaId).order("created_at");
          setBeneficios((data ?? []) as Beneficio[]);
        }} />}
    </div>
  );
}

function Fld({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Label className="mb-1 block text-xs">{label}</Label>{children}</div>;
}

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <Card><CardContent className="p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold ${color ?? ""}`}>{value}</div>
    </CardContent></Card>
  );
}

function Resumo({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-bold">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function Alerta({ tone, icon, texto }: { tone: "amber" | "blue" | "red"; icon: React.ReactNode; texto: string }) {
  const map = {
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-700",
    blue: "border-blue-500/30 bg-blue-500/10 text-blue-700",
    red: "border-red-500/30 bg-red-500/10 text-red-700",
  };
  return (
    <div className={`border rounded-md px-3 py-2 text-sm flex items-center gap-2 ${map[tone]}`}>
      {icon}{texto}
    </div>
  );
}

function NovoBeneficioDialog({
  open, onClose, empresaId, onSaved,
}: { open: boolean; onClose: () => void; empresaId: string; onSaved: () => void }) {
  const [nome, setNome] = useState("");
  const [valor, setValor] = useState(300);
  const [dia, setDia] = useState(5);
  const [limite, setLimite] = useState(120);
  const [alerta, setAlerta] = useState(90);
  const [regra, setRegra] = useState("");
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    if (!nome) return toast.error("Informe o nome");
    setSalvando(true);
    const { error } = await supabase.from("beneficios").insert({
      empresa_id: empresaId,
      nome, tipo: "outro",
      valor_maximo: valor,
      dia_entrega: dia,
      limite_atraso_minutos: limite,
      limite_alerta_minutos: alerta,
      regra_descricao: regra,
    });
    setSalvando(false);
    if (error) return toast.error(error.message);
    toast.success("Benefício criado");
    onSaved(); onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo benefício</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Fld label="Nome"><Input value={nome} onChange={(e) => setNome(e.target.value)} /></Fld>
          <div className="grid grid-cols-2 gap-3">
            <Fld label="Valor máximo (R$)"><Input type="number" step="0.01" value={valor} onChange={(e) => setValor(Number(e.target.value))} /></Fld>
            <Fld label="Dia de entrega"><Input type="number" min="1" max="31" value={dia} onChange={(e) => setDia(Number(e.target.value))} /></Fld>
            <Fld label="Limite atraso (min)"><Input type="number" value={limite} onChange={(e) => setLimite(Number(e.target.value))} /></Fld>
            <Fld label="Alerta atraso (min)"><Input type="number" value={alerta} onChange={(e) => setAlerta(Number(e.target.value))} /></Fld>
          </div>
          <Fld label="Regra"><Textarea value={regra} onChange={(e) => setRegra(e.target.value)} /></Fld>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
