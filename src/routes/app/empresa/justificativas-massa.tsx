import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Users2 } from "lucide-react";
import { listarJustificativasTipos, type JustificativaTipo } from "@/lib/justificativas";

export const Route = createFileRoute("/app/empresa/justificativas-massa")({
  component: MassaPage,
});

type Func = { id: string; nome: string; cargo: string | null; status: string };

function MassaPage() {
  const { empresaId, role, user } = useAuth();
  const [tipos, setTipos] = useState<JustificativaTipo[]>([]);
  const [tipoId, setTipoId] = useState("");
  const [funcs, setFuncs] = useState<Func[]>([]);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [filtroCargo, setFiltroCargo] = useState<string>("todos");
  const hoje = new Date().toISOString().slice(0, 10);
  const [dataInicio, setDataInicio] = useState(hoje);
  const [dataFim, setDataFim] = useState(hoje);
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!empresaId) return;
    listarJustificativasTipos(empresaId).then((all) => {
      setTipos(all.filter((t) => t.ativo && t.pode_aplicar_massa));
    });
    supabase.from("funcionarios").select("id,nome,cargo,status")
      .eq("empresa_id", empresaId).eq("status", "ativo").order("nome")
      .then(({ data }) => setFuncs((data ?? []) as Func[]));
  }, [empresaId]);

  const tipo = tipos.find((t) => t.id === tipoId);
  const cargos = Array.from(new Set(funcs.map((f) => f.cargo).filter(Boolean) as string[]));
  const visiveis = filtroCargo === "todos" ? funcs : funcs.filter((f) => f.cargo === filtroCargo);

  const toggleAll = () => {
    if (selecionados.size === visiveis.length) setSelecionados(new Set());
    else setSelecionados(new Set(visiveis.map((f) => f.id)));
  };

  const aplicar = async () => {
    if (!empresaId || !user || !tipo) { toast.error("Selecione a justificativa"); return; }
    if (selecionados.size === 0) { toast.error("Selecione ao menos um funcionário"); return; }
    if (dataFim < dataInicio) { toast.error("Período inválido"); return; }
    if (tipo.exige_observacao && !obs.trim()) { toast.error("Esta justificativa exige observação"); return; }
    setSaving(true);
    try {
      // gera lista de datas
      const datas: string[] = [];
      const ini = new Date(dataInicio + "T00:00");
      const fim = new Date(dataFim + "T00:00");
      for (let d = new Date(ini); d <= fim; d.setDate(d.getDate() + 1)) {
        datas.push(d.toISOString().slice(0, 10));
      }

      const status = tipo.exige_aprovacao ? "pendente" : "aprovada";
      const rows = [];
      for (const fid of selecionados) {
        for (const dt of datas) {
          rows.push({
            empresa_id: empresaId,
            funcionario_id: fid,
            tipo_id: tipo.id,
            data: dt,
            data_inicio: dataInicio,
            data_fim: dataFim,
            observacao: obs.trim() || null,
            status,
            aplicado_por: user.id,
            aprovado_por: status === "aprovada" ? user.id : null,
            aprovado_em: status === "aprovada" ? new Date().toISOString() : null,
          });
        }
      }

      // remove justificativas existentes no mesmo (func, data)
      for (const fid of selecionados) {
        await supabase.from("justificativas_aplicadas")
          .delete().eq("funcionario_id", fid)
          .gte("data", dataInicio).lte("data", dataFim);
      }

      // insere em lotes
      const chunk = 500;
      for (let i = 0; i < rows.length; i += chunk) {
        const { error } = await supabase.from("justificativas_aplicadas").insert(rows.slice(i, i + chunk));
        if (error) throw error;
      }
      toast.success(`${rows.length} justificativa(s) aplicada(s).`);
      setSelecionados(new Set());
      setObs("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!empresaId) return <p className="text-sm text-muted-foreground">Cadastre primeiro a empresa.</p>;
  if (role !== "admin" && role !== "gerente") return <p className="text-sm">Acesso restrito.</p>;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Aplicar justificativa em massa</h2>
        <p className="text-sm text-muted-foreground">Aplica a mesma justificativa para vários funcionários em um período.</p>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>Justificativa</Label>
              <Select value={tipoId} onValueChange={setTipoId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {tipos.map((t) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              {tipo?.descricao && <p className="text-xs text-muted-foreground mt-1">{tipo.descricao}</p>}
            </div>
            <div>
              <Label>Data inicial</Label>
              <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
            </div>
            <div>
              <Label>Data final</Label>
              <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Observação{tipo?.exige_observacao && <span className="text-destructive"> *</span>}</Label>
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} maxLength={500} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Users2 className="h-4 w-4" />
              <span className="font-semibold">Funcionários ({selecionados.size}/{visiveis.length})</span>
            </div>
            <div className="flex items-center gap-2">
              <Select value={filtroCargo} onValueChange={setFiltroCargo}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os cargos</SelectItem>
                  {cargos.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={toggleAll}>
                {selecionados.size === visiveis.length ? "Limpar" : "Selecionar todos"}
              </Button>
            </div>
          </div>
          <div className="border rounded max-h-80 overflow-y-auto divide-y">
            {visiveis.map((f) => (
              <label key={f.id} className="flex items-center gap-3 px-3 py-2 hover:bg-accent cursor-pointer">
                <Checkbox
                  checked={selecionados.has(f.id)}
                  onCheckedChange={(c) => {
                    const next = new Set(selecionados);
                    if (c) next.add(f.id); else next.delete(f.id);
                    setSelecionados(next);
                  }}
                />
                <div className="flex-1">
                  <div className="text-sm font-medium">{f.nome}</div>
                  {f.cargo && <div className="text-xs text-muted-foreground">{f.cargo}</div>}
                </div>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={aplicar} disabled={saving}>{saving ? "Aplicando..." : "Aplicar em massa"}</Button>
      </div>
    </div>
  );
}
