-- =====================================================================
-- Base de datos: Pre-ICFES
-- Archivo: database/13_contrasenas_pruebas.sql
-- Descripcion: deja a TODOS los usuarios (incluido el propietario) con la
--              misma contrasena de pruebas. Solo se guarda el hash bcrypt.
-- SOLO para la rama "pruebas" de Neon. NO correr en production.
-- Se puede correr mas de una vez sin problema.
-- =====================================================================

BEGIN;

UPDATE usuarios
SET contrasena_hash = '$2b$12$Aa0tF8/J4BgKbrYSoHXgveSYPkE/08RQI2TFjMMGTLlucZVOSEXye';

COMMIT;
