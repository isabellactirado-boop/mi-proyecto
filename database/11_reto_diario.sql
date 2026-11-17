-- =====================================================================
-- Base de datos: Pre-ICFES
-- Archivo: database/11_reto_diario.sql
-- Descripcion: reto diario de la app de estudiantes. Cada estudiante
--              responde UNA pregunta por dia; con los dias seguidos
--              respondidos se calcula su racha.
--              Las preguntas viven en backend/preguntas_diarias.py:
--              aqui solo se guarda que respondio cada quien y cuando.
-- Orden de ejecucion: ... -> 10_comprobantes_pagos.sql -> 11_reto_diario.sql
-- Todo va dentro de una transaccion: si algo falla, no se aplica nada.
-- Se puede correr mas de una vez sin problema.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS respuestas_diarias (
    id_estudiante   INTEGER     NOT NULL
                    REFERENCES estudiantes (id_estudiante) ON DELETE CASCADE,
    fecha           DATE        NOT NULL,          -- dia del reto (hora de Colombia)
    id_pregunta     VARCHAR(12) NOT NULL,          -- "id" de la pregunta en preguntas_diarias.py
    opcion          SMALLINT    NOT NULL CHECK (opcion BETWEEN 0 AND 3),
    correcta        BOOLEAN     NOT NULL,
    respondida_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- una sola respuesta por estudiante y por dia: la primera es la que vale
    PRIMARY KEY (id_estudiante, fecha)
);

COMMIT;
