import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Home, Clock, ClipboardList, CreditCard, Gift, FileText, Bell, User, BellRing } from "lucide-react";
import { AppShell, type NavItem } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";

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

export const Route = createFileRoute("/app/funcionario")({
  component: FuncionarioLayout,
});

function FuncionarioLayout() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && role && role !== "funcionario") {
      navigate({ to: "/app/empresa" });
    }
  }, [role, loading, navigate]);

  return (
    <AppShell items={items} title="Área do Funcionário">
      <Outlet />
    </AppShell>
  );
}
