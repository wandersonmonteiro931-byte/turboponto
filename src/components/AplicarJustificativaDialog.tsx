import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { listarJustificativasTipos, type JustificativaTipo } from "@/lib/justificativas";
import { carregarVinculosAtivos, type VinculoAtivoComDias } from "@/lib/jornadas";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2 } from "lucide-react";

// O preenchimento das marcações faltantes do ESQUECIMENTO REGIST COLAB
// é feito por trigger no banco (preencher_marcacoes_esquecimento_registro_trg_fn),
// garantindo o horário previsto exato em America/Sao_Paulo.

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
  open,
  onClose,
  empresaId,
  funcionarioId,
  data,
  justificativaAtualId,
  onSaved,
}: Props) {
  const [tipos, setTipos] = useState<JustificativaTipo[]>([]);
  const [tipoId, setTipoId] = useState<string>("");
  const [observacao, setObservacao] = useState("");
  const [dataCompensada, setDataCompensada] = useState("");
  const [vinculos, setVinculos] = useState<VinculoAtivoComDias[]>([]);
  const [jornadaCompensacaoId, setJornadaCompensacaoId] = useState<string>("");

  const [anexo, setAnexo] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !empresaId) return;
    listarJustificativasTipos(empresaId).then((all) => {
      setTipos(all.filter((t) => t.ativo && t.pode_aplicar_individual));
    });
    if (funcionarioId) {
      carregarVinculosAtivos(funcionarioId).then(setVinculos).catch(() => setVinculos([]));
    }
    setObservacao("");
    setTipoId("");
    setDataCompensada("");
    setJornadaCompensacaoId("");

    setAnexo(null);
  }, [open, empresaId, funcionarioId]);

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
      toast.error("Informe obrigatoriamente a data que será compensada pela troca de folga");
      return;
    }
    if (tipo.categoria === "troca" && dataCompensada === data) {
      toast.error("A data da folga e a data compensada não podem ser iguais");
      return;
    }
    if (tipo.categoria === "troca" && !jornadaCompensacaoId) {
      toast.error("Selecione a escala que será usada para compensar a folga");
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
          upsert: false,
          contentType: anexo.type || undefined,
        });
        if (up.error) throw up.error;
        anexoUrl = path;
      }

      // Quantidade é calculada automaticamente conforme a jornada do funcionário
      const qtdMin: number | null = null;

      const baseRow = {
        empresa_id: empresaId,
        funcionario_id: funcionarioId,
        tipo_id: tipo.id,
        status,
        aplicado_por: u.user.id,
        aprovado_por: status === "aprovada" ? u.user.id : null,
        aprovado_em: status === "aprovada" ? new Date().toISOString() : null,
        anexo_url: anexoUrl,
        quantidade_minutos: qtdMin,
        jornada_compensacao_id: tipo.categoria === "troca" ? jornadaCompensacaoId : null,
      };

      const obsTrim = observacao.trim();

      const rows =
        tipo.categoria === "troca"
          ? [
              {
                ...baseRow,
                data,
                observacao: `TROCA FOLGA - folga em ${data.split("-").reverse().join("/")} compensada em ${dataCompensada.split("-").reverse().join("/")}${obsTrim ? ` · ${obsTrim}` : ""}`,
              },
              {
                ...baseRow,
                data: dataCompensada,
                observacao: `TROCA COMPENSADA - trabalho em ${dataCompensada.split("-").reverse().join("/")} compensando a folga de ${data.split("-").reverse().join("/")}${obsTrim ? ` · ${obsTrim}` : ""}`,
              },
            ]
          : [{ ...baseRow, data, observacao: obsTrim || null }];

      // Permite mais de uma justificativa no mesmo dia.
      // Não removemos justificativas anteriores; cada nova aplicação vira uma nova linha.
      const { error } = await supabase.from("justificativas_aplicadas").insert(rows);
      if (error) throw error;

      // Esquecimento de registro: o trigger no banco preenche as marcações em branco.

      toast.success(
        status === "aprovada" ? "Justificativa aplicada" : "Justificativa registrada (aguardando aprovação)",
      );
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
    const { error } = await supabase.from("justificativas_aplicadas").delete().eq("id", justificativaAtualId);
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
          <DialogTitle>Adicionar justificativa</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Dia</Label>
            <div className="font-mono text-sm">{data.split("-").reverse().join("/")}</div>
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
              <Label>
                Data que vai compensar esta folga <span className="text-destructive">*</span>
              </Label>
              <input
                type="date"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={dataCompensada}
                onChange={(e) => setDataCompensada(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                O sistema criará duas marcações de troca: TROCA FOLGA para {data.split("-").reverse().join("/")} e TROCA
                COMPENSADA para a data informada acima.
              </p>
            </div>
          )}
          <div>
            <Label>Observação{tipo?.exige_observacao && <span className="text-destructive"> *</span>}</Label>
            <Textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} maxLength={500} />
          </div>
          <div>
            <Label>Anexo{tipo?.exige_anexo && <span className="text-destructive"> *</span>}</Label>
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
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={saving}>
              {saving ? "Salvando..." : "Adicionar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
