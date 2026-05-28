ALTER TABLE public.beneficios_calculos REPLICA IDENTITY FULL;
ALTER TABLE public.beneficios_entregas REPLICA IDENTITY FULL;
ALTER TABLE public.beneficios_ciclos REPLICA IDENTITY FULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='beneficios_ciclos') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.beneficios_ciclos';
  END IF;
END $$;