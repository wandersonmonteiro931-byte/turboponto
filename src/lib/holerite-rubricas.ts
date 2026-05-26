import { supabase } from "@/integrations/supabase/client";

export type TipoCalculo =
  | "manual"
  | "valor_fixo"
  | "percentual_salario"
  | "salario_base"
  | "salario_dias_trabalhados"
  | "horas_extras_50"
  | "horas_extras_100"
  | "atrasos"
  | "faltas_dias"
  | "dsr_faltas";

export const TIPO_CALCULO_OPCOES: Array<{ value: TipoCalculo; label: string; help: string }> = [
  { value: "manual", label: "Manual", help: "Qtde e valor digitados manualmente." },
  { value: "valor_fixo", label: "Valor fixo", help: "Usa o valor de referência. Qtde = 1." },
  { value: "percentual_salario", label: "% do salário", help: "Valor = salário × (referência / 100)." },
  { value: "salario_base", label: "Salário base (30 dias cheios)", help: "Valor = salário contratual. Qtde = 30. Ignora cartão de ponto." },
  { value: "salario_dias_trabalhados", label: "Salário proporcional (cartão de ponto)", help: "Qtde = dias trabalhados no cartão (30 - faltas, considera admissão/desligamento). Valor = (salário/30) × dias." },
  { value: "horas_extras_50", label: "Horas extras 50%", help: "Qtde = horas extras do mês (cartão). Valor = (salário/220) × 1,5 × horas." },
  { value: "horas_extras_100", label: "Horas extras 100%", help: "Qtde = horas extras do mês × 2. Valor = (salário/220) × 2 × horas." },
  { value: "atrasos", label: "Atrasos (horas)", help: "Qtde = horas de atraso no mês. Valor = (salário/220) × horas." },
  { value: "faltas_dias", label: "Faltas (dias)", help: "Qtde = nº de faltas. Valor = (salário/30) × dias." },
  { value: "dsr_faltas", label: "DSR sobre faltas", help: "Qtde = dias de DSR perdidos. Valor = (salário/30) × dias." },
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
