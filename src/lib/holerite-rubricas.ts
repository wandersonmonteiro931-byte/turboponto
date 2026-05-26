import { supabase } from "@/integrations/supabase/client";

export type TipoCalculo =
  | "manual" | "valor_fixo" | "percentual_salario" | "salario_base" | "salario_dias_trabalhados"
  | "horas_trabalhadas"
  | "horas_extras_50" | "horas_extras_60" | "horas_extras_70" | "horas_extras_80" | "horas_extras_100"
  | "dsr_he" | "adicional_noturno" | "dsr_adicional_noturno"
  | "valor_diario" | "valor_hora"
  | "pct_salario_base" | "pct_salario_bruto" | "pct_base_configurada"
  | "vt_automatico" | "inss_automatico" | "fgts_automatico" | "irrf_automatico"
  | "faltas_auto" | "atrasos_auto" | "saida_antecipada_auto"
  | "bh_negativo" | "bh_positivo_pago" | "adto_quinzenal_auto"
  | "cesta_basica_auto" | "vale_alimentacao_auto" | "vale_refeicao_auto" | "salario_familia_auto"
  | "relatorio_ponto" | "resultado_auto"
  | "atrasos" | "faltas_dias" | "dsr_faltas";

export const TIPO_CALCULO_OPCOES: Array<{ value: TipoCalculo; label: string; help: string }> = [
  { value: "manual", label: "Manual", help: "Qtde e valor digitados manualmente." },
  { value: "valor_fixo", label: "Valor fixo mensal", help: "Usa o valor de referência. Qtde = 1." },
  { value: "valor_diario", label: "Valor diário", help: "Valor de referência × dias." },
  { value: "valor_hora", label: "Valor por hora", help: "Valor de referência × horas." },
  { value: "percentual_salario", label: "% do salário (genérico)", help: "Valor = salário × (referência / 100)." },
  { value: "pct_salario_base", label: "% do salário base", help: "% sobre salário base." },
  { value: "pct_salario_bruto", label: "% do salário bruto", help: "% sobre salário bruto do mês." },
  { value: "pct_base_configurada", label: "% sobre base configurada", help: "% sobre base específica (insalubridade etc.)." },
  { value: "salario_base", label: "Salário mensal integral", help: "Salário contratual cheio. Qtde = 30." },
  { value: "salario_dias_trabalhados", label: "Salário proporcional (dias de vínculo)", help: "Salário/30 × dias de vínculo no período." },
  { value: "horas_trabalhadas", label: "Horas trabalhadas", help: "Valor hora × horas efetivamente trabalhadas." },
  { value: "horas_extras_50", label: "Horas extras 50%", help: "HE × valor hora × 1,5." },
  { value: "horas_extras_60", label: "Horas extras 60%", help: "HE × valor hora × 1,6." },
  { value: "horas_extras_70", label: "Horas extras 70%", help: "HE × valor hora × 1,7." },
  { value: "horas_extras_80", label: "Horas extras 80%", help: "HE × valor hora × 1,8." },
  { value: "horas_extras_100", label: "Horas extras 100%", help: "HE × valor hora × 2." },
  { value: "dsr_he", label: "DSR sobre horas extras", help: "Reflexo do DSR sobre HE pagas." },
  { value: "adicional_noturno", label: "Adicional noturno", help: "Horas noturnas × valor hora × adicional." },
  { value: "dsr_adicional_noturno", label: "DSR sobre adicional noturno", help: "Reflexo do DSR sobre adicional noturno." },
  { value: "vt_automatico", label: "Vale-transporte automático", help: "Menor entre VT concedido e 6% do salário base proporcional." },
  { value: "inss_automatico", label: "INSS automático", help: "Tabela progressiva sobre soma de itens com incidência INSS." },
  { value: "fgts_automatico", label: "FGTS automático", help: "Base FGTS × 8%. Informativo, não desconta líquido." },
  { value: "irrf_automatico", label: "IRRF automático", help: "Tabela progressiva sobre base tributável − INSS − dependentes." },
  { value: "faltas_auto", label: "Faltas injustificadas (automático)", help: "Salário/30 × faltas do mês." },
  { value: "atrasos_auto", label: "Atrasos (automático)", help: "Valor hora × tempo de atraso." },
  { value: "saida_antecipada_auto", label: "Saída antecipada (automático)", help: "Valor hora × tempo de saída antecipada." },
  { value: "bh_negativo", label: "Banco de horas negativo (desconto)", help: "Horas negativas autorizadas × valor hora." },
  { value: "bh_positivo_pago", label: "Banco de horas positivo pago", help: "Horas positivas pagas × valor hora × adicional." },
  { value: "adto_quinzenal_auto", label: "Adiantamento quinzenal automático", help: "% do salário proporcional do mês." },
  { value: "cesta_basica_auto", label: "Cesta básica (assiduidade)", help: "Concedida conforme regra de assiduidade." },
  { value: "vale_alimentacao_auto", label: "Vale-alimentação automático", help: "Valor diário × dias trabalhados." },
  { value: "vale_refeicao_auto", label: "Vale-refeição automático", help: "Valor diário × dias trabalhados." },
  { value: "salario_familia_auto", label: "Salário-família automático", help: "Tabela × dependentes elegíveis." },
  { value: "relatorio_ponto", label: "Relatório do ponto", help: "Reflete dados do cartão de ponto." },
  { value: "resultado_auto", label: "Resultado calculado pelo sistema", help: "Calculado a partir de outros itens." },
  { value: "atrasos", label: "(legado) Atrasos", help: "Compatibilidade — prefira Atrasos (automático)." },
  { value: "faltas_dias", label: "(legado) Faltas (dias)", help: "Compatibilidade — prefira Faltas (automático)." },
  { value: "dsr_faltas", label: "(legado) DSR sobre faltas", help: "Compatibilidade." },
];

export type CalcContext = {
  salario: number;
  funcionarioId: string;
  ano: number;
  mes: number;
};

export type CalcResult = { qtde: number | null; provento: number; desconto: number; resultado: number };

const round = (v: number) => Math.round(v * 100) / 100;

async function totalHorasExtrasMes(funcionarioId: string, ano: number, mes: number): Promise<number> {
  const ini = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fim = new Date(ano, mes, 0).toISOString().slice(0, 10);
  const { data } = await supabase
    .from("banco_horas_movimentos")
    .select("minutos,tipo")
    .eq("funcionario_id", funcionarioId)
    .eq("tipo", "credito")
    .gte("data", ini)
    .lte("data", fim);
  const min = (data ?? []).reduce((s, r) => s + Number(r.minutos || 0), 0);
  return min / 60;
}

async function totalAtrasosMinutosMes(funcionarioId: string, ano: number, mes: number): Promise<number> {
  const ini = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fim = new Date(ano, mes, 0).toISOString().slice(0, 10);
  const { data } = await supabase
    .from("banco_horas_movimentos")
    .select("minutos")
    .eq("funcionario_id", funcionarioId)
    .eq("tipo", "debito")
    .gte("data", ini)
    .lte("data", fim);
  return (data ?? []).reduce((s, r) => s + Number(r.minutos || 0), 0);
}

async function totalFaltasMes(funcionarioId: string, ano: number, mes: number): Promise<number> {
  const ini = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fim = new Date(ano, mes, 0).toISOString().slice(0, 10);
  const { count } = await supabase
    .from("dias_falta")
    .select("id", { count: "exact", head: true })
    .eq("funcionario_id", funcionarioId)
    .gte("data", ini)
    .lte("data", fim);
  return count ?? 0;
}

async function diasTrabalhadosCartao(funcionarioId: string, ano: number, mes: number): Promise<number> {
  const diasMes = new Date(ano, mes, 0).getDate();
  const mesIni = new Date(ano, mes - 1, 1);
  const mesFim = new Date(ano, mes - 1, diasMes);
  const { data: func } = await supabase
    .from("funcionarios")
    .select("data_admissao,data_desligamento")
    .eq("id", funcionarioId)
    .maybeSingle();
  const adm = func?.data_admissao ? new Date(func.data_admissao + "T00:00:00") : null;
  const des = func?.data_desligamento ? new Date(func.data_desligamento + "T00:00:00") : null;
  const ini = adm && adm > mesIni ? adm : mesIni;
  const fim = des && des < mesFim ? des : mesFim;
  if (fim < ini) return 0;
  const diasVinculo = Math.round((fim.getTime() - ini.getTime()) / 86400000) + 1;
  // Se vínculo cobre o mês inteiro, retorna 30 (base CLT); senão retorna os dias corridos de vínculo.
  if (diasVinculo >= diasMes) return 30;
  return diasVinculo;
}


export async function calcularRubrica(
  tipo: "provento" | "desconto",
  tipoCalculo: TipoCalculo,
  valorRef: number,
  ctx: CalcContext,
): Promise<CalcResult> {
  const salario = Number(ctx.salario || 0);
  const valorHora = salario > 0 ? salario / 220 : 0;
  const valorDia = salario > 0 ? salario / 30 : 0;

  let qtde: number | null = null;
  let valor = 0;

  switch (tipoCalculo) {
    case "manual":
      break;
    case "valor_fixo":
      qtde = 1;
      valor = valorRef;
      break;
    case "percentual_salario":
      qtde = valorRef;
      valor = salario * (valorRef / 100);
      break;
    case "salario_base":
      qtde = 30;
      valor = salario;
      break;
    case "salario_dias_trabalhados": {
      const dias = await diasTrabalhadosCartao(ctx.funcionarioId, ctx.ano, ctx.mes);
      qtde = dias;
      valor = round(valorDia * dias);
      break;
    }
    case "horas_extras_50": {
      const h = await totalHorasExtrasMes(ctx.funcionarioId, ctx.ano, ctx.mes);
      qtde = round(h);
      valor = round(valorHora * 1.5 * h);
      break;
    }
    case "horas_extras_100": {
      const h = await totalHorasExtrasMes(ctx.funcionarioId, ctx.ano, ctx.mes);
      qtde = round(h);
      valor = round(valorHora * 2 * h);
      break;
    }
    case "atrasos": {
      const min = await totalAtrasosMinutosMes(ctx.funcionarioId, ctx.ano, ctx.mes);
      const h = min / 60;
      qtde = round(h);
      valor = round(valorHora * h);
      break;
    }
    case "faltas_dias": {
      const d = await totalFaltasMes(ctx.funcionarioId, ctx.ano, ctx.mes);
      qtde = d;
      valor = round(valorDia * d);
      break;
    }
    case "dsr_faltas": {
      const d = await totalFaltasMes(ctx.funcionarioId, ctx.ano, ctx.mes);
      qtde = d;
      valor = round(valorDia * d);
      break;
    }
  }

  const provento = tipo === "provento" ? round(valor) : 0;
  const desconto = tipo === "desconto" ? round(valor) : 0;
  const resultado = round(provento - desconto);
  return { qtde, provento, desconto, resultado };
}
