ALTER TABLE public.holerites
  ADD CONSTRAINT holerites_funcionario_fk FOREIGN KEY (funcionario_id) REFERENCES public.funcionarios(id) ON DELETE CASCADE;

ALTER TABLE public.beneficios_calculos
  ADD CONSTRAINT bencalc_funcionario_fk FOREIGN KEY (funcionario_id) REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  ADD CONSTRAINT bencalc_beneficio_fk FOREIGN KEY (beneficio_id) REFERENCES public.beneficios(id) ON DELETE CASCADE;

ALTER TABLE public.beneficios_entregas
  ADD CONSTRAINT benent_funcionario_fk FOREIGN KEY (funcionario_id) REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  ADD CONSTRAINT benent_beneficio_fk FOREIGN KEY (beneficio_id) REFERENCES public.beneficios(id) ON DELETE CASCADE;

ALTER TABLE public.avisos
  ADD CONSTRAINT avisos_funcionario_fk FOREIGN KEY (funcionario_id) REFERENCES public.funcionarios(id) ON DELETE CASCADE;

ALTER TABLE public.avisos_leituras
  ADD CONSTRAINT avleit_aviso_fk FOREIGN KEY (aviso_id) REFERENCES public.avisos(id) ON DELETE CASCADE,
  ADD CONSTRAINT avleit_funcionario_fk FOREIGN KEY (funcionario_id) REFERENCES public.funcionarios(id) ON DELETE CASCADE;