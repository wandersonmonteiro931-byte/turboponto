ALTER TABLE public.funcionarios
  ADD COLUMN IF NOT EXISTS banco_agencia text,
  ADD COLUMN IF NOT EXISTS conta text,
  ADD COLUMN IF NOT EXISTS lotacao text,
  ADD COLUMN IF NOT EXISTS num_dep_irrf integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS num_dep_sal_fam integer NOT NULL DEFAULT 0;