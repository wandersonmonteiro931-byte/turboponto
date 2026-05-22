
CREATE OR REPLACE FUNCTION public.criar_empresa_inicial(
  _nome_fantasia TEXT,
  _razao_social TEXT,
  _cnpj TEXT,
  _telefone TEXT,
  _email TEXT,
  _endereco TEXT,
  _responsavel TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_empresa_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT empresa_id INTO v_empresa_id FROM public.profiles WHERE id = v_uid;
  IF v_empresa_id IS NOT NULL THEN
    RETURN v_empresa_id;
  END IF;

  INSERT INTO public.empresas (nome_fantasia, razao_social, cnpj, telefone, email, endereco, responsavel)
  VALUES (_nome_fantasia, _razao_social, _cnpj, _telefone, _email, _endereco, _responsavel)
  RETURNING id INTO v_empresa_id;

  UPDATE public.profiles SET empresa_id = v_empresa_id WHERE id = v_uid;

  INSERT INTO public.user_roles (user_id, empresa_id, role)
  VALUES (v_uid, v_empresa_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN v_empresa_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.criar_empresa_inicial(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.criar_empresa_inicial(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO authenticated;
