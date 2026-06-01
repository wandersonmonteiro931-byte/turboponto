import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { listarJustificativasTipos, type JustificativaTipo } from "@/lib/justificativas";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Props = {
  open: boolean;
  onClose: () => void;
  empresaId: string;
  funcionarioId: string;
  datas: string[];
  onSaved: () => void;
};

export function BulkJustificarDialog({ open, onClose, empresaId, funcionarioId, datas, onSaved }: Props) {
  const [tipos, setTipos] = useState<JustificativaTipo[]>([]);
  const [tipoId, setTipoId] = useState("");
  const [observacao, setObservacao] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !empresaId) return;
    listarJustificativasTipos(empresaId).then((all) => {
      setTipos(all.filter((t) => t.ativo && t.pode_aplicar_individual && t.categoria !== "troca"));
    });
    setObservacao("");
    setTipoId("");
  }, [open, empresaId]);

  const tipo = tipos.find((t) => t.id === tipoId);

  const salvar = async () => {
    if (!tipo) {
      toast.error("Selecione uma justificativa");
      return;
    }
    if (tipo.exige_observacao && !observacao.trim()) {
      toast.error("Esta justificativa exige observação");
      return;
    }
    if (tipo.exige_anexo) {
      toast.error("Justificativas que exigem anexo não podem ser aplicadas em massa por esta tela");
      return;
    }
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sessão expirada");
      const status = tipo.exige_aprovacao ? "pendente" : "aprovada";
      const obs = observacao.trim() || null;

      // Permite mais de uma justificativa por dia.
      // Não apagamos justificativas existentes.
      const rows = datas.map((dt) => ({
        empresa_id: empresaId,
        funcionario_id: funcionarioId,
        tipo_id: tipo.id,
        data: dt,
        observacao: obs,
        status,
        aplicado_por: u.user.id,
        aprovado_por: status === "aprovada" ? u.user.id : null,
        aprovado_em: status === "aprovada" ? new Date().toISOString() : null,
        quantidade_minutos: null,
      }));
      const { error } = await supabase.from("justificativas_aplicadas").insert(rows);
      if (error) throw error;
      toast.success(`Justificativa aplicada em ${datas.length} dia(s).`);
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Justificar {datas.length} dia(s)</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Datas</Label>
            <div className="font-mono text-xs max-h-24 overflow-y-auto border rounded p-2">
              {datas.map((d) => d.split("-").reverse().join("/")).join(", ")}
            </div>
          </div>
          <div>
            <Label>Justificativa</Label>
            <Select value={tipoId} onValueChange={setTipoId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {tipos.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {tipo?.descricao && <p className="text-xs text-muted-foreground mt-1">{tipo.descricao}</p>}
          </div>
          <div>
            <Label>Observação{tipo?.exige_observacao && <span className="text-destructive"> *</span>}</Label>
            <Textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} maxLength={500} />
          </div>
          <p className="text-xs text-muted-foreground">
            As justificativas existentes serão mantidas; esta será adicionada como nova justificativa.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={saving}>
            {saving ? "Salvando..." : "Adicionar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
