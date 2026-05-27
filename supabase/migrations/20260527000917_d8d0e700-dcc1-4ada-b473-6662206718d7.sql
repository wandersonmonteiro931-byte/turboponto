INSERT INTO public.holerite_rubricas (
  empresa_id,
  codigo,
  descricao,
  tipo,
  tipo_calculo,
  modo,
  automatico,
  editavel_manual,
  entra_liquido,
  aparece_pdf,
  padrao_sistema,
  ativo,
  soma_descontos
)
SELECT
  e.id,
  '09990',
  'INSUFICIENCIA DE SALDO',
  'informativo',
  'manual',
  'automatico',
  true,
  false,
  false,
  true,
  true,
  true,
  false
FROM public.empresas e
WHERE NOT EXISTS (
  SELECT 1
  FROM public.holerite_rubricas r
  WHERE r.empresa_id = e.id
    AND r.codigo = '09990'
);

INSERT INTO public.holerite_rubricas (
  empresa_id,
  codigo,
  descricao,
  tipo,
  tipo_calculo,
  modo,
  automatico,
  editavel_manual,
  entra_liquido,
  aparece_pdf,
  padrao_sistema,
  ativo,
  soma_descontos
)
SELECT
  e.id,
  '09995',
  'INSUF MES ANTERIOR',
  'desconto',
  'manual',
  'automatico',
  true,
  false,
  true,
  true,
  true,
  true,
  true
FROM public.empresas e
WHERE NOT EXISTS (
  SELECT 1
  FROM public.holerite_rubricas r
  WHERE r.empresa_id = e.id
    AND r.codigo = '09995'
);

UPDATE public.holerite_rubricas
SET codigo = '09990',
    descricao = 'INSUFICIENCIA DE SALDO',
    tipo = 'informativo',
    tipo_calculo = 'manual',
    modo = 'automatico',
    automatico = true,
    editavel_manual = false,
    entra_liquido = false,
    aparece_pdf = true,
    padrao_sistema = true,
    ativo = true,
    soma_descontos = false,
    updated_at = now()
WHERE codigo = '09000'
  AND descricao ILIKE 'INSUFICIENCIA DE SALDO'
  AND NOT EXISTS (
    SELECT 1
    FROM public.holerite_rubricas r2
    WHERE r2.empresa_id = holerite_rubricas.empresa_id
      AND r2.codigo = '09990'
      AND r2.id <> holerite_rubricas.id
  );

UPDATE public.holerite_rubricas
SET codigo = '09995',
    descricao = 'INSUF MES ANTERIOR',
    tipo = 'desconto',
    tipo_calculo = 'manual',
    modo = 'automatico',
    automatico = true,
    editavel_manual = false,
    entra_liquido = true,
    aparece_pdf = true,
    padrao_sistema = true,
    ativo = true,
    soma_descontos = true,
    updated_at = now()
WHERE codigo = '09005'
  AND descricao ILIKE 'INSUF MES ANTERIOR'
  AND NOT EXISTS (
    SELECT 1
    FROM public.holerite_rubricas r2
    WHERE r2.empresa_id = holerite_rubricas.empresa_id
      AND r2.codigo = '09995'
      AND r2.id <> holerite_rubricas.id
  );