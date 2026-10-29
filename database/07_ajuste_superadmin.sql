-- =====================================================================
-- Base de datos: Pre-ICFES
-- Archivo: database/07_ajuste_superadmin.sql
-- Descripcion: el propietario (dueño) es el superadmin y el UNICO que
--              puede agregar usuarios (profesores y administradores) y
--              manejar sus contrasenas. Ademas se quita el tope de
--              3 administradores.
-- Orden de ejecucion: ... -> 05_ajuste_puntajes.sql
--                     -> 06_ajustes_dashboard.sql -> 07_ajuste_superadmin.sql
-- Todo va dentro de una transaccion: si algo falla, no se aplica nada.
-- Se puede correr mas de una vez sin problema.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. PERMISOS: el administrador ya no gestiona usuarios
-- ---------------------------------------------------------------------
-- El administrador conserva todo lo demas (estudiantes, inscripciones,
-- pagos, asistencias, resultados y reportes). Se le quita
-- 'gestionar_usuarios' y tambien 'acceso_total' para que no tenga un
-- "acceso a todo" que incluya usuarios.
DELETE FROM rol_permiso rp
USING roles r, permisos p
WHERE rp.id_rol     = r.id_rol
  AND rp.id_permiso = p.id_permiso
  AND r.nombre_rol  = 'administrador'
  AND p.nombre_permiso IN ('gestionar_usuarios', 'acceso_total');

-- El propietario mantiene todos los permisos (por si falta alguno).
INSERT INTO rol_permiso (id_rol, id_permiso)
SELECT r.id_rol, p.id_permiso
FROM roles r CROSS JOIN permisos p
WHERE r.nombre_rol = 'propietario'
ON CONFLICT DO NOTHING;

UPDATE roles SET descripcion =
    'Dueño de la empresa (superadmin). Acceso total y es el unico que puede agregar, editar y desactivar usuarios (profesores y administradores) y asignar contrasenas.'
WHERE nombre_rol = 'propietario';

UPDATE roles SET descripcion =
    'Administrador. Gestiona estudiantes, inscripciones, pagos, asistencias, resultados y reportes. No puede gestionar usuarios.'
WHERE nombre_rol = 'administrador';


-- ---------------------------------------------------------------------
-- 2. USUARIOS: se quita el tope de administradores
-- ---------------------------------------------------------------------
-- Antes: 1 propietario y maximo 3 administradores activos.
-- Ahora: sigue habiendo un solo propietario activo (el superadmin),
-- pero puede haber los administradores que se necesiten.
CREATE OR REPLACE FUNCTION trg_usuarios_roles()
RETURNS TRIGGER AS $$
DECLARE
    v_actuales INTEGER;
BEGIN
    IF NEW.id_rol IS NULL AND NEW.rol IS NOT NULL THEN
        SELECT id_rol INTO NEW.id_rol FROM roles WHERE nombre_rol = NEW.rol;
    END IF;

    IF NEW.id_rol IS NULL THEN
        RAISE EXCEPTION 'El usuario debe tener un rol valido';
    END IF;

    -- rol (texto) e id_rol siempre quedan sincronizados
    SELECT nombre_rol INTO NEW.rol FROM roles WHERE id_rol = NEW.id_rol;

    -- Solo puede haber un propietario activo. Se revisa al crear o
    -- cuando cambia el rol / activo, para no bloquear cosas como
    -- actualizar la ultima sesion.
    IF NEW.activo
       AND NEW.rol = 'propietario'
       AND (TG_OP = 'INSERT'
            OR OLD.rol    IS DISTINCT FROM NEW.rol
            OR OLD.activo IS DISTINCT FROM NEW.activo) THEN

        SELECT COUNT(*) INTO v_actuales
        FROM usuarios u
        WHERE u.rol = 'propietario'
          AND u.activo
          AND u.id_usuario <> COALESCE(NEW.id_usuario, -1);

        IF v_actuales >= 1 THEN
            RAISE EXCEPTION 'Ya hay un propietario activo (solo puede haber uno)';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;
