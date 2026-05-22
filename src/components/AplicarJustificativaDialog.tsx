import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { listarJustificativasTipos, type JustificativaTipo } from "@/lib/justificativas";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2 } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  empresaId: string;
  funcionarioId: string;
  data: string;
  justificativaAtualId?: string | null;
  onSaved: () => void;
};

export function AplicarJustificativaDialog({
  open, onClose, empresaId, funcionarioId, data, justificativaAtualId, onSaved,
}: Props) {
  const [tipos, setTipos] = useState<JustificativaTipo[]>([]);
  const [tipoId, setTipoId] = useState<string>("");
  const [observacao, setObservacao] = useState("");
  const [dataCompensada, setDataCompensada] = useState("");
  const [anexo, setAnexo] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !empresaId) return;
    listarJustificativasTipos(empresaId).then((all) => {
      setTipos(all.filter((t) => t.ativo && t.pode_aplicar_individual));
    });
    setObservacao("");
    setTipoId("");
    setDataCompensada("");
    setAnexo(null);
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
    if (tipo.exige_anexo && !anexo) {
      toast.error("Esta justificativa exige anexo");
      return;
    }
    if (tipo.categoria === "troca" && !dataCompensada) {
      toast.error("Informe o dia compensado");
      return;
    }
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sessão expirada");
      const status = tipo.exige_aprovacao ? "pendente" : "aprovada";

      let anexoUrl: string | null = null;
      if (anexo) {
        const ext = anexo.name.split(".").pop()?.toLowerCase() || "bin";
        const path = `${empresaId}/${funcionarioId}/${data}-${crypto.randomUUID()}.${ext}`;
        const up = await supabase.storage.from("justificativas-anexos").upload(path, anexo, {
          upsert: false, contentType: anexo.type || undefined,
        });
        if (up.error) throw up.error;
        anexoUrl = path;
      }

      const baseRow = {
        empresa_id: empresaId,
        funcionario_id: funcionarioId,
        tipo_id: tipo.id,
        status,
        aplicado_por: u.user.id,
        aprovado_por: status === "aprovada" ? u.user.id : null,
        aprovado_em: status === "aprovada" ? new Date().toISOString() : null,
        anexo_url: anexoUrl,
      };


      const datasAlvo = tipo.categoria === "troca" ? [data, dataCompensada] : [data];
      const obsTrim = observacao.trim();
      const obsCross = tipo.categoria === "troca"
        ? `Troca: ${data.split("-").reverse().join("/")} ↔ ${dataCompensada.split("-").reverse().join("/")}${obsTrim ? ` · ${obsTrim}` : ""}`
        : (obsTrim || null);

      // remove justificativas anteriores nos dias afetados
      await supabase.from("justificativas_aplicadas")
        .delete()
        .eq("funcionario_id", funcionarioId)
        .in("data", datasAlvo);

      const rows = datasAlvo.map((dt) => ({ ...baseRow, data: dt, observacao: obsCross }));
      const { error } = await supabase.from("justificativas_aplicadas").insert(rows);
      if (error) throw error;
      toast.success(status === "aprovada" ? "Justificativa aplicada" : "Justificativa registrada (aguardando aprovação)");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const remover = async () => {
    if (!justificativaAtualId) return;
    if (!window.confirm("Remover a justificativa deste dia?")) return;
    setSaving(true);
    const { error } = await supabase.from("justificativas_aplicadas")
      .delete().eq("id", justificativaAtualId);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Justificativa removida");
      onSaved();
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Aplicar justificativa</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Dia</Label>
            <div className="font-mono text-sm">{data.split("-").reverse().join("/")}</div>
          </div>
          <div>
            <Label>Justificativa</Label>
            <Select value={tipoId} onValueChange={setTipoId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {tipos.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {tipo?.descricao && (
              <p className="text-xs text-muted-foreground mt-1">{tipo.descricao}</p>
            )}
            {tipo && (
              <div className="text-xs text-muted-foreground mt-1 space-x-2">
                {tipo.desconta_salario && <span className="text-red-600">Desconta salário</span>}
                {tipo.movimenta_banco_horas === "credito" && <span className="text-green-700">Crédito BH</span>}
                {tipo.movimenta_banco_horas === "debito" && <span className="text-orange-700">Débito BH</span>}
                {tipo.exige_aprovacao && <span>Exige aprovação</span>}
              </div>
            )}
          </div>
          {tipo?.categoria === "troca" && (
            <div>
              <Label>Dia compensado <span className="text-destructive">*</span></Label>
              <input
                type="date"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={dataCompensada}
                onChange={(e) => setDataCompensada(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Dia em que o funcionário trabalhou para compensar a ausência de {data.split("-").reverse().join("/")}.
              </p>
            </div>
          )}
          <div>
            <Label>
              Observação{tipo?.exige_observacao && <span className="text-destructive"> *</span>}
            </Label>
            <Textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={2}
              maxLength={500}
            />
          </div>
          <div>
            <Label>
              Anexo{tipo?.exige_anexo && <span className="text-destructive"> *</span>}
            </Label>
            <input
              type="file"
              accept="image/*,application/pdf"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              onChange={(e) => setAnexo(e.target.files?.[0] ?? null)}
            />
            {anexo && <p className="text-xs text-muted-foreground mt-1">{anexo.name}</p>}
          </div>
        </div>
        <DialogFooter className="flex-row justify-between">
          <div>
            {justificativaAtualId && (
              <Button variant="ghost" onClick={remover} disabled={saving} className="text-destructive">
                <Trash2 className="h-4 w-4 mr-1" /> Remover
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={salvar} disabled={saving}>{saving ? "Salvando..." : "Aplicar"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
