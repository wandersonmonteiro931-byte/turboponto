import { supabase } from "@/integrations/supabase/client";

export type BancoHorasMovimento = {
  id: string;
  funcionario_id: string;
  data: string;
  tipo: "credito" | "debito";
  minutos: number;
  origem: "justificativa" | "automatico" | "ajuste";
  justificativa_aplicada_id: string | null;
  observacao: string | null;
  created_at: string;
};

export type ExtratoBH = {
  movimentos: (BancoHorasMovimento & { saldoApos: number })[];
  saldoFinal: number;
};

export async function listarMovimentosBH(
  funcionarioId: string,
  ini?: string,
  fim?: string,
): Promise<ExtratoBH> {
  let q = supabase.from("banco_horas_movimentos")
    .select("*")
    .eq("funcionario_id", funcionarioId)
    .order("data", { ascending: true })
    .order("created_at", { ascending: true });
  if (ini) q = q.gte("data", ini);
  if (fim) q = q.lte("data", fim);
  const { data, error } = await q;
  if (error) throw error;
  const movs = (data ?? []) as BancoHorasMovimento[];
  let saldo = 0;
  const out = movs.map((m) => {
    saldo += m.tipo === "credito" ? m.minutos : -m.minutos;
    return { ...m, saldoApos: saldo };
  });
  return { movimentos: out, saldoFinal: saldo };
}

export async function inserirAjuste(args: {
  empresaId: string;
  funcionarioId: string;
  data: string;
  tipo: "credito" | "debito";
  minutos: number;
  observacao: string;
  userId: string;
}) {
  const { error } = await supabase.from("banco_horas_movimentos").insert({
    empresa_id: args.empresaId,
    funcionario_id: args.funcionarioId,
    data: args.data,
    tipo: args.tipo,
    minutos: args.minutos,
    origem: "ajuste",
    observacao: args.observacao,
    created_by: args.userId,
  });
  if (error) throw error;
}

export async function removerMovimento(id: string) {
  const { error } = await supabase.from("banco_horas_movimentos").delete().eq("id", id);
  if (error) throw error;
}

export function formatSaldoMin(min: number): string {
  const sinal = min > 0 ? "+" : min < 0 ? "-" : "";
  const abs = Math.abs(min);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sinal}${h}h${String(m).padStart(2, "0")}`;
}
