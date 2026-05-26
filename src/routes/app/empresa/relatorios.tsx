import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { mesNome } from "@/lib/beneficios";
import { formatMinutos } from "@/lib/format";
import { Download, FileText, Printer } from "lucide-react";

export const Route = createFileRoute("/app/empresa/relatorios")({
  component: RelatoriosPage,
});

const RELATORIOS = [
  { id: "ponto_diario", label: "Ponto — diário" },
  { id: "ponto_mensal", label: "Ponto — mensal por funcionário" },
  { id: "atrasos", label: "Atrasos" },
  { id: "faltas", label: "Faltas" },
  { id: "horas_extras", label: "Horas extras" },
  { id: "beneficios", label: "Benefícios" },
  { id: "cesta_basica", label: "Cesta básica" },
  { id: "holerites", label: "Holerites liberados" },
  { id: "funcionarios_ativos", label: "Funcionários ativos" },
] as const;
type RelatorioId = (typeof RELATORIOS)[number]["id"];

type Row = Record<string, string | number | null>;

function RelatoriosPage() {
  const { empresaId } = useAuth();
  const hoje = new Date();
  const [rel, setRel] = useState<RelatorioId>("ponto_diario");
  const [dataIni, setDataIni] = useState(hoje.toISOString().slice(0, 8) + "01");
  const [dataFim, setDataFim] = useState(hoje.toISOString().slice(0, 10));
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());
  const [funcionarioId, setFuncionarioId] = useState("todos");
  const [funcs, setFuncs] = useState<{ id: string; nome: string; cargo: string | null }[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [cols, setCols] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!empresaId) return;
    void supabase.from("funcionarios").select("id,nome,cargo").eq("empresa_id", empresaId).order("nome")
      .then(({ data }) => setFuncs(data ?? []));
  }, [empresaId]);

  const titulo = useMemo(() => RELATORIOS.find((r) => r.id === rel)?.label ?? "Relatório", [rel]);

  const gerar = async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      let r: { rows: Row[]; cols: string[] } = { rows: [], cols: [] };
      if (rel === "ponto_diario" || rel === "ponto_mensal" || rel === "atrasos" || rel === "horas_extras") {
        let q = supabase.from("registros_ponto")
          .select("data_referencia,tipo_ponto,horario_programado,horario_registrado,atraso_minutos,status,funcionarios(nome,cargo)")
          .eq("empresa_id", empresaId).gte("data_referencia", dataIni).lte("data_referencia", dataFim)
          .order("data_referencia").limit(2000);
        if (funcionarioId !== "todos") q = q.eq("funcionario_id", funcionarioId);
        if (rel === "atrasos") q = q.gt("atraso_minutos", 0);
        const { data, error } = await q;
        if (error) throw error;
        const tipo = (t: string) => ({
          entrada: "Entrada", saida_intervalo: "Saída intervalo",
          retorno_intervalo: "Retorno intervalo", saida_final: "Saída final",
        }[t] ?? t);
        r.cols = ["Data","Funcionário","Cargo","Tipo","Programado","Registrado","Atraso (min)","Status"];
        r.rows = (data ?? []).map((x: { data_referencia: string; tipo_ponto: string; horario_programado: string | null; horario_registrado: string; atraso_minutos: number; status: string; funcionarios: { nome: string; cargo: string | null } | null }) => ({
          Data: new Date(x.data_referencia + "T00:00").toLocaleDateString("pt-BR"),
          Funcionário: x.funcionarios?.nome ?? "",
          Cargo: x.funcionarios?.cargo ?? "",
          Tipo: tipo(x.tipo_ponto),
          Programado: x.horario_programado?.slice(0, 5) ?? "—",
          Registrado: new Date(x.horario_registrado).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
          "Atraso (min)": x.atraso_minutos || 0,
          Status: x.status,
        }));
      } else if (rel === "faltas") {
        // Faltas = dias sem registro dentro do período por funcionário (com jornada ativa)
        const { data: regs } = await supabase.from("registros_ponto").select("funcionario_id,data_referencia")
          .eq("empresa_id", empresaId).gte("data_referencia", dataIni).lte("data_referencia", dataFim);
        const presencas = new Set((regs ?? []).map((x) => `${x.funcionario_id}|${x.data_referencia}`));
        const ativos = funcs;
        const dias: string[] = [];
        const d0 = new Date(dataIni + "T00:00"); const d1 = new Date(dataFim + "T00:00");
        for (let d = new Date(d0); d <= d1; d.setDate(d.getDate() + 1)) dias.push(d.toISOString().slice(0, 10));
        r.cols = ["Funcionário","Cargo","Dias úteis no período","Dias sem registro"];
        r.rows = ativos.map((f) => {
          const semReg = dias.filter((d) => !presencas.has(`${f.id}|${d}`)).length;
          return { Funcionário: f.nome, Cargo: f.cargo ?? "", "Dias úteis no período": dias.length, "Dias sem registro": semReg };
        });
      } else if (rel === "beneficios" || rel === "cesta_basica") {
        const { data, error } = await supabase.from("beneficios_calculos")
          .select("total_atraso_minutos,dias_com_atraso,faltas_injustificadas,tem_direito,status,motivo_perda,valor_estimado,funcionarios(nome,cargo),beneficios(nome)")
          .eq("empresa_id", empresaId).eq("mes_referencia", mes).eq("ano_referencia", ano);
        if (error) throw error;
        r.cols = ["Funcionário","Cargo","Benefício","Atraso (min)","Dias c/ atraso","Faltas","Tem direito","Status","Valor","Motivo"];
        r.rows = (data ?? []).map((x: { total_atraso_minutos: number; dias_com_atraso: number; faltas_injustificadas: number; tem_direito: boolean; status: string; motivo_perda: string | null; valor_estimado: number; funcionarios: { nome: string; cargo: string | null } | null; beneficios: { nome: string } | null }) => ({
          Funcionário: x.funcionarios?.nome ?? "",
          Cargo: x.funcionarios?.cargo ?? "",
          Benefício: x.beneficios?.nome ?? "",
          "Atraso (min)": x.total_atraso_minutos,
          "Dias c/ atraso": x.dias_com_atraso,
          Faltas: x.faltas_injustificadas,
          "Tem direito": x.tem_direito ? "Sim" : "Não",
          Status: x.status,
          Valor: `R$ ${x.valor_estimado.toFixed(2)}`,
          Motivo: x.motivo_perda ?? "",
        }));
      } else if (rel === "holerites") {
        const { data, error } = await supabase.from("holerites")
          .select("mes_referencia,ano_referencia,liberado,liberado_em,acessado_em,funcionarios(nome,cargo)")
          .eq("empresa_id", empresaId).eq("liberado", true)
          .eq("mes_referencia", mes).eq("ano_referencia", ano);
        if (error) throw error;
        r.cols = ["Funcionário","Cargo","Mês","Ano","Liberado em","Acessado em"];
        r.rows = (data ?? []).map((x: { mes_referencia: number; ano_referencia: number; liberado_em: string | null; acessado_em: string | null; funcionarios: { nome: string; cargo: string | null } | null }) => ({
          Funcionário: x.funcionarios?.nome ?? "",
          Cargo: x.funcionarios?.cargo ?? "",
          Mês: mesNome(x.mes_referencia),
          Ano: x.ano_referencia,
          "Liberado em": x.liberado_em ? new Date(x.liberado_em).toLocaleString("pt-BR") : "—",
          "Acessado em": x.acessado_em ? new Date(x.acessado_em).toLocaleString("pt-BR") : "—",
        }));
      } else if (rel === "funcionarios_ativos") {
        const { data, error } = await supabase.from("funcionarios")
          .select("nome,cargo,email,telefone,data_admissao,status").eq("empresa_id", empresaId).eq("status","ativo").order("nome");
        if (error) throw error;
        r.cols = ["Nome","Cargo","Email","Telefone","Admissão"];
        r.rows = (data ?? []).map((x: { nome: string; cargo: string | null; email: string | null; telefone: string | null; data_admissao: string | null }) => ({
          Nome: x.nome, Cargo: x.cargo ?? "", Email: x.email ?? "", Telefone: x.telefone ?? "",
          Admissão: x.data_admissao ? new Date(x.data_admissao + "T00:00").toLocaleDateString("pt-BR") : "—",
        }));
      }
      setRows(r.rows); setCols(r.cols);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar");
    } finally { setLoading(false); }
  };

  const exportarCSV = () => {
    if (rows.length === 0) return toast.error("Gere o relatório primeiro");
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = "\uFEFF" + [cols.join(";"), ...rows.map((r) => cols.map((c) => esc(r[c])).join(";"))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${titulo.toLowerCase().replace(/\s+/g, "_")}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const imprimir = () => {
    if (rows.length === 0) return toast.error("Gere o relatório primeiro");
    const w = window.open("", "_blank");
    if (!w) return;
    const tabela = `<table><thead><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td>${r[c] ?? ""}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    w.document.write(`<html><head><title>${titulo}</title><style>
      body{font-family:Arial,sans-serif;padding:20px;color:#000}
      h1{font-size:18px;margin:0 0 12px}
      .meta{color:#555;font-size:11px;margin-bottom:16px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th,td{border:1px solid #ccc;padding:6px;text-align:left}
      th{background:#f3f4f6}
    </style></head><body>
      <h1>${titulo}</h1>
      <div class="meta">Gerado em ${new Date().toLocaleString("pt-BR")} — ${rows.length} registro(s)</div>
      ${tabela}
      <script>window.print()</script>
    </body></html>`);
    w.document.close();
  };

  const usaPeriodo = ["ponto_diario","ponto_mensal","atrasos","horas_extras","faltas"].includes(rel);
  const usaMesAno = ["beneficios","cesta_basica","holerites"].includes(rel);

  if (!empresaId) return <p className="text-sm text-muted-foreground">Cadastre primeiro os dados da empresa.</p>;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Relatórios</h2>
        <p className="text-sm text-muted-foreground">Gere relatórios da operação e exporte em PDF ou Excel/CSV.</p>
      </div>

      <Card>
        <CardContent className="p-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <div className="sm:col-span-2"><Label className="text-xs">Relatório</Label>
            <Select value={rel} onValueChange={(v: RelatorioId) => setRel(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{RELATORIOS.map((r) => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {usaPeriodo && <>
            <div><Label className="text-xs">De</Label><Input type="date" value={dataIni} onChange={(e) => setDataIni(e.target.value)} /></div>
            <div><Label className="text-xs">Até</Label><Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} /></div>
          </>}
          {usaMesAno && <>
            <div><Label className="text-xs">Mês</Label>
              <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <SelectItem key={m} value={String(m)}>{mesNome(m)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Ano</Label><Input type="number" value={ano} onChange={(e) => setAno(Number(e.target.value))} /></div>
          </>}
          <div><Label className="text-xs">Funcionário</Label>
            <Select value={funcionarioId} onValueChange={setFuncionarioId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {funcs.map((f) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end"><Button onClick={gerar} disabled={loading} className="w-full">{loading ? "Gerando..." : "Gerar"}</Button></div>
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <div className="flex gap-2">
          <Button onClick={imprimir} variant="outline"><Printer className="h-4 w-4 mr-1" />PDF (Imprimir)</Button>
          <Button onClick={exportarCSV} variant="outline"><Download className="h-4 w-4 mr-1" />Excel / CSV</Button>
          <span className="text-sm text-muted-foreground ml-auto self-center">{rows.length} registro(s)</span>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {rows.length === 0
            ? <div className="p-8 text-center text-sm text-muted-foreground"><FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />Selecione os filtros e gere o relatório.</div>
            : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>{cols.map((c) => <th key={c} className="text-left p-2">{c}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y">
                    {rows.slice(0, 200).map((r, i) => (
                      <tr key={i} className="hover:bg-muted/30">
                        {cols.map((c) => <td key={c} className="p-2">{r[c] ?? "—"}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 200 && <div className="p-2 text-center text-xs text-muted-foreground">Mostrando 200 de {rows.length}. Exporte para ver todos.</div>}
              </div>
            )}
        </CardContent>
      </Card>
    </div>
  );
}
