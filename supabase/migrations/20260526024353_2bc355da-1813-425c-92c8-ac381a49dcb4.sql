UPDATE public.jornadas_dias jd
SET horario_intervalo_saida = '21:30:00',
    horario_intervalo_retorno = '22:00:00'
FROM public.jornadas j
WHERE jd.jornada_id = j.id
  AND j.codigo = 'SMN'
  AND jd.trabalha = true;