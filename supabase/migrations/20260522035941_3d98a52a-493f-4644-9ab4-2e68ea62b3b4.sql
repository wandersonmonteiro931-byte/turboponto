ALTER TABLE public.registros_ponto DROP CONSTRAINT registros_ponto_status_check;
ALTER TABLE public.registros_ponto ADD CONSTRAINT registros_ponto_status_check
  CHECK (status = ANY (ARRAY[
    'no_horario'::text,
    'atrasado'::text,
    'entrada_antecipada'::text,
    'saida_antecipada'::text,
    'hora_extra'::text,
    'fora_do_horario'::text,
    'pendente'::text,
    'corrigido'::text
  ]));