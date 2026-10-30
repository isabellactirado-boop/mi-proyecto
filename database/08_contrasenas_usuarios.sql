-- =====================================================================
-- Base de datos: Pre-ICFES
-- Archivo: database/08_contrasenas_usuarios.sql
-- Descripcion: marca a los usuarios que deben cambiar su contrasena
--              en el primer ingreso (contrasena temporal asignada por
--              el propietario).
-- Orden de ejecucion: ... -> 07_ajuste_superadmin.sql
--                     -> 08_contrasenas_usuarios.sql
-- IMPORTANTE: correr ANTES de desplegar el backend nuevo.
-- Se puede correr mas de una vez sin problema.
-- =====================================================================

BEGIN;

-- Los usuarios que ya existen quedan en FALSE (no se les obliga a nada).
-- Los usuarios que cree el propietario desde el sistema quedan en TRUE
-- hasta que cambien su contrasena temporal.
ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS debe_cambiar_contrasena BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;
