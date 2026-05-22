ALTER TABLE public.justificativas_aplicadas
  ADD CONSTRAINT justificativas_aplicadas_funcionario_id_fkey
  FOREIGN KEY (funcionario_id) REFERENCES public.funcionarios(id) ON DELETE CASCADE;