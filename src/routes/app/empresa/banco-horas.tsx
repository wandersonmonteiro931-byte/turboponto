import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import {
  formatSaldoMin, inserirAjuste, listarMovimentosBH, removerMovimento,
  type ExtratoBH,
} from "@/lib/banco-horas";

export const Route = createFileRoute("/app/empresa/banco-horas")({
  component: BancoHorasPage,
});

type Func = { id: string; nome: string };

function BancoHorasPage() {
  const { empresaId, role, user } = useAuth();
  const [funcs, setFuncs] = useState<Func[]>([]);
  const [funcId, setFuncId] = useState<string>("");
  const [extrato, setExtrato] = useState<ExtratoBH | null>(null);
  const [loading, setLoading] = useState(false);
  const [ajusteOpen, setAjusteOpen] = useState(false);
  const [aj, setAj] = useState({ data: new Date().toISOString().slice(0, 10), tipo: "credito" as "credito" | "debito", horas: 0, minutos: 0, obs: "" });

  const podeEditar = role === "admin";

  useEffect(() => {
    if (!empresaId) return;
    supabase.from("funcionarios").select("id,nome").eq("empresa_id", empresaId).order("nome")
      .then(({ data }) => {
        const list = (data ?? []) as Func[];
        setFuncs(list);
        if (list.length && !funcId) setFuncId(list[0].id);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  const carregar = async () => {
    if (!funcId) return;
    setLoading(true);
    try {
      setExtrato(await listarMovimentosBH(funcId));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (funcId) carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [funcId]);

  const salvarAjuste = async () => {
    if (!empresaId || !funcId || !user) return;
    const totalMin = aj.horas * 60 + aj.minutos;
    if (totalMin <= 0) { toast.error("Informe a quantidade de horas/minutos."); return; }
    if (!aj.obs.trim()) { toast.error("Observação obrigatória para ajustes."); return; }
    try {
      await inserirAjuste({
        empresaId, funcionarioId: funcId, data: aj.data, tipo: aj.tipo,
        minutos: totalMin, observacao: aj.obs, userId: user.id,
      });
      toast.success("Ajuste lançado.");
      setAjusteOpen(false);
      setAj({ data: new Date().toISOString().slice(0, 10), tipo: "credito", horas: 0, minutos: 0, obs: "" });
      carregar();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const remover = async (id: string) => {
    if (!confirm("Remover este lançamento?")) return;
    try {
      await removerMovimento(id);
      toast.success("Lançamento removido.");
      carregar();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (!empresaId) return <p className="text-sm text-muted-foreground">Cadastre primeiro a empresa.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold">Banco de horas</h2>
          <p className="text-sm text-muted-foreground">Extrato de créditos e débitos por funcionário.</p>
        </div>
        {podeEditar && (
          <Button onClick={() => setAjusteOpen(true)} disabled={!funcId}>
            <Plus className="h-4 w-4 mr-1" />Lançar ajuste
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Funcionário</Label>
            <Select value={funcId} onValueChange={setFuncId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {funcs.map((f) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2 flex items-end">
            {extrato && (
              <div className="ml-auto text-right">
                <div className="text-xs text-muted-foreground">Saldo atual</div>
                <div className={`text-3xl font-bold ${extrato.saldoFinal >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {formatSaldoMin(extrato.saldoFinal)}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div> :
           !extrato || extrato.movimentos.length === 0 ?
            <div className="p-8 text-center text-sm text-muted-foreground">Nenhum lançamento.</div> :
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-2 text-left">Data</th>
                  <th className="p-2 text-left">Tipo</th>
                  <th className="p-2 text-left">Origem</th>
                  <th className="p-2 text-right">Minutos</th>
                  <th className="p-2 text-right">Saldo</th>
                  <th className="p-2 text-left">Observação</th>
                  {podeEditar && <th className="p-2"></th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {extrato.movimentos.map((m) => (
                  <tr key={m.id}>
                    <td className="p-2 font-mono">{m.data.split("-").reverse().join("/")}</td>
                    <td className="p-2">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs ${m.tipo === "credito" ? "bg-green-500/15 text-green-700" : "bg-red-500/15 text-red-700"}`}>
                        {m.tipo === "credito" ? "Crédito" : "Débito"}
                      </span>
                    </td>
                    <td className="p-2 text-xs">{m.origem}</td>
                    <td className="p-2 text-right font-mono">{m.tipo === "credito" ? "+" : "-"}{m.minutos}m</td>
                    <td className={`p-2 text-right font-mono font-bold ${m.saldoApos >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {formatSaldoMin(m.saldoApos)}
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">{m.observacao}</td>
                    {podeEditar && (
                      <td className="p-2">
                        {m.origem === "ajuste" && (
                          <Button size="sm" variant="ghost" onClick={() => remover(m.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          }
        </CardContent>
      </Card>

      <Dialog open={ajusteOpen} onOpenChange={setAjusteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Lançar ajuste manual</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Data</Label>
              <Input type="date" value={aj.data} onChange={(e) => setAj({ ...aj, data: e.target.value })} />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={aj.tipo} onValueChange={(v) => setAj({ ...aj, tipo: v as "credito" | "debito" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="credito">Crédito (+)</SelectItem>
                  <SelectItem value="debito">Débito (−)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Horas</Label>
                <Input type="number" min={0} value={aj.horas} onChange={(e) => setAj({ ...aj, horas: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Minutos</Label>
                <Input type="number" min={0} max={59} value={aj.minutos} onChange={(e) => setAj({ ...aj, minutos: Number(e.target.value) })} />
              </div>
            </div>
            <div>
              <Label>Observação</Label>
              <Textarea value={aj.obs} onChange={(e) => setAj({ ...aj, obs: e.target.value })} placeholder="Motivo do ajuste" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAjusteOpen(false)}>Cancelar</Button>
            <Button onClick={salvarAjuste}>Lançar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
