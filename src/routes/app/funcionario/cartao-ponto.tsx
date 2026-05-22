import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Lock } from "lucide-react";
import { carregarCartao, DIAS_SEMANA_CURTO, formatMin, NOMES_MES, type ResumoCartao } from "@/lib/cartao";
import { gerarPdfCartao } from "@/lib/cartao-pdf";

export const Route = createFileRoute("/app/funcionario/cartao-ponto")({
  component: CartaoFuncPage,
});

type Cartao = { status: string; total_atraso_minutos: number; total_faltas: number; total_horas_trabalhadas_minutos: number; total_horas_extras_minutos: number };

function CartaoFuncPage() {
  const { user } = useAuth();
  const hoje = new Date();
  const [funcionario, setFuncionario] = useState<{ id: string; nome: string; cpf: string | null; cargo: string | null; empresa_id: string } | null>(null);
  const [empresa, setEmpresa] = useState<{ nome_fantasia: string; cnpj: string | null; endereco: string | null } | null>(null);
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [resumo, setResumo] = useState<ResumoCartao | null>(null);
  const [cartao, setCartao] = useState<Cartao | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("funcionarios").select("id,nome,cpf,cargo,empresa_id").eq("usuario_id", user.id).maybeSingle()
      .then(async ({ data }) => {
        if (!data) return;
        setFuncionario(data);
        const { data: emp } = await supabase.from("empresas").select("nome_fantasia,cnpj,endereco").eq("id", data.empresa_id).maybeSingle();
        setEmpresa(emp);
      });
  }, [user]);

  useEffect(() => {
    if (!funcionario) return;
    setLoading(true);
    (async () => {
      const r = await carregarCartao(funcionario.id, ano, mes);
      const { data: c } = await supabase.from("cartoes_ponto")
        .select("status,total_atraso_minutos,total_faltas,total_horas_trabalhadas_minutos,total_horas_extras_minutos")
        .eq("funcionario_id", funcionario.id).eq("ano_referencia", ano).eq("mes_referencia", mes).maybeSingle();
      setCartao((c ?? null) as Cartao | null);
      setResumo(r);
      setLoading(false);
    })();
  }, [funcionario, ano, mes]);

  const liberado = cartao?.status === "liberado";

  const baixarPdf = async () => {
    try {
      if (!funcionario) {
        console.warn("PDF: funcionário não carregado");
        return;
      }
      // Recarrega o cartão antes de gerar o PDF para refletir alterações recentes
      const resumoAtual = await carregarCartao(funcionario.id, ano, mes);
      setResumo(resumoAtual);
      const emp = empresa ?? { nome_fantasia: "-", cnpj: null, endereco: null };
      const { data: vinc } = await supabase
        .from("funcionarios_jornadas")
        .select("jornadas(nome), jornada_id")
        .eq("funcionario_id", funcionario.id).eq("ativo", true).maybeSingle();
      const v = vinc as { jornadas: { nome: string } | null; jornada_id: string } | null;
      let jornada: { nome: string; entrada: string | null; saida: string | null; intervalo_saida: string | null; intervalo_retorno: string | null } | null = null;
      if (v?.jornada_id) {
        const { data: jd } = await supabase
          .from("jornadas_dias")
          .select("dia_semana,horario_entrada,horario_saida,horario_intervalo_saida,horario_intervalo_retorno,trabalha")
          .eq("jornada_id", v.jornada_id);
        const ref = (jd ?? []).find((x) => x.trabalha) as { horario_entrada: string | null; horario_saida: string | null; horario_intervalo_saida: string | null; horario_intervalo_retorno: string | null } | undefined;
        jornada = {
          nome: v.jornadas?.nome ?? "JORNADA",
          entrada: ref?.horario_entrada?.slice(0, 5) ?? null,
          saida: ref?.horario_saida?.slice(0, 5) ?? null,
          intervalo_saida: ref?.horario_intervalo_saida?.slice(0, 5) ?? null,
          intervalo_retorno: ref?.horario_intervalo_retorno?.slice(0, 5) ?? null,
        };
      }
      const doc = gerarPdfCartao({
        empresa: emp,
        funcionario,
        jornada,
        ano, mes, resumo,
        status: cartao?.status ?? "aberto",
      });
      doc.save(`cartao-${funcionario.nome}-${ano}-${String(mes).padStart(2, "0")}.pdf`);
    } catch (e) {
      console.error("Erro ao gerar PDF", e);
    }
  };

  if (!funcionario) return <p className="text-sm text-muted-foreground">Carregando seus dados...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold">Meu cartão de ponto</h2>
          <p className="text-sm text-muted-foreground">Visualize seu cartão de ponto mês a mês.</p>
        </div>
        <Button variant="outline" onClick={baixarPdf} disabled={!resumo}>
          <Download className="h-4 w-4 mr-1" />PDF
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Mês</Label>
            <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{NOMES_MES.map((n, i) => <SelectItem key={i} value={String(i + 1)}>{n}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Ano</Label>
            <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{[hoje.getFullYear(), hoje.getFullYear() - 1, hoje.getFullYear() - 2].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            {cartao && (
              <span className={`text-xs uppercase font-bold px-2 py-1 rounded ${liberado ? "bg-green-500/20 text-green-700" : cartao.status === "fechado" ? "bg-blue-500/20 text-blue-700" : "bg-muted text-muted-foreground"}`}>
                {liberado && <Lock className="h-3 w-3 inline mr-1" />}{cartao.status}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {resumo && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Atrasos" value={`${resumo.totalAtraso} min`} />
          <Stat label="Faltas" value={resumo.totalFaltas} />
          <Stat label="Trabalhadas" value={formatMin(resumo.totalTrabalhado)} />
          <Stat label="Extras" value={formatMin(resumo.totalExtras)} />
        </div>
      )}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div> :
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-2 text-left">Dia</th>
                  <th className="p-2 text-left">Entrada</th>
                  <th className="p-2 text-left">Saída int.</th>
                  <th className="p-2 text-left">Retorno</th>
                  <th className="p-2 text-left">Saída</th>
                  <th className="p-2 text-left">Atraso</th>
                  <th className="p-2 text-left">Trab.</th>
                  <th className="p-2 text-left">Extras</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {resumo?.dias.map((d) => (
                  <tr key={d.data} className={d.falta ? "bg-red-500/5" : d.pendente && d.trabalha ? "bg-yellow-500/5" : !d.trabalha ? "bg-muted/30" : ""}>
                    <td className="p-2 whitespace-nowrap font-mono">{d.data.slice(8, 10)} <span className="text-xs text-muted-foreground">{DIAS_SEMANA_CURTO[d.diaSemana]}</span></td>
                    <td className="p-2 font-mono">{d.registrado.entrada ?? (d.falta ? <span className="text-red-600 font-bold">FALTA</span> : d.pendente && d.trabalha ? <span className="text-yellow-700 text-xs">marcação não registrada</span> : "—")}</td>
                    <td className="p-2 font-mono">{d.registrado.saida_intervalo ?? "—"}</td>
                    <td className="p-2 font-mono">{d.registrado.retorno_intervalo ?? "—"}</td>
                    <td className="p-2 font-mono">{d.registrado.saida_final ?? "—"}</td>
                    <td className="p-2">{d.atrasoMinutos ? `${d.atrasoMinutos}m` : "—"}</td>
                    <td className="p-2">{d.trabalhadoMinutos ? formatMin(d.trabalhadoMinutos) : "—"}</td>
                    <td className="p-2 text-orange-600">{d.extrasMinutos ? formatMin(d.extrasMinutos) : "—"}</td>
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

function Stat({ label, value }: { label: string; value: string | number }) {
  return <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="text-2xl font-bold">{value}</div></CardContent></Card>;
}
