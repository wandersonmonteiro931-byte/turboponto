import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ArrowLeft, UserCircle2, Upload } from "lucide-react";
import { toast } from "sonner";
import { resetarSenhaFuncionario } from "@/lib/funcionarios.functions";
import { getAccessToken } from "@/lib/session";

export const Route = createFileRoute("/app/empresa/funcionarios/$id")({
  component: FuncionarioDetail,
});

function FuncionarioDetail() {
  const { id } = useParams({ from: "/app/empresa/funcionarios/$id" });
  const { role, empresaId } = useAuth();
  const isAdmin = role === "admin";
  const [f, setF] = useState<Record<string, unknown> | null>(null);
  const [saving, setSaving] = useState(false);
  const [newPass, setNewPass] = useState("");
  const [lotacoes, setLotacoes] = useState<Array<{ id: string; codigo: string; nome: string }>>([]);

  const load = async () => {
    const { data } = await supabase.from("funcionarios").select("*").eq("id", id).maybeSingle();
    setF(data);
  };
  useEffect(() => { load(); }, [id]);
  useEffect(() => {
    if (!empresaId) return;
    void supabase.from("lotacoes").select("id,codigo,nome").eq("empresa_id", empresaId).eq("ativo", true).order("codigo")
      .then(({ data }) => setLotacoes((data ?? []) as typeof lotacoes));
    // eslint-disable-next-line
  }, [empresaId]);

  if (!f) return <div className="text-sm text-muted-foreground">Carregando...</div>;

  const upd = (k: string, v: unknown) => setF((p) => ({ ...(p ?? {}), [k]: v }));

  const save = async () => {
    setSaving(true);
    const payload: Record<string, unknown> = {
      nome: f.nome, cpf: f.cpf, rg: f.rg, data_nascimento: f.data_nascimento || null,
      telefone: f.telefone, email: f.email, endereco: f.endereco, cargo: f.cargo,
      salario: f.salario, data_admissao: f.data_admissao || null, status: f.status,
      observacoes: f.observacoes, permite_bater_ponto: f.permite_bater_ponto,
      data_desligamento: f.data_desligamento || null, motivo_desligamento: f.motivo_desligamento,
      banco_agencia: f.banco_agencia || null,
      conta: f.conta || null,
      lotacao: f.lotacao || null,
      num_dep_irrf: Number(f.num_dep_irrf ?? 0),
      num_dep_sal_fam: Number(f.num_dep_sal_fam ?? 0),
    };
    const { error } = await supabase.from("funcionarios").update(payload as never).eq("id", id);
    setSaving(false);
    if (error) toast.error(error.message); else toast.success("Salvo");
  };

  const uploadFoto = async (file: File) => {
    const path = `${empresaId}/${id}-${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("employee-photos").upload(path, file, { upsert: true });
    if (error) return toast.error(error.message);
    const { data } = supabase.storage.from("employee-photos").getPublicUrl(path);
    await supabase.from("funcionarios").update({ foto_url: data.publicUrl }).eq("id", id);
    upd("foto_url", data.publicUrl);
    toast.success("Foto atualizada");
  };

  const resetSenha = async () => {
    if (!f.usuario_id || newPass.length < 6) return toast.error("Senha mínima de 6 caracteres");
    try {
      const token = await getAccessToken();
      await resetarSenhaFuncionario({ data: { token, usuario_id: f.usuario_id as string, senha: newPass } });
      toast.success("Senha redefinida");
      setNewPass("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  };

  const v = (k: string) => (f[k] ?? "") as string;

  return (
    <div className="space-y-4 max-w-5xl">
      <Link to="/app/empresa/funcionarios" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
      </Link>

      <Card>
        <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="h-20 w-20 rounded-full bg-muted overflow-hidden flex items-center justify-center shrink-0">
            {f.foto_url ? <img src={f.foto_url as string} className="h-full w-full object-cover" /> : <UserCircle2 className="h-10 w-10 text-muted-foreground" />}
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold">{v("nome")}</h2>
            <p className="text-sm text-muted-foreground">{v("cargo") || "—"}</p>
            <p className="text-xs text-muted-foreground capitalize mt-1">Status: {v("status")}</p>
          </div>
          {isAdmin && (
            <label className="cursor-pointer">
              <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadFoto(e.target.files[0])} />
              <Button type="button" variant="outline" asChild><span><Upload className="h-4 w-4 mr-2" />Foto</span></Button>
            </label>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="dados">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="dados">Dados pessoais</TabsTrigger>
          <TabsTrigger value="jornada">Jornada</TabsTrigger>
          <TabsTrigger value="registros">Registros de ponto</TabsTrigger>
          <TabsTrigger value="cartao">Cartão de ponto</TabsTrigger>
          <TabsTrigger value="beneficios">Benefícios</TabsTrigger>
          <TabsTrigger value="holerites">Holerites</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="dados">
          <Card>
            <CardContent className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
              <Fld label="Nome"><Input value={v("nome")} onChange={(e) => upd("nome", e.target.value)} disabled={!isAdmin} /></Fld>
              <Fld label="CPF"><Input value={v("cpf")} onChange={(e) => upd("cpf", e.target.value)} disabled={!isAdmin} /></Fld>
              <Fld label="RG"><Input value={v("rg")} onChange={(e) => upd("rg", e.target.value)} disabled={!isAdmin} /></Fld>
              <Fld label="Data de nascimento"><Input type="date" value={v("data_nascimento")} onChange={(e) => upd("data_nascimento", e.target.value)} disabled={!isAdmin} /></Fld>
              <Fld label="Telefone"><Input value={v("telefone")} onChange={(e) => upd("telefone", e.target.value)} disabled={!isAdmin} /></Fld>
              <Fld label="E-mail"><Input value={v("email")} onChange={(e) => upd("email", e.target.value)} disabled={!isAdmin} /></Fld>
              <Fld label="Endereço" full><Input value={v("endereco")} onChange={(e) => upd("endereco", e.target.value)} disabled={!isAdmin} /></Fld>
              <Fld label="Cargo"><Input value={v("cargo")} onChange={(e) => upd("cargo", e.target.value)} disabled={!isAdmin} /></Fld>
              <Fld label="Salário"><Input type="number" step="0.01" value={v("salario")} onChange={(e) => upd("salario", e.target.value ? Number(e.target.value) : null)} disabled={!isAdmin} /></Fld>
              <Fld label="Data admissão"><Input type="date" value={v("data_admissao")} onChange={(e) => upd("data_admissao", e.target.value)} disabled={!isAdmin} /></Fld>
              <Fld label="Status">
                <select className="w-full h-9 px-3 rounded-md border bg-background text-sm" value={v("status")} onChange={(e) => upd("status", e.target.value)} disabled={!isAdmin}>
                  <option value="ativo">Ativo</option>
                  <option value="afastado">Afastado</option>
                  <option value="desligado">Desligado</option>
                </select>
              </Fld>
              {v("status") === "desligado" && (
                <>
                  <Fld label="Data desligamento"><Input type="date" value={v("data_desligamento")} onChange={(e) => upd("data_desligamento", e.target.value)} disabled={!isAdmin} /></Fld>
                  <Fld label="Motivo" full><Input value={v("motivo_desligamento")} onChange={(e) => upd("motivo_desligamento", e.target.value)} disabled={!isAdmin} /></Fld>
                </>
              )}
              <Fld label="Banco / Agência"><Input value={v("banco_agencia")} onChange={(e) => upd("banco_agencia", e.target.value)} placeholder="237/02402" disabled={!isAdmin} /></Fld>
              <Fld label="Conta"><Input value={v("conta")} onChange={(e) => upd("conta", e.target.value)} disabled={!isAdmin} /></Fld>
              <Fld label="Nº Dep. IRRF"><Input type="number" value={v("num_dep_irrf") || 0} onChange={(e) => upd("num_dep_irrf", Number(e.target.value))} disabled={!isAdmin} /></Fld>
              <Fld label="Nº Dep. Sal. Família"><Input type="number" value={v("num_dep_sal_fam") || 0} onChange={(e) => upd("num_dep_sal_fam", Number(e.target.value))} disabled={!isAdmin} /></Fld>
              <Fld label="Lotação" full>
                <select
                  className="w-full h-9 px-3 rounded-md border bg-background text-sm"
                  value={(v("lotacao") as string) || ""}
                  onChange={(e) => upd("lotacao", e.target.value || null)}
                  disabled={!isAdmin}
                >
                  <option value="">— Selecionar —</option>
                  {lotacoes.map((l) => (
                    <option key={l.id} value={`${l.codigo} - ${l.nome}`}>{l.codigo} - {l.nome}</option>
                  ))}
                  {v("lotacao") && !lotacoes.some((l) => `${l.codigo} - ${l.nome}` === v("lotacao")) && (
                    <option value={v("lotacao") as string}>{v("lotacao") as string} (não cadastrada)</option>
                  )}
                </select>
              </Fld>
              <Fld label="Observações" full>
                <textarea className="w-full min-h-[80px] px-3 py-2 rounded-md border bg-background text-sm" value={v("observacoes")} onChange={(e) => upd("observacoes", e.target.value)} disabled={!isAdmin} />
              </Fld>
              {isAdmin && (
                <div className="md:col-span-2 flex flex-col sm:flex-row gap-3 justify-between items-stretch sm:items-end pt-2">
                  <div className="flex gap-2 items-end">
                    <Fld label="Redefinir senha"><Input type="text" placeholder="Nova senha" value={newPass} onChange={(e) => setNewPass(e.target.value)} /></Fld>
                    <Button type="button" variant="outline" onClick={resetSenha}>Redefinir</Button>
                  </div>
                  <Button onClick={save} disabled={saving} className="font-semibold">{saving ? "Salvando..." : "Salvar alterações"}</Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="jornada">
          <JornadaTab funcionarioId={id} canEdit={isAdmin} />
        </TabsContent>

        {(["registros", "cartao", "beneficios", "holerites", "historico"] as const).map((t) => (
          <TabsContent key={t} value={t}>
            <Card>
              <CardHeader><CardTitle className="capitalize">{t}</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Esta aba será implementada nas próximas etapas do projeto.
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function Fld({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <Label className="mb-1 block text-xs">{label}</Label>
      {children}
    </div>
  );
}

type VinculoRow = {
  id: string;
  data_inicio: string;
  data_fim: string | null;
  ativo: boolean;
  jornada_id: string;
  jornadas: { nome: string; status: string } | null;
};

function JornadaTab({ funcionarioId, canEdit }: { funcionarioId: string; canEdit: boolean }) {
  const { empresaId } = useAuth();
  const [jornadas, setJornadas] = useState<Array<{ id: string; nome: string; status: string }>>([]);
  const [vinculos, setVinculos] = useState<VinculoRow[]>([]);
  const [jornadaId, setJornadaId] = useState("");
  const [dataInicio, setDataInicio] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);

  const reload = async () => {
    if (!empresaId) return;
    const [{ data: js }, { data: vs }] = await Promise.all([
      supabase.from("jornadas").select("id,nome,status").eq("empresa_id", empresaId).eq("status", "ativa").order("nome"),
      supabase.from("funcionarios_jornadas")
        .select("id,data_inicio,data_fim,ativo,jornada_id,jornadas(nome,status)")
        .eq("funcionario_id", funcionarioId)
        .order("data_inicio", { ascending: false }),
    ]);
    setJornadas((js ?? []) as Array<{ id: string; nome: string; status: string }>);
    setVinculos((vs ?? []) as unknown as VinculoRow[]);
  };
  useEffect(() => { reload(); }, [funcionarioId, empresaId]);

  const ativos = vinculos.filter((v) => v.ativo);

  const vincular = async () => {
    if (!jornadaId) return toast.error("Selecione uma jornada");
    setLoading(true);
    try {
      const { ativarVinculo } = await import("@/lib/jornadas");
      await ativarVinculo(funcionarioId, jornadaId, dataInicio);
      toast.success("Jornada vinculada");
      setJornadaId("");
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setLoading(false);
    }
  };


  const encerrarVinculo = async (id: string) => {
    const dataFim = new Date().toISOString().slice(0, 10);
    const { error } = await (supabase.from("funcionarios_jornadas") as never as {
      update: (v: object) => { eq: (a: string, b: unknown) => Promise<{ error: { message: string } | null }> };
    }).update({ ativo: false, data_fim: dataFim }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Jornada encerrada");
    reload();
  };

  return (
    <Card>
      <CardContent className="p-5 space-y-5">
        <div>
          <h3 className="font-semibold mb-2">Jornadas ativas</h3>
          {ativos.length > 0 ? (
            <ul className="divide-y border rounded-md">
              {ativos.map((v) => (
                <li key={v.id} className="p-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{v.jornadas?.nome ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      Desde {new Date(v.data_inicio + "T00:00").toLocaleDateString("pt-BR")}
                    </div>
                  </div>
                  {canEdit && (
                    <Button size="sm" variant="outline" onClick={() => encerrarVinculo(v.id)}>
                      Encerrar
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Sem jornada ativa. Vincule uma jornada abaixo.</p>
          )}
        </div>

        {canEdit && (
          <div>
            <h3 className="font-semibold mb-2">Vincular nova jornada</h3>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2">
              <select
                className="h-9 px-3 rounded-md border bg-background text-sm"
                value={jornadaId}
                onChange={(e) => setJornadaId(e.target.value)}
              >
                <option value="">Selecione...</option>
                {jornadas
                  .filter((j) => !ativos.some((a) => a.jornada_id === j.id))
                  .map((j) => <option key={j.id} value={j.id}>{j.nome}</option>)}
              </select>
              <input
                type="date"
                className="h-9 px-3 rounded-md border bg-background text-sm"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
              />
              <Button onClick={vincular} disabled={loading}>{loading ? "..." : "Vincular"}</Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              O colaborador pode ter várias jornadas ativas simultaneamente. O sistema escolhe automaticamente
              a jornada aplicável a cada data pelo dia da semana configurado em cada uma.
            </p>
          </div>
        )}

        <div>
          <h3 className="font-semibold mb-2">Histórico</h3>
          {vinculos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem histórico ainda.</p>
          ) : (
            <ul className="divide-y border rounded-md">
              {vinculos.map((v) => (
                <li key={v.id} className="p-3 flex justify-between text-sm">
                  <div>
                    <div className="font-medium">{v.jornadas?.nome ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(v.data_inicio + "T00:00").toLocaleDateString("pt-BR")}
                      {" → "}
                      {v.data_fim ? new Date(v.data_fim + "T00:00").toLocaleDateString("pt-BR") : "atual"}
                    </div>
                  </div>
                  <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded h-fit ${v.ativo ? "bg-green-500/20 text-green-700" : "bg-muted text-muted-foreground"}`}>
                    {v.ativo ? "ativa" : "encerrada"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

