
-- alteracoes_ponto
CREATE TABLE public.alteracoes_ponto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  registro_ponto_id uuid,
  funcionario_id uuid NOT NULL,
  usuario_editor_id uuid NOT NULL,
  campo_alterado text NOT NULL,
  valor_antigo text,
  valor_novo text,
  justificativa text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_alteracoes_ponto_func ON public.alteracoes_ponto(funcionario_id, created_at DESC);
CREATE INDEX idx_alteracoes_ponto_reg ON public.alteracoes_ponto(registro_ponto_id);
ALTER TABLE public.alteracoes_ponto ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin gerencia alteracoes" ON public.alteracoes_ponto
  FOR ALL USING (empresa_id = get_user_empresa(auth.uid()) AND has_role(auth.uid(), 'admin'))
  WITH CHECK (empresa_id = get_user_empresa(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin/Gerente veem alteracoes" ON public.alteracoes_ponto
  FOR SELECT USING (empresa_id = get_user_empresa(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'gerente')));

CREATE POLICY "Gerente insere alteracoes" ON public.alteracoes_ponto
  FOR INSERT WITH CHECK (empresa_id = get_user_empresa(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'gerente')) AND usuario_editor_id = auth.uid());

-- cartoes_ponto
CREATE TABLE public.cartoes_ponto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  funcionario_id uuid NOT NULL,
  mes_referencia smallint NOT NULL CHECK (mes_referencia BETWEEN 1 AND 12),
  ano_referencia smallint NOT NULL CHECK (ano_referencia BETWEEN 2000 AND 2100),
  total_atraso_minutos integer NOT NULL DEFAULT 0,
  total_faltas integer NOT NULL DEFAULT 0,
  total_horas_trabalhadas_minutos integer NOT NULL DEFAULT 0,
  total_horas_extras_minutos integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','fechado','liberado')),
  pdf_url text,
  liberado_em timestamptz,
  fechado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (funcionario_id, ano_referencia, mes_referencia)
);
ALTER TABLE public.cartoes_ponto ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_cartoes_updated BEFORE UPDATE ON public.cartoes_ponto
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE POLICY "Admin gerencia cartoes" ON public.cartoes_ponto
  FOR ALL USING (empresa_id = get_user_empresa(auth.uid()) AND has_role(auth.uid(), 'admin'))
  WITH CHECK (empresa_id = get_user_empresa(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin/Gerente veem cartoes" ON public.cartoes_ponto
  FOR SELECT USING (empresa_id = get_user_empresa(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'gerente')));

CREATE POLICY "Funcionario ve cartao liberado" ON public.cartoes_ponto
  FOR SELECT USING (
    status = 'liberado' AND EXISTS (
      SELECT 1 FROM funcionarios f
      WHERE f.id = cartoes_ponto.funcionario_id AND f.usuario_id = auth.uid()
    )
  );

-- fechamentos_mensais
CREATE TABLE public.fechamentos_mensais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  mes_referencia smallint NOT NULL CHECK (mes_referencia BETWEEN 1 AND 12),
  ano_referencia smallint NOT NULL CHECK (ano_referencia BETWEEN 2000 AND 2100),
  status text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','em_conferencia','fechado','liberado')),
  fechado_por uuid,
  fechado_em timestamptz,
  liberado_em timestamptz,
  reaberto_por uuid,
  reaberto_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, ano_referencia, mes_referencia)
);
ALTER TABLE public.fechamentos_mensais ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_fech_updated BEFORE UPDATE ON public.fechamentos_mensais
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE POLICY "Admin gerencia fechamentos" ON public.fechamentos_mensais
  FOR ALL USING (empresa_id = get_user_empresa(auth.uid()) AND has_role(auth.uid(), 'admin'))
  WITH CHECK (empresa_id = get_user_empresa(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin/Gerente veem fechamentos" ON public.fechamentos_mensais
  FOR SELECT USING (empresa_id = get_user_empresa(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'gerente')));

CREATE POLICY "Gerente atualiza status conferencia" ON public.fechamentos_mensais
  FOR UPDATE USING (empresa_id = get_user_empresa(auth.uid()) AND has_role(auth.uid(), 'gerente'))
  WITH CHECK (empresa_id = get_user_empresa(auth.uid()) AND has_role(auth.uid(), 'gerente') AND status IN ('aberto','em_conferencia'));

-- Permitir Admin/Gerente atualizar registros_ponto também
CREATE POLICY "Gerente edita registros" ON public.registros_ponto
  FOR UPDATE USING (empresa_id = get_user_empresa(auth.uid()) AND has_role(auth.uid(), 'gerente'))
  WITH CHECK (empresa_id = get_user_empresa(auth.uid()) AND has_role(auth.uid(), 'gerente'));

CREATE POLICY "Gerente insere registros" ON public.registros_ponto
  FOR INSERT WITH CHECK (empresa_id = get_user_empresa(auth.uid()) AND has_role(auth.uid(), 'gerente') AND origem IN ('empresa','sistema'));
