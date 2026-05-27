import { supabase } from "@/integrations/supabase/client";
import { recalcularMes as recalcularBeneficioMes, type Beneficio } from "@/lib/beneficios";
import { carregarCartao } from "@/lib/cartao";

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
      { ate: 1621.00, aliquota: 7.5, deducao: 0 },
      { ate: 2902.84, aliquota: 9, deducao: 24.32 },
      { ate: 4354.27, aliquota: 12, deducao: 111.40 },
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
    .select("id,codigo,descricao,tipo,tipo_calculo,valor_referencia,ativo,modo,editavel_manual,automatico,incide_inss,incide_fgts,incide_irrf,entra_dsr,entra_liquido,depende_ponto")
    .eq("empresa_id", ctx.empresaId);
  const rubricas = ((rubsData ?? []) as unknown) as Rubrica[];
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
  const datasFalta: string[] = [];
  try {
    const cartao = await carregarCartao(ctx.funcionarioId, ctx.ano, ctx.mes);
    minHE = cartao.totalExtras;
    minAtraso = cartao.dias.reduce((s, d) => (d.bancoHorasMinutos < 0 ? s + -d.bancoHorasMinutos : s), 0);
    numFaltas = cartao.totalFaltas;
    for (const d of cartao.dias) {
      if ((d as { falta?: boolean }).falta) datasFalta.push((d as { data: string }).data);
    }
    // DSR perdido: 1 por semana (seg-dom) que contenha ao menos 1 falta injustificada.
    const semanas = new Set<string>();
    for (const data of datasFalta) {
      const dt = new Date(data + "T00:00:00");
      const dow = dt.getDay(); // 0=dom..6=sab
      const diffToMonday = (dow + 6) % 7;
      const monday = new Date(dt);
      monday.setDate(dt.getDate() - diffToMonday);
      semanas.add(monday.toISOString().slice(0, 10));
    }
    dsrPerdidos = semanas.size;
    saldoBHMinutos = cartao.totalBancoHoras;
  } catch (e) {
    console.warn("[holerite] falha ao carregar cartão de ponto; usando fallback", e);
    const [creditos, debitos, faltas] = await Promise.all([
      supabase.from("banco_horas_movimentos").select("minutos").eq("funcionario_id", ctx.funcionarioId).eq("tipo", "credito").gte("data", ini).lte("data", fim),
      supabase.from("banco_horas_movimentos").select("minutos").eq("funcionario_id", ctx.funcionarioId).eq("tipo", "debito").gte("data", ini).lte("data", fim),
      supabase.from("dias_falta").select("id", { count: "exact", head: true }).eq("funcionario_id", ctx.funcionarioId).gte("data", ini).lte("data", fim),
    ]);
    const creditosMin = (creditos.data ?? []).reduce((s, r) => s + Number(r.minutos || 0), 0);
    const debitosMin = (debitos.data ?? []).reduce((s, r) => s + Number(r.minutos || 0), 0);
    minHE = creditosMin;
    minAtraso = debitosMin;
    numFaltas = faltas.count ?? 0;
    saldoBHMinutos = creditosMin - debitosMin;
  }
  const horasHE = minHE / 60;

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


  // Mantém linhas atuais; recalcula apenas as automáticas.
  const linhas: EngineLanc[] = linhasAtuais.map((l) => {
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
      codigo: r.codigo, descricao: r.descricao, qtde: null, provento: 0, desconto: 0, resultado: 0,
      modo: r.modo, tipo: r.tipo, editavel_manual: r.editavel_manual, rubrica_id: r.id,
    });
  }

  // Auto-adiciona HE/atraso/falta se houver dados.
  if (horasHE > 0 && porCodigo.has("00090") && !linhas.find((l) => l.codigo === "00090")) {
    const r = porCodigo.get("00090")!;
    linhas.push({ _k: crypto.randomUUID(), codigo: r.codigo, descricao: r.descricao, qtde: null, provento: 0, desconto: 0, resultado: 0, modo: r.modo, tipo: r.tipo, editavel_manual: r.editavel_manual, rubrica_id: r.id });
  }
  if (horasAtraso > 0 && porCodigo.has("07045") && !linhas.find((l) => l.codigo === "07045")) {
    const r = porCodigo.get("07045")!;
    linhas.push({ _k: crypto.randomUUID(), codigo: r.codigo, descricao: r.descricao, qtde: null, provento: 0, desconto: 0, resultado: 0, modo: r.modo, tipo: r.tipo, editavel_manual: r.editavel_manual, rubrica_id: r.id });
  } else if (!temFechamentoBancoDesc) {
    // Remove desconto de atraso quando não há fechamento autorizado: o débito
    // do banco de horas não pode reduzir o líquido sem a justificativa.
    const idx7045 = linhas.findIndex((l) => l.codigo === "07045");
    if (idx7045 >= 0) linhas.splice(idx7045, 1);
  }

  if (numFaltas > 0 && porCodigo.has("07035") && !linhas.find((l) => l.codigo === "07035")) {
    const r = porCodigo.get("07035")!;
    linhas.push({ _k: crypto.randomUUID(), codigo: r.codigo, descricao: r.descricao, qtde: null, provento: 0, desconto: 0, resultado: 0, modo: r.modo, tipo: r.tipo, editavel_manual: r.editavel_manual, rubrica_id: r.id });
  }
  if (dsrPerdidos > 0 && porCodigo.has("07040") && !linhas.find((l) => l.codigo === "07040")) {
    const r = porCodigo.get("07040")!;
    linhas.push({ _k: crypto.randomUUID(), codigo: r.codigo, descricao: r.descricao, qtde: null, provento: 0, desconto: 0, resultado: 0, modo: r.modo, tipo: r.tipo, editavel_manual: r.editavel_manual, rubrica_id: r.id });
  }

  // ==== Insuficiência de saldo do mês anterior (09005) ====
  // Busca o holerite do mês anterior (mesmo funcionário) e, se houver uma linha
  // 09000 (INSUFICIENCIA DE SALDO), lança automaticamente 09005 como desconto.
  if (porCodigo.has("09005")) {
    const mesAnt = ctx.mes === 1 ? 12 : ctx.mes - 1;
    const anoAnt = ctx.mes === 1 ? ctx.ano - 1 : ctx.ano;
    const { data: hAnt } = await supabase
      .from("holerites")
      .select("id")
      .eq("funcionario_id", ctx.funcionarioId)
      .eq("ano_referencia", anoAnt)
      .eq("mes_referencia", mesAnt)
      .maybeSingle();
    let saldoAnterior = 0;
    if (hAnt?.id) {
      const { data: linhasAnt } = await supabase
        .from("holerite_lancamentos")
        .select("codigo,resultado,qtde")
        .eq("holerite_id", hAnt.id)
        .eq("codigo", "09000");
      saldoAnterior = (linhasAnt ?? []).reduce(
        (s, l) => s + Number(l.resultado || l.qtde || 0),
        0,
      );
    }
    const idx9005 = linhas.findIndex((l) => l.codigo === "09005");
    if (saldoAnterior > 0) {
      const r = porCodigo.get("09005")!;
      const payload: EngineLanc = {
        _k: idx9005 >= 0 ? linhas[idx9005]._k : crypto.randomUUID(),
        id: idx9005 >= 0 ? linhas[idx9005].id : undefined,
        codigo: r.codigo, descricao: r.descricao,
        qtde: null, provento: 0, desconto: round(saldoAnterior),
        resultado: -round(saldoAnterior),
        modo: r.modo, tipo: r.tipo, editavel_manual: r.editavel_manual, rubrica_id: r.id,
      };
      if (idx9005 >= 0) linhas[idx9005] = payload; else linhas.push(payload);
    } else if (idx9005 >= 0) {
      linhas.splice(idx9005, 1);
    }
  }

  // ==== Informativos automáticos baseados no cartão de ponto ====
  // Saldo do banco de horas do mês em horas = saldo do cartão de ponto.
  const saldoBHHoras = round(saldoBHMinutos / 60);

  // Adiciona/remove SALDO BANCO POSITIVO (28651)
  const idxPos = linhas.findIndex((l) => l.codigo === "28651");
  if (saldoBHHoras > 0 && porCodigo.has("28651")) {
    const r = porCodigo.get("28651")!;
    const payload: EngineLanc = {
      _k: idxPos >= 0 ? linhas[idxPos]._k : crypto.randomUUID(),
      id: idxPos >= 0 ? linhas[idxPos].id : undefined,
      codigo: r.codigo, descricao: r.descricao,
      qtde: null, provento: 0, desconto: 0, resultado: saldoBHHoras,
      modo: r.modo, tipo: r.tipo, editavel_manual: r.editavel_manual, rubrica_id: r.id,
    };
    if (idxPos >= 0) linhas[idxPos] = payload; else linhas.push(payload);
  } else if (idxPos >= 0) {
    linhas.splice(idxPos, 1);
  }

  // Adiciona/remove SALDO BANCO NEGATIVO (28652)
  const idxNeg = linhas.findIndex((l) => l.codigo === "28652");
  if (saldoBHHoras < 0 && porCodigo.has("28652")) {
    const r = porCodigo.get("28652")!;
    const payload: EngineLanc = {
      _k: idxNeg >= 0 ? linhas[idxNeg]._k : crypto.randomUUID(),
      id: idxNeg >= 0 ? linhas[idxNeg].id : undefined,
      codigo: r.codigo, descricao: r.descricao,
      qtde: null, provento: 0, desconto: 0, resultado: saldoBHHoras,
      modo: r.modo, tipo: r.tipo, editavel_manual: r.editavel_manual, rubrica_id: r.id,
    };
    if (idxNeg >= 0) linhas[idxNeg] = payload; else linhas.push(payload);
  } else if (idxNeg >= 0) {
    linhas.splice(idxNeg, 1);
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
    const horasCB = round(minAtraso / 60);
    const idxCB = linhas.findIndex((l) => l.codigo === "18445");
    if (horasCB > 0) {
      const r = porCodigo.get("18445")!;
      const payload: EngineLanc = {
        _k: idxCB >= 0 ? linhas[idxCB]._k : crypto.randomUUID(),
        id: idxCB >= 0 ? linhas[idxCB].id : undefined,
        codigo: r.codigo, descricao: r.descricao,
        qtde: null, provento: 0, desconto: 0, resultado: horasCB,
        modo: r.modo, tipo: r.tipo, editavel_manual: r.editavel_manual, rubrica_id: r.id,
      };
      if (idxCB >= 0) linhas[idxCB] = payload; else linhas.push(payload);
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
        setLinha(r.codigo, { qtde: round(horasHE), provento: round(valorHora * 1.5 * horasHE), desconto: 0 });
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
        setLinha(r.codigo, { qtde: 1, provento: r.tipo === "provento" ? Number(r.valor_referencia) : 0, desconto: r.tipo === "desconto" ? Number(r.valor_referencia) : 0 });
        break;
      case "percentual_salario":
      case "pct_salario_base":
        setLinha(r.codigo, { qtde: Number(r.valor_referencia), provento: r.tipo === "provento" ? round(salario * Number(r.valor_referencia) / 100) : 0, desconto: r.tipo === "desconto" ? round(salario * Number(r.valor_referencia) / 100) : 0 });
        break;
      case "adto_quinzenal_auto": {
        const pct = Number(r.valor_referencia) || 40;
        setLinha(r.codigo, { qtde: pct, provento: 0, desconto: round(salarioProporcional * pct / 100) });
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
  const fgtsMes = round(baseFgts * tab.fgts_aliquota / 100);
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
      (!l.provento || l.provento === 0) &&
      (!l.desconto || l.desconto === 0) &&
      (!l.resultado || l.resultado === 0);
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

  // Se líquido ficou negativo, registra o saldo em 09000 (INSUFICIENCIA DE SALDO)
  // como informativo e zera o líquido. Esse valor será lançado automaticamente
  // como desconto 09005 (INSUF MES ANTERIOR) no holerite do mês seguinte.
  const idx9000 = linhas.findIndex((l) => l.codigo === "09000");
  if (totalLiq < 0 && porCodigo.has("09000")) {
    const shortfall = round(-totalLiq);
    const r = porCodigo.get("09000")!;
    const payload: EngineLanc = {
      _k: idx9000 >= 0 ? linhas[idx9000]._k : crypto.randomUUID(),
      id: idx9000 >= 0 ? linhas[idx9000].id : undefined,
      codigo: r.codigo, descricao: r.descricao,
      qtde: shortfall, provento: 0, desconto: 0, resultado: shortfall,
      modo: r.modo, tipo: r.tipo, editavel_manual: r.editavel_manual, rubrica_id: r.id,
    };
    if (idx9000 >= 0) linhas[idx9000] = payload; else linhas.push(payload);
    totalLiq = 0;
  } else if (idx9000 >= 0) {
    linhas.splice(idx9000, 1);
  }

  return {
    linhas,
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
    .select("id,codigo,descricao,tipo,tipo_calculo,valor_referencia,ativo,modo,editavel_manual,automatico,incide_inss,incide_fgts,incide_irrf,entra_dsr,entra_liquido,depende_ponto")
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
      codigo: rub.codigo, descricao: rub.descricao,
      qtde: null, provento: 0, desconto: 0, resultado: 0,
      modo: rub.modo, tipo: rub.tipo, editavel_manual: rub.editavel_manual, rubrica_id: rub.id,
    },
  ];
  const out = await recalcular(ctx, adicionada);
  return out.linhas.find((l) => l.codigo === rub.codigo) ?? null;
}
