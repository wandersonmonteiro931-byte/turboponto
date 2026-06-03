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
  jornadaCompensacaoId: string | null;
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
  jornadaCodigo: string | null;
  jornadaNome: string | null;
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

function normalizaTextoRegra(valor: string | null | undefined): string {
  return (valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function ehTrocaFolga(j: JustificativaAplicadaDia): boolean {
  const nome = normalizaTextoRegra(j.tipo.nome);
  const codigo = normalizaTextoRegra(j.tipo.codigo);
  const obs = normalizaTextoRegra(j.observacao);
  return (
    j.tipo.categoria === "troca" &&
    (nome.includes("TROCA FOLGA") || codigo.includes("TROCA_FOLGA") || obs.includes("TROCA FOLGA"))
  );
}

function ehTrocaCompensada(j: JustificativaAplicadaDia): boolean {
  const nome = normalizaTextoRegra(j.tipo.nome);
  const codigo = normalizaTextoRegra(j.tipo.codigo);
  const obs = normalizaTextoRegra(j.observacao);
  return (
    j.tipo.categoria === "troca" &&
    (nome.includes("TROCA COMPENSADA") || codigo.includes("TROCA_COMPENSADA") || obs.includes("TROCA COMPENSADA"))
  );
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

export async function carregarCartao(funcionarioId: string, ano: number, mes: number): Promise<ResumoCartao> {
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

  // Carrega todos os vínculos ativos do funcionário (múltiplas jornadas suportadas:
  // a aplicável a cada dia é escolhida pelo dia da semana / trabalha=true).
  const { carregarVinculosAtivos, escolherJornadaParaData } = await import("@/lib/jornadas");
  const vinculos = await carregarVinculosAtivos(funcionarioId);

  // Tolerância CLT (art. 58 §1º): 5 minutos por batida, máximo 10 minutos por dia.
  const toleranciaMin = 5;

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
  const justFaltas = new Map(
    (faltasManual ?? []).map((x) => [x.data as string, (x.justificativa as string | null) ?? null]),
  );

  // Justificativas aplicadas no período
  const { data: justApls } = await supabase
    .from("justificativas_aplicadas")
    .select(
      "id,tipo_id,data,data_inicio,data_fim,observacao,anexo_url,status,quantidade_minutos,jornada_compensacao_id",
    )
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
    jornada_compensacao_id: string | null;
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
      jornadaCompensacaoId: j.jornada_compensacao_id,
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
    const escolha = escolherJornadaParaData(vinculos, data);
    let jd = escolha?.dia ?? null;
    let jornadaCodigo = escolha?.vinculo.codigo ?? null;
    let jornadaNome = escolha?.vinculo.nome ?? null;

    // Se houver justificativa de TROCA com escala de compensação, usa a escala
    // selecionada pelo admin como referência de horário previsto.
    const justsDoDiaParaEscala = justPorDia.get(data) ?? [];
    const compensacao = justsDoDiaParaEscala.find((j) => j.jornadaCompensacaoId);
    if (compensacao?.jornadaCompensacaoId) {
      const vincComp = vinculos.find((v) => v.jornadaId === compensacao.jornadaCompensacaoId);
      const diaComp = vincComp?.dias.find((d) => d.dia_semana === dow) ?? null;
      if (vincComp) {
        jd = diaComp?.trabalha
          ? diaComp
          : {
          id: `compensacao-${vincComp.jornadaId}-${dow}`,
          jornada_id: vincComp.jornadaId,
          dia_semana: dow,
          trabalha: true,
          horario_entrada: vincComp.horario_entrada,
          horario_intervalo_saida: vincComp.horario_intervalo_saida,
          horario_intervalo_retorno: vincComp.horario_intervalo_retorno,
          horario_saida: vincComp.horario_saida,
        };
        jornadaCodigo = vincComp.codigo;
        jornadaNome = vincComp.nome;
      }
    }
    let trabalha = !!jd?.trabalha;

    // Fora do vínculo: antes da admissão ou após desligamento
    const foraVinculo = (dataAdmissao != null && data < dataAdmissao) || (dataDeslig != null && data > dataDeslig);
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

    // Se houve marcação em dia previsto como folga, o dia deixa de ser tratado como folga.
    // Ele entra como dia trabalhado sem gerar crédito/débito automático por ser "folga".
    if (!trabalha && temMarcacaoDoDia && !foraVinculo) {
      trabalha = true;
    }

    if (trabalha && temMarcacaoDoDia) {
      if (!reg.saida_intervalo && prog.saida_intervalo) reg.saida_intervalo = prog.saida_intervalo;
      if (!reg.retorno_intervalo && prog.retorno_intervalo) reg.retorno_intervalo = prog.retorno_intervalo;
    }

    // Atraso é calculado mais abaixo, junto com a tolerância diária compartilhada.
    let atraso = 0;

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

    // Créditos/débitos por categoria (regra CLT art. 58 §1º):
    // - Tolerância de até `toleranciaMin` minutos por batida (padrão 5),
    //   limitada a 10 minutos no total do dia, é IGNORADA (sem crédito nem débito).
    // - Acima da tolerância: atraso/saída antecipada vira DÉBITO; entrada
    //   antecipada / hora extra vira CRÉDITO sobre o tempo TOTAL (sem subtrair tolerância).
    const TOL_DIARIA_MAX = 10;
    let creditoEntradaAntec = 0;
    let debitoSaidaAntec = 0;
    let creditoHoraExtra = 0;
    let tolUsadaDia = 0;
    const aplicarTolerancia = (absMin: number): number => {
      const disponivel = Math.max(0, Math.min(toleranciaMin, TOL_DIARIA_MAX - tolUsadaDia));
      const absorvido = Math.min(absMin, disponivel);
      tolUsadaDia += absorvido;
      return absMin - absorvido;
    };
    // Atrasos em entrada/retorno do intervalo
    for (const k of ["entrada", "retorno_intervalo"] as const) {
      const p = hm(prog[k]);
      const r = hm(reg[k]);
      if (p != null && r != null) {
        const diff = diffRelogioAssinado(p, r);
        if (diff > 0) {
          const restante = aplicarTolerancia(diff);
          if (restante > 0) atraso += diff;
        }
      }
    }
    if (pe != null && e != null) {
      const diffE = diffRelogioAssinado(pe, e);
      if (diffE < 0) {
        const restante = aplicarTolerancia(-diffE);
        if (restante > 0) creditoEntradaAntec = -diffE;
      }
    }
    if (psf != null && sf != null) {
      const diffS = diffRelogioAssinado(psf, sf);
      if (diffS > 0) {
        const restante = aplicarTolerancia(diffS);
        if (restante > 0) creditoHoraExtra = diffS;
      } else if (diffS < 0) {
        const restante = aplicarTolerancia(-diffS);
        if (restante > 0) debitoSaidaAntec = -diffS;
      }
    }
    let extras = creditoHoraExtra;

    // Hoje em horário de Brasília (America/Sao_Paulo)
    const fmtBR = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const partsBR = fmtBR.formatToParts(new Date());
    const getP = (t: string) => partsBR.find((p) => p.type === t)?.value ?? "00";
    const todayStr = `${getP("year")}-${getP("month")}-${getP("day")}`;
    const agoraMinBR = parseInt(getP("hour"), 10) * 60 + parseInt(getP("minute"), 10);

    // Para o dia atual, só considera "ainda dentro do expediente" antes de saída + 60min.
    let aindaDentroDoExpediente = false;
    if (data === todayStr && prog.saida_final) {
      const fimMin = (hm(prog.saida_final) ?? 0) + 60;
      if (agoraMinBR < fimMin) aindaDentroDoExpediente = true;
    }

    // Hoje, sem marcação de entrada, e já passou do horário previsto de entrada → débito até registrar/justificar.
    const hojePassouEntradaSemRegistro = data === todayStr && trabalha && !reg.entrada && pe != null && agoraMinBR > pe;

    const isFuturo = data > todayStr;
    let semRegistro = trabalha && regs.length === 0;
    let falta = semRegistro && setFaltas.has(data);
    let faltaRegistrada = falta;
    // "Marcação não registrada" agora é exclusivo de dias futuros.
    // Dias passados sem registro viram débito automático de banco de horas.
    let marcacaoNaoRegistrada = semRegistro && isFuturo;
    let pendente = marcacaoNaoRegistrada && !falta;
    let bancoHorasMin = 0;

    // Aplica regras das justificativas, mas mantém todas registradas para exibição no PDF
    const justificativas = justPorDia.get(data) ?? [];
    const just = justificativas[0] ?? null;
    const trocaFolga = justificativas.some(ehTrocaFolga);
    const trocaCompensada = justificativas.some(ehTrocaCompensada);

    if (trocaFolga) {
      // TROCA FOLGA: o dia vira folga normal. Não gera débito nem crédito.
      trabalha = false;
      semRegistro = false;
      falta = false;
      faltaRegistrada = false;
      marcacaoNaoRegistrada = false;
      pendente = false;
      atraso = 0;
      extras = 0;
      bancoHorasMin = 0;
    }

    if (trocaCompensada && !foraVinculo) {
      // TROCA COMPENSADA: mesmo que o dia fosse folga, ele passa a contar como dia trabalhado.
      trabalha = true;
      semRegistro = regs.length === 0;
      if (regs.length > 0) {
        falta = false;
        faltaRegistrada = false;
        marcacaoNaoRegistrada = false;
        pendente = false;
      }
    }

    const justHoraExtraPagar = justificativas.find((j) => j.tipo.codigo === "HE_PAGAR");
    const temHoraExtraPagar = !!justHoraExtraPagar;
    const justHoraExtraCredito = justificativas.find((j) => j.tipo.codigo === "HE_CREDITO");
    const temCreditoManualBH = justificativas.some((j) => j.tipo.movimenta_banco_horas === "credito");
    const faltaComDescontoAplicada = justificativas.some(
      (j) => j.tipo.categoria === "falta" && j.tipo.desconta_salario,
    );
    const faltaComDesconto = faltaComDescontoAplicada || (semRegistro && setFaltas.has(data));
    const temDebitoManualBH = justificativas.some(
      (j) => j.tipo.movimenta_banco_horas === "debito" && !(j.tipo.categoria === "falta" && j.tipo.desconta_salario),
    );
    let abonoSemDesconto = false;
    for (const just of justificativas) {
      const t = just.tipo;
      if (trocaFolga) {
        continue;
      }
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
        if (!trabalha) continue;
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
    if (!trocaFolga && !temHoraExtraPagar) {
      const minutosCreditoHE =
        justHoraExtraCredito?.quantidadeMinutos ?? (!trabalha && justHoraExtraCredito ? trabalhado : creditoHoraExtra);
      bancoHorasMin += Math.max(0, minutosCreditoHE);
    }

    // Trabalho em dia de folga nunca pode virar débito. Se não for marcado como
    // HORA EXTRA - PAGAR, entra como crédito de banco de horas pelo período trabalhado.
    if (!trocaFolga && !trabalha && trabalhado > 0) {
      if (justHoraExtraPagar) {
        extras = Math.max(extras, justHoraExtraPagar.quantidadeMinutos ?? trabalhado);
      } else if (!temCreditoManualBH && !justHoraExtraCredito) {
        bancoHorasMin += trabalhado;
      }
    }

    // Crédito automático por entrada antecipada (sempre crédito, independe de HE_PAGAR).
    if (!trocaFolga) bancoHorasMin += creditoEntradaAntec;

    // Débitos automáticos: falta injustificada, atrasos e saída antecipada viram débito de BH.
    if (!trocaFolga && trabalha && !abonoSemDesconto && !temDebitoManualBH && !faltaComDesconto) {
      if (falta && cargaProg > 0) {
        bancoHorasMin -= cargaProg;
      } else if (semRegistro && !isFuturo && !aindaDentroDoExpediente && justificativas.length === 0 && cargaProg > 0) {
        // Dia passado sem nenhuma marcação e sem justificativa → débito da carga prevista.
        bancoHorasMin -= cargaProg;
      } else if (hojePassouEntradaSemRegistro && justificativas.length === 0 && cargaProg > 0) {
        // Hoje: passou da entrada prevista e ainda sem marcação/justificativa → débito.
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
    const obsFinal = foraVinculo ? null : obsJustificativas || (falta ? (justFaltas.get(data) ?? obs) : obs);

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
      jornadaCodigo: foraVinculo ? null : jornadaCodigo,
      jornadaNome: foraVinculo ? null : jornadaNome,
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

/**
 * Calcula o total de minutos que afetam o benefício (QTDE HORAS BENEF).
 * Mesma regra usada no PDF do cartão de ponto:
 *  - Falta injustificada: soma a carga programada do dia.
 *  - Caso contrário, se houver débito de banco de horas (atrasos / saídas
 *    antecipadas / débitos de fechamento), soma o débito do dia.
 *  - Faltas com justificativa que abona assiduidade não entram.
 */
export function calcularHorasBenefMinutos(resumo: ResumoCartao): number {
  const hm = (t: string | null): number | null => {
    if (!t) return null;
    const [h, m] = t.slice(0, 5).split(":").map(Number);
    return h * 60 + m;
  };
  const diffRelogio = (inicio: number, fim: number): number => {
    let diff = fim - inicio;
    if (diff < 0) diff += 1440;
    return diff;
  };
  let total = 0;
  for (const d of resumo.dias) {
    const justificativas = d.justificativas ?? [];
    const falta = d.faltaRegistrada || d.falta;
    const faltaInjustificada =
      falta &&
      (!justificativas.length ||
        justificativas.some(
          (j) => j.tipo.categoria === "falta" && j.tipo.desconta_salario && j.tipo.afeta_assiduidade !== "nao",
        ));
    if (faltaInjustificada) {
      const pe = hm(d.programado.entrada);
      const psf = hm(d.programado.saida_final);
      if (pe != null && psf != null) {
        let c = diffRelogio(pe, psf);
        const psi = hm(d.programado.saida_intervalo);
        const pri = hm(d.programado.retorno_intervalo);
        if (psi != null && pri != null) c -= diffRelogio(psi, pri);
        total += Math.max(0, c);
      }
      continue;
    }
    if (d.bancoHorasMinutos < 0) {
      total += -d.bancoHorasMinutos;
    }
  }
  return total;
}
