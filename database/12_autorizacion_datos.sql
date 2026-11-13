-- =====================================================================
-- Base de datos: Pre-ICFES
-- Archivo: database/12_autorizacion_datos.sql
-- Descripcion: guarda la prueba de la autorizacion de tratamiento de
--              datos (Ley 1581 de 2012, Decreto 1377 de 2013): cuando se
--              registro y quien la dio (el estudiante o su acudiente si
--              es menor de edad).
-- Orden de ejecucion: ... -> 10_comprobantes_pagos.sql -> 12_autorizacion_datos.sql
--   (el 11_seguridad.sql esta en otra rama; este archivo no depende de el)
-- Todo va dentro de una transaccion y se puede correr mas de una vez.
-- Correrlo ANTES de desplegar el backend que pide la autorizacion.
-- =====================================================================

BEGIN;

ALTER TABLE estudiantes
    ADD COLUMN IF NOT EXISTS autorizacion_datos_fecha TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS autorizacion_datos_por   VARCHAR(12);

ALTER TABLE estudiantes
    DROP CONSTRAINT IF EXISTS chk_autorizacion_datos_por;
ALTER TABLE estudiantes
    ADD CONSTRAINT chk_autorizacion_datos_por
    CHECK (autorizacion_datos_por IS NULL OR autorizacion_datos_por IN ('estudiante', 'acudiente'));

COMMIT;
