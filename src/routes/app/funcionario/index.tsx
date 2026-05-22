import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, CreditCard, Gift, FileText, CalendarClock, Bell, TrendingDown } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { DIAS_SEMANA, JornadaDia } from "@/lib/jornadas";
import { formatMinutos, formatDateBR, mesNome } from "@/lib/format";

export const Route = createFileRoute("/app/funcionario/")({
  component: FuncionarioHome,
});

type JornadaAtual = {
  id: string;
  nome: string;
  descricao: string | null;
  horario_entrada: string | null;
  horario_intervalo_saida: string | null;
  horario_intervalo_retorno: string | null;
  horario_saida: string | null;
  tolerancia_atraso_minutos: number;
};

function FuncionarioHome() {
  const { nome, user } = useAuth();
  const userId = user?.id;
  const navigate = useNavigate();
  const [now, setNow] = useState(new Date());
  const [jornada, setJornada] = useState<JornadaAtual | null>(null);
  const [dias, setDias] = useState<JornadaDia[]>([]);
  const [carregou, setCarregou] = useState(false);
  const [resumo, setResumo] = useState<{
    atrasoMes: number;
    cestaStatus: string;
    ultimoHolerite: { mes: number; ano: number } | null;
    avisosNaoLidos: number;
  }>({ atrasoMes: 0, cestaStatus: "—", ultimoHolerite: null, avisosNaoLidos: 0 });

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data: func } = await supabase
        .from("funcionarios").select("id").eq("usuario_id", userId).maybeSingle();
      if (!func) { setCarregou(true); return; }
      const { data: vinc } = await supabase
        .from("funcionarios_jornadas")
        .select("jornada_id, jornadas(id,nome,descricao,horario_entrada,horario_intervalo_saida,horario_intervalo_retorno,horario_saida,tolerancia_atraso_minutos)")
        .eq("funcionario_id", (func as { id: string }).id)
        .eq("ativo", true)
        .maybeSingle();
      const j = (vinc as { jornadas: JornadaAtual | null } | null)?.jornadas ?? null;
      setJornada(j);
      if (j) {
        const { data: ds } = await supabase
          .from("jornadas_dias").select("*").eq("jornada_id", j.id).order("dia_semana");
        setDias((ds ?? []) as JornadaDia[]);
      }
      setCarregou(true);

      const funcId = (func as { id: string }).id;
      const hoje = new Date();
      const mes = hoje.getMonth() + 1;
      const ano = hoje.getFullYear();
      const inicioMes = `${ano}-${String(mes).padStart(2, "0")}-01`;
      const [{ data: pontos }, { data: calc }, { data: hol }, { data: avisos }, { data: leituras }] = await Promise.all([
        supabase.from("registros_ponto").select("atraso_minutos")
          .eq("funcionario_id", funcId).gte("data_referencia", inicioMes),
        supabase.from("beneficios_calculos").select("status,tem_direito,total_atraso_minutos")
          .eq("funcionario_id", funcId).eq("mes_referencia", mes).eq("ano_referencia", ano).maybeSingle(),
        supabase.from("holerites").select("mes_referencia,ano_referencia")
          .eq("funcionario_id", funcId).eq("liberado", true)
          .order("ano_referencia", { ascending: false })
          .order("mes_referencia", { ascending: false }).limit(1),
        supabase.from("avisos").select("id").eq("status", "ativo"),
        supabase.from("avisos_leituras").select("aviso_id").eq("funcionario_id", funcId),
      ]);
      const atrasoMes = (pontos ?? []).reduce((s, p) => s + ((p as { atraso_minutos: number }).atraso_minutos || 0), 0);
      const c = calc as { status: string; tem_direito: boolean; total_atraso_minutos: number } | null;
      const cestaStatus = !c ? "Em cálculo"
        : !c.tem_direito ? "Perdida"
        : c.status === "entregue" ? "Entregue"
        : c.status === "liberada" ? "Liberada"
        : c.total_atraso_minutos >= 90 ? "Em risco" : "OK";
      const lidos = new Set((leituras ?? []).map((l) => (l as { aviso_id: string }).aviso_id));
      const naoLidos = (avisos ?? []).filter((a) => !lidos.has((a as { id: string }).id)).length;
      const uh = (hol ?? [])[0] as { mes_referencia: number; ano_referencia: number } | undefined;
      setResumo({
        atrasoMes,
        cestaStatus,
        ultimoHolerite: uh ? { mes: uh.mes_referencia, ano: uh.ano_referencia } : null,
        avisosNaoLidos: naoLidos,
      });
    })();
  }, [userId]);


  const dataStr = now.toLocaleDateString("pt-BR", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });
  const horaStr = now.toLocaleTimeString("pt-BR");

  const hoje = dias.find((d) => d.dia_semana === now.getDay());
  const proxHorario = (() => {
    if (!hoje || !hoje.trabalha) return "—";
    const hhmm = now.toTimeString().slice(0, 5);
    const seq: Array<[string, string | null]> = [
      ["Entrada", hoje.horario_entrada],
      ["Saída intervalo", hoje.horario_intervalo_saida],
      ["Retorno intervalo", hoje.horario_intervalo_retorno],
      ["Saída", hoje.horario_saida],
    ];
    const prox = seq.find(([, t]) => t && t.slice(0, 5) > hhmm);
    return prox ? `${prox[0]} às ${prox[1]?.slice(0, 5)}` : "Jornada concluída";
  })();

  const fmt = (t: string | null | undefined) => (t ? t.slice(0, 5) : "—");

  return (
    <div className="space-y-6">
      <Card className="bg-black text-white border-primary/30">
        <CardContent className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-sm text-white/70 capitalize">{dataStr}</div>
            <div className="text-3xl sm:text-4xl font-bold mt-1">Olá, {nome || "funcionário"}</div>
            <div className="text-sm text-primary mt-2">Próximo ponto: {proxHorario}</div>
          </div>
          <div className="text-right">
            <div className="text-4xl sm:text-5xl font-mono font-bold text-primary tabular-nums">{horaStr}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 flex flex-col items-center text-center">
          <Clock className="h-12 w-12 text-primary mb-3" />
          <h3 className="text-lg font-semibold mb-1">Registrar ponto</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {jornada ? "Toque no botão abaixo para registrar sua marcação" : "Você não pode bater ponto sem uma jornada ativa"}
          </p>
          <Button
            size="lg"
            className="px-10 py-6 text-lg font-bold"
            disabled={!jornada}
            onClick={() => navigate({ to: "/app/funcionario/bater-ponto" })}
          >
            Bater Ponto
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            Minha jornada
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!carregou ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : !jornada ? (
            <p className="text-sm text-muted-foreground">
              Você ainda não possui jornada cadastrada. Procure o administrador.
            </p>
          ) : (
            <div className="space-y-3">
              <div>
                <div className="font-semibold">{jornada.nome}</div>
                {jornada.descricao && <div className="text-xs text-muted-foreground">{jornada.descricao}</div>}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <Bloc label="Entrada" v={fmt(jornada.horario_entrada)} />
                <Bloc label="Intervalo" v={fmt(jornada.horario_intervalo_saida)} />
                <Bloc label="Retorno" v={fmt(jornada.horario_intervalo_retorno)} />
                <Bloc label="Saída" v={fmt(jornada.horario_saida)} />
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Dias de trabalho</div>
                <div className="flex flex-wrap gap-1.5">
                  {DIAS_SEMANA.map((d) => {
                    const dia = dias.find((x) => x.dia_semana === d.v);
                    const trabalha = dia?.trabalha ?? false;
                    return (
                      <span
                        key={d.v}
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          trabalha ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground line-through"
                        }`}
                      >
                        {d.label}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <InfoCard icon={TrendingDown} label="Atraso no mês" value={formatMinutos(resumo.atrasoMes)} accent="text-orange-600" />
        <InfoCard icon={Gift} label="Cesta básica" value={resumo.cestaStatus}
          accent={resumo.cestaStatus === "Perdida" ? "text-red-600" : resumo.cestaStatus === "Em risco" ? "text-orange-600" : "text-green-600"} />
        <InfoCard icon={FileText} label="Último holerite"
          value={resumo.ultimoHolerite ? `${mesNome(resumo.ultimoHolerite.mes)}/${resumo.ultimoHolerite.ano}` : "—"}
          accent="text-foreground" />
        <InfoCard icon={Bell} label="Avisos novos" value={resumo.avisosNaoLidos} accent="text-primary" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Shortcut to="/app/funcionario/cartao-ponto" icon={CreditCard} label="Cartão de Ponto" />
        <Shortcut to="/app/funcionario/beneficios" icon={Gift} label="Benefícios" />
        <Shortcut to="/app/funcionario/holerites" icon={FileText} label="Holerites" />
      </div>

    </div>
  );
}

function Bloc({ label, v }: { label: string; v: string }) {
  return (
    <div className="rounded-md border p-2 text-center">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="font-mono font-bold text-base">{v}</div>
    </div>
  );
}

function InfoCard({ icon: Icon, label, value, accent }: { icon: typeof Clock; label: string; value: string | number; accent: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-xs font-medium text-muted-foreground leading-tight">{label}</CardTitle>
        <Icon className={`h-4 w-4 shrink-0 ${accent}`} />
      </CardHeader>
      <CardContent>
        <div className="text-xl font-bold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}


function Shortcut({ to, icon: Icon, label }: { to: string; icon: typeof Clock; label: string }) {
  return (
    <Link to={to}>
      <Card className="hover:border-primary transition-colors cursor-pointer">
        <CardContent className="p-5 flex items-center gap-3">
          <div className="h-10 w-10 rounded-md bg-primary/20 flex items-center justify-center">
            <Icon className="h-5 w-5 text-foreground" />
          </div>
          <div className="font-medium">{label}</div>
        </CardContent>
      </Card>
    </Link>
  );
}
