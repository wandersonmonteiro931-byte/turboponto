import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, UserCheck, Clock, UserX, AlertTriangle, CalendarRange } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

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
  const { nome, empresaId } = useAuth();
  const [semJornada, setSemJornada] = useState<Array<{ id: string; nome: string }>>([]);

  useEffect(() => {
    if (!empresaId) return;
    (async () => {
      const { data: ativos } = await supabase
        .from("funcionarios").select("id,nome").eq("empresa_id", empresaId).eq("status", "ativo");
      if (!ativos?.length) { setSemJornada([]); return; }
      const ids = (ativos as Array<{ id: string; nome: string }>).map((a) => a.id);
      const { data: vinc } = await supabase
        .from("funcionarios_jornadas").select("funcionario_id").in("funcionario_id", ids).eq("ativo", true);
      const comJornada = new Set((vinc ?? []).map((v) => (v as { funcionario_id: string }).funcionario_id));
      setSemJornada((ativos as Array<{ id: string; nome: string }>).filter((a) => !comJornada.has(a.id)));
    })();
  }, [empresaId]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Olá, {nome || "Administrador"}</h2>
        <p className="text-sm text-muted-foreground">Resumo da operação Turbo Lanches</p>
      </div>

      {semJornada.length > 0 && (
        <Card className="border-orange-500/50 bg-orange-500/5">
          <CardContent className="p-4 flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
            <div className="flex gap-3 items-start">
              <AlertTriangle className="h-5 w-5 text-orange-600 mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold">
                  {semJornada.length} funcionário{semJornada.length > 1 ? "s" : ""} ativo{semJornada.length > 1 ? "s" : ""} sem jornada cadastrada
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Eles não poderão bater ponto até receberem uma jornada: {semJornada.slice(0, 3).map((f) => f.nome).join(", ")}
                  {semJornada.length > 3 && ` e mais ${semJornada.length - 3}`}
                </div>
              </div>
            </div>
            <Link to="/app/empresa/jornadas"><Button size="sm" variant="outline">Ir para Jornadas</Button></Link>
          </CardContent>
        </Card>
      )}

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
            <li>Benefícios (vale-transporte, vale-refeição)</li>
            <li>Geração e liberação de holerites</li>
            <li>Relatórios completos</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
