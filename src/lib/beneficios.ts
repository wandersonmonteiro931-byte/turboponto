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

/** Regra: perde direito se débito de horas do mês > 60 min OU qualquer falta injustificada. */
export function avaliarDireito(
  beneficio: Pick<Beneficio, "limite_atraso_minutos" | "limite_alerta_minutos" | "valor_maximo">,
  debitoMinutos: number,
  faltas: number,
): { tem_direito: boolean; status: string; motivo: string | null; valor: number; proximoLimite: boolean } {
  const LIMITE = 60;
  const ALERTA = 45;
  const proximoLimite = debitoMinutos >= ALERTA && debitoMinutos <= LIMITE;
  if (faltas > 0) {
    return {
      tem_direito: false,
      status: "nao_tem_direito",
      motivo: `Possui ${faltas} falta(s) injustificada(s) no mês.`,
      valor: 0,
      proximoLimite: false,
    };
  }
  if (debitoMinutos > LIMITE) {
    const h = Math.floor(debitoMinutos / 60);
    const m = debitoMinutos % 60;
    return {
      tem_direito: false,
      status: "nao_tem_direito",
      motivo: `Débito de ${h}h${String(m).padStart(2, "0")} no mês (limite: 1h).`,
      valor: 0,
      proximoLimite: false,
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
    let debito = 0;
    try {
      const cartao = await carregarCartao(f.id, ano, mes);
      totalAtraso = cartao.totalAtraso;
      diasComAtraso = cartao.dias.filter((d) => d.atrasoMinutos > 0).length;
      faltas = cartao.totalFaltas;
      // Débito real do mês: soma dos débitos diários (sem netting contra créditos).
      // Mesma lógica do total "Debitos" exibido no cartão de ponto / PDF.
      debito = cartao.dias.reduce(
        (s, d) => (d.bancoHorasMinutos < 0 ? s + -d.bancoHorasMinutos : s),
        0,
      );
    } catch (err) {
      // Se falhar (ex.: sem jornada), assume zero para não bloquear o cálculo
      console.warn("[beneficios] falha ao carregar cartão", f.id, err);
    }

    const aval = avaliarDireito(beneficio, debito, faltas);
    calculos.push({
      funcionario_id: f.id,
      total_atraso_minutos: debito,
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

  // Upsert por funcionário: assim, uma falha individual não bloqueia os demais.
  let atualizados = 0;
  const erros: string[] = [];
  for (const c of calculos) {
    const ex = mapaExist.get(c.funcionario_id);
    const manterStatus = ex && ["liberado", "entregue", "em_analise"].includes(ex.status);
    const row = {
      ...(ex ? { id: ex.id } : {}),
      empresa_id: empresaId,
      beneficio_id: beneficio.id,
      mes_referencia: mes,
      ano_referencia: ano,
      ...c,
      status: manterStatus ? ex!.status : c.status,
      calculado_em: new Date().toISOString(),
    };
    const { error } = await supabase
      .from("beneficios_calculos")
      .upsert(row, { onConflict: "funcionario_id,beneficio_id,mes_referencia,ano_referencia" });
    if (error) {
      console.warn("[beneficios] upsert falhou", c.funcionario_id, error);
      erros.push(`${c.funcionario_id.slice(0, 8)}: ${error.message}`);
    } else {
      atualizados++;
    }
  }
  if (atualizados === 0 && erros.length > 0) {
    throw new Error(erros.join(" | "));
  }
  return { atualizados };
}

export function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function mesNome(m: number) {
  return ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"][m-1] ?? "";
}

export type CicloBeneficio = {
  id: string;
  empresa_id: string;
  beneficio_id: string;
  mes_referencia: number;
  ano_referencia: number;
  status: "aberto" | "aprovado";
  aprovado_em: string | null;
  aprovado_por: string | null;
  observacao: string | null;
};

export async function carregarCiclos(beneficioId: string): Promise<CicloBeneficio[]> {
  const { data, error } = await supabase
    .from("beneficios_ciclos")
    .select("*")
    .eq("beneficio_id", beneficioId)
    .order("ano_referencia", { ascending: false })
    .order("mes_referencia", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CicloBeneficio[];
}

export function ultimoCicloAprovado(ciclos: CicloBeneficio[]): CicloBeneficio | null {
  return ciclos.find((c) => c.status === "aprovado") ?? null;
}

export function proximoMesDisponivel(ciclos: CicloBeneficio[]): { mes: number; ano: number } {
  const ult = ultimoCicloAprovado(ciclos);
  if (!ult) {
    const hoje = new Date();
    return { mes: hoje.getMonth() + 1, ano: hoje.getFullYear() };
  }
  const m = ult.mes_referencia + 1;
  return m > 12 ? { mes: 1, ano: ult.ano_referencia + 1 } : { mes: m, ano: ult.ano_referencia };
}

export function compMesAno(a: { mes: number; ano: number }, b: { mes: number; ano: number }) {
  if (a.ano !== b.ano) return a.ano < b.ano ? -1 : 1;
  if (a.mes === b.mes) return 0;
  return a.mes < b.mes ? -1 : 1;
}

export async function aprovarCiclo(params: {
  empresaId: string;
  beneficioId: string;
  mes: number;
  ano: number;
  usuarioId: string;
  observacao?: string;
}): Promise<void> {
  const { empresaId, beneficioId, mes, ano, usuarioId, observacao } = params;
  const { error } = await supabase.from("beneficios_ciclos").upsert({
    empresa_id: empresaId,
    beneficio_id: beneficioId,
    mes_referencia: mes,
    ano_referencia: ano,
    status: "aprovado",
    aprovado_em: new Date().toISOString(),
    aprovado_por: usuarioId,
    observacao: observacao ?? null,
  }, { onConflict: "beneficio_id,mes_referencia,ano_referencia" });
  if (error) throw error;

  const proxMes = mes === 12 ? 1 : mes + 1;
  const proxAno = mes === 12 ? ano + 1 : ano;
  await supabase.from("beneficios_ciclos").upsert({
    empresa_id: empresaId,
    beneficio_id: beneficioId,
    mes_referencia: proxMes,
    ano_referencia: proxAno,
    status: "aberto",
  }, { onConflict: "beneficio_id,mes_referencia,ano_referencia", ignoreDuplicates: true });
}

