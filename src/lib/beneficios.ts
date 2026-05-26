import { supabase } from "@/integrations/supabase/client";
import { carregarCartao } from "@/lib/cartao";


export const STATUS_BENEFICIO: Record<string, { label: string; color: string }> = {
  em_calculo: { label: "Em cálculo", color: "bg-muted text-muted-foreground" },
  tem_direito: { label: "Tem direito", color: "bg-green-500/20 text-green-700" },
  nao_tem_direito: { label: "Sem direito", color: "bg-red-500/20 text-red-700" },
  liberado: { label: "Liberado", color: "bg-blue-500/20 text-blue-700" },
  entregue: { label: "Entregue", color: "bg-emerald-500/20 text-emerald-700" },
  bloqueado: { label: "Bloqueado", color: "bg-zinc-500/20 text-zinc-700" },
  em_analise: { label: "Em análise", color: "bg-amber-500/20 text-amber-700" },
};

export type Beneficio = {
  id: string;
  empresa_id: string;
  nome: string;
  tipo: string;
  valor_maximo: number;
  dia_entrega: number;
  regra_descricao: string | null;
  limite_atraso_minutos: number;
  limite_alerta_minutos: number;
  status: string;
};

export type CalculoBeneficio = {
  funcionario_id: string;
  total_atraso_minutos: number;
  dias_com_atraso: number;
  faltas_injustificadas: number;
  horas_extras_minutos: number;
  tem_direito: boolean;
  status: string;
  motivo_perda: string | null;
  valor_estimado: number;
};

/** Calcula direito ao benefício considerando regra: atraso ≤ limite. */
export function avaliarDireito(
  beneficio: Pick<Beneficio, "limite_atraso_minutos" | "limite_alerta_minutos" | "valor_maximo">,
  totalAtraso: number,
  faltas: number,
): { tem_direito: boolean; status: string; motivo: string | null; valor: number; proximoLimite: boolean } {
  const proximoLimite = totalAtraso >= beneficio.limite_alerta_minutos && totalAtraso <= beneficio.limite_atraso_minutos;
  if (totalAtraso > beneficio.limite_atraso_minutos) {
    return {
      tem_direito: false,
      status: "nao_tem_direito",
      motivo: `Ultrapassou ${beneficio.limite_atraso_minutos} min de atraso no mês (${totalAtraso} min acumulados).`,
      valor: 0,
      proximoLimite: false,
    };
  }
  if (faltas > 0) {
    return {
      tem_direito: false,
      status: "nao_tem_direito",
      motivo: `Possui ${faltas} falta(s) injustificada(s) no mês.`,
      valor: 0,
      proximoLimite,
    };
  }
  return { tem_direito: true, status: "tem_direito", motivo: null, valor: beneficio.valor_maximo, proximoLimite };
}

/** Recalcula benefícios do mês para todos funcionários ativos da empresa. */
export async function recalcularMes(empresaId: string, beneficio: Beneficio, mes: number, ano: number) {
  const inicio = new Date(ano, mes - 1, 1).toISOString().slice(0, 10);
  const fim = new Date(ano, mes, 0).toISOString().slice(0, 10);

  const { data: funcs, error: e1 } = await supabase
    .from("funcionarios")
    .select("id,nome,cargo,status")
    .eq("empresa_id", empresaId)
    .eq("status", "ativo");
  if (e1) throw e1;

  const { data: fechamento } = await supabase
    .from("fechamentos_mensais")
    .select("status")
    .eq("empresa_id", empresaId)
    .eq("mes_referencia", mes)
    .eq("ano_referencia", ano)
    .maybeSingle();
  const fechado = fechamento?.status === "fechado";

  // Calcula faltas/atrasos usando exatamente a mesma lógica do cartão de ponto,
  // para garantir consistência com o que o colaborador e o gestor enxergam lá.
  const calculos: CalculoBeneficio[] = [];
  for (const f of funcs ?? []) {
    let totalAtraso = 0;
    let diasComAtraso = 0;
    let faltas = 0;
    try {
      const cartao = await carregarCartao(f.id, ano, mes);
      totalAtraso = cartao.totalAtraso;
      diasComAtraso = cartao.dias.filter((d) => d.atrasoMinutos > 0).length;
      faltas = cartao.totalFaltas;
    } catch {
      // Se falhar (ex.: sem jornada), assume zero para não bloquear o cálculo
    }

    const aval = avaliarDireito(beneficio, totalAtraso, faltas);
    calculos.push({
      funcionario_id: f.id,
      total_atraso_minutos: totalAtraso,
      dias_com_atraso: diasComAtraso,
      faltas_injustificadas: faltas,
      horas_extras_minutos: 0,
      tem_direito: aval.tem_direito,
      status: fechado ? "bloqueado" : aval.status,
      motivo_perda: aval.motivo,
      valor_estimado: aval.valor,
    });
  }


  if (calculos.length === 0) return { atualizados: 0 };

  const { data: existentes } = await supabase
    .from("beneficios_calculos")
    .select("id,funcionario_id,status")
    .eq("empresa_id", empresaId)
    .eq("beneficio_id", beneficio.id)
    .eq("mes_referencia", mes)
    .eq("ano_referencia", ano);
  const mapaExist = new Map((existentes ?? []).map((e) => [e.funcionario_id, e]));

  const rows = calculos.map((c) => {
    const ex = mapaExist.get(c.funcionario_id);
    const manterStatus = ex && ["liberado", "entregue", "em_analise"].includes(ex.status);
    return {
      ...(ex ? { id: ex.id } : {}),
      empresa_id: empresaId,
      beneficio_id: beneficio.id,
      mes_referencia: mes,
      ano_referencia: ano,
      ...c,
      status: manterStatus ? ex!.status : c.status,
      calculado_em: new Date().toISOString(),
    };
  });

  const { error: eUp } = await supabase.from("beneficios_calculos").upsert(rows, {
    onConflict: "funcionario_id,beneficio_id,mes_referencia,ano_referencia",
  });
  if (eUp) throw eUp;
  return { atualizados: rows.length };
}

export function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function mesNome(m: number) {
  return ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"][m-1] ?? "";
}
