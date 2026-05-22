import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Users, UserCheck, Clock, UserX, AlertTriangle, CalendarRange,
  Gift, FileText, TrendingDown,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { formatMinutos } from "@/lib/format";

export const Route = createFileRoute("/app/empresa/")({
  component: EmpresaDashboard,
});

type Stats = {
  totalFuncionarios: number;
  ativos: number;
  pontosHoje: number;
  atrasosHoje: number;
  ausentesHoje: number;
  pendencias: number;
  cestasEmRisco: number;
  cestasPendentes: number;
  holeritesPendentes: number;
  mesStatus: string;
};

const ini: Stats = {
  totalFuncionarios: 0, ativos: 0, pontosHoje: 0, atrasosHoje: 0,
  ausentesHoje: 0, pendencias: 0, cestasEmRisco: 0, cestasPendentes: 0,
  holeritesPendentes: 0, mesStatus: "Em aberto",
};

function EmpresaDashboard() {
  const { nome, empresaId } = useAuth();
  const [stats, setStats] = useState<Stats>(ini);
  const [semJornada, setSemJornada] = useState<Array<{ id: string; nome: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!empresaId) return;
    (async () => {
      setLoading(true);
      const hoje = new Date();
      const dataRef = hoje.toISOString().slice(0, 10);
      const mes = hoje.getMonth() + 1;
      const ano = hoje.getFullYear();

      const [
        { data: funcs },
        { data: pontos },
        { data: calcs },
        { data: entregas },
        { data: holerites },
        { data: fechamento },
      ] = await Promise.all([
        supabase.from("funcionarios").select("id,nome,status").eq("empresa_id", empresaId),
        supabase.from("registros_ponto").select("funcionario_id,atraso_minutos,status")
          .eq("empresa_id", empresaId).eq("data_referencia", dataRef),
        supabase.from("beneficios_calculos")
          .select("id,total_atraso_minutos,status,tem_direito")
          .eq("empresa_id", empresaId).eq("mes_referencia", mes).eq("ano_referencia", ano),
        supabase.from("beneficios_entregas")
          .select("id,entregue")
          .eq("empresa_id", empresaId).eq("mes_referencia", mes).eq("ano_referencia", ano),
        supabase.from("holerites").select("id,liberado").eq("empresa_id", empresaId),
        supabase.from("fechamentos_mensais").select("status")
          .eq("empresa_id", empresaId).eq("mes_referencia", mes).eq("ano_referencia", ano).maybeSingle(),
      ]);

      const ativos = (funcs ?? []).filter((f) => (f as { status: string }).status === "ativo");
      const ids = ativos.map((a) => (a as { id: string }).id);
      const baterIds = new Set((pontos ?? []).map((p) => (p as { funcionario_id: string }).funcionario_id));
      const atrasos = (pontos ?? []).filter((p) => (p as { atraso_minutos: number }).atraso_minutos > 0).length;
      const pendentes = (pontos ?? []).filter((p) => (p as { status: string }).status === "pendente").length;

      const cestasEmRisco = (calcs ?? []).filter((c) => {
        const cc = c as { total_atraso_minutos: number; tem_direito: boolean };
        return cc.tem_direito && cc.total_atraso_minutos >= 90 && cc.total_atraso_minutos < 120;
      }).length;
      const cestasPendentes = (entregas ?? []).filter((e) => !(e as { entregue: boolean }).entregue).length;
      const holPend = (holerites ?? []).filter((h) => !(h as { liberado: boolean }).liberado).length;

      setStats({
        totalFuncionarios: funcs?.length ?? 0,
        ativos: ativos.length,
        pontosHoje: baterIds.size,
        atrasosHoje: atrasos,
        ausentesHoje: Math.max(0, ativos.length - baterIds.size),
        pendencias: pendentes,
        cestasEmRisco,
        cestasPendentes,
        holeritesPendentes: holPend,
        mesStatus: (fechamento as { status: string } | null)?.status === "fechado"
          ? "Fechado" : (fechamento as { status: string } | null)?.status === "liberado"
          ? "Liberado" : "Em aberto",
      });

      if (ids.length) {
        const { data: vinc } = await supabase
          .from("funcionarios_jornadas").select("funcionario_id")
          .in("funcionario_id", ids).eq("ativo", true);
        const comJornada = new Set((vinc ?? []).map((v) => (v as { funcionario_id: string }).funcionario_id));
        setSemJornada(ativos.filter((a) => !comJornada.has((a as { id: string }).id)) as Array<{ id: string; nome: string }>);
      } else {
        setSemJornada([]);
      }
      setLoading(false);
    })();
  }, [empresaId]);

  const cardsTop = [
    { label: "Funcionários ativos", value: stats.ativos, icon: UserCheck, accent: "text-green-600", to: "/app/empresa/funcionarios" },
    { label: "Pontos batidos hoje", value: stats.pontosHoje, icon: Clock, accent: "text-primary", to: "/app/empresa/registros" },
    { label: "Atrasos do dia", value: stats.atrasosHoje, icon: TrendingDown, accent: "text-orange-600", to: "/app/empresa/registros" },
    { label: "Ausentes hoje", value: stats.ausentesHoje, icon: UserX, accent: "text-red-600", to: "/app/empresa/registros" },
    { label: "Pendências de ponto", value: stats.pendencias, icon: AlertTriangle, accent: "text-orange-600", to: "/app/empresa/registros" },
    { label: "Total de funcionários", value: stats.totalFuncionarios, icon: Users, accent: "text-foreground", to: "/app/empresa/funcionarios" },
  ];
  const cardsBottom = [
    { label: "Cestas em risco (≥90min)", value: stats.cestasEmRisco, icon: AlertTriangle, accent: "text-orange-600", to: "/app/empresa/beneficios" },
    { label: "Cestas pendentes de entrega", value: stats.cestasPendentes, icon: Gift, accent: "text-primary", to: "/app/empresa/beneficios" },
    { label: "Holerites pendentes", value: stats.holeritesPendentes, icon: FileText, accent: "text-orange-600", to: "/app/empresa/holerites" },
    { label: "Mês atual", value: stats.mesStatus, icon: CalendarRange, accent: "text-foreground", to: "/app/empresa/fechamento" },
  ];

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
                  {semJornada.length} funcionário{semJornada.length > 1 ? "s" : ""} sem jornada cadastrada
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Não poderão bater ponto: {semJornada.slice(0, 3).map((f) => f.nome).join(", ")}
                  {semJornada.length > 3 && ` e mais ${semJornada.length - 3}`}
                </div>
              </div>
            </div>
            <Link to="/app/empresa/jornadas"><Button size="sm" variant="outline">Ir para Jornadas</Button></Link>
          </CardContent>
        </Card>
      )}

      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Hoje</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {cardsTop.map((c) => <StatCard key={c.label} {...c} loading={loading} />)}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Mês corrente</h3>
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {cardsBottom.map((c) => <StatCard key={c.label} {...c} loading={loading} />)}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label, value, icon: Icon, accent, to, loading,
}: {
  label: string; value: number | string; icon: typeof Users; accent: string; to: string; loading: boolean;
}) {
  return (
    <Link to={to}>
      <Card className="hover:border-primary transition-colors cursor-pointer h-full">
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
          <CardTitle className="text-xs font-medium text-muted-foreground leading-tight">{label}</CardTitle>
          <Icon className={`h-4 w-4 shrink-0 ${accent}`} />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold tabular-nums">
            {loading ? <span className="text-muted-foreground/40">—</span> : value}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
// formatMinutos kept for future use
void formatMinutos;
