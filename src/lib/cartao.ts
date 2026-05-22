import { supabase } from "@/integrations/supabase/client";

export type DiaCartao = {
  data: string; // yyyy-mm-dd
  diaSemana: number;
  trabalha: boolean;
  programado: {
    entrada: string | null;
    saida_intervalo: string | null;
    retorno_intervalo: string | null;
    saida_final: string | null;
  };
  registrado: {
    entrada: string | null;
    saida_intervalo: string | null;
    retorno_intervalo: string | null;
    saida_final: string | null;
  };
  registroIds: Record<string, string>;
  atrasoMinutos: number;
  trabalhadoMinutos: number;
  extrasMinutos: number;
  falta: boolean;
  pendente: boolean;
  observacao: string | null;
};

export type ResumoCartao = {
  dias: DiaCartao[];
  totalAtraso: number;
  totalFaltas: number;
  totalTrabalhado: number;
  totalExtras: number;
};

function hm(t: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

function tsHm(ts: string): number {
  const d = new Date(ts);
  return d.getHours() * 60 + d.getMinutes();
}

function diasNoMes(ano: number, mes: number): string[] {
  const out: string[] = [];
  const last = new Date(ano, mes, 0).getDate();
  for (let d = 1; d <= last; d++) {
    out.push(`${ano}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  return out;
}

export async function carregarCartao(
  funcionarioId: string,
  ano: number,
  mes: number
): Promise<ResumoCartao> {
  const datas = diasNoMes(ano, mes);
  const ini = datas[0];
  const fim = datas[datas.length - 1];

  // jornada ativa atual (simplificação: usa jornada ativa do funcionário no momento)
  const { data: vinc } = await supabase
    .from("funcionarios_jornadas")
    .select("jornada_id")
    .eq("funcionario_id", funcionarioId)
    .eq("ativo", true)
    .order("data_inicio", { ascending: false })
    .limit(1)
    .maybeSingle();

  let dias: Array<{
    dia_semana: number;
    trabalha: boolean;
    horario_entrada: string | null;
    horario_intervalo_saida: string | null;
    horario_intervalo_retorno: string | null;
    horario_saida: string | null;
  }> = [];

  let toleranciaMin = 0;
  if (vinc?.jornada_id) {
    const { data: jd } = await supabase
      .from("jornadas_dias")
      .select("dia_semana,trabalha,horario_entrada,horario_intervalo_saida,horario_intervalo_retorno,horario_saida")
      .eq("jornada_id", vinc.jornada_id);
    dias = jd ?? [];
    const { data: j } = await supabase
      .from("jornadas")
      .select("tolerancia_atraso_minutos")
      .eq("id", vinc.jornada_id)
      .maybeSingle();
    toleranciaMin = j?.tolerancia_atraso_minutos ?? 0;
  }

  const { data: registros } = await supabase
    .from("registros_ponto")
    .select("id,data_referencia,tipo_ponto,horario_registrado,horario_programado,atraso_minutos,observacao")
    .eq("funcionario_id", funcionarioId)
    .gte("data_referencia", ini)
    .lte("data_referencia", fim);

  const { data: faltasManual } = await supabase
    .from("dias_falta")
    .select("data,justificativa")
    .eq("funcionario_id", funcionarioId)
    .gte("data", ini)
    .lte("data", fim);
  const setFaltas = new Set((faltasManual ?? []).map((x) => x.data as string));
  const justFaltas = new Map((faltasManual ?? []).map((x) => [x.data as string, (x.justificativa as string | null) ?? null]));

  const porDia = new Map<string, typeof registros>();
  for (const r of registros ?? []) {
    const arr = porDia.get(r.data_referencia) ?? [];
    arr.push(r);
    porDia.set(r.data_referencia, arr);
  }

  const result: DiaCartao[] = [];
  let totalAtraso = 0;
  let totalFaltas = 0;
  let totalTrabalhado = 0;
  let totalExtras = 0;

  for (const data of datas) {
    const d = new Date(data + "T00:00");
    const dow = d.getDay();
    const jd = dias.find((x) => x.dia_semana === dow);
    const trabalha = !!jd?.trabalha;

    const regs = porDia.get(data) ?? [];
    const reg: DiaCartao["registrado"] = {
      entrada: null, saida_intervalo: null, retorno_intervalo: null, saida_final: null,
    };
    const ids: Record<string, string> = {};
    let obs: string | null = null;
    for (const r of regs) {
      const t = new Date(r.horario_registrado);
      const hhmm = `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
      (reg as Record<string, string | null>)[r.tipo_ponto] = hhmm;
      ids[r.tipo_ponto] = r.id;
      if (r.observacao) obs = (obs ? obs + " · " : "") + r.observacao;
    }

    const prog = {
      entrada: jd?.horario_entrada?.slice(0, 5) ?? null,
      saida_intervalo: jd?.horario_intervalo_saida?.slice(0, 5) ?? null,
      retorno_intervalo: jd?.horario_intervalo_retorno?.slice(0, 5) ?? null,
      saida_final: jd?.horario_saida?.slice(0, 5) ?? null,
    };

    // Atraso = soma das entradas (entrada + retorno) após tolerância
    let atraso = 0;
    for (const k of ["entrada", "retorno_intervalo"] as const) {
      const p = hm(prog[k]);
      const r = hm(reg[k]);
      if (p != null && r != null) {
        const diff = r - p;
        if (diff > toleranciaMin) atraso += diff;
      }
    }

    // Trabalhado = (saida_final - entrada) - (retorno - saida_intervalo)
    let trabalhado = 0;
    const e = hm(reg.entrada);
    const sf = hm(reg.saida_final);
    if (e != null && sf != null) {
      trabalhado = sf - e;
      const si = hm(reg.saida_intervalo);
      const ri = hm(reg.retorno_intervalo);
      if (si != null && ri != null) trabalhado -= ri - si;
    }
    if (trabalhado < 0) trabalhado = 0;

    // Carga programada do dia
    let cargaProg = 0;
    const pe = hm(prog.entrada);
    const psf = hm(prog.saida_final);
    if (pe != null && psf != null) {
      cargaProg = psf - pe;
      const psi = hm(prog.saida_intervalo);
      const pri = hm(prog.retorno_intervalo);
      if (psi != null && pri != null) cargaProg -= pri - psi;
    }
    const extras = trabalhado > cargaProg ? trabalhado - cargaProg : 0;

    const semRegistro = trabalha && regs.length === 0;
    const falta = semRegistro && setFaltas.has(data);
    const pendente = semRegistro && !falta;
    if (falta) totalFaltas += 1;
    totalAtraso += atraso;
    totalTrabalhado += trabalhado;
    totalExtras += extras;

    result.push({
      data,
      diaSemana: dow,
      trabalha,
      programado: prog,
      registrado: reg,
      registroIds: ids,
      atrasoMinutos: atraso,
      trabalhadoMinutos: trabalhado,
      extrasMinutos: extras,
      falta,
      pendente,
      observacao: obs,
    });
  }

  return {
    dias: result,
    totalAtraso,
    totalFaltas,
    totalTrabalhado,
    totalExtras,
  };
}

export function formatMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${String(m).padStart(2, "0")}`;
}

export const NOMES_MES = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

export const DIAS_SEMANA_CURTO = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
