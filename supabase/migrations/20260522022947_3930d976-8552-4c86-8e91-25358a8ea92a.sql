
CREATE TABLE public.registros_ponto (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL,
  funcionario_id UUID NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  jornada_id UUID REFERENCES public.jornadas(id) ON DELETE SET NULL,
  data_referencia DATE NOT NULL,
  tipo_ponto TEXT NOT NULL CHECK (tipo_ponto IN ('entrada','saida_intervalo','retorno_intervalo','saida_final')),
  horario_programado TIME,
  horario_registrado TIMESTAMPTZ NOT NULL DEFAULT now(),
  atraso_minutos INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'no_horario' CHECK (status IN ('no_horario','atrasado','fora_do_horario','pendente','corrigido')),
  origem TEXT NOT NULL DEFAULT 'funcionario' CHECK (origem IN ('funcionario','empresa','sistema')),
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reg_empresa_data ON public.registros_ponto(empresa_id, data_referencia DESC);
CREATE INDEX idx_reg_func_data ON public.registros_ponto(funcionario_id, data_referencia DESC);
CREATE UNIQUE INDEX uq_reg_func_data_tipo ON public.registros_ponto(funcionario_id, data_referencia, tipo_ponto)
  WHERE status <> 'corrigido';

ALTER TABLE public.registros_ponto ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin gerencia registros" ON public.registros_ponto FOR ALL
USING (empresa_id = get_user_empresa(auth.uid()) AND has_role(auth.uid(), 'admin'))
WITH CHECK (empresa_id = get_user_empresa(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin/Gerente veem registros" ON public.registros_ponto FOR SELECT
USING (empresa_id = get_user_empresa(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'gerente')));

CREATE POLICY "Funcionario ve seus registros" ON public.registros_ponto FOR SELECT
USING (EXISTS (SELECT 1 FROM public.funcionarios f WHERE f.id = registros_ponto.funcionario_id AND f.usuario_id = auth.uid()));

CREATE POLICY "Funcionario insere proprio registro" ON public.registros_ponto FOR INSERT
WITH CHECK (
  origem = 'funcionario'
  AND EXISTS (
    SELECT 1 FROM public.funcionarios f
    WHERE f.id = registros_ponto.funcionario_id
      AND f.usuario_id = auth.uid()
      AND f.status = 'ativo'
      AND f.permite_bater_ponto = true
      AND f.empresa_id = registros_ponto.empresa_id
  )
);
