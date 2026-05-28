DROP POLICY IF EXISTS "Funcionario ve ciclos aprovados" ON public.beneficios_ciclos;
CREATE POLICY "Funcionario ve ciclos da empresa"
ON public.beneficios_ciclos FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.funcionarios f
  WHERE f.empresa_id = beneficios_ciclos.empresa_id
    AND f.usuario_id = auth.uid()
));