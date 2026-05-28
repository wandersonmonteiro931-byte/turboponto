CREATE TABLE public.beneficios_ciclos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  beneficio_id uuid NOT NULL REFERENCES public.beneficios(id) ON DELETE CASCADE,
  mes_referencia smallint NOT NULL,
  ano_referencia smallint NOT NULL,
  status text NOT NULL DEFAULT 'aberto',
  aprovado_em timestamptz,
  aprovado_por uuid,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (beneficio_id, mes_referencia, ano_referencia)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.beneficios_ciclos TO authenticated;
GRANT ALL ON public.beneficios_ciclos TO service_role;

ALTER TABLE public.beneficios_ciclos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin gerencia ciclos beneficio"
ON public.beneficios_ciclos FOR ALL
USING ((empresa_id = get_user_empresa(auth.uid())) AND has_role(auth.uid(), 'admin'::app_role))
WITH CHECK ((empresa_id = get_user_empresa(auth.uid())) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin/Gerente veem ciclos beneficio"
ON public.beneficios_ciclos FOR SELECT
USING ((empresa_id = get_user_empresa(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'gerente'::app_role)));

CREATE POLICY "Funcionario ve ciclos aprovados"
ON public.beneficios_ciclos FOR SELECT
USING (status = 'aprovado' AND EXISTS (
  SELECT 1 FROM funcionarios f
  WHERE f.empresa_id = beneficios_ciclos.empresa_id
    AND f.usuario_id = auth.uid()
));

CREATE INDEX idx_beneficios_ciclos_beneficio ON public.beneficios_ciclos(beneficio_id, ano_referencia DESC, mes_referencia DESC);