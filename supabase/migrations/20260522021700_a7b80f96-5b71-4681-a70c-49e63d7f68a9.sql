
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS horario_entrada TIME,
  ADD COLUMN IF NOT EXISTS horario_saida TIME,
  ADD COLUMN IF NOT EXISTS intervalo_almoco_min INT DEFAULT 60,
  ADD COLUMN IF NOT EXISTS tolerancia_atraso_min INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS afastado_pode_bater_ponto BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.funcionarios
  ADD COLUMN IF NOT EXISTS jornada_padrao_id UUID,
  ADD COLUMN IF NOT EXISTS observacoes TEXT,
  ADD COLUMN IF NOT EXISTS data_desligamento DATE,
  ADD COLUMN IF NOT EXISTS motivo_desligamento TEXT,
  ADD COLUMN IF NOT EXISTS permite_bater_ponto BOOLEAN NOT NULL DEFAULT true;

-- Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('company-assets','company-assets', true)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('employee-photos','employee-photos', true)
  ON CONFLICT (id) DO NOTHING;

-- Storage RLS: any authenticated user can read (also public read since bucket is public),
-- only admins can write/update/delete.
CREATE POLICY "Admin envia logos da empresa"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'company-assets'
    AND public.has_role(auth.uid(), 'admin')
  );
CREATE POLICY "Admin atualiza logos"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'company-assets'
    AND public.has_role(auth.uid(), 'admin')
  );
CREATE POLICY "Admin remove logos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'company-assets'
    AND public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Admin envia fotos de funcionários"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'employee-photos'
    AND public.has_role(auth.uid(), 'admin')
  );
CREATE POLICY "Admin atualiza fotos"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'employee-photos'
    AND public.has_role(auth.uid(), 'admin')
  );
CREATE POLICY "Admin remove fotos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'employee-photos'
    AND public.has_role(auth.uid(), 'admin')
  );
