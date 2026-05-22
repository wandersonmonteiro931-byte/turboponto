
-- Recalcula status considerando dia comercial (entrada noturna pode terminar de madrugada)
WITH calc AS (
  SELECT r.id, r.tipo_ponto,
    COALESCE(j.tolerancia_atraso_minutos, 0) AS tol,
    EXTRACT(EPOCH FROM (
      (r.horario_registrado AT TIME ZONE 'America/Sao_Paulo')::time - r.horario_programado
    ))/60 AS raw_diff_min
  FROM registros_ponto r
  LEFT JOIN jornadas j ON j.id = r.jornada_id
  WHERE r.horario_programado IS NOT NULL AND r.status <> 'corrigido'
),
adj AS (
  SELECT id, tipo_ponto, tol,
    CASE WHEN raw_diff_min < -720 THEN raw_diff_min + 1440
         WHEN raw_diff_min >  720 THEN raw_diff_min - 1440
         ELSE raw_diff_min END AS diff
  FROM calc
),
final AS (
  SELECT id, tipo_ponto, diff, tol,
    CASE
      WHEN ABS(diff) <= tol THEN 'no_horario'
      WHEN tipo_ponto IN ('saida_final','saida_intervalo') AND diff < 0 THEN 'saida_antecipada'
      WHEN tipo_ponto IN ('saida_final','saida_intervalo') AND diff > 0 THEN 'hora_extra'
      WHEN diff < 0 THEN 'entrada_antecipada'
      ELSE 'atrasado'
    END AS new_status,
    CASE
      WHEN ABS(diff) <= tol THEN GREATEST(0, diff)::int
      WHEN tipo_ponto IN ('saida_final','saida_intervalo') AND diff < 0 THEN 0
      WHEN diff < 0 THEN 0
      ELSE diff::int
    END AS new_atraso
  FROM adj
)
UPDATE registros_ponto r
SET status = f.new_status,
    atraso_minutos = f.new_atraso
FROM final f
WHERE r.id = f.id
  AND (r.status IS DISTINCT FROM f.new_status OR r.atraso_minutos IS DISTINCT FROM f.new_atraso);
