import { JornadaDia } from "@/lib/jornadas";

export const TIPOS_PONTO = [
  { v: "entrada", label: "Entrada" },
  { v: "saida_intervalo", label: "Saída p/ intervalo" },
  { v: "retorno_intervalo", label: "Retorno do intervalo" },
  { v: "saida_final", label: "Saída final" },
] as const;

export type TipoPonto = (typeof TIPOS_PONTO)[number]["v"];

export const tipoLabel = (t: string) =>
  TIPOS_PONTO.find((x) => x.v === t)?.label ?? t;

export const statusLabel: Record<string, string> = {
  no_horario: "No horário",
  atrasado: "Atrasado",
  entrada_antecipada: "Entrada antecipada",
  saida_antecipada: "Saída antecipada",
  hora_extra: "Hora extra",
  fora_do_horario: "Fora do horário",
  pendente: "Pendente",
  corrigido: "Corrigido",
};

export const statusColor: Record<string, string> = {
  no_horario: "bg-green-500/20 text-green-700",
  atrasado: "bg-orange-500/20 text-orange-700",
  entrada_antecipada: "bg-blue-500/20 text-blue-700",
  saida_antecipada: "bg-orange-500/20 text-orange-700",
  hora_extra: "bg-purple-500/20 text-purple-700",
  fora_do_horario: "bg-red-500/20 text-red-700",
  pendente: "bg-muted text-muted-foreground",
  corrigido: "bg-blue-500/20 text-blue-700",
};

export function horarioProgramado(dia: JornadaDia | null | undefined, tipo: TipoPonto): string | null {
  if (!dia || !dia.trabalha) return null;
  switch (tipo) {
    case "entrada": return dia.horario_entrada;
    case "saida_intervalo": return dia.horario_intervalo_saida;
    case "retorno_intervalo": return dia.horario_intervalo_retorno;
    case "saida_final": return dia.horario_saida;
  }
}

export function proximoTipo(dia: JornadaDia | null | undefined, jaRegistrados: TipoPonto[]): TipoPonto | null {
  if (!dia || !dia.trabalha) return null;
  const sequencia: TipoPonto[] = ["entrada"];
  if (dia.horario_intervalo_saida) sequencia.push("saida_intervalo");
  if (dia.horario_intervalo_retorno) sequencia.push("retorno_intervalo");
  sequencia.push("saida_final");
  for (const t of sequencia) {
    if (!jaRegistrados.includes(t)) return t;
  }
  return null;
}

const minutosDoDia = (d: Date) => d.getHours() * 60 + d.getMinutes();
const hhmmToMin = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
};

/**
 * Infere o tipo de ponto pelo horário mais próximo do programado,
 * mesmo que pontos anteriores não tenham sido registrados.
 * Considera diferença circular (00:55 para saída das 23:50 → ~65min).
 */
export function inferirTipo(
  dia: JornadaDia | null | undefined,
  agora: Date,
  jaRegistrados: TipoPonto[],
): { tipo: TipoPonto; programado: string | null } | null {
  if (!dia || !dia.trabalha) return null;
  const candidatos: Array<{ tipo: TipoPonto; prog: string }> = [];
  if (dia.horario_entrada) candidatos.push({ tipo: "entrada", prog: dia.horario_entrada });
  if (dia.horario_intervalo_saida) candidatos.push({ tipo: "saida_intervalo", prog: dia.horario_intervalo_saida });
  if (dia.horario_intervalo_retorno) candidatos.push({ tipo: "retorno_intervalo", prog: dia.horario_intervalo_retorno });
  if (dia.horario_saida) candidatos.push({ tipo: "saida_final", prog: dia.horario_saida });
  const disponiveis = candidatos.filter((c) => !jaRegistrados.includes(c.tipo));
  if (disponiveis.length === 0) return null;
  const agoraMin = minutosDoDia(agora);
  let melhor = disponiveis[0];
  let melhorDist = Infinity;
  for (const c of disponiveis) {
    const progMin = hhmmToMin(c.prog);
    const diff = Math.abs(agoraMin - progMin);
    const dist = Math.min(diff, 1440 - diff);
    if (dist < melhorDist) {
      melhorDist = dist;
      melhor = c;
    }
  }
  return { tipo: melhor.tipo, programado: melhor.prog };
}

/** Avalia status do registro considerando o tipo de ponto. */
export function avaliar(
  programado: string | null,
  agora: Date,
  toleranciaMin: number,
  tipo?: TipoPonto,
): { atraso: number; status: "no_horario" | "atrasado" | "entrada_antecipada" | "saida_antecipada" | "hora_extra" | "fora_do_horario" } {
  if (!programado) return { atraso: 0, status: "fora_do_horario" };
  const progMin = hhmmToMin(programado);
  const agoraMin = minutosDoDia(agora);
  const diff = agoraMin - progMin;
  if (Math.abs(diff) <= toleranciaMin) return { atraso: Math.max(0, diff), status: "no_horario" };
  // Saídas: cedo = antecipada, tarde = hora extra
  if (tipo === "saida_final" || tipo === "saida_intervalo") {
    if (diff < 0) return { atraso: 0, status: "saida_antecipada" };
    return { atraso: 0, status: "hora_extra" };
  }
  // Entradas / retorno: cedo = antecipada, tarde = atrasado
  if (diff < 0) return { atraso: 0, status: "entrada_antecipada" };
  return { atraso: diff, status: "atrasado" };
}

export function hojeISO(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

/**
 * Status geral da jornada do dia para exibir na home / bater-ponto.
 */
export function statusJornadaHoje(
  dia: JornadaDia | null | undefined,
  jaRegistrados: TipoPonto[],
  agora: Date,
  toleranciaMin: number = 0,
): { label: string; tone: "ok" | "warn" | "bad" | "muted" | "info" } {
  if (!dia) return { label: "Sem jornada cadastrada", tone: "muted" };
  if (!dia.trabalha) return { label: "Folga hoje", tone: "muted" };

  const agoraMin = minutosDoDia(agora);
  const has = (t: TipoPonto) => jaRegistrados.includes(t);
  const ent = dia.horario_entrada ? hhmmToMin(dia.horario_entrada) : null;
  const intS = dia.horario_intervalo_saida ? hhmmToMin(dia.horario_intervalo_saida) : null;
  const intR = dia.horario_intervalo_retorno ? hhmmToMin(dia.horario_intervalo_retorno) : null;
  const sai = dia.horario_saida ? hhmmToMin(dia.horario_saida) : null;

  // Fim do dia sem registro algum → falta
  if (jaRegistrados.length === 0 && sai !== null && agoraMin > sai + 60) {
    return { label: "Falta hoje", tone: "bad" };
  }

  // Saída final concluída
  if (has("saida_final")) return { label: "Jornada concluída", tone: "ok" };

  // Antes da entrada
  if (ent !== null && agoraMin < ent - toleranciaMin && !has("entrada")) {
    return { label: `Aguardando entrada às ${dia.horario_entrada?.slice(0, 5)}`, tone: "info" };
  }

  // Atrasado para entrada
  if (!has("entrada") && ent !== null && agoraMin > ent + toleranciaMin) {
    return { label: "Em atraso para registrar Entrada", tone: "bad" };
  }

  // Em intervalo
  if (has("saida_intervalo") && !has("retorno_intervalo")) {
    if (intR !== null && agoraMin > intR + toleranciaMin) {
      return { label: "Intervalo não registrado (retorno em atraso)", tone: "bad" };
    }
    return { label: "Em intervalo", tone: "info" };
  }

  // Horário de intervalo passou sem registrar
  if (!has("saida_intervalo") && intS !== null && agoraMin > intS + toleranciaMin && has("entrada")) {
    if (intR !== null && agoraMin > intR + toleranciaMin) {
      return { label: "Intervalo não registrado", tone: "warn" };
    }
    return { label: "Em atraso para registrar Saída p/ intervalo", tone: "bad" };
  }

  // Saída final em atraso
  if (!has("saida_final") && sai !== null && agoraMin > sai + toleranciaMin) {
    return { label: "Em atraso para registrar Saída final", tone: "bad" };
  }

  // Trabalhando normalmente
  if (has("entrada")) return { label: "Em horário de trabalho", tone: "ok" };

  return { label: "Em horário de trabalho", tone: "ok" };
}
