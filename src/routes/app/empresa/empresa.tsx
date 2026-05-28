import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Building2, Upload, Wifi, X, Plus } from "lucide-react";
import { getMeuIp } from "@/lib/ip-ponto.functions";

export const Route = createFileRoute("/app/empresa/empresa")({
  component: EmpresaPage,
});

type EmpresaForm = {
  nome_fantasia: string;
  razao_social: string;
  cnpj: string;
  telefone: string;
  email: string;
  endereco: string;
  responsavel: string;
  logo_url: string;
  horario_entrada: string;
  horario_saida: string;
  intervalo_almoco_min: number;
  tolerancia_atraso_min: number;
  afastado_pode_bater_ponto: boolean;
};

const empty: EmpresaForm = {
  nome_fantasia: "", razao_social: "", cnpj: "", telefone: "", email: "",
  endereco: "", responsavel: "", logo_url: "",
  horario_entrada: "08:00", horario_saida: "18:00",
  intervalo_almoco_min: 60, tolerancia_atraso_min: 10,
  afastado_pode_bater_ponto: false,
};

function EmpresaPage() {
  const { empresaId, role, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasEmpresa, setHasEmpresa] = useState(false);
  const [form, setForm] = useState<EmpresaForm>(empty);
  const isAdmin = role === "admin";
  const canEdit = isAdmin || !hasEmpresa;

  useEffect(() => {
    const load = async () => {
      if (!empresaId) { setLoading(false); return; }
      const { data } = await supabase.from("empresas").select("*").eq("id", empresaId).maybeSingle();
      if (data) {
        setHasEmpresa(true);
        setForm({
          nome_fantasia: data.nome_fantasia ?? "",
          razao_social: data.razao_social ?? "",
          cnpj: data.cnpj ?? "",
          telefone: data.telefone ?? "",
          email: data.email ?? "",
          endereco: data.endereco ?? "",
          responsavel: data.responsavel ?? "",
          logo_url: data.logo_url ?? "",
          horario_entrada: data.horario_entrada ?? "08:00",
          horario_saida: data.horario_saida ?? "18:00",
          intervalo_almoco_min: data.intervalo_almoco_min ?? 60,
          tolerancia_atraso_min: data.tolerancia_atraso_min ?? 10,
          afastado_pode_bater_ponto: !!data.afastado_pode_bater_ponto,
        });
      }
      setLoading(false);
    };
    load();
  }, [empresaId]);

  const upd = <K extends keyof EmpresaForm>(k: K, v: EmpresaForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const uploadLogo = async (file: File) => {
    if (!empresaId) return;
    const path = `${empresaId}/logo-${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("company-assets").upload(path, file, { upsert: true });
    if (error) return toast.error(error.message);
    const { data } = supabase.storage.from("company-assets").getPublicUrl(path);
    upd("logo_url", data.publicUrl);
    toast.success("Logo carregado");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      if (!hasEmpresa) {
        // First-time onboarding via SECURITY DEFINER function
        const { data, error } = await supabase.rpc("criar_empresa_inicial", {
          _nome_fantasia: form.nome_fantasia,
          _razao_social: form.razao_social || "",
          _cnpj: form.cnpj || "",
          _telefone: form.telefone || "",
          _email: form.email || "",
          _endereco: form.endereco || "",
          _responsavel: form.responsavel || "",
        });
        if (error) throw error;
        // Update extra fields and reload session
        await supabase.from("empresas").update({
          horario_entrada: form.horario_entrada || null,
          horario_saida: form.horario_saida || null,
          intervalo_almoco_min: form.intervalo_almoco_min,
          tolerancia_atraso_min: form.tolerancia_atraso_min,
          afastado_pode_bater_ponto: form.afastado_pode_bater_ponto,
          logo_url: form.logo_url || null,
        }).eq("id", data as string);
        toast.success("Empresa cadastrada! Recarregando...");
        setTimeout(() => window.location.reload(), 800);
        return;
      }
      const { error } = await supabase.from("empresas").update({
        nome_fantasia: form.nome_fantasia,
        razao_social: form.razao_social,
        cnpj: form.cnpj,
        telefone: form.telefone,
        email: form.email,
        endereco: form.endereco,
        responsavel: form.responsavel,
        logo_url: form.logo_url || null,
        horario_entrada: form.horario_entrada || null,
        horario_saida: form.horario_saida || null,
        intervalo_almoco_min: form.intervalo_almoco_min,
        tolerancia_atraso_min: form.tolerancia_atraso_min,
        afastado_pode_bater_ponto: form.afastado_pode_bater_ponto,
      }).eq("id", empresaId!);
      if (error) throw error;
      toast.success("Dados atualizados");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-sm text-muted-foreground">Carregando...</div>;

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">
      {!hasEmpresa && (
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" /> Bem-vindo ao Turbo Ponto
            </CardTitle>
            <CardDescription>
              Cadastre os dados da sua empresa para começar. Você será definido como administrador.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Identificação</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Nome fantasia *">
            <Input required value={form.nome_fantasia} onChange={(e) => upd("nome_fantasia", e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="Razão social">
            <Input value={form.razao_social} onChange={(e) => upd("razao_social", e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="CNPJ">
            <Input value={form.cnpj} onChange={(e) => upd("cnpj", e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="Responsável">
            <Input value={form.responsavel} onChange={(e) => upd("responsavel", e.target.value)} disabled={!canEdit} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Contato</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Telefone">
            <Input value={form.telefone} onChange={(e) => upd("telefone", e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="E-mail">
            <Input type="email" value={form.email} onChange={(e) => upd("email", e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="Endereço" full>
            <Input value={form.endereco} onChange={(e) => upd("endereco", e.target.value)} disabled={!canEdit} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Logo da empresa</CardTitle></CardHeader>
        <CardContent className="flex items-center gap-4">
          <div className="h-20 w-20 rounded-md border bg-muted flex items-center justify-center overflow-hidden">
            {form.logo_url ? <img src={form.logo_url} alt="logo" className="h-full w-full object-contain" /> : <Building2 className="h-8 w-8 text-muted-foreground" />}
          </div>
          {hasEmpresa && isAdmin && (
            <label className="cursor-pointer">
              <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
              <Button type="button" variant="outline" asChild><span><Upload className="h-4 w-4 mr-2" />Enviar logo</span></Button>
            </label>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Jornada padrão e configurações</CardTitle>
          <CardDescription>Esses valores serão usados como padrão para os funcionários.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Horário de entrada">
            <Input type="time" value={form.horario_entrada} onChange={(e) => upd("horario_entrada", e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="Horário de saída">
            <Input type="time" value={form.horario_saida} onChange={(e) => upd("horario_saida", e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="Intervalo de almoço (minutos)">
            <Input type="number" min={0} value={form.intervalo_almoco_min} onChange={(e) => upd("intervalo_almoco_min", Number(e.target.value))} disabled={!canEdit} />
          </Field>
          <Field label="Tolerância de atraso (minutos)">
            <Input type="number" min={0} value={form.tolerancia_atraso_min} onChange={(e) => upd("tolerancia_atraso_min", Number(e.target.value))} disabled={!canEdit} />
          </Field>
          <div className="md:col-span-2 flex items-center justify-between rounded-md border p-4">
            <div>
              <div className="font-medium text-sm">Funcionário afastado pode bater ponto</div>
              <div className="text-xs text-muted-foreground">Se desligado, nunca poderá registrar ponto.</div>
            </div>
            <Switch checked={form.afastado_pode_bater_ponto} onCheckedChange={(v) => upd("afastado_pode_bater_ponto", v)} disabled={!canEdit} />
          </div>
        </CardContent>
      </Card>

      {canEdit && (
        <div className="flex justify-end">
          <Button type="submit" disabled={saving} className="font-semibold">
            {saving ? "Salvando..." : hasEmpresa ? "Salvar alterações" : "Cadastrar empresa"}
          </Button>
        </div>
      )}
    </form>
  );
}

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <Label className="mb-1.5 block">{label}</Label>
      {children}
    </div>
  );
}
