
-- Enum de perfis
CREATE TYPE public.app_role AS ENUM ('admin', 'gerente', 'funcionario');

-- Empresas
CREATE TABLE public.empresas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_fantasia TEXT NOT NULL,
  razao_social TEXT,
  cnpj TEXT UNIQUE,
  telefone TEXT,
  email TEXT,
  endereco TEXT,
  logo_url TEXT,
  responsavel TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;

-- Profiles (1:1 com auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  empresa_id UUID REFERENCES public.empresas(id) ON DELETE SET NULL,
  nome TEXT NOT NULL DEFAULT '',
  email TEXT,
  cpf TEXT,
  status TEXT NOT NULL DEFAULT 'ativo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Funcionarios
CREATE TABLE public.funcionarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  cpf TEXT,
  rg TEXT,
  data_nascimento DATE,
  telefone TEXT,
  email TEXT,
  endereco TEXT,
  cargo TEXT,
  salario NUMERIC(12,2),
  data_admissao DATE,
  status TEXT NOT NULL DEFAULT 'ativo',
  foto_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.funcionarios ENABLE ROW LEVEL SECURITY;

-- Security definer: has_role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Get user's empresa_id
CREATE OR REPLACE FUNCTION public.get_user_empresa(_user_id UUID)
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT empresa_id FROM public.profiles WHERE id = _user_id LIMIT 1
$$;

-- Trigger: create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', ''), NEW.email);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_empresas_updated BEFORE UPDATE ON public.empresas
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_funcionarios_updated BEFORE UPDATE ON public.funcionarios
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- RLS POLICIES

-- profiles
CREATE POLICY "Usuário vê seu próprio profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admin/Gerente veem profiles da empresa" ON public.profiles
  FOR SELECT USING (
    empresa_id = public.get_user_empresa(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gerente'))
  );
CREATE POLICY "Usuário atualiza próprio profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admin gerencia profiles da empresa" ON public.profiles
  FOR ALL USING (
    empresa_id = public.get_user_empresa(auth.uid())
    AND public.has_role(auth.uid(),'admin')
  );

-- empresas
CREATE POLICY "Usuário vê sua empresa" ON public.empresas
  FOR SELECT USING (id = public.get_user_empresa(auth.uid()));
CREATE POLICY "Admin gerencia sua empresa" ON public.empresas
  FOR ALL USING (
    id = public.get_user_empresa(auth.uid())
    AND public.has_role(auth.uid(),'admin')
  );
CREATE POLICY "Usuário autenticado pode criar empresa" ON public.empresas
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- user_roles
CREATE POLICY "Usuário vê seus papéis" ON public.user_roles
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admin vê papéis da empresa" ON public.user_roles
  FOR SELECT USING (
    empresa_id = public.get_user_empresa(auth.uid())
    AND public.has_role(auth.uid(),'admin')
  );
CREATE POLICY "Admin gerencia papéis da empresa" ON public.user_roles
  FOR ALL USING (
    empresa_id = public.get_user_empresa(auth.uid())
    AND public.has_role(auth.uid(),'admin')
    AND user_id <> auth.uid()
  );

-- funcionarios
CREATE POLICY "Funcionário vê seu cadastro" ON public.funcionarios
  FOR SELECT USING (usuario_id = auth.uid());
CREATE POLICY "Admin/Gerente veem funcionários da empresa" ON public.funcionarios
  FOR SELECT USING (
    empresa_id = public.get_user_empresa(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gerente'))
  );
CREATE POLICY "Admin gerencia funcionários" ON public.funcionarios
  FOR ALL USING (
    empresa_id = public.get_user_empresa(auth.uid())
    AND public.has_role(auth.uid(),'admin')
  );
