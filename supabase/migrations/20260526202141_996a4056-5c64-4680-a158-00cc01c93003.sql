
UPDATE public.holerite_rubricas
  SET modo='automatico',
      tipo_calculo='adto_quinzenal_auto',
      automatico=true,
      editavel_manual=true,
      valor_referencia=40
  WHERE codigo='07065';
