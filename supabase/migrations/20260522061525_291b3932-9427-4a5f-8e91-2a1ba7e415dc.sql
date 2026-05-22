-- Corrige registros antigos: ponto batido entre 00:00 e 05:59
-- deve pertencer ao dia comercial anterior (jornada noturna).
UPDATE public.registros_ponto
SET data_referencia = data_referencia - INTERVAL '1 day'
WHERE EXTRACT(HOUR FROM (horario_registrado AT TIME ZONE 'America/Sao_Paulo')) < 6
  AND data_referencia = (horario_registrado AT TIME ZONE 'America/Sao_Paulo')::date;