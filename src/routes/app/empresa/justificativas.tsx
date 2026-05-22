import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Pencil, Power } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  CATEGORIA_LABEL,
  listarJustificativasTipos,
  type AfetaAssiduidade,
  type JustificativaCategoria,
  type JustificativaTipo,
  type MovimentaBancoHoras,
} from "@/lib/justificativas";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/app/empresa/justificativas")({
  component: JustificativasPage,
});

type FormState = Omit<JustificativaTipo, "id" | "empresa_id" | "padrao_sistema">;

const FORM_VAZIO: FormState = {
  nome: "",
  codigo: "",
  categoria: "abono",
  desconta_salario: false,
  desconta_dsr: false,
  abona_ocorrencia: true,
  exige_aprovacao: false,
  exige_anexo: false,
  exige_observacao: false,
  movimenta_banco_horas: "nenhum",
  conta_dia_trabalhado: false,
  exige_marcacao_ponto: false,
  afeta_assiduidade: "nao",
  pode_aplicar_individual: true,
  pode_aplicar_massa: false,
  ativo: true,
  descricao: "",
};

function JustificativasPage() {
  const { empresaId, role } = useAuth();
  const isAdmin = role === "admin";
  const [tipos, setTipos] = useState<JustificativaTipo[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<JustificativaTipo | null>(null);
  const [form, setForm] = useState<FormState>(FORM_VAZIO);
  const [saving, setSaving] = useState(false);

  const carregar = async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      setTipos(await listarJustificativasTipos(empresaId));
    } catch (e) {
      toast.error("Erro ao carregar justificativas");
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  const abrirNovo = () => {
    setEditing(null);
    setForm(FORM_VAZIO);
    setDialogOpen(true);
  };

  const abrirEditar = (t: JustificativaTipo) => {
    setEditing(t);
    setForm({
      nome: t.nome,
      codigo: t.codigo,
      categoria: t.categoria,
      desconta_salario: t.desconta_salario,
      desconta_dsr: t.desconta_dsr,
      abona_ocorrencia: t.abona_ocorrencia,
      exige_aprovacao: t.exige_aprovacao,
      exige_anexo: t.exige_anexo,
      exige_observacao: t.exige_observacao,
      movimenta_banco_horas: t.movimenta_banco_horas,
      conta_dia_trabalhado: t.conta_dia_trabalhado,
      exige_marcacao_ponto: t.exige_marcacao_ponto,
      afeta_assiduidade: t.afeta_assiduidade,
      pode_aplicar_individual: t.pode_aplicar_individual,
      pode_aplicar_massa: t.pode_aplicar_massa,
      ativo: t.ativo,
      descricao: t.descricao ?? "",
    });
    setDialogOpen(true);
  };

  const salvar = async () => {
    if (!empresaId) return;
    if (!form.nome.trim() || !form.codigo.trim()) {
      toast.error("Informe nome e código");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        empresa_id: empresaId,
        codigo: form.codigo.trim().toUpperCase().replace(/\s+/g, "_"),
        descricao: form.descricao?.trim() || null,
      };
      if (editing) {
        const { error } = await supabase
          .from("justificativas_tipos")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Justificativa atualizada");
      } else {
        const { error } = await supabase
          .from("justificativas_tipos")
          .insert(payload);
        if (error) throw error;
        toast.success("Justificativa criada");
      }
      setDialogOpen(false);
      await carregar();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao salvar";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const toggleAtivo = async (t: JustificativaTipo) => {
    const { error } = await supabase
      .from("justificativas_tipos")
      .update({ ativo: !t.ativo })
      .eq("id", t.id);
    if (error) toast.error("Erro ao alterar status");
    else {
      toast.success(t.ativo ? "Desativada" : "Ativada");
      await carregar();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Justificativas de irregularidade</h2>
          <p className="text-sm text-muted-foreground">
            Tipos de justificativa aplicáveis a faltas, atrasos, ausências e divergências de ponto.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={abrirNovo}>
            <Plus className="h-4 w-4 mr-1" /> Nova justificativa
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tipos cadastrados ({tipos.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-sm text-muted-foreground">Carregando...</div>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Desconta</TableHead>
                    <TableHead>Banco horas</TableHead>
                    <TableHead>Anexo</TableHead>
                    <TableHead>Aprovação</TableHead>
                    <TableHead>Assiduidade</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tipos.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>
                        <div className="font-medium">{t.nome}</div>
                        <div className="text-xs text-muted-foreground">{t.codigo}</div>
                      </TableCell>
                      <TableCell>{CATEGORIA_LABEL[t.categoria]}</TableCell>
                      <TableCell>
                        {t.desconta_salario ? (
                          <Badge variant="destructive">Salário{t.desconta_dsr ? " + DSR" : ""}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {t.movimenta_banco_horas === "credito" ? (
                          <Badge className="bg-green-500/20 text-green-700 hover:bg-green-500/20">Crédito</Badge>
                        ) : t.movimenta_banco_horas === "debito" ? (
                          <Badge className="bg-orange-500/20 text-orange-700 hover:bg-orange-500/20">Débito</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>{t.exige_anexo ? "Sim" : "—"}</TableCell>
                      <TableCell>{t.exige_aprovacao ? "Sim" : "—"}</TableCell>
                      <TableCell>
                        {t.afeta_assiduidade === "sim" ? "Afeta" : t.afeta_assiduidade === "configuravel" ? "Configurável" : "Não afeta"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={t.ativo ? "default" : "secondary"}>
                          {t.ativo ? "Ativo" : "Inativo"}
                        </Badge>
                        {t.padrao_sistema && (
                          <Badge variant="outline" className="ml-1">Padrão</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        {isAdmin && (
                          <>
                            <Button size="icon" variant="ghost" onClick={() => abrirEditar(t)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => toggleAtivo(t)} title={t.ativo ? "Desativar" : "Ativar"}>
                              <Power className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Editar: ${editing.nome}` : "Nova justificativa"}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Nome</Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                maxLength={80}
              />
            </div>
            <div>
              <Label>Código</Label>
              <Input
                value={form.codigo}
                onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                disabled={!!editing?.padrao_sistema}
                maxLength={40}
                placeholder="EX: ABONO_GERENTE"
              />
              {editing?.padrao_sistema && (
                <p className="text-xs text-muted-foreground mt-1">
                  Código fixo: usado pelo sistema como chave da regra de cálculo.
                </p>
              )}
            </div>
            <div>
              <Label>Categoria</Label>
              <Select
                value={form.categoria}
                onValueChange={(v) => setForm({ ...form, categoria: v as JustificativaCategoria })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORIA_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Movimenta banco de horas</Label>
              <Select
                value={form.movimenta_banco_horas}
                onValueChange={(v) => setForm({ ...form, movimenta_banco_horas: v as MovimentaBancoHoras })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhum">Não movimenta</SelectItem>
                  <SelectItem value="credito">Crédito</SelectItem>
                  <SelectItem value="debito">Débito</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Afeta cesta básica / assiduidade</Label>
              <Select
                value={form.afeta_assiduidade}
                onValueChange={(v) => setForm({ ...form, afeta_assiduidade: v as AfetaAssiduidade })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nao">Não afeta</SelectItem>
                  <SelectItem value="sim">Afeta (perde benefício)</SelectItem>
                  <SelectItem value="configuravel">Configurável por empresa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>Descrição</Label>
              <Textarea
                value={form.descricao ?? ""}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                rows={2}
                maxLength={500}
              />
            </div>

            <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t">
              <FlagRow label="Desconta salário" value={form.desconta_salario} onChange={(v) => setForm({ ...form, desconta_salario: v })} />
              <FlagRow label="Desconta DSR" value={form.desconta_dsr} onChange={(v) => setForm({ ...form, desconta_dsr: v })} />
              <FlagRow label="Abona a ocorrência" value={form.abona_ocorrencia} onChange={(v) => setForm({ ...form, abona_ocorrencia: v })} />
              <FlagRow label="Exige aprovação" value={form.exige_aprovacao} onChange={(v) => setForm({ ...form, exige_aprovacao: v })} />
              <FlagRow label="Exige anexo" value={form.exige_anexo} onChange={(v) => setForm({ ...form, exige_anexo: v })} />
              <FlagRow label="Exige observação" value={form.exige_observacao} onChange={(v) => setForm({ ...form, exige_observacao: v })} />
              <FlagRow label="Conta como dia trabalhado" value={form.conta_dia_trabalhado} onChange={(v) => setForm({ ...form, conta_dia_trabalhado: v })} />
              <FlagRow label="Exige marcação de ponto" value={form.exige_marcacao_ponto} onChange={(v) => setForm({ ...form, exige_marcacao_ponto: v })} />
              <FlagRow label="Pode aplicar individualmente" value={form.pode_aplicar_individual} onChange={(v) => setForm({ ...form, pode_aplicar_individual: v })} />
              <FlagRow label="Pode aplicar em massa" value={form.pode_aplicar_massa} onChange={(v) => setForm({ ...form, pode_aplicar_massa: v })} />
              <FlagRow label="Ativo" value={form.ativo} onChange={(v) => setForm({ ...form, ativo: v })} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FlagRow({
  label, value, onChange,
}: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-md border p-2.5">
      <span className="text-sm">{label}</span>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}
