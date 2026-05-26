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
  codigo: string;
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
  // Permite múltiplas jornadas ativas simultaneamente (cada uma cobre dias diferentes da semana).
  // Não encerra vínculos anteriores; apenas evita duplicar a mesma jornada já ativa.
  const { data: existente } = await supabase
    .from("funcionarios_jornadas")
    .select("id")
    .eq("funcionario_id", funcionarioId)
    .eq("jornada_id", jornadaId)
    .eq("ativo", true)
    .maybeSingle();
  if (existente) {
    throw new Error("Esta jornada já está ativa para o colaborador.");
  }
  const { error } = await supabase.from("funcionarios_jornadas").insert({
    funcionario_id: funcionarioId,
    jornada_id: jornadaId,
    data_inicio: dataInicio,
    ativo: true,
  } as never);
  if (error) throw new Error(error.message);
}

// ---------------- Múltiplas jornadas por colaborador ----------------

export type VinculoAtivoComDias = {
  vinculoId: string;
  jornadaId: string;
  nome: string;
  codigo: string;
  tolerancia_atraso_minutos: number;
  data_inicio: string;
  data_fim: string | null;
  dias: JornadaDia[];
};

export async function carregarVinculosAtivos(funcionarioId: string): Promise<VinculoAtivoComDias[]> {
  const { data: vincs } = await supabase
    .from("funcionarios_jornadas")
    .select("id,jornada_id,data_inicio,data_fim,jornadas(nome,codigo,tolerancia_atraso_minutos)")
    .eq("funcionario_id", funcionarioId)
    .eq("ativo", true)
    .order("data_inicio", { ascending: false });
  const rows = (vincs ?? []) as Array<{
    id: string;
    jornada_id: string;
    data_inicio: string;
    data_fim: string | null;
    jornadas: { nome: string; codigo: string | null; tolerancia_atraso_minutos: number } | null;
  }>;
  if (!rows.length) return [];
  const jornadaIds = Array.from(new Set(rows.map((r) => r.jornada_id)));
  const { data: dias } = await supabase
    .from("jornadas_dias")
    .select("*")
    .in("jornada_id", jornadaIds);
  const diasPorJornada = new Map<string, JornadaDia[]>();
  for (const d of (dias ?? []) as JornadaDia[]) {
    const arr = diasPorJornada.get(d.jornada_id) ?? [];
    arr.push(d);
    diasPorJornada.set(d.jornada_id, arr);
  }
  return rows.map((r) => ({
    vinculoId: r.id,
    jornadaId: r.jornada_id,
    nome: r.jornadas?.nome ?? "Jornada",
    codigo: r.jornadas?.codigo ?? "—",
    tolerancia_atraso_minutos: r.jornadas?.tolerancia_atraso_minutos ?? 0,
    data_inicio: r.data_inicio,
    data_fim: r.data_fim,
    dias: diasPorJornada.get(r.jornada_id) ?? [],
  }));
}

/**
 * Escolhe a jornada aplicável a uma data específica.
 * Regra: dentre os vínculos cujo intervalo cobre a data, prefere aquela cuja
 * configuração tem trabalha=true para o dia da semana. Se nenhuma trabalhar
 * nesse dia, retorna a primeira aplicável (folga).
 */
export function escolherJornadaParaData(
  vinculos: VinculoAtivoComDias[],
  dataISO: string,
): { vinculo: VinculoAtivoComDias; dia: JornadaDia | null } | null {
  const dow = new Date(dataISO + "T12:00:00").getDay();
  const aplicaveis = vinculos.filter(
    (v) => v.data_inicio <= dataISO && (!v.data_fim || v.data_fim >= dataISO),
  );
  if (!aplicaveis.length) return null;
  const comTrabalha = aplicaveis
    .map((v) => ({ vinculo: v, dia: v.dias.find((d) => d.dia_semana === dow) ?? null }))
    .filter((x) => x.dia?.trabalha);
  if (comTrabalha.length > 0) return comTrabalha[0];
  const primeiro = aplicaveis[0];
  return { vinculo: primeiro, dia: primeiro.dias.find((d) => d.dia_semana === dow) ?? null };
}

