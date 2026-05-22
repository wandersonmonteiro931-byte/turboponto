import { supabase } from "@/integrations/supabase/client";

export const DIAS_SEMANA = [
  { v: 0, label: "Dom", full: "Domingo" },
  { v: 1, label: "Seg", full: "Segunda" },
  { v: 2, label: "Ter", full: "Terça" },
  { v: 3, label: "Qua", full: "Quarta" },
  { v: 4, label: "Qui", full: "Quinta" },
  { v: 5, label: "Sex", full: "Sexta" },
  { v: 6, label: "Sáb", full: "Sábado" },
];

export type Jornada = {
  id: string;
  empresa_id: string;
  nome: string;
  descricao: string | null;
  horario_entrada: string | null;
  horario_intervalo_saida: string | null;
  horario_intervalo_retorno: string | null;
  horario_saida: string | null;
  carga_horaria_minutos: number;
  tolerancia_atraso_minutos: number;
  status: string;
};

export type JornadaDia = {
  id: string;
  jornada_id: string;
  dia_semana: number;
  trabalha: boolean;
  horario_entrada: string | null;
  horario_intervalo_saida: string | null;
  horario_intervalo_retorno: string | null;
  horario_saida: string | null;
};

export function calcMinutos(entrada: string, intSai: string, intRet: string, saida: string): number {
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  if (!entrada || !saida) return 0;
  let total = toMin(saida) - toMin(entrada);
  if (total < 0) total += 24 * 60;
  if (intSai && intRet) {
    let inter = toMin(intRet) - toMin(intSai);
    if (inter < 0) inter += 24 * 60;
    total -= inter;
  }
  return Math.max(0, total);
}

export function formatMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${m.toString().padStart(2, "0")}`;
}

export async function ativarVinculo(funcionarioId: string, jornadaId: string, dataInicio: string) {
  // Encerra vínculos ativos
  await (supabase.from("funcionarios_jornadas") as never as {
    update: (v: object) => { eq: (a: string, b: unknown) => { eq: (a: string, b: unknown) => Promise<unknown> } };
  })
    .update({ ativo: false, data_fim: dataInicio })
    .eq("funcionario_id", funcionarioId)
    .eq("ativo", true);
  const { error } = await supabase.from("funcionarios_jornadas").insert({
    funcionario_id: funcionarioId,
    jornada_id: jornadaId,
    data_inicio: dataInicio,
    ativo: true,
  } as never);
  if (error) throw new Error(error.message);
}
