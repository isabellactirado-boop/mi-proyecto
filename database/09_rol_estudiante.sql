-- =====================================================================
-- Base de datos: Pre-ICFES
-- Archivo: database/09_rol_estudiante.sql
-- Descripcion: agrega el rol 'estudiante' (acceso solo a la app movil para
--              ver sus clases, asistencia y resultados) y liga cada usuario
--              estudiante con su ficha en la tabla estudiantes.
-- Orden de ejecucion: ... -> 07_ajuste_superadmin.sql
--                     -> 08_contrasenas_usuarios.sql -> 09_rol_estudiante.sql
-- Todo va dentro de una transaccion: si algo falla, no se aplica nada.
-- Se puede correr mas de una vez sin problema.
-- =====================================================================

BEGIN;

-- 1. Rol nuevo
INSERT INTO roles (nombre_rol, descripcion)
VALUES ('estudiante',
        'Estudiante. Solo entra a la app movil para ver sus clases, asistencia y resultados.')
ON CONFLICT (nombre_rol) DO NOTHING;

-- 2. Liga del usuario con su ficha de estudiante (una cuenta por estudiante)
ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS id_estudiante INTEGER UNIQUE
    REFERENCES estudiantes (id_estudiante);

-- 3. Roles permitidos
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
ALTER TABLE usuarios
    ADD CONSTRAINT usuarios_rol_check
    CHECK (rol IN ('propietario', 'administrador', 'profesor', 'estudiante'));

-- 4. Un usuario estudiante siempre apunta a su ficha, y solo el estudiante la tiene
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_estudiante_check;
ALTER TABLE usuarios
    ADD CONSTRAINT usuarios_estudiante_check
    CHECK ((rol = 'estudiante') = (id_estudiante IS NOT NULL));

COMMIT;
