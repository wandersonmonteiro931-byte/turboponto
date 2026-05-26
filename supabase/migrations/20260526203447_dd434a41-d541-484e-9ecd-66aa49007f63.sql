
ALTER TABLE public.holerite_rubricas DROP CONSTRAINT IF EXISTS holerite_rubricas_tipo_calculo_check;

UPDATE public.holerite_rubricas
SET modo = 'automatico', automatico = true, tipo_calculo = 'saldo_bh_positivo', editavel_manual = false
WHERE codigo = '28651';

UPDATE public.holerite_rubricas
SET modo = 'automatico', automatico = true, tipo_calculo = 'saldo_bh_negativo', editavel_manual = false
WHERE codigo = '28652';

UPDATE public.holerite_rubricas
SET modo = 'automatico', automatico = true, tipo_calculo = 'qtd_horas_cesta_basica', editavel_manual = false
WHERE codigo = '18445';
