DROP POLICY IF EXISTS "Funcionario ve suas just_aplicadas" ON public.justificativas_aplicadas;
CREATE POLICY "Funcionario ve suas just_aplicadas"
ON public.justificativas_aplicadas
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM funcionarios f
  WHERE f.id = justificativas_aplicadas.funcionario_id
    AND f.usuario_id = auth.uid()
));