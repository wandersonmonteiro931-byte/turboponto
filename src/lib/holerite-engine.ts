import { supabase } from "@/integrations/supabase/client";
import { recalcularMes as recalcularBeneficioMes, type Beneficio } from "@/lib/beneficios";
import { carregarCartao } from "@/lib/cartao";
import { carregarVinculosAtivos, escolherJornadaParaData } from "@/lib/jornadas";
import { calcularHorasBenefMinutos } from "@/lib/cartao";

// Motor de cálculo automático da folha.
// Calcula qtde / provento / desconto para rubricas com modo='automatico' (e propõe valores para 'semi_automatico'),
// preservando linhas manuais já lançadas pelo operador.

export type EngineLanc = {
  _k: string;
  id?: string;
  codigo: string;
  descricao: string;
  qtde: number | null;
  provento: number;
  desconto: number;
  resultado: number;
  // Metadados (não persistidos, apenas para UI)
  modo?: "automatico" | "semi_automatico" | "manual";
  tipo?: "provento" | "desconto" | "informativo" | "resultado";
  editavel_manual?: boolean;
  rubrica_id?: string;
};

export type EngineCtx = {
  empresaId: string;
  funcionarioId: string;
  ano: number;
  mes: number;
};

type Rubrica = {
  id: string;
  codigo: string;
  descricao: string;
  tipo: "provento" | "desconto" | "informativo" | "resultado";
  tipo_calculo: string;
  valor_referencia: number;
  ativo: boolean;
  modo: "automatico" | "semi_automatico" | "manual";
  editavel_manual: boolean;
  automatico: boolean;
  incide_inss: boolean;
  incide_fgts: boolean;
  incide_irrf: boolean;
  entra_dsr: boolean;
  entra_liquido: boolean;
  depende_ponto: boolean;
};

type FaixaINSS = { ate: number; aliquota: number; deducao: number };
type FaixaIRRF = { ate: number; aliquota: number; deducao: number };
type TabelaLegal = {
  inss_faixas: FaixaINSS[];
  irrf_faixas: FaixaIRRF[];
  irrf_deducao_dependente: number;
  fgts_aliquota: number;
  salario_familia_valor: number;
  salario_familia_teto: number;
};

const round = (v: number) => Math.round(v * 100) / 100;

const MINUTO_INICIO_NOTURNO = 22 * 60;
const MINUTO_FIM_NOTURNO = 5 * 60;
const ADICIONAL_NOTURNO_PCT = 20;
const MINUTOS_HORA_NOTURNA_REDUZIDA = 52.5;

function sobreposicaoMinutos(inicioA: number, fimA: number, inicioB: number, fimB: number): number {
  return Math.max(0, Math.min(fimA, fimB) - Math.max(inicioA, inicioB));
}

function hmEngineHolerite(valor: string | null | undefined): number | null {
  if (!valor) return null;
  const [h, m] = valor.slice(0, 5).split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function minutosNoturnosIntervalo(inicio: string | null, fim: string | null): number {
  const ini = hmEngineHolerite(inicio);
  const out = hmEngineHolerite(fim);
  if (ini == null || out == null) return 0;

  let start = ini;
  let end = out;

  // Horário igual não é virada de dia.
  // Ex.: 22:00 até 22:00 deve ser 00:00, não 07:00 de adicional noturno.
  if (end === start) return 0;
  if (end < start) end += 1440;

  return (
    sobreposicaoMinutos(start, end, 0, MINUTO_FIM_NOTURNO) +
    sobreposicaoMinutos(start, end, MINUTO_INICIO_NOTURNO, 1440 + MINUTO_FIM_NOTURNO)
  );
}

function minutosNoturnosDia(registrado: {
  entrada: string | null;
  saida_intervalo: string | null;
  retorno_intervalo: string | null;
  saida_final: string | null;
}): number {
  if (!registrado?.entrada || !registrado?.saida_final) return 0;

  if (registrado.saida_intervalo && registrado.retorno_intervalo) {
    return (
      minutosNoturnosIntervalo(registrado.entrada, registrado.saida_intervalo) +
      minutosNoturnosIntervalo(registrado.retorno_intervalo, registrado.saida_final)
    );
  }

  return minutosNoturnosIntervalo(registrado.entrada, registrado.saida_final);
}

function removerLinhaPorCodigo(linhas: EngineLanc[], codigo: string) {
  const idx = linhas.findIndex((l) => l.codigo === codigo);
  if (idx >= 0) linhas.splice(idx, 1);
}

function contarDomingosNoPeriodo(ano: number, mes: number, adm: string | null, des: string | null): number {
  const diasMes = new Date(ano, mes, 0).getDate();
  let total = 0;

  for (let d = 1; d <= diasMes; d++) {
    const iso = `${ano}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (adm && iso < adm) continue;
    if (des && iso > des) continue;

    const data = new Date(ano, mes - 1, d);
    if (data.getDay() === 0) total++;
  }

  return total;
}

async function carregarTabela(): Promise<TabelaLegal> {
  const { data } = await supabase
    .from("holerite_tabelas_legais")
    .select("inss_faixas,irrf_faixas,irrf_deducao_dependente,fgts_aliquota,salario_familia_valor,salario_familia_teto")
    .order("vigencia_inicio", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data) {
    return {
      inss_faixas: data.inss_faixas as unknown as FaixaINSS[],
      irrf_faixas: data.irrf_faixas as unknown as FaixaIRRF[],
      irrf_deducao_dependente: Number(data.irrf_deducao_dependente),
      fgts_aliquota: Number(data.fgts_aliquota),
      salario_familia_valor: Number(data.salario_familia_valor),
      salario_familia_teto: Number(data.salario_familia_teto),
    };
  }
  return {
    // Tabela INSS 2026
    inss_faixas: [
      { ate: 1621.0, aliquota: 7.5, deducao: 0 },
      { ate: 2902.84, aliquota: 9, deducao: 24.32 },
      { ate: 4354.27, aliquota: 12, deducao: 111.4 },
      { ate: 8475.55, aliquota: 14, deducao: 198.49 },
    ],
    irrf_faixas: [
      { ate: 2428.8, aliquota: 0, deducao: 0 },
      { ate: 2826.65, aliquota: 7.5, deducao: 182.16 },
      { ate: 3751.05, aliquota: 15, deducao: 394.16 },
      { ate: 4664.68, aliquota: 22.5, deducao: 675.49 },
      { ate: 999999999, aliquota: 27.5, deducao: 908.73 },
    ],
    irrf_deducao_dependente: 189.59,
    fgts_aliquota: 8,
    salario_familia_valor: 65,
    salario_familia_teto: 1906.04,
  };
}

function calcINSS(base: number, faixas: FaixaINSS[]): number {
  if (base <= 0) return 0;
  const teto = faixas[faixas.length - 1].ate;
  const b = Math.min(base, teto);
  const f = faixas.find((x) => b <= x.ate) ?? faixas[faixas.length - 1];
  return round(b * (f.aliquota / 100) - f.deducao);
}

async function carregarFechamentoBancoHorasFolha(
  ctx: EngineCtx,
  ini: string,
  fim: string,
): Promise<{ minutosPagar: number; minutosDescontar: number }> {
  const { data } = await supabase
    .from("justificativas_aplicadas")
    .select("quantidade_minutos,tipo:justificativas_tipos(codigo,nome)")
    .eq("funcionario_id", ctx.funcionarioId)
    .gte("data", ini)
    .lte("data", fim);

  let minutosPagar = 0;
  let minutosDescontar = 0;

  for (const row of data ?? []) {
    const tipo = (row as any).tipo;
    const codigo = String(tipo?.codigo || "").toUpperCase();
    const nome = String(tipo?.nome || "").toUpperCase();
    const qtd = Math.max(0, Number((row as any).quantidade_minutos || 0));

    if (
      codigo === "FECHAMENTO_BH_PAGAR" ||
      codigo === "FECHAMENTO_BANCO_PAGAR" ||
      (nome.includes("FECHAMENTO") && nome.includes("BANCO") && nome.includes("PAGAR")) ||
      (nome.includes("FECHAMENTO") && nome.includes("BH") && nome.includes("PAGAR"))
    ) {
      minutosPagar += qtd;
    }

    if (
      codigo === "FECHAMENTO_BANCO_DESC" ||
      codigo === "FECHAMENTO_BH_DESC" ||
      (nome.includes("FECHAMENTO") && nome.includes("BANCO") && nome.includes("DESC")) ||
      (nome.includes("FECHAMENTO") && nome.includes("BH") && nome.includes("DESC"))
    ) {
      minutosDescontar += qtd;
    }
  }

  return { minutosPagar, minutosDescontar };
}

function justificativaAutorizaPagarHoraExtra(tipo: { codigo?: string | null; nome?: string | null }): boolean {
  const codigo = String(tipo.codigo || "")
    .trim()
    .toUpperCase();
  const nome = String(tipo.nome || "")
    .trim()
    .toUpperCase();

  return (
    codigo === "HE_PAGAR" ||
    codigo === "FECHAMENTO_BH_PAGAR" ||
    codigo === "FECHAMENTO_BANCO_PAGAR" ||
    codigo === "FECHAMENTO_BANCO_HORAS_PAGAR" ||
    (nome.includes("HORA EXTRA") && nome.includes("PAGAR")) ||
    (nome.includes("FECHAMENTO") && nome.includes("BH") && nome.includes("PAGAR")) ||
    (nome.includes("FECHAMENTO") && nome.includes("BANCO") && nome.includes("PAGAR"))
  );
}

function minutosHoraExtraPagavelDia(d: {
  extrasMinutos?: number;
  bancoHorasMinutos?: number;
  trabalhadoMinutos?: number;
  justificativas?: Array<{
    quantidadeMinutos?: number | null;
    tipo: { codigo?: string | null; nome?: string | null };
  }>;
}): number {
  const justificativas = d.justificativas ?? [];
  const justificativasPagamento = justificativas.filter((j) => justificativaAutorizaPagarHoraExtra(j.tipo));

  if (!justificativasPagamento.length) return 0;

  return justificativasPagamento.reduce((total, j) => {
    if (j.quantidadeMinutos != null) return total + Math.max(0, Number(j.quantidadeMinutos || 0));

    const codigo = String(j.tipo.codigo || "")
      .trim()
      .toUpperCase();
    const nome = String(j.tipo.nome || "")
      .trim()
      .toUpperCase();

    if (codigo.includes("FECHAMENTO") || nome.includes("FECHAMENTO")) {
      return total + Math.max(0, Number(d.bancoHorasMinutos || 0), Number(d.extrasMinutos || 0));
    }

    return total + Math.max(0, Number(d.extrasMinutos || 0));
  }, 0);
}

function calcIRRF(base: number, faixas: FaixaIRRF[]): number {
  if (base <= 0) return 0;
  const f = faixas.find((x) => base <= x.ate) ?? faixas[faixas.length - 1];
  return round(Math.max(0, base * (f.aliquota / 100) - f.deducao));
}

function diasVinculo(adm: string | null, des: string | null, ano: number, mes: number): number {
  const diasMes = new Date(ano, mes, 0).getDate();
  const ini = new Date(ano, mes - 1, 1);
  const fim = new Date(ano, mes - 1, diasMes);
  const a = adm ? new Date(adm + "T00:00:00") : null;
  const d = des ? new Date(des + "T00:00:00") : null;
  const i = a && a > ini ? a : ini;
  const f = d && d < fim ? d : fim;
  if (f < i) return 0;
  const v = Math.round((f.getTime() - i.getTime()) / 86400000) + 1;
  return Math.min(v, 30);
}

async function carregarSaldoPendenteMesAnterior(ctx: EngineCtx): Promise<number> {
  const mesAnt = ctx.mes === 1 ? 12 : ctx.mes - 1;
  const anoAnt = ctx.mes === 1 ? ctx.ano - 1 : ctx.ano;
  const iniAnt = `${anoAnt}-${String(mesAnt).padStart(2, "0")}-01`;
  const fimAnt = `${anoAnt}-${String(mesAnt).padStart(2, "0")}-${String(new Date(anoAnt, mesAnt, 0).getDate()).padStart(2, "0")}`;

  // Se o mês anterior já teve 00120 ou 00121 lançado, não relança no mês atual.
  const { data: hAntList } = await supabase
    .from("holerites")
    .select("id")
    .eq("funcionario_id", ctx.funcionarioId)
    .eq("ano_referencia", anoAnt)
    .eq("mes_referencia", mesAnt);

  const ids = (hAntList ?? []).map((h) => h.id).filter(Boolean);
  if (ids.length > 0) {
    const { data: linhasAnt } = await supabase
      .from("holerite_lancamentos")
      .select("codigo")
      .in("holerite_id", ids)
      .in("codigo", ["00120", "00121"]);

    if ((linhasAnt ?? []).length > 0) return 0;
  }

  let statusCartaoAnterior = "";
  let saldo = 0;

  // 1) Primeiro tenta ler o cartão fechado do mês anterior.
  try {
    const { data: cartaoAnt } = await (supabase as any)
      .from("cartoes_ponto")
      .select("status,total_banco_horas_minutos,fechamento_bh_minutos")
      .eq("funcionario_id", ctx.funcionarioId)
      .eq("ano_referencia", anoAnt)
      .eq("mes_referencia", mesAnt)
      .maybeSingle();

    statusCartaoAnterior = String(cartaoAnt?.status || "");

    if (statusCartaoAnterior === "fechado" || statusCartaoAnterior === "liberado") {
      saldo = Number(cartaoAnt?.fechamento_bh_minutos ?? 0);

      // Mês antigo pode ter sido fechado antes da criação dos campos novos.
      // Nesse caso fechamento_bh_minutos vem 0/null, então tenta total_banco_horas_minutos.
      if (!saldo) saldo = Number(cartaoAnt?.total_banco_horas_minutos ?? 0);
    }
  } catch (e) {
    console.warn("[holerite] falha ao consultar cartão anterior para saldo pendente", e);
  }

  // 2) Se o cartão anterior estava fechado/liberado, mas foi fechado antes dos campos novos,
  // recalcula o cartão do mês anterior e usa o totalBancoHoras.
  if (!saldo && (statusCartaoAnterior === "fechado" || statusCartaoAnterior === "liberado")) {
    try {
      const cartaoAntCalc = await carregarCartao(ctx.funcionarioId, anoAnt, mesAnt);
      saldo = Number(cartaoAntCalc?.totalBancoHoras || 0);
    } catch (e) {
      console.warn("[holerite] falha ao recalcular cartão anterior para saldo pendente", e);
    }
  }

  // 3) Último fallback para histórico antigo: usa movimentos de banco de horas do mês anterior.
  // Isso cobre casos em que o mês foi fechado, mas o saldo ficou apenas nos movimentos.
  if (!saldo && (statusCartaoAnterior === "fechado" || statusCartaoAnterior === "liberado")) {
    try {
      const [creditos, debitos] = await Promise.all([
        supabase
          .from("banco_horas_movimentos")
          .select("minutos")
          .eq("funcionario_id", ctx.funcionarioId)
          .eq("tipo", "credito")
          .gte("data", iniAnt)
          .lte("data", fimAnt),
        supabase
          .from("banco_horas_movimentos")
          .select("minutos")
          .eq("funcionario_id", ctx.funcionarioId)
          .eq("tipo", "debito")
          .gte("data", iniAnt)
          .lte("data", fimAnt),
      ]);

      const creditosMin = (creditos.data ?? []).reduce((s, r) => s + Number(r.minutos || 0), 0);
      const debitosMin = (debitos.data ?? []).reduce((s, r) => s + Number(r.minutos || 0), 0);
      saldo = creditosMin - debitosMin;
    } catch (e) {
      console.warn("[holerite] falha ao consultar movimentos de BH anterior", e);
    }
  }

  return saldo;
}

const RUBRICA_FALLBACK_FECHAMENTO_BH = {
  codigo: "00120",
  descricao: "FECHAMENTO BH",
};

const RUBRICA_FALLBACK_SALDO_BH_POSITIVO = {
  codigo: "18060",
  descricao: "SALDO BANCO DE HORAS POSITIVO",
};

const RUBRICA_FALLBACK_SALDO_BH_NEGATIVO = {
  codigo: "28652",
  descricao: "SALDO BANCO DE HORAS NEGATIVO",
};

const getRubricaOrFallback = (
  porCodigo: Map<string, any>,
  codigo: string,
  fallback: { codigo: string; descricao: string },
) => {
  return (
    porCodigo.get(codigo) || {
      id: undefined,
      codigo: fallback.codigo,
      descricao: fallback.descricao,
      tipo: "resultado",
      modo: "automatico",
      editavel_manual: false,
      entra_liquido: false,
    }
  );
};

const calcularDsrBancoHorasPagasEngine = (linhas: EngineLanc[]) => {
  const semDsrBh = linhas.filter((linha) => linha.codigo !== "00115");

  const salarioLinha = semDsrBh.find((linha) => linha.codigo === "00005");
  const diasPagos = Math.max(1, Number(salarioLinha?.qtde || 30));

  const proventosQueGeramDsr = semDsrBh
    .filter((linha) => ["00090", "00120", "00121"].includes(linha.codigo))
    .reduce((s, linha) => s + Math.max(0, Number(linha.provento || 0)), 0);

  // Saldo negativo/desconto não gera DSR.
  if (proventosQueGeramDsr <= 0) return semDsrBh;

  const dsrRef = Math.max(1, Math.ceil(diasPagos / 6));
  const valorDsr = round((proventosQueGeramDsr / diasPagos) * dsrRef);

  if (valorDsr <= 0) return semDsrBh;

  return [
    ...semDsrBh,
    {
      _k: crypto.randomUUID(),
      codigo: "00115",
      descricao: "DSR HE 50%",
      qtde: dsrRef,
      provento: valorDsr,
      desconto: 0,
      resultado: valorDsr,
      modo: "automatico",
      tipo: "provento",
      editavel_manual: false,
    } as EngineLanc,
  ];
};

export async function recalcular(
  ctx: EngineCtx,
  linhasAtuais: EngineLanc[],
): Promise<{
  linhas: EngineLanc[];
  totalProv: number;
  totalDesc: number;
  totalLiq: number;
  salContribInss: number;
  baseFgts: number;
  fgtsMes: number;
  baseIrpf: number;
  inssCalculado: number;
  irrfCalculado: number;
}> {
  const tab = await carregarTabela();

  const { data: f } = await supabase
    .from("funcionarios")
    .select("id,salario,data_admissao,data_desligamento,num_dep_irrf,num_dep_sal_fam,vale_transporte_mensal")
    .eq("id", ctx.funcionarioId)
    .maybeSingle();
  const salario = Number(f?.salario ?? 0);
  const numDepIrrf = Number(f?.num_dep_irrf ?? 0);
  const vtConcedido = Number(f?.vale_transporte_mensal ?? 0);

  const dias = diasVinculo(f?.data_admissao ?? null, f?.data_desligamento ?? null, ctx.ano, ctx.mes);
  const salarioProporcional = round((salario / 30) * dias);
  const valorHora = salario > 0 ? salario / 220 : 0;
  const valorDia = salario > 0 ? salario / 30 : 0;

  // Carrega rubricas da empresa
  const { data: rubsData } = await supabase
    .from("holerite_rubricas")
    .select(
      "id,codigo,descricao,tipo,tipo_calculo,valor_referencia,ativo,modo,editavel_manual,automatico,incide_inss,incide_fgts,incide_irrf,entra_dsr,entra_liquido,depende_ponto",
    )
    .eq("empresa_id", ctx.empresaId);
  const rubricas = (rubsData ?? []) as unknown as Rubrica[];
  const porCodigo = new Map(rubricas.map((r) => [r.codigo, r]));

  // Ponto do mês: usa o mesmo resumo do cartão de ponto para manter banco de
  // horas e benefício alinhados ao que é exibido no mês de referência.
  const ini = `${ctx.ano}-${String(ctx.mes).padStart(2, "0")}-01`;
  const fim = new Date(ctx.ano, ctx.mes, 0).toISOString().slice(0, 10);
  let minHE = 0;
  let minAtraso = 0;
  let numFaltas = 0;
  let saldoBHMinutos = 0;
  let dsrPerdidos = 0;
  let minHorasBenef = 0;
  let minAdicionalNoturno = 0;
  let diasTrabalhoReflexo = 0;
  let diasDsrReflexo = 0;
  const datasFalta: string[] = [];
  try {
    const cartao = await carregarCartao(ctx.funcionarioId, ctx.ano, ctx.mes);
    // Hora extra só entra no holerite para pagamento quando houver justificativa:
    // HORA EXTRA - PAGAR ou FECHAMENTO BH - PAGAR.
    // HORA EXTRA / CRED BH continua apenas como banco de horas, não como provento.
    minHE = cartao.dias.reduce((s, d) => s + minutosHoraExtraPagavelDia(d), 0);
    minAtraso = cartao.dias.reduce((s, d) => (d.bancoHorasMinutos < 0 ? s + -d.bancoHorasMinutos : s), 0);
    numFaltas = cartao.totalFaltas;
    for (const d of cartao.dias) {
      if ((d as { falta?: boolean }).falta) datasFalta.push((d as { data: string }).data);

      if (!(d as { foraVinculo?: boolean }).foraVinculo) {
        if ((d as { trabalha?: boolean }).trabalha) diasTrabalhoReflexo++;
        else diasDsrReflexo++;
      }

      minAdicionalNoturno += minutosNoturnosDia(
        (
          d as {
            registrado: {
              entrada: string | null;
              saida_intervalo: string | null;
              retorno_intervalo: string | null;
              saida_final: string | null;
            };
          }
        ).registrado,
      );
    }
    // DSR perdido: 1 por folga/repouso da escala precedida por ao menos uma
    // falta injustificada no período entre a folga anterior (ou admissão) e
    // a folga atual. Folgas antes da admissão ou anteriores a qualquer falta
    // do período não geram perda de DSR.
    const faltasSet = new Set(datasFalta);
    const vinculos = await carregarVinculosAtivos(ctx.funcionarioId);
    const admStr = f?.data_admissao ?? null;
    const desStr = f?.data_desligamento ?? null;
    const diasMes = new Date(ctx.ano, ctx.mes, 0).getDate();
    let faltaAcumulada = false;
    for (let d = 1; d <= diasMes; d++) {
      const iso = `${ctx.ano}-${String(ctx.mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (admStr && iso < admStr) continue;
      if (desStr && iso > desStr) break;
      const escolha = vinculos.length ? escolherJornadaParaData(vinculos, iso) : null;
      const isFolga = !!escolha && (!escolha.dia || !escolha.dia.trabalha);
      if (isFolga) {
        if (faltaAcumulada) dsrPerdidos++;
        faltaAcumulada = false;
        continue;
      }
      if (faltasSet.has(iso)) faltaAcumulada = true;
    }
    saldoBHMinutos = cartao.totalBancoHoras;
    minHorasBenef = calcularHorasBenefMinutos(cartao);
  } catch (e) {
    console.warn("[holerite] falha ao carregar cartão de ponto; usando fallback", e);
    const [creditos, debitos, faltas] = await Promise.all([
      supabase
        .from("banco_horas_movimentos")
        .select("minutos")
        .eq("funcionario_id", ctx.funcionarioId)
        .eq("tipo", "credito")
        .gte("data", ini)
        .lte("data", fim),
      supabase
        .from("banco_horas_movimentos")
        .select("minutos")
        .eq("funcionario_id", ctx.funcionarioId)
        .eq("tipo", "debito")
        .gte("data", ini)
        .lte("data", fim),
      supabase
        .from("dias_falta")
        .select("id", { count: "exact", head: true })
        .eq("funcionario_id", ctx.funcionarioId)
        .gte("data", ini)
        .lte("data", fim),
    ]);
    const creditosMin = (creditos.data ?? []).reduce((s, r) => s + Number(r.minutos || 0), 0);
    const debitosMin = (debitos.data ?? []).reduce((s, r) => s + Number(r.minutos || 0), 0);
    // Fallback seguro: sem o cartão completo não dá para saber se o crédito BH foi autorizado para pagamento.
    // Portanto, não paga hora extra automaticamente.
    minHE = 0;
    minAtraso = debitosMin;
    numFaltas = faltas.count ?? 0;
    saldoBHMinutos = creditosMin - debitosMin;
  }

  const horasHE = minHE / 60;
  const horasNoturnasReduzidas = minAdicionalNoturno / MINUTOS_HORA_NOTURNA_REDUZIDA;
  const valorHorasExtras50 = round(valorHora * 1.5 * horasHE);
  const valorAdicionalNoturno = round(valorHora * (ADICIONAL_NOTURNO_PCT / 100) * horasNoturnasReduzidas);

  const domingosPeriodo = contarDomingosNoPeriodo(
    ctx.ano,
    ctx.mes,
    f?.data_admissao ?? null,
    f?.data_desligamento ?? null,
  );

  // Para reflexo de DSR, usa os dias de repouso/folga do cartão quando existirem.
  // Se o período é muito curto e não aparece folga no cartão, garante ao menos 1 DSR
  // quando houver HE/adicional noturno, para não deixar o reflexo zerado.
  const dsrReflexoFinal = Math.max(diasDsrReflexo, domingosPeriodo, horasHE > 0 || minAdicionalNoturno > 0 ? 1 : 0);
  const diasTrabalhoReflexoFinal = Math.max(1, diasTrabalhoReflexo || dias);

  const valorDsrHorasExtras50 = round(
    horasHE > 0 ? (valorHorasExtras50 / diasTrabalhoReflexoFinal) * dsrReflexoFinal : 0,
  );
  const valorDsrAdicionalNoturno = round(
    valorAdicionalNoturno > 0 ? (valorAdicionalNoturno / diasTrabalhoReflexoFinal) * dsrReflexoFinal : 0,
  );

  // Atraso só desconta em folha quando houver aplicação da justificativa
  // "FECHAMENTO_BANCO_DESC" no mês de referência. Caso contrário, o débito
  // permanece apenas como saldo informativo do banco de horas (rubrica 28652).
  let temFechamentoBancoDesc = false;
  try {
    const { data: tipoFech } = await supabase
      .from("justificativas_tipos")
      .select("id")
      .eq("empresa_id", ctx.empresaId)
      .eq("codigo", "FECHAMENTO_BANCO_DESC")
      .maybeSingle();
    if (tipoFech?.id) {
      const { count } = await supabase
        .from("justificativas_aplicadas")
        .select("id", { count: "exact", head: true })
        .eq("funcionario_id", ctx.funcionarioId)
        .eq("tipo_id", tipoFech.id)
        .gte("data", ini)
        .lte("data", fim);
      temFechamentoBancoDesc = (count ?? 0) > 0;
    }
  } catch (e) {
    console.warn("[holerite] falha ao checar FECHAMENTO_BANCO_DESC", e);
  }
  // Horas de atraso elegíveis para desconto em folha: zero quando não há
  // fechamento do banco autorizado.
  const horasAtraso = temFechamentoBancoDesc ? minAtraso / 60 : 0;

  // Fechamento mensal do banco de horas:
  // positivo = pagar em folha; negativo = descontar em folha; zero = não cria linha.
  const fechamentoBH = await carregarFechamentoBancoHorasFolha(ctx, ini, fim);

  const { data: cartaoFechado } = await (supabase as any)
    .from("cartoes_ponto")
    .select("status,total_banco_horas_minutos,fechamento_bh_minutos,fechamento_bh_acao")
    .eq("funcionario_id", ctx.funcionarioId)
    .eq("ano_referencia", ctx.ano)
    .eq("mes_referencia", ctx.mes)
    .maybeSingle();

  const statusCartao = String(cartaoFechado?.status || "");
  let saldoCartaoFechado =
    statusCartao === "fechado" || statusCartao === "liberado"
      ? Number(cartaoFechado?.fechamento_bh_minutos ?? cartaoFechado?.total_banco_horas_minutos ?? 0)
      : 0;

  // Para cartões fechados antes dos campos novos, ou quando o fechamento ainda não gravou o saldo,
  // recalcula o cartão do próprio mês e usa o banco de horas atual como fechamento.
  if ((statusCartao === "fechado" || statusCartao === "liberado") && saldoCartaoFechado === 0) {
    try {
      const cartaoMesAtual = await carregarCartao(ctx.funcionarioId, ctx.ano, ctx.mes);
      saldoCartaoFechado = Number(cartaoMesAtual?.totalBancoHoras || 0);
    } catch (e) {
      console.warn("[holerite] falha ao recalcular cartão atual para fechamento BH", e);
    }
  }

  let minutosFechamentoBH = fechamentoBH.minutosPagar - fechamentoBH.minutosDescontar;

  // Se o cartão do mês foi fechado/liberado com saldo e não existe justificativa de fechamento,
  // lança automaticamente em 00120 - FECHAMENTO BH.
  if (minutosFechamentoBH === 0 && saldoCartaoFechado !== 0) {
    minutosFechamentoBH = saldoCartaoFechado;
  }

  const minutosSaldoPendenteMesAnterior = await carregarSaldoPendenteMesAnterior(ctx);

  const horasFechamentoBH = round(Math.abs(minutosFechamentoBH) / 60);
  const valorFechamentoBH = round(horasFechamentoBH * valorHora);
  const horasSaldoPendenteMesAnterior = round(Math.abs(minutosSaldoPendenteMesAnterior) / 60);
  const valorSaldoPendenteMesAnterior = round(horasSaldoPendenteMesAnterior * valorHora);

  // Mantém linhas atuais; recalcula apenas as automáticas.
  const linhas: EngineLanc[] = linhasAtuais
    .filter((l) => {
      const legadoSaldoEmFerias =
        l.codigo === "09000" &&
        Number(l.provento || 0) === 0 &&
        Number(l.desconto || 0) === 0 &&
        Number(l.resultado || l.qtde || 0) > 0;
      const legadoInsufMesAnteriorEmFerias =
        l.codigo === "09005" &&
        Number(l.provento || 0) === 0 &&
        (Number(l.desconto || 0) > 0 || Number(l.resultado || 0) < 0);
      return !legadoSaldoEmFerias && !legadoInsufMesAnteriorEmFerias;
    })
    .map((l) => {
      const r = porCodigo.get(l.codigo);
      if (!r) return l;
      return { ...l, modo: r.modo, tipo: r.tipo, editavel_manual: r.editavel_manual, rubrica_id: r.id };
    });

  // Helper para atualizar uma linha por código (ou inserir se ainda não existe).
  const setLinha = (codigo: string, calc: { qtde: number | null; provento: number; desconto: number }) => {
    const r = porCodigo.get(codigo);
    if (!r) return;
    const resultado = round(calc.provento - calc.desconto);
    const idx = linhas.findIndex((l) => l.codigo === codigo);
    const payload: EngineLanc = {
      _k: idx >= 0 ? linhas[idx]._k : crypto.randomUUID(),
      id: idx >= 0 ? linhas[idx].id : undefined,
      codigo: r.codigo,
      descricao: r.descricao,
      qtde: calc.qtde,
      provento: round(calc.provento),
      desconto: round(calc.desconto),
      resultado,
      modo: r.modo,
      tipo: r.tipo,
      editavel_manual: r.editavel_manual,
      rubrica_id: r.id,
    };
    if (idx >= 0) linhas[idx] = payload;
    else linhas.push(payload);
  };

  // Aplica cálculo para cada rubrica automática já presente, e para algumas "sempre presentes"
  // (00005, 07065 ADIANTAMENTO, INSS, FGTS, IRRF) que devem aparecer sempre que houver salário.
  const sempre = ["00005", "07065", "07000", "07005", "07010"];
  for (const cod of sempre) {
    if (porCodigo.has(cod) && !linhas.find((l) => l.codigo === cod)) {
      const r = porCodigo.get(cod)!;
      linhas.push({
        _k: crypto.randomUUID(),
        codigo: r.codigo,
        descricao: r.descricao,
        qtde: null,
        provento: 0,
        desconto: 0,
        resultado: 0,
        modo: r.modo,
        tipo: r.tipo,
        editavel_manual: r.editavel_manual,
        rubrica_id: r.id,
      });
    }
  }

  // Auto-adiciona VT se funcionário tem VT configurado.
  if (vtConcedido > 0 && porCodigo.has("07030") && !linhas.find((l) => l.codigo === "07030")) {
    const r = porCodigo.get("07030")!;
    linhas.push({
      _k: crypto.randomUUID(),
      codigo: r.codigo,
      descricao: r.descricao,
      qtde: null,
      provento: 0,
      desconto: 0,
      resultado: 0,
      modo: r.modo,
      tipo: r.tipo,
      editavel_manual: r.editavel_manual,
      rubrica_id: r.id,
    });
  }

  // Auto-adiciona HE/atraso/falta se houver dados.
  if (horasHE > 0 && porCodigo.has("00090") && !linhas.find((l) => l.codigo === "00090")) {
    const r = porCodigo.get("00090")!;
    linhas.push({
      _k: crypto.randomUUID(),
      codigo: r.codigo,
      descricao: r.descricao,
      qtde: null,
      provento: 0,
      desconto: 0,
      resultado: 0,
      modo: r.modo,
      tipo: r.tipo,
      editavel_manual: r.editavel_manual,
      rubrica_id: r.id,
    });
  }
  if (horasAtraso > 0 && porCodigo.has("07045") && !linhas.find((l) => l.codigo === "07045")) {
    const r = porCodigo.get("07045")!;
    linhas.push({
      _k: crypto.randomUUID(),
      codigo: r.codigo,
      descricao: r.descricao,
      qtde: null,
      provento: 0,
      desconto: 0,
      resultado: 0,
      modo: r.modo,
      tipo: r.tipo,
      editavel_manual: r.editavel_manual,
      rubrica_id: r.id,
    });
  } else if (!temFechamentoBancoDesc) {
    // Remove desconto de atraso quando não há fechamento autorizado: o débito
    // do banco de horas não pode reduzir o líquido sem a justificativa.
    const idx7045 = linhas.findIndex((l) => l.codigo === "07045");
    if (idx7045 >= 0) linhas.splice(idx7045, 1);
  }

  if (numFaltas > 0 && porCodigo.has("07035") && !linhas.find((l) => l.codigo === "07035")) {
    const r = porCodigo.get("07035")!;
    linhas.push({
      _k: crypto.randomUUID(),
      codigo: r.codigo,
      descricao: r.descricao,
      qtde: null,
      provento: 0,
      desconto: 0,
      resultado: 0,
      modo: r.modo,
      tipo: r.tipo,
      editavel_manual: r.editavel_manual,
      rubrica_id: r.id,
    });
  }
  if (dsrPerdidos > 0 && porCodigo.has("07040") && !linhas.find((l) => l.codigo === "07040")) {
    const r = porCodigo.get("07040")!;
    linhas.push({
      _k: crypto.randomUUID(),
      codigo: r.codigo,
      descricao: r.descricao,
      qtde: null,
      provento: 0,
      desconto: 0,
      resultado: 0,
      modo: r.modo,
      tipo: r.tipo,
      editavel_manual: r.editavel_manual,
      rubrica_id: r.id,
    });
  }

  // Rubricas automáticas de trabalho noturno e reflexos.
  // São lançadas mesmo se o cadastro da rubrica estiver como manual, desde que o código exista.
  if (valorAdicionalNoturno > 0 && porCodigo.has("00070")) {
    setLinha("00070", {
      qtde: round(horasNoturnasReduzidas),
      provento: valorAdicionalNoturno,
      desconto: 0,
    });
  } else {
    removerLinhaPorCodigo(linhas, "00070");
  }

  if (valorDsrAdicionalNoturno > 0 && porCodigo.has("00075")) {
    setLinha("00075", {
      qtde: dsrReflexoFinal,
      provento: valorDsrAdicionalNoturno,
      desconto: 0,
    });
  } else {
    removerLinhaPorCodigo(linhas, "00075");
  }

  if (valorDsrHorasExtras50 > 0 && porCodigo.has("00115")) {
    setLinha("00115", {
      qtde: dsrReflexoFinal,
      provento: valorDsrHorasExtras50,
      desconto: 0,
    });
  } else {
    removerLinhaPorCodigo(linhas, "00115");
  }

  // ==== Insuficiência de saldo do mês anterior (09995) ====
  // Busca o holerite do mês anterior (mesmo funcionário) e, se houver uma linha
  // 09990 (INSUFICIENCIA DE SALDO), lança automaticamente 09995 como desconto.
  if (porCodigo.has("09995")) {
    const mesAnt = ctx.mes === 1 ? 12 : ctx.mes - 1;
    const anoAnt = ctx.mes === 1 ? ctx.ano - 1 : ctx.ano;
    // Busca TODOS os holerites do mês anterior (MENSAL, ADIANTAMENTO, etc.)
    const { data: hAntList } = await supabase
      .from("holerites")
      .select("id")
      .eq("funcionario_id", ctx.funcionarioId)
      .eq("ano_referencia", anoAnt)
      .eq("mes_referencia", mesAnt);
    let saldoAnterior = 0;
    const ids = (hAntList ?? []).map((h) => h.id).filter(Boolean);
    if (ids.length > 0) {
      const { data: linhasAnt } = await supabase
        .from("holerite_lancamentos")
        .select("codigo,descricao,qtde,provento,desconto,resultado")
        .in("holerite_id", ids)
        .in("codigo", ["09990", "09000"]);
      saldoAnterior = (linhasAnt ?? []).reduce((s, l) => {
        const codigo = String(l.codigo || "");
        const legadoSaldoEmFerias =
          codigo === "09000" &&
          Number(l.provento || 0) === 0 &&
          Number(l.desconto || 0) === 0 &&
          Number(l.resultado || l.qtde || 0) > 0;
        if (codigo !== "09990" && !legadoSaldoEmFerias) return s;
        return s + Number(l.resultado || l.qtde || 0);
      }, 0);
    }
    const idx9005 = linhas.findIndex((l) => l.codigo === "09995");
    if (saldoAnterior > 0) {
      const r = porCodigo.get("09995")!;
      const payload: EngineLanc = {
        _k: idx9005 >= 0 ? linhas[idx9005]._k : crypto.randomUUID(),
        id: idx9005 >= 0 ? linhas[idx9005].id : undefined,
        codigo: r.codigo,
        descricao: r.descricao,
        qtde: round(saldoAnterior),
        provento: 0,
        desconto: round(saldoAnterior),
        resultado: -round(saldoAnterior),
        modo: r.modo,
        tipo: r.tipo,
        editavel_manual: r.editavel_manual,
        rubrica_id: r.id,
      };
      if (idx9005 >= 0) linhas[idx9005] = payload;
      else linhas.push(payload);
    } else if (idx9005 >= 0) {
      linhas.splice(idx9005, 1);
    }
  }

  // FECHAMENTO BH: paga se positivo, desconta se negativo, remove se zero.
  const idxFechamentoBH = linhas.findIndex((l) => l.codigo === "00120");
  if (minutosFechamentoBH !== 0) {
    const r = getRubricaOrFallback(porCodigo, "00120", RUBRICA_FALLBACK_FECHAMENTO_BH);
    const payload: EngineLanc = {
      _k: idxFechamentoBH >= 0 ? linhas[idxFechamentoBH]._k : crypto.randomUUID(),
      id: idxFechamentoBH >= 0 ? linhas[idxFechamentoBH].id : undefined,
      codigo: "00120",
      descricao: r.descricao || "FECHAMENTO BH",
      qtde: horasFechamentoBH,
      provento: minutosFechamentoBH > 0 ? valorFechamentoBH : 0,
      desconto: minutosFechamentoBH < 0 ? valorFechamentoBH : 0,
      resultado: minutosFechamentoBH > 0 ? valorFechamentoBH : -valorFechamentoBH,
      modo: r.modo || "automatico",
      tipo: minutosFechamentoBH > 0 ? "provento" : "desconto",
      editavel_manual: Boolean(r.editavel_manual),
      rubrica_id: r.id,
    };
    if (idxFechamentoBH >= 0) linhas[idxFechamentoBH] = payload;
    else linhas.push(payload);
  } else if (idxFechamentoBH >= 0) {
    linhas.splice(idxFechamentoBH, 1);
  }

  // SALDO PEND MES ANT: saldo de banco de horas de mês anterior que ficou pendente.
  // Positivo vira provento; negativo vira desconto.
  const idxSaldoPendenteMesAnterior = linhas.findIndex((l) => l.codigo === "00121");
  if (minutosSaldoPendenteMesAnterior !== 0) {
    const r = getRubricaOrFallback(porCodigo, "00121", { codigo: "00121", descricao: "SALDO PEND MES ANT" });
    const payload: EngineLanc = {
      _k: idxSaldoPendenteMesAnterior >= 0 ? linhas[idxSaldoPendenteMesAnterior]._k : crypto.randomUUID(),
      id: idxSaldoPendenteMesAnterior >= 0 ? linhas[idxSaldoPendenteMesAnterior].id : undefined,
      codigo: r.codigo,
      descricao: r.descricao || "SALDO PEND MES ANT",
      qtde: horasSaldoPendenteMesAnterior,
      provento: minutosSaldoPendenteMesAnterior > 0 ? valorSaldoPendenteMesAnterior : 0,
      desconto: minutosSaldoPendenteMesAnterior < 0 ? valorSaldoPendenteMesAnterior : 0,
      resultado: minutosSaldoPendenteMesAnterior > 0 ? valorSaldoPendenteMesAnterior : -valorSaldoPendenteMesAnterior,
      modo: r.modo,
      tipo: minutosSaldoPendenteMesAnterior > 0 ? "provento" : "desconto",
      editavel_manual: r.editavel_manual,
      rubrica_id: r.id,
    };
    if (idxSaldoPendenteMesAnterior >= 0) linhas[idxSaldoPendenteMesAnterior] = payload;
    else linhas.push(payload);
  } else if (idxSaldoPendenteMesAnterior >= 0) {
    linhas.splice(idxSaldoPendenteMesAnterior, 1);
  }

  // ==== Informativos automáticos baseados no cartão de ponto ====
  // Saldo do banco de horas do mês em horas = saldo do fechamento/cartão.
  // Usar somente:
  // 18060 - SALDO BANCO DE HORAS POSITIVO
  // 28652 - SALDO BANCO DE HORAS NEGATIVO
  // Nunca usar 28651 - SALDO BH.
  const saldoBHInformativoMinutos = minutosFechamentoBH !== 0 ? minutosFechamentoBH : saldoBHMinutos;
  const saldoBHHoras = round(saldoBHInformativoMinutos / 60);

  removerLinhaPorCodigo(linhas, "28651");
  removerLinhaPorCodigo(linhas, "18060");
  removerLinhaPorCodigo(linhas, "28652");

  if (saldoBHInformativoMinutos !== 0) {
    const codigoSaldoBH = saldoBHInformativoMinutos < 0 ? "28652" : "18060";
    const fallbackSaldoBH =
      saldoBHInformativoMinutos < 0 ? RUBRICA_FALLBACK_SALDO_BH_NEGATIVO : RUBRICA_FALLBACK_SALDO_BH_POSITIVO;
    const r = getRubricaOrFallback(porCodigo, codigoSaldoBH, fallbackSaldoBH);

    linhas.push({
      _k: crypto.randomUUID(),
      codigo: codigoSaldoBH,
      descricao: r.descricao || fallbackSaldoBH.descricao,
      qtde: null,
      provento: 0,
      desconto: 0,
      resultado: saldoBHHoras,
      modo: r.modo || "automatico",
      tipo: r.tipo || "resultado",
      editavel_manual: Boolean(r.editavel_manual),
      rubrica_id: r.id,
    });
  }

  // QTD HORAS CESTA BÁSICA (18445) — quantidade de horas de débito (atrasos /
  // saídas antecipadas) do mês que conta para a regra da cesta básica.
  // Sempre puxa do total de débitos do cartão de ponto (mesma base usada
  // pelo cálculo do benefício, mas independente da existência do benefício
  // cadastrado) para refletir imediatamente o saldo do mês.
  if (porCodigo.has("18445")) {
    // Mantém o cálculo do benefício "Cesta Básica" sincronizado, se existir.
    try {
      const { data: ben } = await supabase
        .from("beneficios")
        .select("*")
        .eq("empresa_id", ctx.empresaId)
        .eq("tipo", "cesta_basica")
        .eq("status", "ativo")
        .maybeSingle();
      if (ben) {
        await recalcularBeneficioMes(ctx.empresaId, ben as Beneficio, ctx.mes, ctx.ano);
      }
    } catch (e) {
      console.warn("[holerite] falha ao recalcular cesta básica antes de ler", e);
    }
    // Saldo de débito do mês em horas, vindo direto do cartão de ponto.
    // Mesma base do cartão de ponto (QTDE HORAS BENEF): inclui faltas
    // injustificadas (carga programada) + débitos de banco de horas.
    const horasCB = round(minHorasBenef / 60);
    const idxCB = linhas.findIndex((l) => l.codigo === "18445");
    if (horasCB > 0) {
      const r = porCodigo.get("18445")!;
      const payload: EngineLanc = {
        _k: idxCB >= 0 ? linhas[idxCB]._k : crypto.randomUUID(),
        id: idxCB >= 0 ? linhas[idxCB].id : undefined,
        codigo: r.codigo,
        descricao: r.descricao,
        qtde: null,
        provento: 0,
        desconto: 0,
        resultado: horasCB,
        modo: r.modo,
        tipo: r.tipo,
        editavel_manual: r.editavel_manual,
        rubrica_id: r.id,
      };
      if (idxCB >= 0) linhas[idxCB] = payload;
      else linhas.push(payload);
    } else if (idxCB >= 0) {
      linhas.splice(idxCB, 1);
    }
  }

  // ==== FASE 1: calcula tudo exceto INSS / IRRF (que precisam das bases) ====
  for (const l of linhas) {
    const r = porCodigo.get(l.codigo);
    if (!r || r.modo === "manual") continue;
    switch (r.tipo_calculo) {
      case "salario_dias_trabalhados":
        setLinha(r.codigo, { qtde: dias, provento: salarioProporcional, desconto: 0 });
        break;
      case "salario_base":
        setLinha(r.codigo, { qtde: 30, provento: salario, desconto: 0 });
        break;
      case "horas_extras_50":
        setLinha(r.codigo, { qtde: round(horasHE), provento: valorHorasExtras50, desconto: 0 });
        break;
      case "horas_extras_60":
        setLinha(r.codigo, { qtde: round(horasHE), provento: round(valorHora * 1.6 * horasHE), desconto: 0 });
        break;
      case "horas_extras_70":
        setLinha(r.codigo, { qtde: round(horasHE), provento: round(valorHora * 1.7 * horasHE), desconto: 0 });
        break;
      case "horas_extras_80":
        setLinha(r.codigo, { qtde: round(horasHE), provento: round(valorHora * 1.8 * horasHE), desconto: 0 });
        break;
      case "horas_extras_100":
        setLinha(r.codigo, { qtde: round(horasHE), provento: round(valorHora * 2 * horasHE), desconto: 0 });
        break;
      case "adicional_noturno":
        setLinha(r.codigo, { qtde: round(horasNoturnasReduzidas), provento: valorAdicionalNoturno, desconto: 0 });
        break;
      case "dsr_adicional_noturno":
        setLinha(r.codigo, { qtde: dsrReflexoFinal, provento: valorDsrAdicionalNoturno, desconto: 0 });
        break;
      case "dsr_he":
        setLinha(r.codigo, {
          qtde: dsrReflexoFinal,
          provento: r.codigo === "00115" ? valorDsrHorasExtras50 : 0,
          desconto: 0,
        });
        break;
      case "atrasos":
      case "atrasos_auto":
        setLinha(r.codigo, { qtde: round(horasAtraso), provento: 0, desconto: round(valorHora * horasAtraso) });
        break;
      case "faltas_dias":
      case "faltas_auto":
        setLinha(r.codigo, { qtde: numFaltas, provento: 0, desconto: round(valorDia * numFaltas) });
        break;
      case "dsr_faltas":
        setLinha(r.codigo, { qtde: dsrPerdidos, provento: 0, desconto: round(valorDia * dsrPerdidos) });
        break;
      case "vt_automatico": {
        const baseSal = salarioProporcional > 0 ? salarioProporcional : salario;
        const seisPct = round(baseSal * 0.06);
        const desc = Math.min(seisPct, vtConcedido);
        setLinha(r.codigo, { qtde: 1, provento: 0, desconto: round(desc) });
        break;
      }
      case "valor_fixo":
        setLinha(r.codigo, {
          qtde: 1,
          provento: r.tipo === "provento" ? Number(r.valor_referencia) : 0,
          desconto: r.tipo === "desconto" ? Number(r.valor_referencia) : 0,
        });
        break;
      case "percentual_salario":
      case "pct_salario_base":
        setLinha(r.codigo, {
          qtde: Number(r.valor_referencia),
          provento: r.tipo === "provento" ? round((salario * Number(r.valor_referencia)) / 100) : 0,
          desconto: r.tipo === "desconto" ? round((salario * Number(r.valor_referencia)) / 100) : 0,
        });
        break;
      case "adto_quinzenal_auto": {
        const pct = Number(r.valor_referencia) || 40;
        setLinha(r.codigo, { qtde: pct, provento: 0, desconto: round((salarioProporcional * pct) / 100) });
        break;
      }
      case "salario_familia_auto": {
        const num = Number(f?.num_dep_sal_fam ?? 0);
        const eleg = salario <= tab.salario_familia_teto ? num : 0;
        setLinha(r.codigo, { qtde: eleg, provento: round(eleg * tab.salario_familia_valor), desconto: 0 });
        break;
      }
      default:
        break;
    }
  }

  // ==== VALE / EMPRÉSTIMO INTERNO (07075) ====
  // Lançamentos cadastrados na seção "Vale" entram automaticamente no holerite
  // da folha escolhida pelo admin.
  if (porCodigo.has("07075")) {
    const { data: valesMes, error: valesError } = await (supabase as any)
      .from("vales_funcionarios")
      .select("valor")
      .eq("empresa_id", ctx.empresaId)
      .eq("funcionario_id", ctx.funcionarioId)
      .eq("ano_referencia", ctx.ano)
      .eq("mes_referencia", ctx.mes)
      .eq("status", "ativo");

    if (valesError) {
      console.warn("[holerite] falha ao carregar vales do funcionário", valesError);
    }

    const totalVales = round(
      (valesMes ?? []).reduce((s: number, item: { valor: number | string | null }) => s + Number(item.valor || 0), 0),
    );

    const idxVale = linhas.findIndex((l) => l.codigo === "07075");

    if (totalVales > 0) {
      const r = porCodigo.get("07075")!;
      const payload: EngineLanc = {
        _k: idxVale >= 0 ? linhas[idxVale]._k : crypto.randomUUID(),
        id: idxVale >= 0 ? linhas[idxVale].id : undefined,
        codigo: r.codigo,
        descricao: r.descricao || "VALE EMPREST INT",
        qtde: 1,
        provento: 0,
        desconto: totalVales,
        resultado: -totalVales,
        modo: r.modo,
        tipo: r.tipo,
        editavel_manual: r.editavel_manual,
        rubrica_id: r.id,
      };

      if (idxVale >= 0) linhas[idxVale] = payload;
      else linhas.push(payload);
    } else if (idxVale >= 0) {
      linhas.splice(idxVale, 1);
    }
  }

  // DSR sobre banco de horas pago em dinheiro:
  // 00120 positivo e 00121 positivo geram 00115.
  // 00120/00121 negativos não geram DSR.
  const linhasComDsrBH = calcularDsrBancoHorasPagasEngine(linhas);
  linhas.length = 0;
  linhas.push(...linhasComDsrBH);

  // ==== FASE 2: bases ====
  let baseInss = 0;
  let baseFgts = 0;
  let baseIrrfBruta = 0;

  for (const l of linhas) {
    const r = porCodigo.get(l.codigo);
    if (!r) continue;
    const liquido = (l.provento || 0) - (l.desconto || 0);
    if (r.incide_inss) baseInss += liquido;
    if (r.incide_fgts) baseFgts += liquido;
    if (r.incide_irrf) baseIrrfBruta += liquido;
  }
  baseInss = round(baseInss);
  baseFgts = round(baseFgts);
  baseIrrfBruta = round(baseIrrfBruta);

  const inss = calcINSS(baseInss, tab.inss_faixas);
  const fgtsMes = round((baseFgts * tab.fgts_aliquota) / 100);
  const baseIrrf = round(Math.max(0, baseIrrfBruta - inss - numDepIrrf * tab.irrf_deducao_dependente));
  const irrf = calcIRRF(baseIrrf, tab.irrf_faixas);

  // Aplica INSS / FGTS / IRRF nas linhas correspondentes (se rubrica existir).
  if (porCodigo.has("07000")) setLinha("07000", { qtde: null, provento: 0, desconto: inss });
  if (porCodigo.has("07010")) setLinha("07010", { qtde: null, provento: 0, desconto: 0 }); // FGTS é informativo
  if (porCodigo.has("07005")) setLinha("07005", { qtde: null, provento: 0, desconto: irrf });

  // Remove linhas sem dados (provento=0, desconto=0 e resultado=0). Mantém
  // informativos quando têm resultado (ex.: saldo banco de horas, cesta básica).
  for (let i = linhas.length - 1; i >= 0; i--) {
    const l = linhas[i];
    const semDados =
      (!l.provento || l.provento === 0) && (!l.desconto || l.desconto === 0) && (!l.resultado || l.resultado === 0);
    if (semDados) linhas.splice(i, 1);
  }

  // Ordem fixa obrigatória no início: salário contratual (00005),
  // ADIANTAMENTO SALARIAL (07065) e INSS do mês (07000). Demais linhas mantêm a ordem atual.
  const ordemFixa = ["00005", "07065", "07000"];
  const fixas: EngineLanc[] = [];
  const resto: EngineLanc[] = [];
  for (const l of linhas) {
    if (ordemFixa.includes(l.codigo)) continue;
    resto.push(l);
  }
  for (const cod of ordemFixa) {
    const l = linhas.find((x) => x.codigo === cod);
    if (l) fixas.push(l);
  }
  linhas.length = 0;
  linhas.push(...fixas, ...resto);

  // Totais (informativos não entram no líquido)

  let totalProv = 0;
  let totalDesc = 0;
  for (const l of linhas) {
    const r = porCodigo.get(l.codigo);
    if (r && (r.tipo === "informativo" || !r.entra_liquido)) continue;
    totalProv += Number(l.provento || 0);
    totalDesc += Number(l.desconto || 0);
  }
  totalProv = round(totalProv);
  totalDesc = round(totalDesc);
  let totalLiq = round(totalProv - totalDesc);

  // Se líquido ficou negativo, registra o saldo em 09990 (INSUFICIENCIA DE SALDO)
  // como informativo e zera o líquido. Esse valor será lançado automaticamente
  // como desconto 09995 (INSUF MES ANTERIOR) no holerite do mês seguinte.
  const idx9000 = linhas.findIndex((l) => l.codigo === "09990");
  if (totalLiq < 0 && porCodigo.has("09990")) {
    const shortfall = round(-totalLiq);
    const r = porCodigo.get("09990")!;
    const payload: EngineLanc = {
      _k: idx9000 >= 0 ? linhas[idx9000]._k : crypto.randomUUID(),
      id: idx9000 >= 0 ? linhas[idx9000].id : undefined,
      codigo: r.codigo,
      descricao: r.descricao,
      qtde: shortfall,
      provento: 0,
      desconto: 0,
      resultado: shortfall,
      modo: r.modo,
      tipo: r.tipo,
      editavel_manual: r.editavel_manual,
      rubrica_id: r.id,
    };
    if (idx9000 >= 0) linhas[idx9000] = payload;
    else linhas.push(payload);
    totalLiq = 0;
  } else if (idx9000 >= 0) {
    linhas.splice(idx9000, 1);
  }

  const linhasSemSaldoBHAntigo = linhas.filter((linha) => linha.codigo !== "28651");

  return {
    linhas: linhasSemSaldoBHAntigo,
    totalProv,
    totalDesc,
    totalLiq,
    salContribInss: baseInss,
    baseFgts,
    fgtsMes,
    baseIrpf: baseIrrf,
    inssCalculado: inss,
    irrfCalculado: irrf,
  };
}

// Calcula uma única rubrica (usado pela UI ao adicionar uma linha) — devolve provento/desconto/qtde sugeridos.
export async function calcularLinhaUnica(
  ctx: EngineCtx,
  rubricaId: string,
  linhasAtuais: EngineLanc[],
): Promise<EngineLanc | null> {
  const { data: r } = await supabase
    .from("holerite_rubricas")
    .select(
      "id,codigo,descricao,tipo,tipo_calculo,valor_referencia,ativo,modo,editavel_manual,automatico,incide_inss,incide_fgts,incide_irrf,entra_dsr,entra_liquido,depende_ponto",
    )
    .eq("id", rubricaId)
    .maybeSingle();
  if (!r) return null;
  const rub = r as unknown as Rubrica;

  // Para rubricas manuais devolve linha vazia preenchida com código/descrição.
  if (rub.modo === "manual" || rub.tipo_calculo === "manual") {
    return {
      _k: crypto.randomUUID(),
      codigo: rub.codigo,
      descricao: rub.descricao,
      qtde: rub.tipo_calculo === "valor_fixo" ? 1 : null,
      provento: rub.tipo === "provento" ? Number(rub.valor_referencia) : 0,
      desconto: rub.tipo === "desconto" ? Number(rub.valor_referencia) : 0,
      resultado: rub.tipo === "provento" ? Number(rub.valor_referencia) : -Number(rub.valor_referencia),
      modo: rub.modo,
      tipo: rub.tipo,
      editavel_manual: rub.editavel_manual,
      rubrica_id: rub.id,
    };
  }

  // Para automáticas: roda o engine, pega a linha resultante.
  const adicionada: EngineLanc[] = [
    ...linhasAtuais,
    {
      _k: crypto.randomUUID(),
      codigo: rub.codigo,
      descricao: rub.descricao,
      qtde: null,
      provento: 0,
      desconto: 0,
      resultado: 0,
      modo: rub.modo,
      tipo: rub.tipo,
      editavel_manual: rub.editavel_manual,
      rubrica_id: rub.id,
    },
  ];
  const out = await recalcular(ctx, adicionada);
  return out.linhas.find((l) => l.codigo === rub.codigo) ?? null;
}
