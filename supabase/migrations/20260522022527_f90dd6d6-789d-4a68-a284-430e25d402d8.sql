
CREATE TABLE public.jornadas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  horario_entrada TIME,
  horario_intervalo_saida TIME,
  horario_intervalo_retorno TIME,
  horario_saida TIME,
  carga_horaria_minutos INTEGER NOT NULL DEFAULT 0,
  tolerancia_atraso_minutos INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ativa',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.jornadas_dias (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  jornada_id UUID NOT NULL REFERENCES public.jornadas(id) ON DELETE CASCADE,
  dia_semana SMALLINT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  trabalha BOOLEAN NOT NULL DEFAULT true,
  horario_entrada TIME,
  horario_intervalo_saida TIME,
  horario_intervalo_retorno TIME,
  horario_saida TIME,
  UNIQUE (jornada_id, dia_semana)
);

CREATE TABLE public.funcionarios_jornadas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  funcionario_id UUID NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  jornada_id UUID NOT NULL REFERENCES public.jornadas(id) ON DELETE RESTRICT,
  data_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  data_fim DATE,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_jornadas_empresa ON public.jornadas(empresa_id);
CREATE INDEX idx_jornadas_dias_jornada ON public.jornadas_dias(jornada_id);
CREATE INDEX idx_func_jornadas_func ON public.funcionarios_jornadas(funcionario_id);
CREATE INDEX idx_func_jornadas_jornada ON public.funcionarios_jornadas(jornada_id);
CREATE INDEX idx_func_jornadas_ativo ON public.funcionarios_jornadas(funcionario_id, ativo) WHERE ativo = true;

CREATE TRIGGER trg_jornadas_updated_at
BEFORE UPDATE ON public.jornadas
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.jornadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jornadas_dias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funcionarios_jornadas ENABLE ROW LEVEL SECURITY;

-- jornadas policies
CREATE POLICY "Admin gerencia jornadas" ON public.jornadas FOR ALL
USING (empresa_id = get_user_empresa(auth.uid()) AND has_role(auth.uid(), 'admin'))
WITH CHECK (empresa_id = get_user_empresa(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin/Gerente veem jornadas" ON public.jornadas FOR SELECT
USING (empresa_id = get_user_empresa(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'gerente')));

CREATE POLICY "Funcionario ve sua jornada" ON public.jornadas FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.funcionarios_jornadas fj
  JOIN public.funcionarios f ON f.id = fj.funcionario_id
  WHERE fj.jornada_id = jornadas.id AND f.usuario_id = auth.uid() AND fj.ativo = true
));

-- jornadas_dias policies
CREATE POLICY "Admin gerencia dias jornada" ON public.jornadas_dias FOR ALL
USING (EXISTS (SELECT 1 FROM public.jornadas j WHERE j.id = jornadas_dias.jornada_id AND j.empresa_id = get_user_empresa(auth.uid()) AND has_role(auth.uid(), 'admin')))
WITH CHECK (EXISTS (SELECT 1 FROM public.jornadas j WHERE j.id = jornadas_dias.jornada_id AND j.empresa_id = get_user_empresa(auth.uid()) AND has_role(auth.uid(), 'admin')));

CREATE POLICY "Admin/Gerente veem dias jornada" ON public.jornadas_dias FOR SELECT
USING (EXISTS (SELECT 1 FROM public.jornadas j WHERE j.id = jornadas_dias.jornada_id AND j.empresa_id = get_user_empresa(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'gerente'))));

CREATE POLICY "Funcionario ve dias propria jornada" ON public.jornadas_dias FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.funcionarios_jornadas fj
  JOIN public.funcionarios f ON f.id = fj.funcionario_id
  WHERE fj.jornada_id = jornadas_dias.jornada_id AND f.usuario_id = auth.uid() AND fj.ativo = true
));

-- funcionarios_jornadas policies
CREATE POLICY "Admin gerencia vinculos jornada" ON public.funcionarios_jornadas FOR ALL
USING (EXISTS (SELECT 1 FROM public.funcionarios f WHERE f.id = funcionarios_jornadas.funcionario_id AND f.empresa_id = get_user_empresa(auth.uid()) AND has_role(auth.uid(), 'admin')))
WITH CHECK (EXISTS (SELECT 1 FROM public.funcionarios f WHERE f.id = funcionarios_jornadas.funcionario_id AND f.empresa_id = get_user_empresa(auth.uid()) AND has_role(auth.uid(), 'admin')));

CREATE POLICY "Admin/Gerente veem vinculos jornada" ON public.funcionarios_jornadas FOR SELECT
USING (EXISTS (SELECT 1 FROM public.funcionarios f WHERE f.id = funcionarios_jornadas.funcionario_id AND f.empresa_id = get_user_empresa(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'gerente'))));

CREATE POLICY "Funcionario ve seus vinculos" ON public.funcionarios_jornadas FOR SELECT
USING (EXISTS (SELECT 1 FROM public.funcionarios f WHERE f.id = funcionarios_jornadas.funcionario_id AND f.usuario_id = auth.uid()));
