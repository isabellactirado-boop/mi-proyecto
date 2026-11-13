-- =====================================================================
-- Base de datos: Pre-ICFES
-- Archivo: database/11_usuario_danis_prueba.sql
-- Descripcion: usuario de PRUEBA "Danis" (contrasena 123) con rol
--              propietario, que puede entrar a todos los paneles
--              (administrador y profesor).
-- Orden de ejecucion: ... -> 10_comprobantes_pagos.sql
--                     -> 11_usuario_danis_prueba.sql
-- SOLO para la rama pruebas de Neon. NO correr en production: la
-- contrasena 123 es insegura.
-- Se puede correr mas de una vez sin problema.
-- =====================================================================

BEGIN;

-- Solo puede haber un propietario activo: se desactivan los demas
-- propietarios (por ejemplo dueno_prueba) para que Danis ocupe ese lugar.
UPDATE usuarios
SET activo = FALSE
WHERE rol = 'propietario'
  AND activo = TRUE
  AND lower(nombre_usuario) <> 'danis';

-- Si Danis ya existe, solo se le restablece la contrasena.
UPDATE usuarios
SET contrasena_hash = '$2b$12$uKx91VdgUwPzUlkY8/8Hs.tBjzF1X.0sB/.oigw3e5FhqaHl9W/8W',
    rol = 'propietario',
    activo = TRUE,
    debe_cambiar_contrasena = FALSE
WHERE lower(nombre_usuario) = 'danis';

-- Si no existe, se crea (el trigger sincroniza id_rol).
INSERT INTO usuarios (nombre_usuario, contrasena_hash, rol, activo, debe_cambiar_contrasena)
SELECT 'Danis',
       '$2b$12$uKx91VdgUwPzUlkY8/8Hs.tBjzF1X.0sB/.oigw3e5FhqaHl9W/8W',
       'propietario',
       TRUE,
       FALSE
WHERE NOT EXISTS (
    SELECT 1 FROM usuarios WHERE lower(nombre_usuario) = 'danis'
);

COMMIT;
