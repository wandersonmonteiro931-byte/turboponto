import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/app/empresa/justificativas-historico")({
  component: HistPage,
});

type Row = {
  id: string;
  created_at: string;
  acao: string;
  status_anterior: string | null;
  status_novo: string | null;
  observacao: string | null;
  alterado_por: string | null;
  funcionario_nome: string;
  tipo_nome: string;
  data: string;
};

const cor = (a: string) => ({
  criada: "bg-blue-100 text-blue-800",
  aprovada: "bg-green-100 text-green-800",
  reprovada: "bg-red-100 text-red-800",
  atualizada: "bg-yellow-100 text-yellow-800",
  removida: "bg-gray-200 text-gray-700",
} as Record<string,string>)[a] ?? "";

function HistPage() {
  const { empresaId } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("");

  useEffect(() => {
    if (!empresaId) return;
    (async () => {
      const { data, error } = await supabase
        .from("justificativas_historico")
        .select("id, created_at, acao, status_anterior, status_novo, observacao, alterado_por, justificativa_id, funcionario_id")
        .eq("empresa_id", empresaId)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) { setLoading(false); return; }

      const justIds = Array.from(new Set((data ?? []).map((r) => r.justificativa_id)));
      const funcIds = Array.from(new Set((data ?? []).map((r) => r.funcionario_id)));
      const [{ data: justs }, { data: funcs }] = await Promise.all([
        supabase.from("justificativas_aplicadas").select("id, data, tipo_id").in("id", justIds),
        supabase.from("funcionarios").select("id, nome").in("id", funcIds),
      ]);
      const tipoIds = Array.from(new Set((justs ?? []).map((j) => j.tipo_id)));
      const { data: tipos } = await supabase.from("justificativas_tipos").select("id, nome").in("id", tipoIds);

      const fMap = new Map((funcs ?? []).map((f) => [f.id, f.nome]));
      const jMap = new Map((justs ?? []).map((j) => [j.id, j]));
      const tMap = new Map((tipos ?? []).map((t) => [t.id, t.nome]));

      setRows((data ?? []).map((r) => {
        const j = jMap.get(r.justificativa_id);
        return {
          id: r.id,
          created_at: r.created_at,
          acao: r.acao,
          status_anterior: r.status_anterior,
          status_novo: r.status_novo,
          observacao: r.observacao,
          alterado_por: r.alterado_por,
          funcionario_nome: fMap.get(r.funcionario_id) ?? "—",
          tipo_nome: (j && tMap.get(j.tipo_id)) ?? "—",
          data: j?.data ?? "",
        };
      }));
      setLoading(false);
    })();
  }, [empresaId]);

  const rowsFiltradas = rows.filter((r) => {
    if (!filtro) return true;
    const f = filtro.toLowerCase();
    return r.funcionario_nome.toLowerCase().includes(f) || r.tipo_nome.toLowerCase().includes(f);
  });

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <History className="h-6 w-6" /> Histórico de justificativas
      </h1>
      <Card className="p-4">
        <Label>Filtrar (funcionário ou tipo)</Label>
        <Input value={filtro} onChange={(e) => setFiltro(e.target.value)} className="max-w-sm" />
      </Card>
      <Card className="p-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Quando</TableHead>
              <TableHead>Funcionário</TableHead>
              <TableHead>Justificativa</TableHead>
              <TableHead>Dia</TableHead>
              <TableHead>Ação</TableHead>
              <TableHead>De → Para</TableHead>
              <TableHead>Observação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center">Carregando...</TableCell></TableRow>
            ) : rowsFiltradas.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Sem registros</TableCell></TableRow>
            ) : rowsFiltradas.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs whitespace-nowrap">{new Date(r.created_at).toLocaleString("pt-BR")}</TableCell>
                <TableCell>{r.funcionario_nome}</TableCell>
                <TableCell>{r.tipo_nome}</TableCell>
                <TableCell className="font-mono text-xs">{r.data ? r.data.split("-").reverse().join("/") : "—"}</TableCell>
                <TableCell><Badge className={cor(r.acao)} variant="secondary">{r.acao}</Badge></TableCell>
                <TableCell className="text-xs">
                  {r.status_anterior || "—"} → <strong>{r.status_novo || "—"}</strong>
                </TableCell>
                <TableCell className="text-xs max-w-xs truncate">{r.observacao || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
