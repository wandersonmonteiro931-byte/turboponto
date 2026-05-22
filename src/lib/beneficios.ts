import { supabase } from "@/integrations/supabase/client";

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

  const { data: registros, error: e2 } = await supabase
    .from("registros_ponto")
    .select("funcionario_id,data_referencia,tipo_ponto,atraso_minutos,status")
    .eq("empresa_id", empresaId)
    .gte("data_referencia", inicio)
    .lte("data_referencia", fim);
  if (e2) throw e2;

  // justificativas aprovadas no período (com tipo)
  const { data: justAplic } = await supabase
    .from("justificativas_aplicadas")
    .select("funcionario_id,data,tipo_id,justificativas_tipos(afeta_assiduidade,abona_ocorrencia,categoria)")
    .eq("empresa_id", empresaId)
    .eq("status", "aprovada")
    .gte("data", inicio)
    .lte("data", fim);

  type JA = {
    funcionario_id: string;
    data: string;
    justificativas_tipos: { afeta_assiduidade: string; abona_ocorrencia: boolean; categoria: string } | null;
  };
  const justPorFunc = new Map<string, Map<string, JA>>();
  for (const j of (justAplic ?? []) as unknown as JA[]) {
    const m = justPorFunc.get(j.funcionario_id) ?? new Map();
    m.set(j.data, j);
    justPorFunc.set(j.funcionario_id, m);
  }

  const funcIds = (funcs ?? []).map((f) => f.id);
  const { data: vincs } = funcIds.length
    ? await supabase
        .from("funcionarios_jornadas")
        .select("funcionario_id,jornada_id")
        .in("funcionario_id", funcIds)
        .eq("ativo", true)
    : { data: [] as Array<{ funcionario_id: string; jornada_id: string }> };

  const jornadaIds = Array.from(new Set((vincs ?? []).map((v) => v.jornada_id)));
  const { data: dias } = jornadaIds.length
    ? await supabase
        .from("jornadas_dias")
        .select("jornada_id,dia_semana,trabalha")
        .in("jornada_id", jornadaIds)
    : { data: [] as Array<{ jornada_id: string; dia_semana: number; trabalha: boolean }> };

  const jornadaPorFunc = new Map((vincs ?? []).map((v) => [v.funcionario_id, v.jornada_id]));
  const diasPorJornada = new Map<string, Set<number>>();
  for (const d of dias ?? []) {
    if (!d.trabalha) continue;
    const set = diasPorJornada.get(d.jornada_id) ?? new Set<number>();
    set.add(d.dia_semana);
    diasPorJornada.set(d.jornada_id, set);
  }

  const hoje = new Date();
  const ehMesCorrente = hoje.getFullYear() === ano && hoje.getMonth() + 1 === mes;
  const ultimoDia = ehMesCorrente ? hoje.getDate() : new Date(ano, mes, 0).getDate();
  const todasDatas: { iso: string; dow: number }[] = [];
  for (let d = 1; d <= ultimoDia; d++) {
    const dt = new Date(ano, mes - 1, d);
    todasDatas.push({ iso: dt.toISOString().slice(0, 10), dow: dt.getDay() });
  }

  const { data: fechamento } = await supabase
    .from("fechamentos_mensais")
    .select("status")
    .eq("empresa_id", empresaId)
    .eq("mes_referencia", mes)
    .eq("ano_referencia", ano)
    .maybeSingle();
  const fechado = fechamento?.status === "fechado";

  // helper: a justificativa afeta assiduidade negativamente?
  // afeta_assiduidade='sim' = conta como ocorrência (não abona)
  // afeta_assiduidade='nao' = não afeta (abona)
  // afeta_assiduidade='configuravel' = segue abona_ocorrencia do tipo
  const abonaPorJust = (j: JA | undefined): boolean => {
    if (!j) return false;
    const t = j.justificativas_tipos;
    if (!t) return false;
    if (t.afeta_assiduidade === "nao") return true;
    if (t.afeta_assiduidade === "sim") return false;
    return t.abona_ocorrencia === true;
  };

  const calculos: CalculoBeneficio[] = (funcs ?? []).map((f) => {
    const regs = (registros ?? []).filter((r) => r.funcionario_id === f.id);
    const justMap = justPorFunc.get(f.id) ?? new Map<string, JA>();

    // atraso ignora dias abonados por justificativa
    const regsConsiderados = regs.filter((r) => !abonaPorJust(justMap.get(r.data_referencia)));
    const totalAtraso = regsConsiderados.reduce((s, r) => s + (r.atraso_minutos || 0), 0);
    const diasComAtraso = new Set(regsConsiderados.filter((r) => (r.atraso_minutos || 0) > 0).map((r) => r.data_referencia)).size;

    const jornadaId = jornadaPorFunc.get(f.id);
    const diasUteis = jornadaId ? diasPorJornada.get(jornadaId) ?? new Set<number>() : new Set<number>();
    const datasComEntrada = new Set(
      regs.filter((r) => r.tipo_ponto === "entrada").map((r) => r.data_referencia),
    );
    let faltas = 0;
    if (jornadaId) {
      for (const { iso, dow } of todasDatas) {
        if (!diasUteis.has(dow)) continue;
        if (datasComEntrada.has(iso)) continue;
        // se há justificativa que abona, não conta falta
        if (abonaPorJust(justMap.get(iso))) continue;
        faltas++;
      }
    }

    const aval = avaliarDireito(beneficio, totalAtraso, faltas);
    return {
      funcionario_id: f.id,
      total_atraso_minutos: totalAtraso,
      dias_com_atraso: diasComAtraso,
      faltas_injustificadas: faltas,
      horas_extras_minutos: 0,
      tem_direito: aval.tem_direito,
      status: fechado ? "bloqueado" : aval.status,
      motivo_perda: aval.motivo,
      valor_estimado: aval.valor,
    };
  });

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
