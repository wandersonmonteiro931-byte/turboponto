import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import {
  LayoutDashboard, Building2, Users, Clock, ClipboardList,
  CreditCard, CalendarCheck, Gift, FileText, BarChart3, Settings, ShieldCheck, Wallet,
} from "lucide-react";
import { AppShell, type NavItem } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";

const items: NavItem[] = [
  { to: "/app/empresa", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
  { to: "/app/empresa/empresa", label: "Empresa", icon: <Building2 className="h-4 w-4" /> },
  { to: "/app/empresa/funcionarios", label: "Funcionários", icon: <Users className="h-4 w-4" /> },
  { to: "/app/empresa/jornadas", label: "Jornadas", icon: <Clock className="h-4 w-4" /> },
  { to: "/app/empresa/registros", label: "Registros de Ponto", icon: <ClipboardList className="h-4 w-4" /> },
  { to: "/app/empresa/cartao-ponto", label: "Cartão de Ponto", icon: <CreditCard className="h-4 w-4" /> },
  { to: "/app/empresa/fechamento", label: "Fechamento Mensal", icon: <CalendarCheck className="h-4 w-4" /> },
  { to: "/app/empresa/justificativas", label: "Justificativas", icon: <ShieldCheck className="h-4 w-4" /> },
  { to: "/app/empresa/justificativas-massa", label: "Aplicar em Massa", icon: <Users className="h-4 w-4" /> },
  { to: "/app/empresa/banco-horas", label: "Banco de Horas", icon: <Wallet className="h-4 w-4" /> },
  { to: "/app/empresa/beneficios", label: "Benefícios", icon: <Gift className="h-4 w-4" /> },
  { to: "/app/empresa/holerites", label: "Holerites", icon: <FileText className="h-4 w-4" /> },
  { to: "/app/empresa/relatorios", label: "Relatórios", icon: <BarChart3 className="h-4 w-4" /> },
  { to: "/app/empresa/configuracoes", label: "Configurações", icon: <Settings className="h-4 w-4" /> },
];

export const Route = createFileRoute("/app/empresa")({
  component: EmpresaLayout,
});

function EmpresaLayout() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && role === "funcionario") {
      navigate({ to: "/app/funcionario" });
    }
  }, [role, loading, navigate]);

  return (
    <AppShell items={items} title="Área da Empresa">
      <Outlet />
    </AppShell>
  );
}
