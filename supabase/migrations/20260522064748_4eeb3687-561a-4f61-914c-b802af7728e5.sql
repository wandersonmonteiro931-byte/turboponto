
-- bucket for attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('justificativas-anexos', 'justificativas-anexos', false)
ON CONFLICT (id) DO NOTHING;

-- read
CREATE POLICY "Admin/Gerente leem anexos justificativas"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'justificativas-anexos'
  AND (storage.foldername(name))[1] = public.get_user_empresa(auth.uid())::text
  AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'gerente'::public.app_role))
);

-- upload
CREATE POLICY "Admin/Gerente upload anexos justificativas"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'justificativas-anexos'
  AND (storage.foldername(name))[1] = public.get_user_empresa(auth.uid())::text
  AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'gerente'::public.app_role))
);

-- delete
CREATE POLICY "Admin remove anexos justificativas"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'justificativas-anexos'
  AND (storage.foldername(name))[1] = public.get_user_empresa(auth.uid())::text
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- index para listagem de pendentes
CREATE INDEX IF NOT EXISTS idx_just_aplicadas_status_empresa
ON public.justificativas_aplicadas(empresa_id, status, data);
