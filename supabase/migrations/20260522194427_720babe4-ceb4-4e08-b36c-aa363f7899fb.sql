UPDATE public.registros_ponto
SET horario_registrado = ((data_referencia::timestamp + horario_programado) AT TIME ZONE 'America/Sao_Paulo')
WHERE observacao = 'Preenchido por ESQUECIMENTO REGIST COLAB'
  AND origem = 'sistema'
  AND horario_programado IS NOT NULL;