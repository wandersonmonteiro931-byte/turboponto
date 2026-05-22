import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { listarJustificativasTipos, type JustificativaTipo } from "@/lib/justificativas";

export const Route = createFileRoute("/app/empresa/justificativas-relatorio")({
  component: RelatorioPage,
});

type Linha = {
  id: string;
  data: string;
  observacao: string | null;
  status: string;
  funcionario_id: string;
  tipo_id: string;
  funcionarios: { nome: string; cargo: string | null } | null;
  justificativas_tipos: { nome: string; codigo: string; categoria: string } | null;
};

type Func = { id: string; nome: string };

function RelatorioPage() {
  const { empresaId } = useAuth();
  const hoje = new Date();
  const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10);
  const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10);

  const [inicio, setInicio] = useState(primeiroDia);
  const [fim, setFim] = useState(ultimoDia);
  const [funcionarioId, setFuncionarioId] = useState("todos");
  const [tipoId, setTipoId] = useState("todos");
  const [status, setStatus] = useState("todos");

  const [funcs, setFuncs] = useState<Func[]>([]);
  const [tipos, setTipos] = useState<JustificativaTipo[]>([]);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!empresaId) return;
    void (async () => {
      const [{ data: f }, t] = await Promise.all([
        supabase.from("funcionarios").select("id,nome").eq("empresa_id", empresaId).order("nome"),
        listarJustificativasTipos(empresaId),
      ]);
      setFuncs((f ?? []) as Func[]);
      setTipos(t);
    })();
  }, [empresaId]);

  const carregar = useCallback(async () => {
    if (!empresaId) return;
    setLoading(true);
    let q = supabase
      .from("justificativas_aplicadas")
      .select("id,data,observacao,status,funcionario_id,tipo_id,funcionarios(nome,cargo),justificativas_tipos(nome,codigo,categoria)")
      .eq("empresa_id", empresaId)
      .gte("data", inicio)
      .lte("data", fim);
    if (funcionarioId !== "todos") q = q.eq("funcionario_id", funcionarioId);
    if (tipoId !== "todos") q = q.eq("tipo_id", tipoId);
    if (status !== "todos") q = q.eq("status", status);
    const { data, error } = await q.order("data", { ascending: false });
    if (error) toast.error(error.message);
    setLinhas((data ?? []) as unknown as Linha[]);
    setLoading(false);
  }, [empresaId, inicio, fim, funcionarioId, tipoId, status]);

  useEffect(() => { void carregar(); }, [carregar]);

  const exportarCSV = () => {
    const header = ["Data", "Funcionário", "Cargo", "Tipo", "Categoria", "Status", "Observação"];
    const rows = linhas.map((l) => [
      l.data,
      l.funcionarios?.nome ?? "",
      l.funcionarios?.cargo ?? "",
      l.justificativas_tipos?.nome ?? "",
      l.justificativas_tipos?.categoria ?? "",
      l.status,
      (l.observacao ?? "").replace(/[\r\n]+/g, " "),
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `justificativas_${inicio}_${fim}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totaisPorTipo = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of linhas) {
      const k = l.justificativas_tipos?.nome ?? "—";
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [linhas]);

  if (!empresaId) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold">Relatório de justificativas</h2>
          <p className="text-sm text-muted-foreground">Filtre por período, funcionário, tipo e status.</p>
        </div>
        <Button variant="outline" onClick={exportarCSV} disabled={linhas.length === 0}>
          <Download className="h-4 w-4 mr-1" />Exportar CSV
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div>
            <Label className="text-xs">Início</Label>
            <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Fim</Label>
            <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Funcionário</Label>
            <Select value={funcionarioId} onValueChange={setFuncionarioId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {funcs.map((f) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Tipo</Label>
            <Select value={tipoId} onValueChange={setTipoId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {tipos.map((t) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="aprovada">Aprovadas</SelectItem>
                <SelectItem value="pendente">Pendentes</SelectItem>
                <SelectItem value="rejeitada">Rejeitadas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {totaisPorTipo.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-2">Distribuição</div>
            <div className="flex flex-wrap gap-2">
              {totaisPorTipo.map(([nome, qtd]) => (
                <span key={nome} className="text-xs px-2 py-1 rounded bg-muted">
                  {nome}: <strong>{qtd}</strong>
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div>
          ) : linhas.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma justificativa no período.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left p-2">Data</th>
                    <th className="text-left p-2">Funcionário</th>
                    <th className="text-left p-2">Tipo</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Observação</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {linhas.map((l) => (
                    <tr key={l.id} className="hover:bg-muted/30">
                      <td className="p-2 font-mono">{l.data.split("-").reverse().join("/")}</td>
                      <td className="p-2">{l.funcionarios?.nome ?? "—"}</td>
                      <td className="p-2">{l.justificativas_tipos?.nome ?? "—"}</td>
                      <td className="p-2">
                        <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                          l.status === "aprovada" ? "bg-green-500/20 text-green-700" :
                          l.status === "pendente" ? "bg-amber-500/20 text-amber-700" :
                          "bg-red-500/20 text-red-700"
                        }`}>{l.status}</span>
                      </td>
                      <td className="p-2 text-xs text-muted-foreground">{l.observacao ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
