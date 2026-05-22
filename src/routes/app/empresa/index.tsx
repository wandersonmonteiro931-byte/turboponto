import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, UserCheck, Clock, UserX, AlertTriangle, CalendarRange } from "lucide-react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/app/empresa/")({
  component: EmpresaDashboard,
});

const cards = [
  { label: "Total de funcionários", value: 0, icon: Users, color: "text-foreground" },
  { label: "Funcionários ativos", value: 0, icon: UserCheck, color: "text-green-600" },
  { label: "Bateram ponto hoje", value: 0, icon: Clock, color: "text-primary" },
  { label: "Ausentes hoje", value: 0, icon: UserX, color: "text-red-600" },
  { label: "Pendências de ponto", value: 0, icon: AlertTriangle, color: "text-orange-600" },
  { label: "Mês atual", value: "Em aberto", icon: CalendarRange, color: "text-foreground" },
];

function EmpresaDashboard() {
  const { nome } = useAuth();
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Olá, {nome || "Administrador"}</h2>
        <p className="text-sm text-muted-foreground">Resumo da operação Turbo Lanches</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
              <c.icon className={`h-5 w-5 ${c.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Próximos passos</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>Esta é a estrutura base. Em breve serão implementados:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Cálculo automático de horas trabalhadas</li>
            <li>Gestão de jornadas e escalas</li>
            <li>Benefícios (vale-transporte, vale-refeição)</li>
            <li>Geração e liberação de holerites</li>
            <li>Relatórios completos</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
