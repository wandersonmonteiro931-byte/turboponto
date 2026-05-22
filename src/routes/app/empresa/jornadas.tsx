import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Power, PowerOff, Clock } from "lucide-react";
import {
  DIAS_SEMANA, Jornada, JornadaDia, calcMinutos, formatMin,
} from "@/lib/jornadas";

export const Route = createFileRoute("/app/empresa/jornadas")({
  component: JornadasPage,
});

type DiaForm = {
  dia_semana: number;
  trabalha: boolean;
  horario_entrada: string;
  horario_intervalo_saida: string;
  horario_intervalo_retorno: string;
  horario_saida: string;
};

const emptyDias = (): DiaForm[] =>
  DIAS_SEMANA.map((d) => ({
    dia_semana: d.v,
    trabalha: d.v >= 1 && d.v <= 5,
    horario_entrada: "",
    horario_intervalo_saida: "",
    horario_intervalo_retorno: "",
    horario_saida: "",
  }));

function JornadasPage() {
  const { empresaId, role } = useAuth();
  const isAdmin = role === "admin";
  const [list, setList] = useState<Jornada[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Jornada | null>(null);

  const reload = async () => {
    if (!empresaId) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("jornadas")
      .select("*")
      .eq("empresa_id", empresaId)
      .order("nome");
    if (error) toast.error(error.message);
    setList((data ?? []) as Jornada[]);
    setLoading(false);
  };

  useEffect(() => { reload(); }, [empresaId]);

  const toggleStatus = async (j: Jornada) => {
    const novo = j.status === "ativa" ? "inativa" : "ativa";
    const { error } = await (supabase.from("jornadas") as never as {
      update: (v: object) => { eq: (a: string, b: unknown) => Promise<{ error: { message: string } | null }> };
    }).update({ status: novo }).eq("id", j.id);
    if (error) return toast.error(error.message);
    toast.success(`Jornada ${novo}`);
    reload();
  };

  if (!empresaId) {
    return <p className="text-sm text-muted-foreground">Cadastre primeiro os dados da empresa.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold">Jornadas de trabalho</h2>
          <p className="text-sm text-muted-foreground">Defina os horários que serão usados para validar o ponto.</p>
        </div>
        {isAdmin && (
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button className="font-semibold" onClick={() => setEditing(null)}>
                <Plus className="h-4 w-4 mr-1" />Nova jornada
              </Button>
            </DialogTrigger>
            <JornadaDialog
              empresaId={empresaId}
              jornada={editing}
              onDone={() => { setOpen(false); setEditing(null); reload(); }}
            />
          </Dialog>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div>
          ) : list.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Nenhuma jornada cadastrada. Crie a primeira para começar a controlar o ponto.
            </div>
          ) : (
            <ul className="divide-y">
              {list.map((j) => (
                <li key={j.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold flex items-center gap-2">
                      <Clock className="h-4 w-4 text-primary" />
                      {j.nome}
                      <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${j.status === "ativa" ? "bg-green-500/20 text-green-700" : "bg-muted text-muted-foreground"}`}>
                        {j.status}
                      </span>
                    </div>
                    {j.descricao && <div className="text-xs text-muted-foreground mt-0.5">{j.descricao}</div>}
                    <div className="text-xs text-muted-foreground mt-1">
                      {(j.horario_entrada ?? "—").slice(0, 5)} → {(j.horario_intervalo_saida ?? "—").slice(0, 5)} / {(j.horario_intervalo_retorno ?? "—").slice(0, 5)} → {(j.horario_saida ?? "—").slice(0, 5)}
                      {" · "}{formatMin(j.carga_horaria_minutos)}/dia
                      {j.tolerancia_atraso_minutos > 0 && ` · tol. ${j.tolerancia_atraso_minutos}min`}
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(j); setOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => toggleStatus(j)} title={j.status === "ativa" ? "Inativar" : "Ativar"}>
                        {j.status === "ativa" ? <PowerOff className="h-4 w-4 text-red-600" /> : <Power className="h-4 w-4 text-green-600" />}
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function JornadaDialog({
  empresaId, jornada, onDone,
}: { empresaId: string; jornada: Jornada | null; onDone: () => void }) {
  const [nome, setNome] = useState(jornada?.nome ?? "");
  const [descricao, setDescricao] = useState(jornada?.descricao ?? "");
  const [entrada, setEntrada] = useState(jornada?.horario_entrada?.slice(0, 5) ?? "08:00");
  const [intSai, setIntSai] = useState(jornada?.horario_intervalo_saida?.slice(0, 5) ?? "12:00");
  const [intRet, setIntRet] = useState(jornada?.horario_intervalo_retorno?.slice(0, 5) ?? "13:00");
  const [saida, setSaida] = useState(jornada?.horario_saida?.slice(0, 5) ?? "17:00");
  const [tolerancia, setTolerancia] = useState(jornada?.tolerancia_atraso_minutos ?? 0);
  const [dias, setDias] = useState<DiaForm[]>(emptyDias());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!jornada) return;
    (async () => {
      const { data } = await supabase
        .from("jornadas_dias").select("*").eq("jornada_id", jornada.id).order("dia_semana");
      const rows = (data ?? []) as JornadaDia[];
      setDias(emptyDias().map((d) => {
        const r = rows.find((x) => x.dia_semana === d.dia_semana);
        return r ? {
          dia_semana: r.dia_semana,
          trabalha: r.trabalha,
          horario_entrada: r.horario_entrada?.slice(0, 5) ?? "",
          horario_intervalo_saida: r.horario_intervalo_saida?.slice(0, 5) ?? "",
          horario_intervalo_retorno: r.horario_intervalo_retorno?.slice(0, 5) ?? "",
          horario_saida: r.horario_saida?.slice(0, 5) ?? "",
        } : d;
      }));
    })();
  }, [jornada]);

  const carga = useMemo(() => calcMinutos(entrada, intSai, intRet, saida), [entrada, intSai, intRet, saida]);

  const toggleDia = (idx: number) => setDias((arr) => arr.map((d, i) => i === idx ? { ...d, trabalha: !d.trabalha } : d));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) return toast.error("Informe o nome");
    setSaving(true);
    try {
      const payload = {
        empresa_id: empresaId,
        nome: nome.trim(),
        descricao: descricao || null,
        horario_entrada: entrada,
        horario_intervalo_saida: intSai || null,
        horario_intervalo_retorno: intRet || null,
        horario_saida: saida,
        carga_horaria_minutos: carga,
        tolerancia_atraso_minutos: tolerancia,
      };
      let jornadaId = jornada?.id;
      if (jornada) {
        const { error } = await (supabase.from("jornadas") as never as {
          update: (v: object) => { eq: (a: string, b: unknown) => Promise<{ error: { message: string } | null }> };
        }).update(payload).eq("id", jornada.id);
        if (error) throw new Error(error.message);
      } else {
        const { data, error } = await supabase.from("jornadas").insert(payload as never).select("id").single();
        if (error) throw new Error(error.message);
        jornadaId = (data as { id: string }).id;
      }
      if (!jornadaId) throw new Error("Falha ao salvar");

      await supabase.from("jornadas_dias").delete().eq("jornada_id", jornadaId);
      const diasRows = dias.map((d) => ({
        jornada_id: jornadaId,
        dia_semana: d.dia_semana,
        trabalha: d.trabalha,
        horario_entrada: d.trabalha ? (d.horario_entrada || entrada) : null,
        horario_intervalo_saida: d.trabalha ? (d.horario_intervalo_saida || intSai || null) : null,
        horario_intervalo_retorno: d.trabalha ? (d.horario_intervalo_retorno || intRet || null) : null,
        horario_saida: d.trabalha ? (d.horario_saida || saida) : null,
      }));
      const { error: errD } = await supabase.from("jornadas_dias").insert(diasRows as never);
      if (errD) throw new Error(errD.message);

      toast.success("Jornada salva");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{jornada ? "Editar jornada" : "Nova jornada"}</DialogTitle>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <Label className="mb-1 block text-xs">Nome *</Label>
            <Input required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Jornada Padrão Turbo Lanches" />
          </div>
          <div className="md:col-span-2">
            <Label className="mb-1 block text-xs">Descrição</Label>
            <Input value={descricao ?? ""} onChange={(e) => setDescricao(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Entrada *</Label>
            <Input type="time" required value={entrada} onChange={(e) => setEntrada(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Saída para intervalo</Label>
            <Input type="time" value={intSai} onChange={(e) => setIntSai(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Retorno do intervalo</Label>
            <Input type="time" value={intRet} onChange={(e) => setIntRet(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Saída final *</Label>
            <Input type="time" required value={saida} onChange={(e) => setSaida(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Carga horária diária</Label>
            <Input value={formatMin(carga)} disabled />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Tolerância de atraso (min)</Label>
            <Input type="number" min={0} value={tolerancia} onChange={(e) => setTolerancia(Number(e.target.value) || 0)} />
          </div>
        </div>

        <div>
          <Label className="mb-2 block text-xs">Dias trabalhados</Label>
          <div className="flex flex-wrap gap-2">
            {dias.map((d, i) => (
              <button
                key={d.dia_semana}
                type="button"
                onClick={() => toggleDia(i)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium border transition ${
                  d.trabalha ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground"
                }`}
              >
                {DIAS_SEMANA[i].label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Os horários acima serão aplicados aos dias selecionados. Dias não selecionados são folgas.
          </p>
        </div>

        <DialogFooter>
          <Button type="submit" disabled={saving} className="font-semibold">
            {saving ? "Salvando..." : jornada ? "Salvar alterações" : "Criar jornada"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
