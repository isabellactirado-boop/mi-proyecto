-- =====================================================================
-- Base de datos: Pre-ICFES
-- Archivo: database/06_ajustes_dashboard.sql
-- Descripcion: ajustes para que el dashboard de administrador pueda
--              funcionar con datos reales (pagos, reportes y alertas).
-- Orden de ejecucion: ... -> 03_ajustes.sql -> 05_ajuste_puntajes.sql
--                     -> 06_ajustes_dashboard.sql
-- Todo va dentro de una transaccion: si algo falla, no se aplica nada.
-- Se puede correr mas de una vez sin problema.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. PAGOS: agregar Nequi / Daviplata como metodo de pago
-- ---------------------------------------------------------------------
-- El formulario "Registrar Pago Rapido" ofrece Efectivo, Nequi/Daviplata
-- y Transferencia bancaria. Antes el CHECK no aceptaba Nequi/Daviplata.
ALTER TABLE pagos DROP CONSTRAINT IF EXISTS pagos_metodo_pago_check;
ALTER TABLE pagos
    ADD CONSTRAINT pagos_metodo_pago_check
    CHECK (metodo_pago IN ('efectivo', 'nequi_daviplata', 'transferencia',
                           'tarjeta', 'otro'));


-- ---------------------------------------------------------------------
-- 2. PAGOS: comprobante adjunto
-- ---------------------------------------------------------------------
-- Aqui NO se guarda el archivo, solo la ruta o URL donde quedo
-- almacenado (JPG, PNG o PDF). Es opcional: el pago en efectivo
-- puede no tener comprobante.
ALTER TABLE pagos
    ADD COLUMN IF NOT EXISTS comprobante_url VARCHAR(500);


-- ---------------------------------------------------------------------
-- 3. VISTA: cuotas vencidas, ahora con el contacto del acudiente
-- ---------------------------------------------------------------------
-- Es la misma vista de 03_ajustes.sql. Solo se agregan 3 columnas al
-- final (acudiente principal, su telefono y el parentesco) para poder
-- contactar a quien debe. Si el estudiante no tiene acudiente
-- principal marcado, esas columnas salen NULL.
CREATE OR REPLACE VIEW vista_cuotas_vencidas AS
WITH pagado AS (
    SELECT id_inscripcion, SUM(monto_pagado) AS total_pagado
    FROM pagos
    GROUP BY id_inscripcion
),
acumulado AS (
    SELECT
        cu.*,
        SUM(cu.valor) OVER (
            PARTITION BY cu.id_inscripcion
            ORDER BY cu.numero_cuota
        ) AS acumulado_exigible
    FROM cuotas cu
)
SELECT
    i.id_inscripcion,
    e.nombre_completo AS estudiante,
    c.nombre_curso AS curso,
    i.estado,
    a.numero_cuota,
    a.valor,
    a.fecha_vencimiento,
    CURRENT_DATE - a.fecha_vencimiento AS dias_mora,
    LEAST(a.valor, a.acumulado_exigible - COALESCE(p.total_pagado, 0)) AS valor_en_mora,
    ac.nombre_completo AS acudiente_principal,
    ac.telefono        AS telefono_acudiente,
    ea.parentesco      AS parentesco_acudiente
FROM acumulado a
JOIN inscripciones i ON i.id_inscripcion = a.id_inscripcion
JOIN estudiantes   e ON e.id_estudiante  = i.id_estudiante
JOIN cursos        c ON c.id_curso       = i.id_curso
LEFT JOIN pagado   p ON p.id_inscripcion = a.id_inscripcion
LEFT JOIN estudiante_acudiente ea ON ea.id_estudiante = i.id_estudiante
                                 AND ea.es_principal
LEFT JOIN acudientes ac ON ac.id_acudiente = ea.id_acudiente
WHERE a.fecha_vencimiento < CURRENT_DATE
  AND a.acumulado_exigible > COALESCE(p.total_pagado, 0);


-- ---------------------------------------------------------------------
-- 4. VISTA NUEVA: estado de pago por inscripcion (en mora / al dia)
-- ---------------------------------------------------------------------
-- Sirve para el reporte de pagos: el backend filtra con
--   WHERE estado_pago = 'en_mora'   -> pagos atrasados
--   WHERE estado_pago = 'al_dia'    -> personas al dia
-- Solo inscripciones activas.
CREATE OR REPLACE VIEW vista_estado_pagos AS
WITH pagado AS (
    SELECT id_inscripcion, SUM(monto_pagado) AS total_pagado
    FROM pagos
    GROUP BY id_inscripcion
),
mora AS (
    SELECT
        id_inscripcion,
        COUNT(*)           AS cuotas_en_mora,
        SUM(valor_en_mora) AS valor_en_mora,
        MAX(dias_mora)     AS dias_mora_maximo
    FROM vista_cuotas_vencidas
    GROUP BY id_inscripcion
)
SELECT
    i.id_inscripcion,
    e.doc_identidad,
    e.nombre_completo AS estudiante,
    c.nombre_curso    AS curso,
    g.nombre_grupo,
    i.valor_acordado,
    COALESCE(p.total_pagado, 0)                    AS total_pagado,
    i.valor_acordado - COALESCE(p.total_pagado, 0) AS saldo_pendiente,
    COALESCE(m.cuotas_en_mora, 0)                  AS cuotas_en_mora,
    COALESCE(m.valor_en_mora, 0)                   AS valor_en_mora,
    COALESCE(m.dias_mora_maximo, 0)                AS dias_mora_maximo,
    CASE WHEN m.id_inscripcion IS NULL THEN 'al_dia' ELSE 'en_mora' END AS estado_pago,
    ac.nombre_completo AS acudiente_principal,
    ac.telefono        AS telefono_acudiente
FROM inscripciones i
JOIN estudiantes e ON e.id_estudiante = i.id_estudiante
JOIN cursos      c ON c.id_curso      = i.id_curso
LEFT JOIN grupos g ON g.id_grupo      = i.id_grupo
LEFT JOIN pagado p ON p.id_inscripcion = i.id_inscripcion
LEFT JOIN mora   m ON m.id_inscripcion = i.id_inscripcion
LEFT JOIN estudiante_acudiente ea ON ea.id_estudiante = i.id_estudiante
                                 AND ea.es_principal
LEFT JOIN acudientes ac ON ac.id_acudiente = ea.id_acudiente
WHERE i.estado = 'activa';


-- ---------------------------------------------------------------------
-- 5. VISTA NUEVA: estudiantes con 3 o mas inasistencias seguidas
-- ---------------------------------------------------------------------
-- Alimenta la tarjeta "Estudiantes con inasistencias seguidas".
-- Cuenta las clases 'ausente' mas recientes, una tras otra, hasta
-- encontrar una clase en que si asistio (presente, tarde o excusa).
-- Solo cuenta clases que ya tienen asistencia registrada.
-- Para cambiar el minimo, se cambia el 3 del final.
CREATE OR REPLACE VIEW vista_inasistencias_seguidas AS
WITH ordenadas AS (
    SELECT
        a.id_inscripcion,
        cl.fecha_clase,
        a.estado_asistencia,
        ROW_NUMBER() OVER (
            PARTITION BY a.id_inscripcion
            ORDER BY cl.fecha_clase DESC, cl.hora_inicio DESC
        ) AS pos
    FROM asistencias a
    JOIN clases cl ON cl.id_clase = a.id_clase
),
corte AS (
    SELECT id_inscripcion, MIN(pos) AS pos_corte
    FROM ordenadas
    WHERE estado_asistencia <> 'ausente'
    GROUP BY id_inscripcion
),
rachas AS (
    SELECT
        o.id_inscripcion,
        COUNT(*)           AS faltas_seguidas,
        MIN(o.fecha_clase) AS primera_falta,
        MAX(o.fecha_clase) AS ultima_falta
    FROM ordenadas o
    LEFT JOIN corte k ON k.id_inscripcion = o.id_inscripcion
    WHERE o.estado_asistencia = 'ausente'
      AND (k.pos_corte IS NULL OR o.pos < k.pos_corte)
    GROUP BY o.id_inscripcion
)
SELECT
    i.id_inscripcion,
    e.doc_identidad,
    e.nombre_completo AS estudiante,
    c.nombre_curso    AS curso,
    g.nombre_grupo,
    r.faltas_seguidas,
    r.primera_falta,
    r.ultima_falta,
    ac.nombre_completo AS acudiente_principal,
    ac.telefono        AS telefono_acudiente
FROM rachas r
JOIN inscripciones i ON i.id_inscripcion = r.id_inscripcion
JOIN estudiantes   e ON e.id_estudiante  = i.id_estudiante
JOIN cursos        c ON c.id_curso       = i.id_curso
LEFT JOIN grupos   g ON g.id_grupo       = i.id_grupo
LEFT JOIN estudiante_acudiente ea ON ea.id_estudiante = i.id_estudiante
                                 AND ea.es_principal
LEFT JOIN acudientes ac ON ac.id_acudiente = ea.id_acudiente
WHERE i.estado = 'activa'
  AND r.faltas_seguidas >= 3;

COMMIT;
