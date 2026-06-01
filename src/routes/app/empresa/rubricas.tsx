import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { TIPO_CALCULO_OPCOES, type TipoCalculo } from "@/lib/holerite-rubricas";

export const Route = createFileRoute("/app/empresa/rubricas")({
  component: RubricasPage,
});

type TipoRubrica = "provento" | "desconto" | "informativo" | "resultado";
type ModoRubrica = "automatico" | "semi_automatico" | "manual";
type Rubrica = {
  id: string;
  codigo: string;
  descricao: string;
  tipo: TipoRubrica;
  tipo_calculo: TipoCalculo;
  valor_referencia: number;
  ativo: boolean;
  grupo: string | null;
  base_calculo: string | null;
  padrao_sistema: boolean;
  modo: ModoRubrica;
  editavel_manual: boolean;
};

const TIPO_BADGE: Record<TipoRubrica, { label: string; cls: string }> = {
  provento: { label: "Provento", cls: "bg-green-500/20 text-green-700" },
  desconto: { label: "Desconto", cls: "bg-red-500/20 text-red-700" },
  informativo: { label: "Informativo", cls: "bg-blue-500/20 text-blue-700" },
  resultado: { label: "Resultado", cls: "bg-purple-500/20 text-purple-700" },
};

const RUBRICAS_OBRIGATORIAS: Array<
  Partial<Rubrica> & {
    codigo: string;
    descricao: string;
    tipo: TipoRubrica;
    modo: ModoRubrica;
    tipo_calculo: TipoCalculo;
  }
> = [
  {
    codigo: "00005",
    descricao: "SALARIO CONTRATUAL",
    tipo: "provento",
    modo: "automatico",
    tipo_calculo: "salario_dias_trabalhados",
    grupo: "00100 - Proventos",
    ativo: true,
    padrao_sistema: true,
    editavel_manual: false,
    valor_referencia: 0,
  },
  {
    codigo: "00070",
    descricao: "ADICIONAL NOTURNO",
    tipo: "provento",
    modo: "automatico",
    tipo_calculo: "adicional_noturno",
    grupo: "00100 - Proventos",
    ativo: true,
    padrao_sistema: true,
    editavel_manual: false,
    valor_referencia: 20,
  },
  {
    codigo: "00075",
    descricao: "DSR ADICIONAL NOTURNO",
    tipo: "provento",
    modo: "automatico",
    tipo_calculo: "dsr_adicional_noturno",
    grupo: "00100 - Proventos",
    ativo: true,
    padrao_sistema: true,
    editavel_manual: false,
    valor_referencia: 0,
  },
  {
    codigo: "00090",
    descricao: "HORAS EXTRAS 50%",
    tipo: "provento",
    modo: "automatico",
    tipo_calculo: "horas_extras_50",
    grupo: "00100 - Proventos",
    ativo: true,
    padrao_sistema: true,
    editavel_manual: false,
    valor_referencia: 50,
  },
  {
    codigo: "00115",
    descricao: "DSR HORAS EXTRAS 50%",
    tipo: "provento",
    modo: "automatico",
    tipo_calculo: "dsr_he",
    grupo: "00100 - Proventos",
    ativo: true,
    padrao_sistema: true,
    editavel_manual: false,
    valor_referencia: 0,
  },
  {
    codigo: "00120",
    descricao: "FECHAMENTO BH",
    tipo: "provento",
    modo: "automatico",
    tipo_calculo: "bh_positivo_pago",
    grupo: "00100 - Proventos e descontos",
    ativo: true,
    padrao_sistema: true,
    editavel_manual: false,
    valor_referencia: 50,
  },

  {
    codigo: "07000",
    descricao: "INSS MES",
    tipo: "desconto",
    modo: "automatico",
    tipo_calculo: "inss_automatico",
    grupo: "00200 - Descontos",
    ativo: true,
    padrao_sistema: true,
    editavel_manual: false,
    valor_referencia: 0,
  },
  {
    codigo: "07030",
    descricao: "VALE TRANSPORTE",
    tipo: "desconto",
    modo: "automatico",
    tipo_calculo: "vt_automatico",
    grupo: "00200 - Descontos",
    ativo: true,
    padrao_sistema: true,
    editavel_manual: false,
    valor_referencia: 6,
  },
  {
    codigo: "07035",
    descricao: "FALTA INJUSTIFICADA",
    tipo: "desconto",
    modo: "automatico",
    tipo_calculo: "faltas_auto",
    grupo: "00200 - Descontos",
    ativo: true,
    padrao_sistema: true,
    editavel_manual: false,
    valor_referencia: 0,
  },
  {
    codigo: "07040",
    descricao: "DESCONTO DSR FALTA INJUST",
    tipo: "desconto",
    modo: "automatico",
    tipo_calculo: "dsr_faltas",
    grupo: "00200 - Descontos",
    ativo: true,
    padrao_sistema: true,
    editavel_manual: false,
    valor_referencia: 0,
  },
  {
    codigo: "07065",
    descricao: "ADIANTAMENTO SALARIAL",
    tipo: "desconto",
    modo: "automatico",
    tipo_calculo: "adto_quinzenal_auto",
    grupo: "00200 - Descontos",
    ativo: true,
    padrao_sistema: true,
    editavel_manual: true,
    valor_referencia: 40,
  },
  {
    codigo: "09995",
    descricao: "COMP INSUF MES ANTERIOR",
    tipo: "desconto",
    modo: "automatico",
    tipo_calculo: "manual",
    grupo: "00200 - Descontos",
    ativo: true,
    padrao_sistema: true,
    editavel_manual: false,
    valor_referencia: 0,
  },

  {
    codigo: "09990",
    descricao: "INSUFICIENCIA DE SALDO",
    tipo: "informativo",
    modo: "automatico",
    tipo_calculo: "manual",
    grupo: "00900 - Informativos",
    ativo: true,
    padrao_sistema: true,
    editavel_manual: false,
    valor_referencia: 0,
  },
  {
    codigo: "18445",
    descricao: "QTD HORAS CESTA BASICA",
    tipo: "informativo",
    modo: "automatico",
    tipo_calculo: "cesta_basica_auto",
    grupo: "00900 - Informativos",
    ativo: true,
    padrao_sistema: true,
    editavel_manual: false,
    valor_referencia: 0,
  },
  {
    codigo: "28651",
    descricao: "SALDO BANCO DE HORAS POSITIVO",
    tipo: "informativo",
    modo: "automatico",
    tipo_calculo: "bh_positivo_pago",
    grupo: "00900 - Informativos",
    ativo: true,
    padrao_sistema: true,
    editavel_manual: false,
    valor_referencia: 0,
  },
  {
    codigo: "28652",
    descricao: "SALDO BANCO DE HORAS NEGATIVO",
    tipo: "informativo",
    modo: "automatico",
    tipo_calculo: "bh_negativo",
    grupo: "00900 - Informativos",
    ativo: true,
    padrao_sistema: true,
    editavel_manual: false,
    valor_referencia: 0,
  },
  {
    codigo: "09998",
    descricao: "QTDE HORAS BENEF",
    tipo: "informativo",
    modo: "automatico",
    tipo_calculo: "manual",
    grupo: "00900 - Informativos",
    ativo: true,
    padrao_sistema: true,
    editavel_manual: false,
    valor_referencia: 0,
  },
];

const MODO_BADGE: Record<ModoRubrica, { label: string; cls: string }> = {
  automatico: { label: "Auto", cls: "bg-emerald-500/20 text-emerald-700" },
  semi_automatico: { label: "Semi", cls: "bg-amber-500/20 text-amber-700" },
  manual: { label: "Manual", cls: "bg-slate-500/20 text-slate-700" },
};

function RubricasPage() {
  const { empresaId, role } = useAuth();
  const podeEditar = role === "admin";
  const [lista, setLista] = useState<Rubrica[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Rubrica | null>(null);
  const [busca, setBusca] = useState("");

  const garantirRubricasObrigatorias = async () => {
    if (!empresaId) return;

    const { data: existentes, error: errExistentes } = await supabase
      .from("holerite_rubricas")
      .select("codigo")
      .eq("empresa_id", empresaId);

    if (errExistentes) throw errExistentes;

    const codigosExistentes = new Set((existentes ?? []).map((r) => r.codigo));
    const faltantes = RUBRICAS_OBRIGATORIAS.filter((r) => !codigosExistentes.has(r.codigo));

    if (faltantes.length === 0) return;

    const { error } = await supabase.from("holerite_rubricas").insert(
      faltantes.map((r) => ({
        empresa_id: empresaId,
        codigo: r.codigo,
        descricao: r.descricao,
        tipo: r.tipo,
        tipo_calculo: r.tipo_calculo,
        valor_referencia: r.valor_referencia ?? 0,
        ativo: r.ativo ?? true,
        grupo: r.grupo ?? null,
        base_calculo: r.base_calculo ?? null,
        padrao_sistema: r.padrao_sistema ?? true,
        modo: r.modo,
        editavel_manual: r.editavel_manual ?? false,
      })),
    );

    if (error) throw error;
  };

  const listaFiltrada = (() => {
    const q = busca.trim().toLowerCase();
    if (!q) return lista;
    return lista.filter(
      (r) =>
        r.codigo.toLowerCase().includes(q) ||
        r.descricao.toLowerCase().includes(q) ||
        (r.grupo ?? "").toLowerCase().includes(q) ||
        r.tipo.toLowerCase().includes(q),
    );
  })();

  const carregar = async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      await garantirRubricasObrigatorias();

      const { data, error } = await supabase
        .from("holerite_rubricas")
        .select("*")
        .eq("empresa_id", empresaId)
        .order("codigo", { ascending: true });

      if (error) throw error;

      setLista((data ?? []) as Rubrica[]);
    } catch (e) {
      console.error("[rubricas] erro ao carregar rubricas", e);
      toast.error(e instanceof Error ? e.message : "Erro ao carregar rubricas");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void carregar(); /* eslint-disable-next-line */
  }, [empresaId]);

  const remover = async (r: Rubrica) => {
    if (!confirm(`Remover rubrica ${r.codigo}?`)) return;
    const { error } = await supabase.from("holerite_rubricas").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("Removida");
    await carregar();
  };

  if (!empresaId) return <p className="text-sm text-muted-foreground">Cadastre primeiro os dados da empresa.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold">Rubricas do Holerite</h2>
          <p className="text-sm text-muted-foreground">
            Cadastre códigos (proventos e descontos) usados nos holerites. Durante a montagem, basta selecionar o código
            e o sistema preenche descrição e valor automaticamente.
          </p>
        </div>
        {podeEditar && (
          <Button
            onClick={() => {
              setEdit(null);
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1" />
            Nova rubrica
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-3">
          <Input
            placeholder="Buscar por código, descrição, grupo ou tipo..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div>
          ) : listaFiltrada.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {busca ? "Nenhuma rubrica encontrada para a busca." : "Nenhuma rubrica cadastrada."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left p-2 w-20">Código</th>
                    <th className="text-left p-2">Descrição</th>
                    <th className="text-left p-2 w-48">Grupo</th>
                    <th className="text-left p-2 w-28">Tipo</th>
                    <th className="text-left p-2 w-20">Modo</th>
                    <th className="text-left p-2">Cálculo</th>
                    <th className="text-right p-2 w-28">Referência</th>
                    <th className="text-left p-2 w-20">Status</th>
                    {podeEditar && <th className="text-right p-2 w-24">Ações</th>}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {listaFiltrada.map((r) => {
                    const badge = TIPO_BADGE[r.tipo];
                    const mb = MODO_BADGE[r.modo ?? "manual"];
                    return (
                      <tr key={r.id} className="hover:bg-muted/30">
                        <td className="p-2 font-mono">{r.codigo}</td>
                        <td className="p-2">{r.descricao}</td>
                        <td className="p-2 text-xs text-muted-foreground">{r.grupo ?? "—"}</td>
                        <td className="p-2">
                          <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${badge.cls}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="p-2">
                          <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${mb.cls}`}>
                            {mb.label}
                          </span>
                        </td>
                        <td className="p-2 text-xs">
                          {TIPO_CALCULO_OPCOES.find((o) => o.value === r.tipo_calculo)?.label ?? r.tipo_calculo}
                        </td>
                        <td className="p-2 text-right font-mono">
                          {Number(r.valor_referencia).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-2 text-xs">{r.ativo ? "Ativa" : "Inativa"}</td>
                        {podeEditar && (
                          <td className="p-2 text-right whitespace-nowrap space-x-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEdit(r);
                                setOpen(true);
                              }}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => remover(r)} disabled={r.padrao_sistema}>
                              <Trash2 className="h-3 w-3 text-red-600" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {open && empresaId && (
        <EditorRubrica
          empresaId={empresaId}
          rubrica={edit}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            void carregar();
          }}
        />
      )}
    </div>
  );
}

function EditorRubrica({
  empresaId,
  rubrica,
  onClose,
  onSaved,
}: {
  empresaId: string;
  rubrica: Rubrica | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [codigo, setCodigo] = useState(rubrica?.codigo ?? "");
  const [descricao, setDescricao] = useState(rubrica?.descricao ?? "");
  const [tipo, setTipo] = useState<TipoRubrica>(rubrica?.tipo ?? "provento");
  const [tipoCalculo, setTipoCalculo] = useState<TipoCalculo>(rubrica?.tipo_calculo ?? "manual");
  const [valorRef, setValorRef] = useState(rubrica?.valor_referencia ?? 0);
  const [ativo, setAtivo] = useState(rubrica?.ativo ?? true);
  const [modo, setModo] = useState<ModoRubrica>(rubrica?.modo ?? "manual");
  const [editavelManual, setEditavelManual] = useState(rubrica?.editavel_manual ?? true);
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    if (!codigo.trim() || !descricao.trim()) return toast.error("Preencha código e descrição");
    if (!/^[0-9]{5}$/.test(codigo.trim())) return toast.error("O código deve ter exatamente 5 dígitos numéricos");
    setSalvando(true);
    const payload = {
      empresa_id: empresaId,
      codigo: codigo.trim(),
      descricao: descricao.trim(),
      tipo,
      tipo_calculo: tipoCalculo,
      valor_referencia: Number(valorRef) || 0,
      ativo,
      modo,
      editavel_manual: editavelManual,
    };
    const q = rubrica
      ? supabase.from("holerite_rubricas").update(payload).eq("id", rubrica.id)
      : supabase.from("holerite_rubricas").insert(payload);
    const { error } = await q;
    setSalvando(false);
    if (error) return toast.error(error.message);
    toast.success("Salvo");
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{rubrica ? "Editar rubrica" : "Nova rubrica"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Código (5 dígitos)</Label>
              <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="00005" maxLength={5} />
            </div>
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select value={tipo} onValueChange={(v: TipoRubrica) => setTipo(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="provento">Provento (soma)</SelectItem>
                  <SelectItem value="desconto">Desconto (subtrai)</SelectItem>
                  <SelectItem value="informativo">Informativo (não altera líquido)</SelectItem>
                  <SelectItem value="resultado">Resultado (calculado pelo sistema)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Descrição</Label>
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="SALARIO BASE" />
          </div>
          <div>
            <Label className="text-xs">Tipo de cálculo</Label>
            <Select value={tipoCalculo} onValueChange={(v: TipoCalculo) => setTipoCalculo(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPO_CALCULO_OPCOES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground mt-1">
              {TIPO_CALCULO_OPCOES.find((o) => o.value === tipoCalculo)?.help}
            </p>
          </div>
          <div>
            <Label className="text-xs">Valor de referência</Label>
            <Input type="number" step="0.01" value={valorRef} onChange={(e) => setValorRef(Number(e.target.value))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Modo</Label>
              <Select value={modo} onValueChange={(v: ModoRubrica) => setModo(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="automatico">Automático (sistema calcula)</SelectItem>
                  <SelectItem value="semi_automatico">Semi-automático (sugere, admin confirma)</SelectItem>
                  <SelectItem value="manual">Manual (operador digita)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-end gap-2 text-sm pb-2">
              <input type="checkbox" checked={editavelManual} onChange={(e) => setEditavelManual(e.target.checked)} />
              Permitir edição manual
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
            Ativa
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
