DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'registros_ponto','dias_falta','justificativas_aplicadas',
    'banco_horas_movimentos','jornadas_dias','funcionarios',
    'beneficios','beneficios_calculos','beneficios_entregas'
  ] LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN undefined_table THEN NULL;
    END;
  END LOOP;
END $$;