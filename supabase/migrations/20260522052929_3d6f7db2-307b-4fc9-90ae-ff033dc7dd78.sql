
CREATE TABLE public.dias_falta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  funcionario_id uuid NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  data date NOT NULL,
  justificativa text,
  marcado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (funcionario_id, data)
);

ALTER TABLE public.dias_falta ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin gerencia dias_falta" ON public.dias_falta
  FOR ALL USING (empresa_id = get_user_empresa(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (empresa_id = get_user_empresa(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin/Gerente veem dias_falta" ON public.dias_falta
  FOR SELECT USING (empresa_id = get_user_empresa(auth.uid()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'gerente'::app_role)));

CREATE POLICY "Gerente marca dias_falta" ON public.dias_falta
  FOR INSERT WITH CHECK (empresa_id = get_user_empresa(auth.uid()) AND has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Gerente atualiza dias_falta" ON public.dias_falta
  FOR UPDATE USING (empresa_id = get_user_empresa(auth.uid()) AND has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Gerente remove dias_falta" ON public.dias_falta
  FOR DELETE USING (empresa_id = get_user_empresa(auth.uid()) AND has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Funcionario ve seus dias_falta" ON public.dias_falta
  FOR SELECT USING (EXISTS (SELECT 1 FROM funcionarios f WHERE f.id = dias_falta.funcionario_id AND f.usuario_id = auth.uid()));
