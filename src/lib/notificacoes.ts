import { supabase } from "@/integrations/supabase/client";

export type Notificacao = {
  id: string;
  empresa_id: string;
  funcionario_id: string;
  titulo: string;
  mensagem: string;
  link: string | null;
  categoria: string;
  lida: boolean;
  lida_em: string | null;
  created_at: string;
};

export type HistoricoJustificativa = {
  id: string;
  justificativa_id: string;
  funcionario_id: string;
  acao: string;
  status_anterior: string | null;
  status_novo: string | null;
  alterado_por: string | null;
  observacao: string | null;
  created_at: string;
};

export async function listarNotificacoes(funcionarioId: string, apenasNaoLidas = false) {
  let q = supabase.from("notificacoes").select("*")
    .eq("funcionario_id", funcionarioId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (apenasNaoLidas) q = q.eq("lida", false);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Notificacao[];
}

export async function marcarLida(id: string) {
  const { error } = await supabase.from("notificacoes")
    .update({ lida: true, lida_em: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function marcarTodasLidas(funcionarioId: string) {
  const { error } = await supabase.from("notificacoes")
    .update({ lida: true, lida_em: new Date().toISOString() })
    .eq("funcionario_id", funcionarioId).eq("lida", false);
  if (error) throw error;
}

export async function listarHistoricoJustificativa(justificativaId: string) {
  const { data, error } = await supabase.from("justificativas_historico")
    .select("*").eq("justificativa_id", justificativaId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as HistoricoJustificativa[];
}

export async function calcularDescontoFolha(funcionarioId: string, ano: number, mes: number) {
  const { data, error } = await supabase.rpc("calcular_desconto_folha", {
    _funcionario_id: funcionarioId, _ano: ano, _mes: mes,
  });
  if (error) throw error;
  const r = (data?.[0] ?? { dias_desc: 0, dias_dsr: 0, valor_desconto: 0 }) as {
    dias_desc: number; dias_dsr: number; valor_desconto: number;
  };
  return r;
}
