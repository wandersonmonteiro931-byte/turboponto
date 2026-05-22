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
  fora_do_horario: "Fora do horário",
  pendente: "Pendente",
  corrigido: "Corrigido",
};

export const statusColor: Record<string, string> = {
  no_horario: "bg-green-500/20 text-green-700",
  atrasado: "bg-orange-500/20 text-orange-700",
  fora_do_horario: "bg-red-500/20 text-red-700",
  pendente: "bg-muted text-muted-foreground",
  corrigido: "bg-blue-500/20 text-blue-700",
};

/** Devolve o horário programado para o tipo de ponto no dia da jornada. */
export function horarioProgramado(dia: JornadaDia | null | undefined, tipo: TipoPonto): string | null {
  if (!dia || !dia.trabalha) return null;
  switch (tipo) {
    case "entrada": return dia.horario_entrada;
    case "saida_intervalo": return dia.horario_intervalo_saida;
    case "retorno_intervalo": return dia.horario_intervalo_retorno;
    case "saida_final": return dia.horario_saida;
  }
}

/** Próximo tipo esperado dada a lista de tipos já registrados hoje. */
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

/** Calcula minutos de atraso (>=0) e status com base no horário programado. */
export function avaliar(programado: string | null, agora: Date, toleranciaMin: number): { atraso: number; status: "no_horario" | "atrasado" | "fora_do_horario" } {
  if (!programado) return { atraso: 0, status: "fora_do_horario" };
  const [h, m] = programado.split(":").map(Number);
  const prog = new Date(agora);
  prog.setHours(h, m, 0, 0);
  const diff = Math.floor((agora.getTime() - prog.getTime()) / 60000);
  if (diff <= toleranciaMin) return { atraso: Math.max(0, diff), status: "no_horario" };
  return { atraso: diff, status: "atrasado" };
}

export function hojeISO(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}
