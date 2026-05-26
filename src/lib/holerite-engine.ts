import { supabase } from "@/integrations/supabase/client";

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
    inss_faixas: [
      { ate: 1518, aliquota: 7.5, deducao: 0 },
      { ate: 2793.88, aliquota: 9, deducao: 22.77 },
      { ate: 4190.83, aliquota: 12, deducao: 106.59 },
      { ate: 8157.41, aliquota: 14, deducao: 190.4 },
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

  // Ponto do mês: HE (créditos), atrasos (débitos), faltas.
  const ini = `${ctx.ano}-${String(ctx.mes).padStart(2, "0")}-01`;
  const fim = new Date(ctx.ano, ctx.mes, 0).toISOString().slice(0, 10);
  const [creditos, debitos, faltas] = await Promise.all([
    supabase.from("banco_horas_movimentos").select("minutos").eq("funcionario_id", ctx.funcionarioId).eq("tipo", "credito").gte("data", ini).lte("data", fim),
    supabase.from("banco_horas_movimentos").select("minutos").eq("funcionario_id", ctx.funcionarioId).eq("tipo", "debito").gte("data", ini).lte("data", fim),
    supabase.from("dias_falta").select("id", { count: "exact", head: true }).eq("funcionario_id", ctx.funcionarioId).gte("data", ini).lte("data", fim),
  ]);
  const minHE = (creditos.data ?? []).reduce((s, r) => s + Number(r.minutos || 0), 0);
  const minAtraso = (debitos.data ?? []).reduce((s, r) => s + Number(r.minutos || 0), 0);
  const numFaltas = faltas.count ?? 0;
  const horasHE = minHE / 60;
  const horasAtraso = minAtraso / 60;

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
  // (00005, INSS, FGTS, IRRF) que devem aparecer sempre que houver salário.
  const sempre = ["00005", "07000", "07005", "07010"];
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
  }
  if (numFaltas > 0 && porCodigo.has("07035") && !linhas.find((l) => l.codigo === "07035")) {
    const r = porCodigo.get("07035")!;
    linhas.push({ _k: crypto.randomUUID(), codigo: r.codigo, descricao: r.descricao, qtde: null, provento: 0, desconto: 0, resultado: 0, modo: r.modo, tipo: r.tipo, editavel_manual: r.editavel_manual, rubrica_id: r.id });
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
        setLinha(r.codigo, { qtde: numFaltas, provento: 0, desconto: round(valorDia * numFaltas) });
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
  const totalLiq = round(totalProv - totalDesc);

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
