import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { JornadaDia } from "@/lib/jornadas";
import {
  TipoPonto, tipoLabel, statusLabel, statusColor,
  inferirTipo, avaliar, diaComercialISO,
} from "@/lib/ponto";
import { formatMinutos } from "@/lib/format";

type Props = {
  size?: "default" | "lg";
  className?: string;
  onRegistered?: () => void;
};

export function BaterPontoButton({ size = "lg", className, onRegistered }: Props) {
  const { user, empresaId } = useAuth();
  const [now, setNow] = useState(new Date());
  const [funcId, setFuncId] = useState<string | null>(null);
  const [funcStatus, setFuncStatus] = useState<string | null>(null);
  const [permitePonto, setPermitePonto] = useState(true);
  const [jornadaId, setJornadaId] = useState<string | null>(null);
  const [tolerancia, setTolerancia] = useState(0);
  const [dia, setDia] = useState<JornadaDia | null>(null);
  const [tipos, setTipos] = useState<TipoPonto[]>([]);
  const [registrosDia, setRegistrosDia] = useState<Array<{ tipo_ponto: TipoPonto }>>([]);
  const [bloqueioAte, setBloqueioAte] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmando, setConfirmando] = useState(false);
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

    const dataComercial = diaComercialISO(new Date());
    const { carregarVinculosAtivos, escolherJornadaParaData } = await import("@/lib/jornadas");
    const vincs = await carregarVinculosAtivos(f.id);
    const escolha = escolherJornadaParaData(vincs, dataComercial);
    setJornadaId(escolha?.vinculo.jornadaId ?? null);
    setTolerancia(escolha?.vinculo.tolerancia_atraso_minutos ?? 0);
    setDia(escolha?.dia ?? null);

    const { data: regs } = await supabase
      .from("registros_ponto")
      .select("tipo_ponto")
      .eq("funcionario_id", f.id)
      .eq("data_referencia", dataComercial)
      .neq("status", "corrigido");
    const rs = (regs ?? []) as Array<{ tipo_ponto: TipoPonto }>;
    setRegistrosDia(rs);
    setTipos(rs.map((r) => r.tipo_ponto));

    const { data: ultSaida } = await supabase
      .from("registros_ponto")
      .select("data_referencia,horario_programado,horario_registrado")
      .eq("funcionario_id", f.id)
      .eq("tipo_ponto", "saida_final")
      .neq("status", "corrigido")
      .order("data_referencia", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ultSaida) {
      const u = ultSaida as { data_referencia: string; horario_programado: string | null; horario_registrado: string };
      const registrado = new Date(u.horario_registrado);
      let base = u.horario_programado ? new Date(`${u.data_referencia}T${u.horario_programado}`) : registrado;
      if (base.getTime() > registrado.getTime() + 60 * 1000) base = new Date(base.getTime() - 24 * 60 * 60 * 1000);
      const ate = new Date(base.getTime() + 10 * 60 * 60 * 1000);
      setBloqueioAte(ate > new Date() ? ate : null);
    } else setBloqueioAte(null);
    setLoading(false);
  }, [user]);

  useEffect(() => { carregar(); }, [carregar]);

  const inferido = inferirTipo(dia, now, tipos);
  const emBloqueio = !!bloqueioAte && bloqueioAte > now;
  const podeBater = funcStatus === "ativo" && permitePonto && !!jornadaId && !!dia?.trabalha && !!inferido && !emBloqueio;
  const previa = inferido ? avaliar(inferido.programado, now, tolerancia, inferido.tipo) : null;

  const motivo = !podeBater
    ? emBloqueio
      ? `Aguarde 10h após a saída final.`
      : !jornadaId ? "Sem jornada cadastrada."
      : funcStatus !== "ativo" ? `Funcionário ${funcStatus}.`
      : !permitePonto ? "Registro desabilitado."
      : !dia?.trabalha ? "Hoje não é dia de trabalho."
      : !inferido ? "Todos os pontos do dia já foram registrados."
      : "Não disponível"
    : null;

  const bater = async () => {
    if (!funcId || !empresaId || !inferido) return;
    setEnviando(true);
    try {
      const { atraso, status } = avaliar(inferido.programado, new Date(), tolerancia, inferido.tipo);
      const { error } = await supabase.from("registros_ponto").insert({
        empresa_id: empresaId,
        funcionario_id: funcId,
        jornada_id: jornadaId,
        data_referencia: diaComercialISO(new Date()),
        tipo_ponto: inferido.tipo,
        horario_programado: inferido.programado,
        horario_registrado: new Date().toISOString(),
        atraso_minutos: atraso,
        status,
        origem: "funcionario",
      } as never);
      if (error) {
        if (error.code === "23505") toast.error("Este ponto já foi registrado hoje.");
        else toast.error(error.message);
        return;
      }
      if (inferido.tipo === "saida_final" && dia) {
        const dataRef = diaComercialISO(new Date());
        const jaTipos = registrosDia.map((r) => r.tipo_ponto);
        const autos: Array<{ tipo: TipoPonto; hora: string }> = [];
        if (dia.horario_intervalo_saida && !jaTipos.includes("saida_intervalo"))
          autos.push({ tipo: "saida_intervalo", hora: dia.horario_intervalo_saida });
        if (dia.horario_intervalo_retorno && !jaTipos.includes("retorno_intervalo"))
          autos.push({ tipo: "retorno_intervalo", hora: dia.horario_intervalo_retorno });
        if (autos.length > 0) {
          await supabase.from("registros_ponto").insert(
            autos.map((a) => ({
              empresa_id: empresaId,
              funcionario_id: funcId,
              jornada_id: jornadaId,
              data_referencia: dataRef,
              tipo_ponto: a.tipo,
              horario_programado: a.hora,
              horario_registrado: new Date(`${dataRef}T${a.hora}`).toISOString(),
              atraso_minutos: 0,
              status: "no_horario",
              origem: "automatico",
            })) as never,
          );
        }
      }
      const label = tipoLabel(inferido.tipo);
      if (status === "atrasado") toast.warning(`${label} registrada com atraso de ${formatMinutos(atraso)}`);
      else if (status === "hora_extra") toast.success(`${label} registrada — hora extra`);
      else if (status === "saida_antecipada") toast.warning(`${label} antecipada`);
      else if (status === "entrada_antecipada") toast.success(`${label} antecipada`);
      else toast.success(`${label} registrada`);
      setConfirmando(false);
      await carregar();
      onRegistered?.();
    } finally {
      setEnviando(false);
    }
  };

  const horaStr = now.toLocaleTimeString("pt-BR");

  return (
    <>
      <div className="flex flex-col items-center gap-2 w-full">
        {podeBater && inferido && (
          <div className="text-xs text-muted-foreground">
            Será registrado como <strong className="text-foreground">{tipoLabel(inferido.tipo)}</strong>
            {inferido.programado && ` · prog. ${inferido.programado.slice(0,5)}`}
          </div>
        )}
        <Button
          size={size}
          className={className ?? "px-10 py-6 text-lg font-bold"}
          disabled={loading || !podeBater || enviando}
          onClick={() => setConfirmando(true)}
        >
          Bater Ponto
        </Button>
        {!loading && !podeBater && motivo && (
          <div className="text-xs text-orange-600">{motivo}</div>
        )}
      </div>

      <AlertDialog open={confirmando} onOpenChange={(o) => !enviando && setConfirmando(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar registro de ponto</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <div>Tipo: <strong>{inferido ? tipoLabel(inferido.tipo) : "—"}</strong></div>
                <div>Horário atual: <strong className="font-mono">{horaStr}</strong></div>
                {inferido?.programado && (
                  <div>Programado: <strong className="font-mono">{inferido.programado.slice(0, 5)}</strong></div>
                )}
                {previa && previa.status !== "no_horario" && (
                  <span className={`inline-block text-[10px] uppercase font-bold px-2 py-0.5 rounded ${statusColor[previa.status]}`}>
                    {statusLabel[previa.status]}
                    {previa.atraso > 0 ? ` · ${formatMinutos(previa.atraso)}` : ""}
                  </span>
                )}
                <div className="text-muted-foreground">Após confirmar, o registro não poderá ser alterado por você.</div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={enviando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); bater(); }} disabled={enviando}>
              {enviando ? "Registrando..." : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
