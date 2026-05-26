
-- 1. Drop CHECK antigo de tipo_calculo (se existir) para ampliar opções
ALTER TABLE public.holerite_rubricas DROP CONSTRAINT IF EXISTS holerite_rubricas_tipo_calculo_check;

-- 2. Novos campos
ALTER TABLE public.holerite_rubricas
  ADD COLUMN IF NOT EXISTS modo text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS editavel_manual boolean NOT NULL DEFAULT true;

ALTER TABLE public.holerite_rubricas
  ADD CONSTRAINT holerite_rubricas_modo_check
  CHECK (modo IN ('automatico','semi_automatico','manual'));

ALTER TABLE public.holerite_rubricas
  ADD CONSTRAINT holerite_rubricas_tipo_calculo_check
  CHECK (tipo_calculo IN (
    'manual','valor_fixo','percentual_salario',
    'salario_base','salario_dias_trabalhados',
    'horas_trabalhadas',
    'horas_extras_50','horas_extras_60','horas_extras_70','horas_extras_80','horas_extras_100',
    'dsr_he','adicional_noturno','dsr_adicional_noturno',
    'valor_diario','valor_hora',
    'pct_salario_base','pct_salario_bruto','pct_base_configurada',
    'vt_automatico',
    'inss_automatico','fgts_automatico','irrf_automatico',
    'faltas_auto','atrasos_auto','saida_antecipada_auto',
    'bh_negativo','bh_positivo_pago',
    'adto_quinzenal_auto',
    'cesta_basica_auto','vale_alimentacao_auto','vale_refeicao_auto',
    'salario_familia_auto',
    'relatorio_ponto','resultado_auto',
    'atrasos','faltas_dias','dsr_faltas'
  ));

-- 3. Funcionário: VT mensal concedido
ALTER TABLE public.funcionarios
  ADD COLUMN IF NOT EXISTS vale_transporte_mensal numeric NOT NULL DEFAULT 0;

-- 4. Tabela de tabelas legais (INSS / IRRF / dependentes)
CREATE TABLE IF NOT EXISTS public.holerite_tabelas_legais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid, -- NULL = global do sistema
  vigencia_inicio date NOT NULL,
  inss_faixas jsonb NOT NULL DEFAULT '[]'::jsonb,
  irrf_faixas jsonb NOT NULL DEFAULT '[]'::jsonb,
  irrf_deducao_dependente numeric NOT NULL DEFAULT 0,
  fgts_aliquota numeric NOT NULL DEFAULT 8,
  salario_familia_valor numeric NOT NULL DEFAULT 0,
  salario_familia_teto numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.holerite_tabelas_legais TO authenticated;
GRANT ALL ON public.holerite_tabelas_legais TO service_role;

ALTER TABLE public.holerite_tabelas_legais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos veem tabelas legais"
  ON public.holerite_tabelas_legais FOR SELECT TO authenticated
  USING (empresa_id IS NULL OR empresa_id = public.get_user_empresa(auth.uid()));

CREATE POLICY "Admin gerencia tabelas legais empresa"
  ON public.holerite_tabelas_legais FOR ALL TO authenticated
  USING (empresa_id = public.get_user_empresa(auth.uid()) AND public.has_role(auth.uid(),'admin'))
  WITH CHECK (empresa_id = public.get_user_empresa(auth.uid()) AND public.has_role(auth.uid(),'admin'));

-- Seed tabela INSS/IRRF 2025 (global)
INSERT INTO public.holerite_tabelas_legais
  (empresa_id, vigencia_inicio, inss_faixas, irrf_faixas, irrf_deducao_dependente, fgts_aliquota, salario_familia_valor, salario_familia_teto)
VALUES (
  NULL, '2025-01-01',
  '[
    {"ate": 1518.00, "aliquota": 7.5,  "deducao": 0},
    {"ate": 2793.88, "aliquota": 9.0,  "deducao": 22.77},
    {"ate": 4190.83, "aliquota": 12.0, "deducao": 106.59},
    {"ate": 8157.41, "aliquota": 14.0, "deducao": 190.40}
  ]'::jsonb,
  '[
    {"ate": 2428.80, "aliquota": 0,    "deducao": 0},
    {"ate": 2826.65, "aliquota": 7.5,  "deducao": 182.16},
    {"ate": 3751.05, "aliquota": 15.0, "deducao": 394.16},
    {"ate": 4664.68, "aliquota": 22.5, "deducao": 675.49},
    {"ate": 999999999, "aliquota": 27.5, "deducao": 908.73}
  ]'::jsonb,
  189.59, 8, 65.00, 1906.04
)
ON CONFLICT DO NOTHING;

-- 5. Atualiza seed_rubricas_padrao para marcar modo/tipo_calculo corretos.
-- Usamos UPDATEs aplicáveis a todas as empresas (atualiza tanto padrão futura quanto registros já gerados pelo seed atual).

-- Automáticas
UPDATE public.holerite_rubricas SET modo='automatico', tipo_calculo='salario_dias_trabalhados', automatico=true, editavel_manual=false, depende_ponto=true WHERE codigo='00005' AND padrao_sistema=true;
UPDATE public.holerite_rubricas SET modo='automatico', tipo_calculo='salario_base', automatico=true, editavel_manual=false WHERE codigo='00010' AND padrao_sistema=true;
UPDATE public.holerite_rubricas SET modo='automatico', tipo_calculo='horas_extras_50', automatico=true, editavel_manual=false, depende_ponto=true WHERE codigo='00090' AND padrao_sistema=true;
UPDATE public.holerite_rubricas SET modo='automatico', tipo_calculo='horas_extras_100', automatico=true, editavel_manual=false, depende_ponto=true WHERE codigo='00110' AND padrao_sistema=true;
UPDATE public.holerite_rubricas SET modo='automatico', tipo_calculo='dsr_he', automatico=true, editavel_manual=false WHERE codigo IN ('00115','00120') AND padrao_sistema=true;
UPDATE public.holerite_rubricas SET modo='automatico', tipo_calculo='cesta_basica_auto', automatico=true, editavel_manual=true WHERE codigo='00820' AND padrao_sistema=true;
UPDATE public.holerite_rubricas SET modo='automatico', tipo_calculo='vale_alimentacao_auto', automatico=true, editavel_manual=true WHERE codigo='00800' AND padrao_sistema=true;
UPDATE public.holerite_rubricas SET modo='automatico', tipo_calculo='vale_refeicao_auto', automatico=true, editavel_manual=true WHERE codigo='00805' AND padrao_sistema=true;
UPDATE public.holerite_rubricas SET modo='automatico', tipo_calculo='salario_familia_auto', automatico=true, editavel_manual=false WHERE codigo='00835' AND padrao_sistema=true;
UPDATE public.holerite_rubricas SET modo='automatico', tipo_calculo='inss_automatico', automatico=true, editavel_manual=false WHERE codigo='07000' AND padrao_sistema=true;
UPDATE public.holerite_rubricas SET modo='automatico', tipo_calculo='irrf_automatico', automatico=true, editavel_manual=false WHERE codigo='07005' AND padrao_sistema=true;
UPDATE public.holerite_rubricas SET modo='automatico', tipo_calculo='fgts_automatico', automatico=true, editavel_manual=false WHERE codigo='07010' AND padrao_sistema=true;
UPDATE public.holerite_rubricas SET modo='automatico', tipo_calculo='vt_automatico', automatico=true, editavel_manual=false WHERE codigo='07030' AND padrao_sistema=true;
UPDATE public.holerite_rubricas SET modo='automatico', tipo_calculo='faltas_auto', automatico=true, editavel_manual=false, depende_ponto=true WHERE codigo='07035' AND padrao_sistema=true;
UPDATE public.holerite_rubricas SET modo='automatico', tipo_calculo='atrasos_auto', automatico=true, editavel_manual=false, depende_ponto=true WHERE codigo='07045' AND padrao_sistema=true;
UPDATE public.holerite_rubricas SET modo='automatico', tipo_calculo='saida_antecipada_auto', automatico=true, editavel_manual=false, depende_ponto=true WHERE codigo='07050' AND padrao_sistema=true;
UPDATE public.holerite_rubricas SET modo='automatico', tipo_calculo='bh_negativo', automatico=true, editavel_manual=true, depende_ponto=true WHERE codigo='07060' AND padrao_sistema=true;
UPDATE public.holerite_rubricas SET modo='automatico', tipo_calculo='adto_quinzenal_auto', automatico=true, editavel_manual=true WHERE codigo='07070' AND padrao_sistema=true;
UPDATE public.holerite_rubricas SET modo='automatico', tipo_calculo='bh_positivo_pago', automatico=true, editavel_manual=true WHERE codigo='00135' AND padrao_sistema=true;

-- Manuais explícitas
UPDATE public.holerite_rubricas SET modo='manual', tipo_calculo='manual', automatico=false, editavel_manual=true
  WHERE codigo IN ('00020','00030','00035','00040','00045','00055','00060','00065',
                   '07075','07080','07085','07125','07130','07135',
                   '07900','07905','07910') AND padrao_sistema=true;

-- Recria função seed para já gravar com modo correto em novas empresas.
CREATE OR REPLACE FUNCTION public.atualizar_modo_rubricas_padrao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  -- Após seed_rubricas_padrao popular as rubricas, aplica os UPDATEs de modo/tipo_calculo.
  UPDATE public.holerite_rubricas SET modo='automatico', tipo_calculo='salario_dias_trabalhados', automatico=true, editavel_manual=false, depende_ponto=true WHERE empresa_id=NEW.id AND codigo='00005';
  UPDATE public.holerite_rubricas SET modo='automatico', tipo_calculo='salario_base', automatico=true, editavel_manual=false WHERE empresa_id=NEW.id AND codigo='00010';
  UPDATE public.holerite_rubricas SET modo='automatico', tipo_calculo='horas_extras_50', automatico=true, editavel_manual=false, depende_ponto=true WHERE empresa_id=NEW.id AND codigo='00090';
  UPDATE public.holerite_rubricas SET modo='automatico', tipo_calculo='horas_extras_100', automatico=true, editavel_manual=false, depende_ponto=true WHERE empresa_id=NEW.id AND codigo='00110';
  UPDATE public.holerite_rubricas SET modo='automatico', tipo_calculo='dsr_he', automatico=true, editavel_manual=false WHERE empresa_id=NEW.id AND codigo IN ('00115','00120');
  UPDATE public.holerite_rubricas SET modo='automatico', tipo_calculo='cesta_basica_auto', automatico=true, editavel_manual=true WHERE empresa_id=NEW.id AND codigo='00820';
  UPDATE public.holerite_rubricas SET modo='automatico', tipo_calculo='vale_alimentacao_auto', automatico=true, editavel_manual=true WHERE empresa_id=NEW.id AND codigo='00800';
  UPDATE public.holerite_rubricas SET modo='automatico', tipo_calculo='vale_refeicao_auto', automatico=true, editavel_manual=true WHERE empresa_id=NEW.id AND codigo='00805';
  UPDATE public.holerite_rubricas SET modo='automatico', tipo_calculo='salario_familia_auto', automatico=true, editavel_manual=false WHERE empresa_id=NEW.id AND codigo='00835';
  UPDATE public.holerite_rubricas SET modo='automatico', tipo_calculo='inss_automatico', automatico=true, editavel_manual=false WHERE empresa_id=NEW.id AND codigo='07000';
  UPDATE public.holerite_rubricas SET modo='automatico', tipo_calculo='irrf_automatico', automatico=true, editavel_manual=false WHERE empresa_id=NEW.id AND codigo='07005';
  UPDATE public.holerite_rubricas SET modo='automatico', tipo_calculo='fgts_automatico', automatico=true, editavel_manual=false WHERE empresa_id=NEW.id AND codigo='07010';
  UPDATE public.holerite_rubricas SET modo='automatico', tipo_calculo='vt_automatico', automatico=true, editavel_manual=false WHERE empresa_id=NEW.id AND codigo='07030';
  UPDATE public.holerite_rubricas SET modo='automatico', tipo_calculo='faltas_auto', automatico=true, editavel_manual=false, depende_ponto=true WHERE empresa_id=NEW.id AND codigo='07035';
  UPDATE public.holerite_rubricas SET modo='automatico', tipo_calculo='atrasos_auto', automatico=true, editavel_manual=false, depende_ponto=true WHERE empresa_id=NEW.id AND codigo='07045';
  UPDATE public.holerite_rubricas SET modo='automatico', tipo_calculo='saida_antecipada_auto', automatico=true, editavel_manual=false, depende_ponto=true WHERE empresa_id=NEW.id AND codigo='07050';
  UPDATE public.holerite_rubricas SET modo='automatico', tipo_calculo='bh_negativo', automatico=true, editavel_manual=true, depende_ponto=true WHERE empresa_id=NEW.id AND codigo='07060';
  UPDATE public.holerite_rubricas SET modo='automatico', tipo_calculo='adto_quinzenal_auto', automatico=true, editavel_manual=true WHERE empresa_id=NEW.id AND codigo='07070';
  UPDATE public.holerite_rubricas SET modo='automatico', tipo_calculo='bh_positivo_pago', automatico=true, editavel_manual=true WHERE empresa_id=NEW.id AND codigo='00135';
  UPDATE public.holerite_rubricas SET modo='manual', tipo_calculo='manual', automatico=false, editavel_manual=true
    WHERE empresa_id=NEW.id AND codigo IN ('00020','00030','00035','00040','00045','00055','00060','00065',
                     '07075','07080','07085','07125','07130','07135','07900','07905','07910');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_atualizar_modo_rubricas_apos_empresa ON public.empresas;
CREATE TRIGGER trg_atualizar_modo_rubricas_apos_empresa
AFTER INSERT ON public.empresas
FOR EACH ROW EXECUTE FUNCTION public.atualizar_modo_rubricas_padrao();
