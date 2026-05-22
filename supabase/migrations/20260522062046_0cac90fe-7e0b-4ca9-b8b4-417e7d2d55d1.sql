-- ============================================================
-- Fase 1: tipos de justificativa de irregularidade de ponto
-- ============================================================

CREATE TABLE public.justificativas_tipos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  nome text NOT NULL,
  codigo text NOT NULL,
  categoria text NOT NULL CHECK (categoria IN (
    'falta','abono','afastamento','banco_horas','ferias',
    'folga','admissao_desligamento','treinamento','liberacao','fechado','troca'
  )),
  desconta_salario boolean NOT NULL DEFAULT false,
  desconta_dsr boolean NOT NULL DEFAULT false,
  abona_ocorrencia boolean NOT NULL DEFAULT true,
  exige_aprovacao boolean NOT NULL DEFAULT false,
  exige_anexo boolean NOT NULL DEFAULT false,
  exige_observacao boolean NOT NULL DEFAULT false,
  movimenta_banco_horas text NOT NULL DEFAULT 'nenhum' CHECK (movimenta_banco_horas IN ('nenhum','credito','debito')),
  conta_dia_trabalhado boolean NOT NULL DEFAULT false,
  exige_marcacao_ponto boolean NOT NULL DEFAULT false,
  afeta_assiduidade text NOT NULL DEFAULT 'nao' CHECK (afeta_assiduidade IN ('sim','nao','configuravel')),
  pode_aplicar_individual boolean NOT NULL DEFAULT true,
  pode_aplicar_massa boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  padrao_sistema boolean NOT NULL DEFAULT false,
  descricao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, codigo)
);

CREATE INDEX idx_just_tipos_empresa ON public.justificativas_tipos(empresa_id);

ALTER TABLE public.justificativas_tipos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin gerencia justificativas_tipos"
  ON public.justificativas_tipos
  FOR ALL
  USING (empresa_id = get_user_empresa(auth.uid()) AND has_role(auth.uid(), 'admin'))
  WITH CHECK (empresa_id = get_user_empresa(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin/Gerente veem justificativas_tipos"
  ON public.justificativas_tipos
  FOR SELECT
  USING (empresa_id = get_user_empresa(auth.uid())
    AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'gerente')));

CREATE POLICY "Funcionario ve justificativas ativas"
  ON public.justificativas_tipos
  FOR SELECT
  USING (ativo = true AND EXISTS (
    SELECT 1 FROM funcionarios f
    WHERE f.usuario_id = auth.uid() AND f.empresa_id = justificativas_tipos.empresa_id
  ));

-- Bloqueia DELETE de justificativas padrão do sistema
CREATE OR REPLACE FUNCTION public.bloqueia_delete_padrao_sistema()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.padrao_sistema THEN
    RAISE EXCEPTION 'Justificativa padrão do sistema não pode ser removida. Desative-a em vez disso.';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_bloqueia_delete_padrao_sistema
  BEFORE DELETE ON public.justificativas_tipos
  FOR EACH ROW
  EXECUTE FUNCTION public.bloqueia_delete_padrao_sistema();

CREATE TRIGGER trg_just_tipos_updated_at
  BEFORE UPDATE ON public.justificativas_tipos
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- Seed das 20 justificativas padrão para uma empresa
-- ============================================================
CREATE OR REPLACE FUNCTION public.seed_justificativas_padrao(_empresa_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.justificativas_tipos
    (empresa_id, nome, codigo, categoria,
     desconta_salario, desconta_dsr, abona_ocorrencia,
     exige_aprovacao, exige_anexo, exige_observacao,
     movimenta_banco_horas, conta_dia_trabalhado, exige_marcacao_ponto,
     afeta_assiduidade, pode_aplicar_individual, pode_aplicar_massa,
     padrao_sistema, descricao)
  VALUES
    (_empresa_id, 'FALTA INJUSTIF - DESC', 'FALTA_INJUST', 'falta',
     true, true, false, false, false, true, 'nenhum', false, false,
     'sim', true, false, true,
     'Falta injustificada com desconto em folha e perda de DSR.'),
    (_empresa_id, 'ATESTADO MED', 'ATESTADO_MED', 'afastamento',
     false, false, true, false, true, true, 'nenhum', false, false,
     'configuravel', true, false, true,
     'Ausência justificada por atestado médico. Exige anexo.'),
    (_empresa_id, 'AFAST DOENÇA', 'AFAST_DOENCA', 'afastamento',
     false, false, true, true, true, true, 'nenhum', false, false,
     'configuravel', true, false, true,
     'Afastamento por doença. Suspende exigência de ponto no período.'),
    (_empresa_id, 'LIBERAÇÃO DA COMPANHIA', 'LIB_COMPANHIA', 'liberacao',
     false, false, true, false, false, false, 'nenhum', true, false,
     'nao', true, true, true,
     'Funcionário liberado pela empresa. Não gera desconto.'),
    (_empresa_id, 'ABONO', 'ABONO', 'abono',
     false, false, true, true, false, true, 'nenhum', false, false,
     'nao', true, false, true,
     'Abono administrativo de falta, atraso ou saída antecipada.'),
    (_empresa_id, 'TROCA', 'TROCA', 'troca',
     false, false, true, true, false, true, 'nenhum', true, false,
     'nao', true, false, true,
     'Troca de dia ou horário. Vincula ausência a dia compensado.'),
    (_empresa_id, 'ADMISSÃO', 'ADMISSAO', 'admissao_desligamento',
     false, false, true, false, false, false, 'nenhum', false, false,
     'nao', true, false, true,
     'Primeiro dia/período de admissão. Não exige ponto antes da data.'),
    (_empresa_id, 'DESLIGAMENTO', 'DESLIGAMENTO', 'admissao_desligamento',
     false, false, true, false, false, false, 'nenhum', false, false,
     'nao', true, false, true,
     'Encerra ponto após desligamento. Fecha banco de horas.'),
    (_empresa_id, 'FOLGA', 'FOLGA', 'folga',
     false, false, true, false, false, false, 'nenhum', false, false,
     'nao', true, true, true,
     'Dia de descanso autorizado. Não exige ponto.'),
    (_empresa_id, 'INTEGRAÇÃO', 'INTEGRACAO', 'treinamento',
     false, false, true, false, false, false, 'nenhum', true, false,
     'nao', true, true, true,
     'Dia de integração do funcionário.'),
    (_empresa_id, 'TREINAMENTO', 'TREINAMENTO', 'treinamento',
     false, false, true, false, false, false, 'nenhum', true, false,
     'nao', true, true, true,
     'Período de treinamento autorizado.'),
    (_empresa_id, 'DEBITO BC HORA', 'DEBITO_BCO', 'banco_horas',
     false, false, true, false, false, true, 'debito', false, false,
     'configuravel', true, false, true,
     'Lança débito no banco de horas (atraso, saída antecipada).'),
    (_empresa_id, 'CREDITO BC HORA', 'CREDITO_BCO', 'banco_horas',
     false, false, true, true, false, true, 'credito', false, false,
     'nao', true, false, true,
     'Lança crédito no banco de horas (horas trabalhadas além).'),
    (_empresa_id, 'FERIAS NORMAIS', 'FERIAS_NORMAIS', 'ferias',
     false, false, true, false, false, false, 'nenhum', false, false,
     'nao', true, true, true,
     'Período formal de férias.'),
    (_empresa_id, 'FERIAS', 'FERIAS', 'ferias',
     false, false, true, false, false, false, 'nenhum', false, false,
     'nao', true, true, true,
     'Justificativa genérica de férias.'),
    (_empresa_id, 'LIBERACAO SUPERVISAO', 'LIB_SUPERV', 'liberacao',
     false, false, true, true, false, true, 'nenhum', true, false,
     'nao', true, false, true,
     'Liberação autorizada pelo supervisor.'),
    (_empresa_id, 'ABONO SUPERVISAO', 'ABONO_SUPERV', 'abono',
     false, false, true, true, false, true, 'nenhum', false, false,
     'nao', true, false, true,
     'Abono concedido pelo supervisor após irregularidade.'),
    (_empresa_id, 'FERIAS COLETIVAS', 'FERIAS_COLET', 'ferias',
     false, false, true, true, false, false, 'nenhum', false, false,
     'nao', false, true, true,
     'Férias coletivas aplicadas em massa.'),
    (_empresa_id, 'FECHADO', 'FECHADO', 'fechado',
     false, false, true, false, false, false, 'nenhum', false, false,
     'nao', true, true, true,
     'Empresa fechada. Não exige ponto.'),
    (_empresa_id, 'LIBERACAO COLETIVA SUPERV', 'LIB_COLET_SUPERV', 'liberacao',
     false, false, true, true, false, true, 'nenhum', true, false,
     'nao', false, true, true,
     'Liberação coletiva pela supervisão.')
  ON CONFLICT (empresa_id, codigo) DO NOTHING;
END;
$$;

-- Seed para empresas existentes
DO $$
DECLARE
  e RECORD;
BEGIN
  FOR e IN SELECT id FROM public.empresas LOOP
    PERFORM public.seed_justificativas_padrao(e.id);
  END LOOP;
END;
$$;

-- Trigger para novas empresas
CREATE OR REPLACE FUNCTION public.seed_justificativas_apos_empresa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_justificativas_padrao(NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_seed_justificativas_apos_empresa
  AFTER INSERT ON public.empresas
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_justificativas_apos_empresa();