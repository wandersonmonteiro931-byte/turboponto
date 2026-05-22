import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Calculator, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { calcularDescontoFolha } from "@/lib/notificacoes";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/app/empresa/impacto-folha")({
  component: ImpactoFolhaPage,
});

type Linha = {
  funcionario_id: string;
  nome: string;
  salario: number;
  dias_desc: number;
  dias_dsr: number;
  valor_desconto: number;
};

function ImpactoFolhaPage() {
  const { empresaId } = useAuth();
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [loading, setLoading] = useState(false);
  const [linhas, setLinhas] = useState<Linha[]>([]);

  const carregar = async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      const { data: funcs, error } = await supabase
        .from("funcionarios")
        .select("id, nome, salario")
        .eq("empresa_id", empresaId)
        .eq("status", "ativo")
        .order("nome");
      if (error) throw error;
      const out: Linha[] = [];
      for (const f of funcs ?? []) {
        const r = await calcularDescontoFolha(f.id, ano, mes);
        if (r.dias_desc > 0 || r.dias_dsr > 0) {
          out.push({
            funcionario_id: f.id, nome: f.nome,
            salario: Number(f.salario ?? 0),
            dias_desc: r.dias_desc, dias_dsr: r.dias_dsr,
            valor_desconto: Number(r.valor_desconto ?? 0),
          });
        }
      }
      setLinhas(out);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao calcular");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [empresaId, ano, mes]);

  const exportar = () => {
    const header = "Funcionário;Salário;Dias desc.;Dias DSR;Valor desconto\n";
    const body = linhas.map((l) =>
      `${l.nome};${l.salario.toFixed(2)};${l.dias_desc};${l.dias_dsr};${l.valor_desconto.toFixed(2)}`).join("\n");
    const blob = new Blob(["\ufeff" + header + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `impacto-folha-${ano}-${String(mes).padStart(2,"0")}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const total = linhas.reduce((s, l) => s + l.valor_desconto, 0);

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Calculator className="h-6 w-6" /> Impacto em folha
        </h1>
        <Button variant="outline" onClick={exportar} disabled={linhas.length === 0}>
          <Download className="h-4 w-4 mr-1" /> CSV
        </Button>
      </div>

      <Card className="p-4 flex flex-wrap gap-3 items-end">
        <div>
          <Label>Mês</Label>
          <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from({length:12}, (_,i)=>i+1).map(m =>
                <SelectItem key={m} value={String(m)}>{String(m).padStart(2,"0")}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Ano</Label>
          <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[ano-1, ano, ano+1].map(a => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={carregar} disabled={loading}>{loading ? "Calculando..." : "Recalcular"}</Button>
      </Card>

      <Card className="p-4">
        <div className="text-sm text-muted-foreground mb-2">
          Calculado a partir das justificativas aprovadas com flag <strong>desconta salário</strong> e/ou <strong>desconta DSR</strong>. Valor/dia = salário ÷ dias do mês.
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Funcionário</TableHead>
              <TableHead className="text-right">Salário</TableHead>
              <TableHead className="text-right">Dias desc.</TableHead>
              <TableHead className="text-right">Dias DSR</TableHead>
              <TableHead className="text-right">Valor a descontar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">
                {loading ? "Calculando..." : "Sem descontos no período."}
              </TableCell></TableRow>
            ) : linhas.map((l) => (
              <TableRow key={l.funcionario_id}>
                <TableCell>{l.nome}</TableCell>
                <TableCell className="text-right">R$ {l.salario.toFixed(2)}</TableCell>
                <TableCell className="text-right">{l.dias_desc}</TableCell>
                <TableCell className="text-right">{l.dias_dsr}</TableCell>
                <TableCell className="text-right text-red-600 font-medium">R$ {l.valor_desconto.toFixed(2)}</TableCell>
              </TableRow>
            ))}
            {linhas.length > 0 && (
              <TableRow className="font-bold bg-muted/30">
                <TableCell colSpan={4} className="text-right">Total</TableCell>
                <TableCell className="text-right text-red-600">R$ {total.toFixed(2)}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
