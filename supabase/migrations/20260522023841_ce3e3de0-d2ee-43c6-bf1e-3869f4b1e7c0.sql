-- beneficios
CREATE TABLE public.beneficios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'cesta_basica',
  valor_maximo NUMERIC(10,2) NOT NULL DEFAULT 0,
  dia_entrega SMALLINT NOT NULL DEFAULT 5,
  regra_descricao TEXT,
  limite_atraso_minutos INTEGER NOT NULL DEFAULT 120,
  limite_alerta_minutos INTEGER NOT NULL DEFAULT 90,
  status TEXT NOT NULL DEFAULT 'ativo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.beneficios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin gerencia beneficios" ON public.beneficios
  FOR ALL USING (empresa_id = get_user_empresa(auth.uid()) AND has_role(auth.uid(),'admin'))
  WITH CHECK (empresa_id = get_user_empresa(auth.uid()) AND has_role(auth.uid(),'admin'));
CREATE POLICY "Admin/Gerente veem beneficios" ON public.beneficios
  FOR SELECT USING (empresa_id = get_user_empresa(auth.uid()) AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'gerente')));
CREATE POLICY "Funcionario ve beneficios ativos" ON public.beneficios
  FOR SELECT USING (status = 'ativo' AND EXISTS (SELECT 1 FROM funcionarios f WHERE f.usuario_id = auth.uid() AND f.empresa_id = beneficios.empresa_id));

CREATE TRIGGER beneficios_updated BEFORE UPDATE ON public.beneficios
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- beneficios_calculos
CREATE TABLE public.beneficios_calculos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL,
  funcionario_id UUID NOT NULL,
  beneficio_id UUID NOT NULL,
  mes_referencia SMALLINT NOT NULL,
  ano_referencia SMALLINT NOT NULL,
  total_atraso_minutos INTEGER NOT NULL DEFAULT 0,
  dias_com_atraso INTEGER NOT NULL DEFAULT 0,
  faltas_injustificadas INTEGER NOT NULL DEFAULT 0,
  horas_extras_minutos INTEGER NOT NULL DEFAULT 0,
  tem_direito BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'em_calculo',
  motivo_perda TEXT,
  valor_estimado NUMERIC(10,2) NOT NULL DEFAULT 0,
  calculado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  fechado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (funcionario_id, beneficio_id, mes_referencia, ano_referencia)
);
ALTER TABLE public.beneficios_calculos ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_bencalc_emp_mes ON public.beneficios_calculos(empresa_id, ano_referencia, mes_referencia);

CREATE POLICY "Admin gerencia calculos" ON public.beneficios_calculos
  FOR ALL USING (empresa_id = get_user_empresa(auth.uid()) AND has_role(auth.uid(),'admin'))
  WITH CHECK (empresa_id = get_user_empresa(auth.uid()) AND has_role(auth.uid(),'admin'));
CREATE POLICY "Admin/Gerente veem calculos" ON public.beneficios_calculos
  FOR SELECT USING (empresa_id = get_user_empresa(auth.uid()) AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'gerente')));
CREATE POLICY "Gerente insere calculos" ON public.beneficios_calculos
  FOR INSERT WITH CHECK (empresa_id = get_user_empresa(auth.uid()) AND has_role(auth.uid(),'gerente'));
CREATE POLICY "Gerente atualiza calculos" ON public.beneficios_calculos
  FOR UPDATE USING (empresa_id = get_user_empresa(auth.uid()) AND has_role(auth.uid(),'gerente'))
  WITH CHECK (empresa_id = get_user_empresa(auth.uid()) AND has_role(auth.uid(),'gerente'));
CREATE POLICY "Funcionario ve seus calculos" ON public.beneficios_calculos
  FOR SELECT USING (EXISTS (SELECT 1 FROM funcionarios f WHERE f.id = beneficios_calculos.funcionario_id AND f.usuario_id = auth.uid()));

CREATE TRIGGER bencalc_updated BEFORE UPDATE ON public.beneficios_calculos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- beneficios_entregas
CREATE TABLE public.beneficios_entregas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL,
  funcionario_id UUID NOT NULL,
  beneficio_id UUID NOT NULL,
  mes_referencia SMALLINT NOT NULL,
  ano_referencia SMALLINT NOT NULL,
  data_entrega DATE,
  valor_estimado NUMERIC(10,2) NOT NULL DEFAULT 0,
  entregue BOOLEAN NOT NULL DEFAULT false,
  entregue_por UUID,
  observacao TEXT,
  recibo_pdf_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (funcionario_id, beneficio_id, mes_referencia, ano_referencia)
);
ALTER TABLE public.beneficios_entregas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin gerencia entregas" ON public.beneficios_entregas
  FOR ALL USING (empresa_id = get_user_empresa(auth.uid()) AND has_role(auth.uid(),'admin'))
  WITH CHECK (empresa_id = get_user_empresa(auth.uid()) AND has_role(auth.uid(),'admin'));
CREATE POLICY "Admin/Gerente veem entregas" ON public.beneficios_entregas
  FOR SELECT USING (empresa_id = get_user_empresa(auth.uid()) AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'gerente')));
CREATE POLICY "Gerente marca entregas" ON public.beneficios_entregas
  FOR UPDATE USING (empresa_id = get_user_empresa(auth.uid()) AND has_role(auth.uid(),'gerente'))
  WITH CHECK (empresa_id = get_user_empresa(auth.uid()) AND has_role(auth.uid(),'gerente'));
CREATE POLICY "Funcionario ve suas entregas" ON public.beneficios_entregas
  FOR SELECT USING (EXISTS (SELECT 1 FROM funcionarios f WHERE f.id = beneficios_entregas.funcionario_id AND f.usuario_id = auth.uid()));

-- beneficios_logs
CREATE TABLE public.beneficios_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL,
  funcionario_id UUID,
  beneficio_id UUID,
  usuario_id UUID NOT NULL,
  acao TEXT NOT NULL,
  status_anterior TEXT,
  status_novo TEXT,
  justificativa TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.beneficios_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/Gerente veem logs" ON public.beneficios_logs
  FOR SELECT USING (empresa_id = get_user_empresa(auth.uid()) AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'gerente')));
CREATE POLICY "Admin/Gerente inserem logs" ON public.beneficios_logs
  FOR INSERT WITH CHECK (empresa_id = get_user_empresa(auth.uid()) AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'gerente')) AND usuario_id = auth.uid());

-- Cria benefício padrão (Cesta Básica) para empresas que ainda não têm
INSERT INTO public.beneficios (empresa_id, nome, tipo, valor_maximo, dia_entrega, regra_descricao, limite_atraso_minutos, limite_alerta_minutos)
SELECT e.id, 'Cesta Básica por Assiduidade', 'cesta_basica', 300.00, 5,
       'Funcionário tem direito à cesta se não acumular mais de 2 horas (120 min) de atraso no mês. Atraso não é compensável por horas extras.',
       120, 90
FROM public.empresas e
WHERE NOT EXISTS (
  SELECT 1 FROM public.beneficios b WHERE b.empresa_id = e.id AND b.tipo = 'cesta_basica'
);