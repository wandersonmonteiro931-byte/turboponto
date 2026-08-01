import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useFuncionarioStatus } from "@/lib/funcionario-status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { User, Building2, Landmark, KeyRound, IdCard } from "lucide-react";

export const Route = createFileRoute("/app/funcionario/perfil")({
  component: PerfilPage,
});

type Func = {
  id: string;
  nome: string;
  cpf: string | null;
  rg: string | null;
  matricula: string | null;
  cargo: string | null;
  lotacao: string | null;
  email: string | null;
  telefone: string | null;
  endereco: string | null;
  data_nascimento: string | null;
  data_admissao: string | null;
  data_desligamento: string | null;
  motivo_desligamento: string | null;
  banco_agencia: string | null;
  conta: string | null;
  foto_url: string | null;
  status: string;
  empresa_id: string;
};

const dt = (v: string | null) => (v ? new Date(`${v}T12:00:00`).toLocaleDateString("pt-BR") : "—");

function Campo({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-medium break-words">{value?.trim() ? value : "—"}</div>
    </div>
  );
}

function PerfilPage() {
  const { user } = useAuth();
  const { desligado } = useFuncionarioStatus();
  const [func, setFunc] = useState<Func | null>(null);
  const [empresa, setEmpresa] = useState<{ nome_fantasia: string; cnpj: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [senha, setSenha] = useState("");
  const [senha2, setSenha2] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("funcionarios")
        .select(
          "id,nome,cpf,rg,matricula,cargo,lotacao,email,telefone,endereco,data_nascimento,data_admissao,data_desligamento,motivo_desligamento,banco_agencia,conta,foto_url,status,empresa_id",
        )
        .eq("usuario_id", user.id)
        .maybeSingle();
      const f = (data ?? null) as Func | null;
      setFunc(f);
      if (f) {
        const { data: emp } = await supabase
          .from("empresas")
          .select("nome_fantasia,cnpj")
          .eq("id", f.empresa_id)
          .maybeSingle();
        setEmpresa((emp ?? null) as { nome_fantasia: string; cnpj: string | null } | null);
      }
      setLoading(false);
    })();
  }, [user]);

  const alterarSenha = async () => {
    if (senha.length < 6) return toast.error("A senha deve ter ao menos 6 caracteres.");
    if (senha !== senha2) return toast.error("As senhas não conferem.");
    setSalvando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setSalvando(false);
    if (error) return toast.error(error.message);
    setSenha("");
    setSenha2("");
    toast.success("Senha alterada com sucesso.");
  };

  if (loading) return <p className="text-sm text-muted-foreground">Carregando...</p>;
  if (!func) {
    return (
      <Card>
        <CardContent className="p-10 text-center text-sm text-muted-foreground">
          Cadastro de funcionário não encontrado. Procure o administrador.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-6 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full bg-muted flex items-center justify-center">
            {func.foto_url ? (
              <img src={func.foto_url} alt={`Foto de ${func.nome}`} className="h-full w-full object-cover" />
            ) : (
              <User className="h-8 w-8 text-muted-foreground" />
            )}
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">{func.nome}</h1>
            <p className="text-sm text-muted-foreground">
              {func.cargo || "Cargo não informado"}
              {func.matricula ? ` · Matrícula ${func.matricula}` : ""}
            </p>
            <span className="inline-block rounded px-2 py-0.5 text-[11px] font-bold uppercase bg-muted text-muted-foreground">
              {func.status}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <IdCard className="h-4 w-4 text-primary" /> Dados pessoais
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Campo label="CPF" value={func.cpf} />
          <Campo label="RG" value={func.rg} />
          <Campo label="Nascimento" value={dt(func.data_nascimento)} />
          <Campo label="E-mail" value={func.email ?? user?.email ?? null} />
          <Campo label="Telefone" value={func.telefone} />
          <Campo label="Endereço" value={func.endereco} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4 text-primary" /> Vínculo
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Campo label="Empresa" value={empresa?.nome_fantasia} />
          <Campo label="CNPJ" value={empresa?.cnpj} />
          <Campo label="Lotação" value={func.lotacao} />
          <Campo label="Admissão" value={dt(func.data_admissao)} />
          {desligado && <Campo label="Desligamento" value={dt(func.data_desligamento)} />}
          {desligado && <Campo label="Motivo" value={func.motivo_desligamento} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Landmark className="h-4 w-4 text-primary" /> Dados bancários
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo label="Banco / Agência" value={func.banco_agencia} />
          <Campo label="Conta" value={func.conta} />
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Para corrigir qualquer informação cadastral, entre em contato com o setor responsável da empresa.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4 text-primary" /> Alterar senha
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
          <div className="space-y-1">
            <Label className="text-xs">Nova senha</Label>
            <Input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Confirmar nova senha</Label>
            <Input type="password" value={senha2} onChange={(e) => setSenha2(e.target.value)} autoComplete="new-password" />
          </div>
          <div>
            <Button onClick={alterarSenha} disabled={salvando}>
              {salvando ? "Salvando..." : "Alterar senha"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
