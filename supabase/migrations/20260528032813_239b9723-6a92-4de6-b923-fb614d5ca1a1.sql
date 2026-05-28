ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS restringir_ip_ponto boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ips_permitidos text[] NOT NULL DEFAULT '{}'::text[];