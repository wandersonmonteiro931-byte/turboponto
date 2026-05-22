import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { TIPOS_PONTO, tipoLabel } from "@/lib/ponto";

export type RegistroEdit = {
  id: string;
  empresa_id: string;
  funcionario_id: string;
  data_referencia: string;
  tipo_ponto: string;
  horario_registrado: string;
  observacao: string | null;
};

export function EditarPontoDialog({
  open, onClose, registro, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  registro: RegistroEdit | null;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [tipo, setTipo] = useState("entrada");
  const [data, setData] = useState("");
  const [hora, setHora] = useState("");
  const [observacao, setObservacao] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [historico, setHistorico] = useState<Array<{ campo_alterado: string; valor_antigo: string | null; valor_novo: string | null; justificativa: string; created_at: string }>>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!registro) return;
    setTipo(registro.tipo_ponto);
    setData(registro.data_referencia);
    const d = new Date(registro.horario_registrado);
    setHora(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
    setObservacao(registro.observacao ?? "");
    setJustificativa("");
    supabase.from("alteracoes_ponto").select("campo_alterado,valor_antigo,valor_novo,justificativa,created_at")
      .eq("registro_ponto_id", registro.id).order("created_at", { ascending: false })
      .then(({ data }) => setHistorico(data ?? []));
  }, [registro]);

  const salvar = async () => {
    if (!registro || !user) return;
    if (!justificativa.trim()) { toast.error("Justificativa é obrigatória."); return; }
    setSaving(true);

    const dataRef = data || registro.data_referencia;
    const [h, m] = hora.split(":").map(Number);
    const novoTs = new Date(`${dataRef}T00:00:00`);
    novoTs.setHours(h, m, 0, 0);
    const novoIso = novoTs.toISOString();

    const horaAntiga = new Date(registro.horario_registrado);
    const horaAntigaStr = `${String(horaAntiga.getHours()).padStart(2, "0")}:${String(horaAntiga.getMinutes()).padStart(2, "0")}`;

    const alteracoes: Array<{ campo: string; antigo: string | null; novo: string | null }> = [];
    if (tipo !== registro.tipo_ponto) alteracoes.push({ campo: "tipo_ponto", antigo: registro.tipo_ponto, novo: tipo });
    if (dataRef !== registro.data_referencia) alteracoes.push({ campo: "data_referencia", antigo: registro.data_referencia, novo: dataRef });
    if (hora !== horaAntigaStr) alteracoes.push({ campo: "horario_registrado", antigo: horaAntigaStr, novo: hora });
    if ((observacao || "") !== (registro.observacao ?? "")) alteracoes.push({ campo: "observacao", antigo: registro.observacao, novo: observacao });

    if (alteracoes.length === 0) { toast.error("Nenhuma alteração detectada."); setSaving(false); return; }

    const { error } = await supabase.from("registros_ponto")
      .update({ tipo_ponto: tipo, data_referencia: dataRef, horario_registrado: novoIso, observacao: observacao || null, status: "corrigido" })
      .eq("id", registro.id);
    if (error) { toast.error(error.message); setSaving(false); return; }

    await supabase.from("alteracoes_ponto").insert(alteracoes.map((a) => ({
      empresa_id: registro.empresa_id,
      registro_ponto_id: registro.id,
      funcionario_id: registro.funcionario_id,
      usuario_editor_id: user.id,
      campo_alterado: a.campo,
      valor_antigo: a.antigo,
      valor_novo: a.novo,
      justificativa,
    })));

    toast.success("Ponto atualizado.");
    setSaving(false);
    onSaved();
    onClose();
  };

  const excluir = async () => {
    if (!registro || !user) return;
    if (!justificativa.trim()) { toast.error("Justificativa é obrigatória."); return; }
    if (!confirm("Excluir este registro de ponto?")) return;
    await supabase.from("alteracoes_ponto").insert({
      empresa_id: registro.empresa_id,
      registro_ponto_id: registro.id,
      funcionario_id: registro.funcionario_id,
      usuario_editor_id: user.id,
      campo_alterado: "exclusao",
      valor_antigo: `${registro.tipo_ponto} ${new Date(registro.horario_registrado).toLocaleString("pt-BR")}`,
      valor_novo: null,
      justificativa,
    });
    const { error } = await supabase.from("registros_ponto").delete().eq("id", registro.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Registro excluído.");
    onSaved(); onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Editar registro de ponto</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS_PONTO.map((t) => <SelectItem key={t.v} value={t.v}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Data</Label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Horário</Label>
              <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Observação</Label>
            <Textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} />
          </div>
          <div>
            <Label className="text-xs">Justificativa (obrigatória)</Label>
            <Textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)} rows={2} placeholder="Motivo da alteração..." />
          </div>

          {historico.length > 0 && (
            <div>
              <Label className="text-xs">Histórico de alterações</Label>
              <div className="mt-1 max-h-40 overflow-y-auto border rounded p-2 space-y-2 text-xs">
                {historico.map((h, i) => (
                  <div key={i} className="border-l-2 pl-2">
                    <div className="text-muted-foreground">{new Date(h.created_at).toLocaleString("pt-BR")}</div>
                    <div><b>{h.campo_alterado}:</b> {h.valor_antigo ?? "—"} → {h.valor_novo ?? "—"}</div>
                    <div className="italic">"{h.justificativa}"</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="destructive" onClick={excluir} disabled={saving}>Excluir</Button>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function InserirPontoDialog({
  open, onClose, empresaId, funcionarios, onSaved, prefill,
}: {
  open: boolean;
  onClose: () => void;
  empresaId: string;
  funcionarios: Array<{ id: string; nome: string }>;
  onSaved: () => void;
  prefill?: { funcionarioId?: string; data?: string; tipo?: string; hora?: string };
}) {
  const { user } = useAuth();
  const [funcId, setFuncId] = useState("");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [tipo, setTipo] = useState("entrada");
  const [hora, setHora] = useState("08:00");
  const [observacao, setObservacao] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setFuncId(prefill?.funcionarioId ?? "");
      setData(prefill?.data ?? new Date().toISOString().slice(0, 10));
      setTipo(prefill?.tipo ?? "entrada");
      setHora(prefill?.hora ?? "08:00");
      setObservacao(""); setJustificativa("");
    }
  }, [open, prefill]);

  const salvar = async () => {
    if (!funcId) { toast.error("Selecione um funcionário."); return; }
    if (!justificativa.trim()) { toast.error("Justificativa é obrigatória."); return; }
    if (!user) return;
    setSaving(true);
    const [h, m] = hora.split(":").map(Number);
    const ts = new Date(`${data}T00:00:00`);
    ts.setHours(h, m, 0, 0);

    const { data: reg, error } = await supabase.from("registros_ponto").insert({
      empresa_id: empresaId,
      funcionario_id: funcId,
      data_referencia: data,
      tipo_ponto: tipo,
      horario_registrado: ts.toISOString(),
      origem: "empresa",
      status: "corrigido",
      observacao: observacao || null,
    }).select("id").single();

    if (error) { toast.error(error.message); setSaving(false); return; }

    await supabase.from("alteracoes_ponto").insert({
      empresa_id: empresaId,
      registro_ponto_id: reg.id,
      funcionario_id: funcId,
      usuario_editor_id: user.id,
      campo_alterado: "insercao",
      valor_antigo: null,
      valor_novo: `${tipo} ${hora}`,
      justificativa,
    });

    toast.success("Ponto inserido.");
    setSaving(false); onSaved(); onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Inserir ponto manual</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Funcionário</Label>
            <Select value={funcId} onValueChange={setFuncId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {funcionarios.map((f) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Data</Label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TIPOS_PONTO.map((t) => <SelectItem key={t.v} value={t.v}>{tipoLabel(t.v)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Horário</Label>
              <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Observação</Label>
            <Textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} />
          </div>
          <div>
            <Label className="text-xs">Justificativa (obrigatória)</Label>
            <Textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>Inserir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
