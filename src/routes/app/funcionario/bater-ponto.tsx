import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { JornadaDia } from "@/lib/jornadas";
import {
  TIPOS_PONTO, TipoPonto, tipoLabel, statusLabel, statusColor,
  horarioProgramado, proximoTipo, avaliar, hojeISO,
} from "@/lib/ponto";

export const Route = createFileRoute("/app/funcionario/bater-ponto")({
  component: BaterPontoPage,
});

type JornadaInfo = {
  id: string;
  nome: string;
  tolerancia_atraso_minutos: number;
};

type RegistroHoje = {
  id: string;
  tipo_ponto: TipoPonto;
  horario_registrado: string;
  horario_programado: string | null;
  atraso_minutos: number;
  status: string;
};

function BaterPontoPage() {
  const { nome, user, empresaId } = useAuth();
  const [now, setNow] = useState(new Date());
  const [funcId, setFuncId] = useState<string | null>(null);
  const [funcStatus, setFuncStatus] = useState<string | null>(null);
  const [permitePonto, setPermitePonto] = useState(true);
  const [jornada, setJornada] = useState<JornadaInfo | null>(null);
  const [dia, setDia] = useState<JornadaDia | null>(null);
  const [registros, setRegistros] = useState<RegistroHoje[]>([]);
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const carregar = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data: func } = await supabase
      .from("funcionarios")
      .select("id,status,permite_bater_ponto")
      .eq("usuario_id", user.id).maybeSingle();
    if (!func) { setLoading(false); return; }
    const f = func as { id: string; status: string; permite_bater_ponto: boolean };
    setFuncId(f.id);
    setFuncStatus(f.status);
    setPermitePonto(f.permite_bater_ponto);

    const { data: vinc } = await supabase
      .from("funcionarios_jornadas")
      .select("jornada_id, jornadas(id,nome,tolerancia_atraso_minutos)")
      .eq("funcionario_id", f.id).eq("ativo", true).maybeSingle();
    const j = (vinc as { jornadas: JornadaInfo | null } | null)?.jornadas ?? null;
    setJornada(j);

    if (j) {
      const { data: dias } = await supabase
        .from("jornadas_dias").select("*").eq("jornada_id", j.id);
      const hoje = (dias ?? []).find((d) => (d as JornadaDia).dia_semana === new Date().getDay()) as JornadaDia | undefined;
      setDia(hoje ?? null);
    }

    const { data: regs } = await supabase
      .from("registros_ponto")
      .select("id,tipo_ponto,horario_registrado,horario_programado,atraso_minutos,status")
      .eq("funcionario_id", f.id)
      .eq("data_referencia", hojeISO())
      .neq("status", "corrigido")
      .order("horario_registrado");
    setRegistros((regs ?? []) as RegistroHoje[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { carregar(); }, [carregar]);

  const tiposJaRegistrados = registros.map((r) => r.tipo_ponto);
  const proximo = proximoTipo(dia, tiposJaRegistrados);
  const horProgProx = proximo ? horarioProgramado(dia, proximo) : null;

  const podeBater = funcStatus === "ativo" && permitePonto && !!jornada && !!dia?.trabalha && !!proximo;

  const motivoBloqueio = !jornada
    ? "Você não possui jornada cadastrada. Procure o administrador."
    : funcStatus !== "ativo"
    ? `Funcionário ${funcStatus}. Procure o administrador.`
    : !permitePonto
    ? "Registro de ponto desabilitado para sua conta."
    : !dia?.trabalha
    ? "Hoje não é um dia de trabalho conforme sua jornada."
    : !proximo
    ? "Todos os pontos do dia já foram registrados."
    : null;

  const bater = async () => {
    if (!funcId || !empresaId || !proximo) return;
    setEnviando(true);
    try {
      const { atraso, status } = avaliar(horProgProx, new Date(), jornada?.tolerancia_atraso_minutos ?? 0);
      const { error } = await supabase.from("registros_ponto").insert({
        empresa_id: empresaId,
        funcionario_id: funcId,
        jornada_id: jornada?.id ?? null,
        data_referencia: hojeISO(),
        tipo_ponto: proximo,
        horario_programado: horProgProx,
        horario_registrado: new Date().toISOString(),
        atraso_minutos: atraso,
        status,
        origem: "funcionario",
      } as never);
      if (error) {
        if (error.code === "23505") {
          toast.error("Este ponto já foi registrado hoje.");
        } else {
          toast.error(error.message);
        }
        return;
      }
      if (status === "atrasado") {
        toast.warning(`${tipoLabel(proximo)} registrada com atraso de ${atraso} min`);
      } else {
        toast.success(`${tipoLabel(proximo)} registrada`);
      }
      carregar();
    } finally {
      setEnviando(false);
    }
  };

  const fmtHora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const dataStr = now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  const horaStr = now.toLocaleTimeString("pt-BR");

  const completos = registros.length === TIPOS_PONTO.filter((t) => t.v === "entrada" || t.v === "saida_final" || (t.v === "saida_intervalo" && dia?.horario_intervalo_saida) || (t.v === "retorno_intervalo" && dia?.horario_intervalo_retorno)).length;
  const statusDia = !dia?.trabalha
    ? "Folga"
    : registros.length === 0
    ? "Não iniciado"
    : !proximo
    ? "Jornada concluída"
    : completos
    ? "Em andamento"
    : "Em andamento";

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <Card className="bg-black text-white border-primary/30">
        <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-xs text-white/70 capitalize">{dataStr}</div>
            <div className="text-xl font-bold mt-0.5">{nome || "Funcionário"}</div>
            <div className="text-xs text-primary mt-1">
              {jornada ? `Jornada: ${jornada.nome}` : "Sem jornada"}
            </div>
          </div>
          <div className="text-right">
            <div className="text-4xl sm:text-5xl font-mono font-bold text-primary tabular-nums">{horaStr}</div>
            <div className="text-xs text-white/70">Status: {statusDia}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 flex flex-col items-center text-center">
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : podeBater ? (
            <>
              <Clock className="h-10 w-10 text-primary mb-2" />
              <div className="text-sm text-muted-foreground">Próximo ponto</div>
              <div className="text-2xl font-bold">{tipoLabel(proximo!)}</div>
              {horProgProx && (
                <div className="text-xs text-muted-foreground mt-1">
                  Programado para {horProgProx.slice(0, 5)}
                </div>
              )}
              <Button
                size="lg"
                className="mt-5 px-12 py-7 text-lg font-bold w-full sm:w-auto"
                disabled={enviando}
                onClick={bater}
              >
                {enviando ? "Registrando..." : "Bater Ponto"}
              </Button>
            </>
          ) : (
            <>
              <AlertTriangle className="h-10 w-10 text-orange-500 mb-2" />
              <div className="text-sm font-medium">{motivoBloqueio ?? "Não é possível bater ponto agora"}</div>
              <Button size="lg" className="mt-4" disabled>Bater Ponto</Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            Registros de hoje
          </CardTitle>
        </CardHeader>
        <CardContent>
          {registros.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum registro hoje.</p>
          ) : (
            <ul className="divide-y">
              {registros.map((r) => (
                <li key={r.id} className="py-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">{tipoLabel(r.tipo_ponto)}</div>
                    <div className="text-xs text-muted-foreground">
                      {fmtHora(r.horario_registrado)}
                      {r.horario_programado && ` · programado ${r.horario_programado.slice(0, 5)}`}
                      {r.atraso_minutos > 0 && ` · atraso ${r.atraso_minutos}min`}
                    </div>
                  </div>
                  <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${statusColor[r.status] ?? "bg-muted"}`}>
                    {statusLabel[r.status] ?? r.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        Você não pode editar seus registros. Em caso de erro, procure a empresa.
      </p>
    </div>
  );
}
