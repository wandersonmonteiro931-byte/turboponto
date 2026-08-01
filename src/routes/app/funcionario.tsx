import { createFileRoute, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { Home, Clock, ClipboardList, CreditCard, Gift, FileText, Bell, User, BellRing, Archive, Lock } from "lucide-react";
import { AppShell, type NavItem } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { useFuncionarioStatus } from "@/lib/funcionario-status";

const items: NavItem[] = [
  { to: "/app/funcionario", label: "Início", icon: <Home className="h-4 w-4" /> },
  { to: "/app/funcionario/bater-ponto", label: "Bater Ponto", icon: <Clock className="h-4 w-4" /> },
  { to: "/app/funcionario/registros", label: "Meus Registros", icon: <ClipboardList className="h-4 w-4" /> },
  { to: "/app/funcionario/cartao-ponto", label: "Cartão de Ponto", icon: <CreditCard className="h-4 w-4" /> },
  { to: "/app/funcionario/notificacoes", label: "Notificações", icon: <BellRing className="h-4 w-4" /> },
  { to: "/app/funcionario/beneficios", label: "Meus Benefícios", icon: <Gift className="h-4 w-4" /> },
  { to: "/app/funcionario/holerites", label: "Holerites", icon: <FileText className="h-4 w-4" /> },
  { to: "/app/funcionario/avisos", label: "Avisos", icon: <Bell className="h-4 w-4" /> },
  { to: "/app/funcionario/perfil", label: "Meu Perfil", icon: <User className="h-4 w-4" /> },
];

// Somente consulta de histórico para quem foi desligado.
const itemsDesligado: NavItem[] = [
  { to: "/app/funcionario", label: "Resumo do vínculo", icon: <Archive className="h-4 w-4" /> },
  { to: "/app/funcionario/registros", label: "Histórico de Pontos", icon: <ClipboardList className="h-4 w-4" /> },
  { to: "/app/funcionario/cartao-ponto", label: "Cartão de Ponto", icon: <CreditCard className="h-4 w-4" /> },
  { to: "/app/funcionario/holerites", label: "Holerites", icon: <FileText className="h-4 w-4" /> },
  { to: "/app/funcionario/beneficios", label: "Benefícios (histórico)", icon: <Gift className="h-4 w-4" /> },
  { to: "/app/funcionario/perfil", label: "Meus Dados", icon: <User className="h-4 w-4" /> },
];

const rotasBloqueadas = [
  "/app/funcionario/bater-ponto",
  "/app/funcionario/notificacoes",
  "/app/funcionario/avisos",
];

export const Route = createFileRoute("/app/funcionario")({
  component: FuncionarioLayout,
});

function FuncionarioLayout() {
  const { role, loading, profileLoaded } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { desligado, dataDesligamento, carregado } = useFuncionarioStatus();

  useEffect(() => {
    if (loading || !profileLoaded) return;
    if (role === "admin" || role === "gerente") {
      navigate({ to: "/app/empresa", replace: true });
    }
  }, [role, loading, profileLoaded, navigate]);

  useEffect(() => {
    if (!carregado || !desligado) return;
    if (rotasBloqueadas.includes(location.pathname)) {
      navigate({ to: "/app/funcionario", replace: true });
    }
  }, [carregado, desligado, location.pathname, navigate]);

  if (desligado) {
    const dataFmt = dataDesligamento
      ? new Date(`${dataDesligamento}T12:00:00`).toLocaleDateString("pt-BR")
      : null;
    return (
      <AppShell
        items={itemsDesligado}
        title="Arquivo do Colaborador"
        variant="arquivo"
        headerBadge={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/40 bg-destructive/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-destructive">
            <Lock className="h-3 w-3" /> Somente consulta
          </span>
        }
      >
        <div className="mb-6 overflow-hidden rounded-xl border border-destructive/30 bg-destructive/5">
          <div className="flex items-start gap-3 p-5">
            <div className="rounded-lg bg-destructive/15 p-2.5 text-destructive">
              <Archive className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-bold uppercase tracking-wide text-destructive">
                Vínculo encerrado
              </h2>
              <p className="text-sm text-muted-foreground">
                {dataFmt
                  ? `Seu contrato foi encerrado em ${dataFmt}.`
                  : "Seu contrato foi encerrado."}{" "}
                Esta área está em modo <strong>somente consulta</strong>: você pode visualizar e
                baixar seu histórico de pontos, cartões de ponto, holerites e benefícios, mas não é
                possível registrar ponto nem enviar solicitações.
              </p>
            </div>
          </div>
          <div className="border-t border-destructive/20 bg-destructive/10 px-5 py-2 text-[11px] font-medium uppercase tracking-wider text-destructive">
            Registro de ponto desativado · Notificações e avisos indisponíveis
          </div>
        </div>
        <div className="pointer-events-auto">
          <Outlet />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell items={items} title="Área do Funcionário">
      <Outlet />
    </AppShell>
  );
}
