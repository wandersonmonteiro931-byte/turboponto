import { supabase } from "@/integrations/supabase/client";

export type JustificativaCategoria =
  | "falta"
  | "abono"
  | "afastamento"
  | "banco_horas"
  | "ferias"
  | "folga"
  | "admissao_desligamento"
  | "treinamento"
  | "liberacao"
  | "fechado"
  | "troca";

export type MovimentaBancoHoras = "nenhum" | "credito" | "debito";
export type AfetaAssiduidade = "sim" | "nao" | "configuravel";

export type JustificativaTipo = {
  id: string;
  empresa_id: string;
  nome: string;
  codigo: string;
  categoria: JustificativaCategoria;
  desconta_salario: boolean;
  desconta_dsr: boolean;
  abona_ocorrencia: boolean;
  exige_aprovacao: boolean;
  exige_anexo: boolean;
  exige_observacao: boolean;
  movimenta_banco_horas: MovimentaBancoHoras;
  conta_dia_trabalhado: boolean;
  exige_marcacao_ponto: boolean;
  afeta_assiduidade: AfetaAssiduidade;
  pode_aplicar_individual: boolean;
  pode_aplicar_massa: boolean;
  ativo: boolean;
  padrao_sistema: boolean;
  descricao: string | null;
};

export const CATEGORIA_LABEL: Record<JustificativaCategoria, string> = {
  falta: "Falta",
  abono: "Abono",
  afastamento: "Afastamento",
  banco_horas: "Banco de horas",
  ferias: "Férias",
  folga: "Folga",
  admissao_desligamento: "Admissão/Desligamento",
  treinamento: "Treinamento",
  liberacao: "Liberação",
  fechado: "Empresa fechada",
  troca: "Troca",
};

export async function listarJustificativasTipos(empresaId: string) {
  const { data, error } = await supabase
    .from("justificativas_tipos")
    .select("*")
    .eq("empresa_id", empresaId)
    .order("padrao_sistema", { ascending: false })
    .order("nome");
  if (error) throw error;
  return (data ?? []) as JustificativaTipo[];
}
