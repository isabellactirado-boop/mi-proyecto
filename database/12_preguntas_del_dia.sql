-- =====================================================================
-- Base de datos: Pre-ICFES
-- Archivo: database/12_preguntas_del_dia.sql
-- Descripcion: guarda la pregunta del reto diario de cada fecha.
--              El servidor la crea sola con la API de Gemini
--              (backend/generador.py); si ese dia no se pudo generar, se
--              guarda una del banco fijo (backend/preguntas_diarias.py).
--              Asi todos los estudiantes ven la misma pregunta ese dia.
-- Orden de ejecucion: ... -> 11_reto_diario.sql -> 12_preguntas_del_dia.sql
-- Todo va dentro de una transaccion: si algo falla, no se aplica nada.
-- Se puede correr mas de una vez sin problema.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS preguntas_del_dia (
    fecha           DATE        PRIMARY KEY,       -- dia del reto (hora de Colombia)
    id_pregunta     VARCHAR(12) NOT NULL,          -- "ia-20261117" o el id del banco ("mat-03")
    area            VARCHAR(30) NOT NULL,
    enunciado       TEXT        NOT NULL,
    opciones        JSONB       NOT NULL,          -- lista de 4 textos
    correcta        SMALLINT    NOT NULL CHECK (correcta BETWEEN 0 AND 3),
    explicacion     TEXT        NOT NULL,
    origen          VARCHAR(10) NOT NULL CHECK (origen IN ('ia', 'banco')),
    creada_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;
