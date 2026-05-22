import { supabase } from "@/integrations/supabase/client";
import type { JustificativaTipo } from "@/lib/justificativas";

export type JustificativaAplicadaDia = {
  id: string;
  tipo_id: string;
  tipo: Pick<
    JustificativaTipo,
    | "nome"
    | "codigo"
    | "categoria"
    | "desconta_salario"
    | "desconta_dsr"
    | "abona_ocorrencia"
    | "movimenta_banco_horas"
    | "conta_dia_trabalhado"
    | "exige_marcacao_ponto"
    | "afeta_assiduidade"
  >;
  observacao: string | null;
  anexo_url: string | null;
  status: string;
  quantidadeMinutos: number | null;
};

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
  faltaRegistrada: boolean;
  marcacaoNaoRegistrada: boolean;
  foraVinculo: boolean;
  observacao: string | null;
  justificativa: JustificativaAplicadaDia | null;
  justificativas: JustificativaAplicadaDia[];
  bancoHorasMinutos: number; // positivo = crédito, negativo = débito
};

export type ResumoCartao = {
  dias: DiaCartao[];
  totalAtraso: number;
  totalFaltas: number;
  totalTrabalhado: number;
  totalExtras: number;
  totalBancoHoras: number;
  toleranciaMinutos: number;
  dataAdmissao: string | null;
  dataDesligamento: string | null;
};

function hm(t: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

function diffRelogio(inicio: number, fim: number): number {
  let diff = fim - inicio;
  if (diff < 0) diff += 1440;
  return diff;
}

function diffRelogioAssinado(previsto: number, real: number): number {
  let diff = real - previsto;
  if (diff < -720) diff += 1440;
  if (diff > 720) diff -= 1440;
  return diff;
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
  mes: number,
): Promise<ResumoCartao> {
  const datas = diasNoMes(ano, mes);
  const ini = datas[0];
  const fim = datas[datas.length - 1];

  // datas de admissão/desligamento do funcionário
  const { data: func } = await supabase
    .from("funcionarios")
    .select("data_admissao,data_desligamento")
    .eq("id", funcionarioId)
    .maybeSingle();
  const dataAdmissao = func?.data_admissao ?? null;
  const dataDeslig = func?.data_desligamento ?? null;

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

  let toleranciaMin = 5;
  if (vinc?.jornada_id) {
    const { data: jd } = await supabase
      .from("jornadas_dias")
      .select(
        "dia_semana,trabalha,horario_entrada,horario_intervalo_saida,horario_intervalo_retorno,horario_saida",
      )
      .eq("jornada_id", vinc.jornada_id);
    dias = jd ?? [];
    const { data: j } = await supabase
      .from("jornadas")
      .select("tolerancia_atraso_minutos")
      .eq("id", vinc.jornada_id)
      .maybeSingle();
    toleranciaMin = j?.tolerancia_atraso_minutos ?? 5;
  }

  const { data: registros } = await supabase
    .from("registros_ponto")
    .select(
      "id,data_referencia,tipo_ponto,horario_registrado,horario_programado,atraso_minutos,observacao",
    )
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
  const justFaltas = new Map(
    (faltasManual ?? []).map((x) => [x.data as string, (x.justificativa as string | null) ?? null]),
  );

  // Justificativas aplicadas no período
  const { data: justApls } = await supabase
    .from("justificativas_aplicadas")
    .select("id,tipo_id,data,data_inicio,data_fim,observacao,anexo_url,status,quantidade_minutos")
    .eq("funcionario_id", funcionarioId)
    .gte("data", ini)
    .lte("data", fim);
  const tipoIds = Array.from(new Set((justApls ?? []).map((j) => j.tipo_id).filter(Boolean)));
  const { data: tiposJust } = tipoIds.length
    ? await supabase
        .from("justificativas_tipos")
        .select(
          "id,nome,codigo,categoria,desconta_salario,desconta_dsr,abona_ocorrencia,movimenta_banco_horas,conta_dia_trabalhado,exige_marcacao_ponto,afeta_assiduidade",
        )
        .in("id", tipoIds)
    : { data: [] };
  const tiposPorId = new Map(
    (tiposJust ?? []).map((t) => [t.id, t as JustificativaAplicadaDia["tipo"] & { id: string }]),
  );
  const justPorDia = new Map<string, JustificativaAplicadaDia[]>();
  for (const j of (justApls ?? []) as Array<{
    id: string;
    tipo_id: string;
    data: string;
    data_inicio: string | null;
    data_fim: string | null;
    observacao: string | null;
    anexo_url: string | null;
    status: string;
    quantidade_minutos: number | null;
  }>) {
    const tipo = tiposPorId.get(j.tipo_id);
    if (!tipo) continue;
    const item: JustificativaAplicadaDia = {
      id: j.id,
      tipo_id: j.tipo_id,
      observacao: j.observacao,
      anexo_url: j.anexo_url,
      status: j.status,
      quantidadeMinutos: j.quantidade_minutos,
      tipo,
    };
    const arr = justPorDia.get(j.data) ?? [];
    arr.push(item);
    justPorDia.set(j.data, arr);
  }

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
  let totalBancoHoras = 0;

  for (const data of datas) {
    const d = new Date(data + "T00:00");
    const dow = d.getDay();
    const jd = dias.find((x) => x.dia_semana === dow);
    let trabalha = !!jd?.trabalha;

    // Fora do vínculo: antes da admissão ou após desligamento
    const foraVinculo =
      (dataAdmissao != null && data < dataAdmissao) || (dataDeslig != null && data > dataDeslig);
    if (foraVinculo) trabalha = false;

    const regs = porDia.get(data) ?? [];
    const reg: DiaCartao["registrado"] = {
      entrada: null,
      saida_intervalo: null,
      retorno_intervalo: null,
      saida_final: null,
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

    // Quando há marcação do dia, mas o intervalo não foi registrado,
    // considera o intervalo programado para manter o cálculo do cartão correto.
    const temMarcacaoDoDia = Object.values(reg).some(Boolean);
    if (trabalha && temMarcacaoDoDia) {
      if (!reg.saida_intervalo && prog.saida_intervalo) reg.saida_intervalo = prog.saida_intervalo;
      if (!reg.retorno_intervalo && prog.retorno_intervalo)
        reg.retorno_intervalo = prog.retorno_intervalo;
    }

    // Atraso = soma das entradas (entrada + retorno) após tolerância
    let atraso = 0;
    for (const k of ["entrada", "retorno_intervalo"] as const) {
      const p = hm(prog[k]);
      const r = hm(reg[k]);
      if (p != null && r != null) {
        const diff = diffRelogioAssinado(p, r);
        if (diff > toleranciaMin) atraso += diff;
      }
    }

    // Trabalhado = (saida_final - entrada) - (retorno - saida_intervalo)
    let trabalhado = 0;
    const e = hm(reg.entrada);
    const sf = hm(reg.saida_final);
    if (e != null && sf != null) {
      trabalhado = diffRelogio(e, sf);
      const si = hm(reg.saida_intervalo);
      const ri = hm(reg.retorno_intervalo);
      if (si != null && ri != null) trabalhado -= diffRelogio(si, ri);
    }
    if (trabalhado < 0) trabalhado = 0;

    // Carga programada do dia
    let cargaProg = 0;
    const pe = hm(prog.entrada);
    const psf = hm(prog.saida_final);
    if (pe != null && psf != null) {
      cargaProg = diffRelogio(pe, psf);
      const psi = hm(prog.saida_intervalo);
      const pri = hm(prog.retorno_intervalo);
      if (psi != null && pri != null) cargaProg -= diffRelogio(psi, pri);
    }

    // Créditos/débitos por categoria (regra solicitada):
    // - Entrada antecipada → CRÉDITO
    // - Saída antecipada   → DÉBITO
    // - Entrada em atraso  → DÉBITO (já contabilizado em "atraso")
    // - Hora extra: somente após o horário previsto de saída + 10 minutos → CRÉDITO
    const LIMITE_EXTRA_MIN = 10;
    let creditoEntradaAntec = 0;
    let debitoSaidaAntec = 0;
    let creditoHoraExtra = 0;
    if (pe != null && e != null) {
      const diffE = diffRelogioAssinado(pe, e);
      if (diffE < -toleranciaMin) creditoEntradaAntec = -diffE;
    }
    if (psf != null && sf != null) {
      const diffS = diffRelogioAssinado(psf, sf);
      if (diffS > LIMITE_EXTRA_MIN) creditoHoraExtra = diffS;
      else if (diffS < -toleranciaMin) debitoSaidaAntec = -diffS;
    }
    let extras = creditoHoraExtra;


    // Hoje (yyyy-mm-dd local)
    const hoje = new Date();
    const todayStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
    // Para o dia atual, só considera pendente após o horário de saída final + 60min de margem.
    // Dias futuros: tratados como pendente (marcação não registrada).
    let aindaDentroDoExpediente = false;
    if (data === todayStr && prog.saida_final) {
      const agoraMin = hoje.getHours() * 60 + hoje.getMinutes();
      const fimMin = (hm(prog.saida_final) ?? 0) + 60;
      if (agoraMin < fimMin) aindaDentroDoExpediente = true;
    }

    const semRegistro = trabalha && regs.length === 0;
    let falta = semRegistro && setFaltas.has(data);
    let pendente = semRegistro && !falta && !aindaDentroDoExpediente;
    const faltaRegistrada = falta;
    const marcacaoNaoRegistrada = semRegistro && !aindaDentroDoExpediente;
    let bancoHorasMin = 0;

    // Aplica regras das justificativas, mas mantém todas registradas para exibição no PDF
    const justificativas = justPorDia.get(data) ?? [];
    const just = justificativas[0] ?? null;
    const temHoraExtraPagar = justificativas.some((j) => j.tipo.codigo === "HE_PAGAR");
    const justHoraExtraCredito = justificativas.find((j) => j.tipo.codigo === "HE_CREDITO");
    const faltaComDescontoAplicada = justificativas.some(
      (j) => j.tipo.categoria === "falta" && j.tipo.desconta_salario,
    );
    const faltaComDesconto = faltaComDescontoAplicada || (semRegistro && setFaltas.has(data));
    const temDebitoManualBH = justificativas.some(
      (j) =>
        j.tipo.movimenta_banco_horas === "debito" &&
        !(j.tipo.categoria === "falta" && j.tipo.desconta_salario),
    );
    let abonoSemDesconto = false;
    for (const just of justificativas) {
      const t = just.tipo;
      // Abona ocorrência: anula falta/pendente e zera atraso, salvo se tipo desconta
      if (t.abona_ocorrencia) {
        falta = false;
        pendente = false;
        if (!t.desconta_salario) {
          atraso = 0;
          abonoSemDesconto = true;
        }
      }
      // Não exige marcação: substitui "marcação não registrada" pelo rótulo
      if (!t.exige_marcacao_ponto) {
        pendente = false;
      }
      // Conta como dia trabalhado: soma carga prevista
      if (t.conta_dia_trabalhado && trabalhado === 0 && cargaProg > 0) {
        trabalhado = cargaProg;
      }
      // Banco de horas: crédito usa horas trabalhadas na folga e somente extra em dia normal.
      if (t.movimenta_banco_horas === "credito") {
        if (t.codigo === "HE_CREDITO") continue;
        const minutosCredito = just.quantidadeMinutos ?? (!trabalha ? trabalhado : extras);
        bancoHorasMin += Math.max(0, minutosCredito);
      } else if (t.movimenta_banco_horas === "debito") {
        if (t.categoria === "falta" && t.desconta_salario) continue;
        const minutosDebito = just.quantidadeMinutos ?? (cargaProg > 0 ? cargaProg : atraso);
        bancoHorasMin -= Math.max(0, minutosDebito);
      }
      // Falta com desconto explícita
      if (t.categoria === "falta" && t.desconta_salario) {
        falta = true;
      }
    }

    // Toda hora extra (após +10 min) vira crédito automaticamente,
    // exceto quando o admin marca HORA EXTRA - PAGAR.
    if (!temHoraExtraPagar) {
      const minutosCreditoHE = justHoraExtraCredito?.quantidadeMinutos ?? creditoHoraExtra;
      bancoHorasMin += Math.max(0, minutosCreditoHE);
    }

    // Crédito automático por entrada antecipada (sempre crédito, independe de HE_PAGAR).
    bancoHorasMin += creditoEntradaAntec;

    // Débitos automáticos: falta injustificada, atrasos e saída antecipada viram débito de BH.
    if (trabalha && !abonoSemDesconto && !temDebitoManualBH && !faltaComDesconto) {
      if (falta && cargaProg > 0) {
        bancoHorasMin -= cargaProg;
      } else {
        const debitoAutomatico = atraso + debitoSaidaAntec;
        bancoHorasMin -= Math.max(0, debitoAutomatico);
      }
    }


    // Fora do vínculo zera ocorrências e adiciona observação informativa
    if (foraVinculo) {
      falta = false;
      pendente = false;
      atraso = 0;
      trabalhado = 0;
      extras = 0;
      bancoHorasMin = 0;
    }

    if (falta) totalFaltas += 1;
    totalAtraso += atraso;
    totalTrabalhado += trabalhado;
    totalExtras += extras;
    totalBancoHoras += bancoHorasMin;

    const obsJustificativas = justificativas
      .map((j) => j.observacao)
      .filter(Boolean)
      .join(" · ");
    const obsFinal = foraVinculo
      ? null
      : obsJustificativas || (falta ? (justFaltas.get(data) ?? obs) : obs);

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
      faltaRegistrada,
      marcacaoNaoRegistrada,
      foraVinculo,
      observacao: obsFinal,
      justificativa: just,
      justificativas,
      bancoHorasMinutos: bancoHorasMin,
    });
  }

  return {
    dias: result,
    totalAtraso,
    totalFaltas,
    totalTrabalhado,
    totalExtras,
    totalBancoHoras,
    toleranciaMinutos: toleranciaMin,
    dataAdmissao,
    dataDesligamento: dataDeslig,
  };
}

export function formatMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${String(m).padStart(2, "0")}`;
}

export const NOMES_MES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export const DIAS_SEMANA_CURTO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
