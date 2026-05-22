-- holerites
CREATE TABLE public.holerites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL,
  funcionario_id UUID NOT NULL,
  mes_referencia SMALLINT NOT NULL,
  ano_referencia SMALLINT NOT NULL,
  pdf_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  liberado BOOLEAN NOT NULL DEFAULT false,
  liberado_por UUID,
  liberado_em TIMESTAMPTZ,
  acessado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (funcionario_id, mes_referencia, ano_referencia)
);
ALTER TABLE public.holerites ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_holerites_emp ON public.holerites(empresa_id, ano_referencia, mes_referencia);

CREATE POLICY "Admin gerencia holerites" ON public.holerites
  FOR ALL USING (empresa_id = get_user_empresa(auth.uid()) AND has_role(auth.uid(),'admin'))
  WITH CHECK (empresa_id = get_user_empresa(auth.uid()) AND has_role(auth.uid(),'admin'));
CREATE POLICY "Admin/Gerente veem holerites" ON public.holerites
  FOR SELECT USING (empresa_id = get_user_empresa(auth.uid()) AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'gerente')));
CREATE POLICY "Gerente edita holerites" ON public.holerites
  FOR UPDATE USING (empresa_id = get_user_empresa(auth.uid()) AND has_role(auth.uid(),'gerente'))
  WITH CHECK (empresa_id = get_user_empresa(auth.uid()) AND has_role(auth.uid(),'gerente'));
CREATE POLICY "Gerente insere holerites" ON public.holerites
  FOR INSERT WITH CHECK (empresa_id = get_user_empresa(auth.uid()) AND has_role(auth.uid(),'gerente'));
CREATE POLICY "Funcionario ve holerite liberado" ON public.holerites
  FOR SELECT USING (
    liberado = true AND EXISTS (
      SELECT 1 FROM funcionarios f
      WHERE f.id = holerites.funcionario_id AND f.usuario_id = auth.uid()
    )
  );
CREATE POLICY "Funcionario marca acessado" ON public.holerites
  FOR UPDATE USING (
    liberado = true AND EXISTS (
      SELECT 1 FROM funcionarios f
      WHERE f.id = holerites.funcionario_id AND f.usuario_id = auth.uid()
    )
  ) WITH CHECK (
    liberado = true AND EXISTS (
      SELECT 1 FROM funcionarios f
      WHERE f.id = holerites.funcionario_id AND f.usuario_id = auth.uid()
    )
  );

CREATE TRIGGER holerites_updated BEFORE UPDATE ON public.holerites
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- avisos
CREATE TABLE public.avisos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL,
  titulo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  tipo_destino TEXT NOT NULL DEFAULT 'todos', -- todos | cargo | individual
  cargo_destino TEXT,
  funcionario_id UUID,
  criado_por UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'ativo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.avisos ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_avisos_emp ON public.avisos(empresa_id, status, created_at DESC);

CREATE POLICY "Admin/Gerente gerenciam avisos" ON public.avisos
  FOR ALL USING (empresa_id = get_user_empresa(auth.uid()) AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'gerente')))
  WITH CHECK (empresa_id = get_user_empresa(auth.uid()) AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'gerente')));
CREATE POLICY "Funcionario ve avisos destinados" ON public.avisos
  FOR SELECT USING (
    status = 'ativo' AND EXISTS (
      SELECT 1 FROM funcionarios f
      WHERE f.usuario_id = auth.uid()
        AND f.empresa_id = avisos.empresa_id
        AND f.status = 'ativo'
        AND (
          avisos.tipo_destino = 'todos'
          OR (avisos.tipo_destino = 'cargo' AND f.cargo = avisos.cargo_destino)
          OR (avisos.tipo_destino = 'individual' AND f.id = avisos.funcionario_id)
        )
    )
  );

CREATE TRIGGER avisos_updated BEFORE UPDATE ON public.avisos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- avisos_leituras
CREATE TABLE public.avisos_leituras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aviso_id UUID NOT NULL,
  funcionario_id UUID NOT NULL,
  lido_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (aviso_id, funcionario_id)
);
ALTER TABLE public.avisos_leituras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/Gerente veem leituras" ON public.avisos_leituras
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM avisos a
    WHERE a.id = avisos_leituras.aviso_id
      AND a.empresa_id = get_user_empresa(auth.uid())
      AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'gerente'))
  ));
CREATE POLICY "Funcionario ve suas leituras" ON public.avisos_leituras
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM funcionarios f
    WHERE f.id = avisos_leituras.funcionario_id AND f.usuario_id = auth.uid()
  ));
CREATE POLICY "Funcionario registra leitura" ON public.avisos_leituras
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM funcionarios f
    WHERE f.id = avisos_leituras.funcionario_id AND f.usuario_id = auth.uid()
  ));

-- Storage bucket para holerites (privado)
INSERT INTO storage.buckets (id, name, public)
VALUES ('holerites', 'holerites', false)
ON CONFLICT (id) DO NOTHING;

-- Path convention: {empresa_id}/{funcionario_id}/{ano}-{mes}.pdf
CREATE POLICY "Empresa gerencia holerites no storage" ON storage.objects
  FOR ALL USING (
    bucket_id = 'holerites'
    AND (storage.foldername(name))[1] = get_user_empresa(auth.uid())::text
    AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'gerente'))
  ) WITH CHECK (
    bucket_id = 'holerites'
    AND (storage.foldername(name))[1] = get_user_empresa(auth.uid())::text
    AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'gerente'))
  );

CREATE POLICY "Funcionario baixa seu holerite" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'holerites'
    AND EXISTS (
      SELECT 1 FROM funcionarios f
      WHERE f.usuario_id = auth.uid()
        AND (storage.foldername(name))[1] = f.empresa_id::text
        AND (storage.foldername(name))[2] = f.id::text
    )
  );