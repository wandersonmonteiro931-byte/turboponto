
CREATE TABLE public.justificativas_aplicadas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL,
  funcionario_id UUID NOT NULL,
  tipo_id UUID NOT NULL REFERENCES public.justificativas_tipos(id) ON DELETE RESTRICT,
  data DATE NOT NULL,
  data_inicio DATE,
  data_fim DATE,
  observacao TEXT,
  anexo_url TEXT,
  status TEXT NOT NULL DEFAULT 'aprovada',
  aplicado_por UUID NOT NULL,
  aprovado_por UUID,
  aprovado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX justificativas_aplicadas_unica_dia
  ON public.justificativas_aplicadas (funcionario_id, data)
  WHERE status <> 'rejeitada';

CREATE INDEX idx_just_aplic_empresa_data ON public.justificativas_aplicadas (empresa_id, data);
CREATE INDEX idx_just_aplic_func_data ON public.justificativas_aplicadas (funcionario_id, data);

ALTER TABLE public.justificativas_aplicadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin gerencia just_aplicadas"
  ON public.justificativas_aplicadas FOR ALL
  USING (empresa_id = public.get_user_empresa(auth.uid()) AND public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (empresa_id = public.get_user_empresa(auth.uid()) AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin/Gerente veem just_aplicadas"
  ON public.justificativas_aplicadas FOR SELECT
  USING (empresa_id = public.get_user_empresa(auth.uid())
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'gerente'::app_role)));

CREATE POLICY "Gerente insere just_aplicadas"
  ON public.justificativas_aplicadas FOR INSERT
  WITH CHECK (empresa_id = public.get_user_empresa(auth.uid())
    AND public.has_role(auth.uid(), 'gerente'::app_role)
    AND aplicado_por = auth.uid());

CREATE POLICY "Gerente atualiza just_aplicadas"
  ON public.justificativas_aplicadas FOR UPDATE
  USING (empresa_id = public.get_user_empresa(auth.uid()) AND public.has_role(auth.uid(), 'gerente'::app_role))
  WITH CHECK (empresa_id = public.get_user_empresa(auth.uid()) AND public.has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Funcionario ve suas just_aplicadas"
  ON public.justificativas_aplicadas FOR SELECT
  USING (status = 'aprovada' AND EXISTS (
    SELECT 1 FROM public.funcionarios f
    WHERE f.id = justificativas_aplicadas.funcionario_id AND f.usuario_id = auth.uid()
  ));

CREATE TRIGGER touch_just_aplicadas
  BEFORE UPDATE ON public.justificativas_aplicadas
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
