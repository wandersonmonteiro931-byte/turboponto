import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Settings, KeyRound, Building2, CalendarClock, MapPin, Receipt, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/app/empresa/configuracoes")({
  component: ConfiguracoesPage,
});

const atalhos = [
  { to: "/app/empresa/empresa", icon: Building2, label: "Dados da empresa", desc: "Cadastro, logo, tolerância e restrição de IP para o ponto." },
  { to: "/app/empresa/jornadas", icon: CalendarClock, label: "Jornadas", desc: "Escalas, horários e dias de trabalho." },
  { to: "/app/empresa/lotacoes", icon: MapPin, label: "Lotações", desc: "Locais e setores de trabalho." },
  { to: "/app/empresa/rubricas", icon: Receipt, label: "Rubricas", desc: "Proventos e descontos usados no holerite." },
];

function ConfiguracoesPage() {
  const { nome, role, user } = useAuth();
  const [senha, setSenha] = useState("");
  const [senha2, setSenha2] = useState("");
  const [salvando, setSalvando] = useState(false);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Configurações</h1>
          <p className="text-sm text-muted-foreground">Ajustes gerais do sistema e da sua conta.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {atalhos.map((a) => (
          <Link key={a.to} to={a.to}>
            <Card className="h-full hover:border-primary transition-colors">
              <CardContent className="p-5 flex items-start gap-3">
                <div className="h-10 w-10 shrink-0 rounded-md bg-primary/15 flex items-center justify-center">
                  <a.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="font-semibold">{a.label}</div>
                  <div className="text-xs text-muted-foreground">{a.desc}</div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-primary" /> Minha conta
          </CardTitle>
          <CardDescription>Sessão ativa neste dispositivo.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-md border p-3">
            <div className="text-[10px] uppercase text-muted-foreground">Nome</div>
            <div className="font-medium">{nome || "—"}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-[10px] uppercase text-muted-foreground">E-mail</div>
            <div className="font-medium break-words">{user?.email ?? "—"}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-[10px] uppercase text-muted-foreground">Perfil</div>
            <div className="font-medium capitalize">{role ?? "—"}</div>
          </div>
        </CardContent>
      </Card>

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
