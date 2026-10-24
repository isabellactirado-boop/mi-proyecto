-- =====================================================================
-- Base de datos: Pre-ICFES
-- Archivo: database/03_ajustes.sql
-- Descripcion: ajustes posteriores a la reunion con el dueño.
-- Orden de ejecucion: 01_schema.sql -> 02_migration.sql -> 03_ajustes.sql
-- Todo va dentro de una transaccion: si algo falla, no se aplica nada.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0. GUARDIA
-- ---------------------------------------------------------------------
-- Este script cambia la estructura de asistencias (ahora apunta a la
-- tabla clases y se elimina asistio/fecha_clase). Solo es seguro si la
-- tabla aun esta vacia.
-- Solo aplica la primera vez: si la columna asistio ya no existe, el
-- script ya se corrio antes y se puede repetir sin problema.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'asistencias' AND column_name = 'asistio')
       AND EXISTS (SELECT 1 FROM asistencias) THEN
        RAISE EXCEPTION
            'asistencias ya tiene datos. Hay que migrarlas a mano antes de correr 03_ajustes.sql.';
    END IF;
END
$$;


-- ---------------------------------------------------------------------
-- 1. ROLES Y PERMISOS
-- ---------------------------------------------------------------------
-- Propietario + 3 administradores: acceso a todo.
-- Profesor: solo asistencias + consultar puntajes de sus estudiantes
--           asignados (ver seccion 8).

UPDATE permisos SET nombre_permiso = 'acceso_total'
WHERE nombre_permiso = 'access_total';

-- Las inscripciones no se borran: se pasan a 'retirada'.
-- (rol_permiso se limpia solo por ON DELETE CASCADE)
DELETE FROM permisos WHERE nombre_permiso = 'eliminar_inscripciones';

UPDATE roles SET descripcion =
    'Dueño de la empresa. Acceso total al sistema.'
WHERE nombre_rol = 'propietario';

UPDATE roles SET descripcion =
    'Administrador (maximo 3). Acceso total al sistema, igual que el propietario.'
WHERE nombre_rol = 'administrador';

UPDATE roles SET descripcion =
    'Registra y consulta asistencias de sus grupos virtuales y consulta los puntajes de los estudiantes que tiene asignados para seguimiento.'
WHERE nombre_rol = 'profesor';

-- Propietario y administrador: todos los permisos
INSERT INTO rol_permiso (id_rol, id_permiso)
SELECT r.id_rol, p.id_permiso
FROM roles r CROSS JOIN permisos p
WHERE r.nombre_rol IN ('propietario', 'administrador')
ON CONFLICT DO NOTHING;

-- Profesor: se reemplaza lo que tenia por solo lo necesario
DELETE FROM rol_permiso rp
USING roles r
WHERE rp.id_rol = r.id_rol AND r.nombre_rol = 'profesor';

INSERT INTO rol_permiso (id_rol, id_permiso)
SELECT r.id_rol, p.id_permiso
FROM roles r CROSS JOIN permisos p
WHERE r.nombre_rol = 'profesor'
  AND p.nombre_permiso IN (
      'ver_estudiantes',
      'ver_asistencias',
      'crear_asistencias',
      'editar_asistencias',
      'ver_resultados'
  )
ON CONFLICT DO NOTHING;


-- ---------------------------------------------------------------------
-- 2. USUARIOS: un solo rol coherente y limite de cuentas
-- ---------------------------------------------------------------------
-- Se quita 'consultor' (no existe en la tabla roles).
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
ALTER TABLE usuarios
    ADD CONSTRAINT usuarios_rol_check
    CHECK (rol IN ('propietario', 'administrador', 'profesor'));

ALTER TABLE usuarios ALTER COLUMN id_rol SET NOT NULL;

-- rol (texto) e id_rol siempre quedan sincronizados, y se limita a
-- 1 propietario y 3 administradores activos.
CREATE OR REPLACE FUNCTION trg_usuarios_roles()
RETURNS TRIGGER AS $$
DECLARE
    v_max      INTEGER;
    v_actuales INTEGER;
BEGIN
    IF NEW.id_rol IS NULL AND NEW.rol IS NOT NULL THEN
        SELECT id_rol INTO NEW.id_rol FROM roles WHERE nombre_rol = NEW.rol;
    END IF;

    IF NEW.id_rol IS NULL THEN
        RAISE EXCEPTION 'El usuario debe tener un rol valido';
    END IF;

    SELECT nombre_rol INTO NEW.rol FROM roles WHERE id_rol = NEW.id_rol;

    -- El limite solo se revisa al crear o cuando cambia el rol / activo,
    -- para no bloquear cosas como actualizar la ultima sesion.
    IF NEW.activo
       AND NEW.rol IN ('propietario', 'administrador')
       AND (TG_OP = 'INSERT'
            OR OLD.rol    IS DISTINCT FROM NEW.rol
            OR OLD.activo IS DISTINCT FROM NEW.activo) THEN

        v_max := CASE NEW.rol WHEN 'propietario' THEN 1 ELSE 3 END;

        SELECT COUNT(*) INTO v_actuales
        FROM usuarios u
        WHERE u.rol = NEW.rol
          AND u.activo
          AND u.id_usuario <> COALESCE(NEW.id_usuario, -1);

        IF v_actuales >= v_max THEN
            RAISE EXCEPTION 'Ya hay % usuario(s) activo(s) con el rol % (maximo %)',
                v_actuales, NEW.rol, v_max;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_usuarios_roles ON usuarios;
CREATE TRIGGER trg_usuarios_roles
BEFORE INSERT OR UPDATE ON usuarios
FOR EACH ROW EXECUTE FUNCTION trg_usuarios_roles();


-- ---------------------------------------------------------------------
-- 3. ACUDIENTES: el acudiente principal depende de la pareja
-- ---------------------------------------------------------------------
ALTER TABLE acudientes DROP COLUMN IF EXISTS es_principal;

UPDATE estudiante_acudiente SET es_principal = FALSE WHERE es_principal IS NULL;
ALTER TABLE estudiante_acudiente ALTER COLUMN es_principal SET DEFAULT FALSE;
ALTER TABLE estudiante_acudiente ALTER COLUMN es_principal SET NOT NULL;

-- Maximo un acudiente principal por estudiante
CREATE UNIQUE INDEX IF NOT EXISTS ux_estudiante_acudiente_principal
ON estudiante_acudiente (id_estudiante)
WHERE es_principal;


-- ---------------------------------------------------------------------
-- 4. ESTUDIANTES, DOCENTES Y CORREOS
-- ---------------------------------------------------------------------
-- telefono_celular reemplaza a telefono (era un duplicado).
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'estudiantes' AND column_name = 'telefono') THEN
        UPDATE estudiantes
        SET telefono_celular = telefono
        WHERE telefono_celular = 'NO REGISTRADO' AND telefono IS NOT NULL;
    END IF;
END
$$;

ALTER TABLE estudiantes ALTER COLUMN telefono_celular DROP DEFAULT;
ALTER TABLE estudiantes DROP COLUMN IF EXISTS telefono;

-- estado_matricula: solo valores validos
ALTER TABLE estudiantes ALTER COLUMN estado_matricula SET NOT NULL;
ALTER TABLE estudiantes DROP CONSTRAINT IF EXISTS estudiantes_estado_matricula_check;
ALTER TABLE estudiantes
    ADD CONSTRAINT estudiantes_estado_matricula_check
    CHECK (estado_matricula IN ('activo', 'inactivo'));

-- docentes.tipo_documento con los mismos valores que las otras tablas
ALTER TABLE docentes ALTER COLUMN tipo_documento SET NOT NULL;
ALTER TABLE docentes DROP CONSTRAINT IF EXISTS docentes_tipo_documento_check;
ALTER TABLE docentes
    ADD CONSTRAINT docentes_tipo_documento_check
    CHECK (tipo_documento IN ('TI', 'CC', 'CE', 'PPT', 'OTRO'));

-- Indices unicos repetidos (basta el case-insensitive ux_*_ci)
DROP INDEX IF EXISTS idx_estudiantes_correo;
DROP INDEX IF EXISTS idx_acudientes_correo;
DROP INDEX IF EXISTS idx_docentes_correo;
DROP INDEX IF EXISTS idx_usuarios_nombre;


-- ---------------------------------------------------------------------
-- 5. CALENDARIOS, CURSOS Y GRUPOS (quitar datos duplicados)
-- ---------------------------------------------------------------------
-- duracion_dias ahora se calcula sola a partir de las fechas.
ALTER TABLE calendarios DROP COLUMN IF EXISTS duracion_dias;
ALTER TABLE calendarios
    ADD COLUMN duracion_dias INTEGER
    GENERATED ALWAYS AS (fecha_fin - fecha_inicio + 1) STORED;

-- El tipo (A/B/VACACIONAL) ya lo da el calendario del curso.
ALTER TABLE grupos DROP COLUMN IF EXISTS tipo_grupo;

-- La capacidad vive solo en grupos.
ALTER TABLE cursos DROP COLUMN IF EXISTS capacidad_maxima;

ALTER TABLE clases ALTER COLUMN enlace_reunion TYPE VARCHAR(500);


-- ---------------------------------------------------------------------
-- 6. INSCRIPCIONES: el grupo debe ser del mismo curso + capacidad
-- ---------------------------------------------------------------------
ALTER TABLE inscripciones DROP CONSTRAINT IF EXISTS fk_inscripciones_grupo_curso;
ALTER TABLE inscripciones DROP CONSTRAINT IF EXISTS inscripciones_id_grupo_fkey;
ALTER TABLE grupos        DROP CONSTRAINT IF EXISTS uq_grupos_id_grupo_curso;

ALTER TABLE grupos
    ADD CONSTRAINT uq_grupos_id_grupo_curso UNIQUE (id_grupo, id_curso);

-- Si id_grupo es NULL no se valida; si tiene valor, debe ser de ese curso.
ALTER TABLE inscripciones
    ADD CONSTRAINT fk_inscripciones_grupo_curso
    FOREIGN KEY (id_grupo, id_curso) REFERENCES grupos (id_grupo, id_curso);

CREATE OR REPLACE FUNCTION trg_validar_capacidad_grupo()
RETURNS TRIGGER AS $$
DECLARE
    v_capacidad SMALLINT;
    v_ocupados  INTEGER;
BEGIN
    IF NEW.id_grupo IS NOT NULL AND NEW.estado = 'activa' THEN
        SELECT capacidad_maxima INTO v_capacidad
        FROM grupos WHERE id_grupo = NEW.id_grupo;

        SELECT COUNT(*) INTO v_ocupados
        FROM inscripciones i
        WHERE i.id_grupo = NEW.id_grupo
          AND i.estado = 'activa'
          AND i.id_inscripcion <> NEW.id_inscripcion;

        IF v_ocupados >= v_capacidad THEN
            RAISE EXCEPTION 'El grupo % esta lleno (capacidad %)',
                NEW.id_grupo, v_capacidad;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validar_capacidad_grupo ON inscripciones;
CREATE TRIGGER trg_validar_capacidad_grupo
BEFORE INSERT OR UPDATE OF id_grupo, estado ON inscripciones
FOR EACH ROW EXECUTE FUNCTION trg_validar_capacidad_grupo();


-- ---------------------------------------------------------------------
-- 7. ASISTENCIAS: conectar con la tabla clases
-- ---------------------------------------------------------------------
-- Antes apuntaba a clases_horarios (tabla vieja). Ahora cada asistencia
-- es de una clase concreta (grupo + fecha) de la tabla clases.
COMMENT ON TABLE clases_horarios IS
    'OBSOLETA: reemplazada por grupos (horario semanal) y clases (sesiones con fecha).';

ALTER TABLE asistencias DROP CONSTRAINT IF EXISTS asistencias_id_clase_fkey;
ALTER TABLE asistencias
    ADD CONSTRAINT asistencias_id_clase_fkey
    FOREIGN KEY (id_clase) REFERENCES clases (id_clase);

-- La fecha ya esta en clases.fecha_clase; se borra tambien la UNIQUE vieja
ALTER TABLE asistencias DROP COLUMN IF EXISTS fecha_clase;

-- estado_asistencia es ahora la unica fuente de verdad
ALTER TABLE asistencias DROP COLUMN IF EXISTS asistio;

ALTER TABLE asistencias DROP CONSTRAINT IF EXISTS asistencias_estado_asistencia_check;
ALTER TABLE asistencias
    ADD CONSTRAINT asistencias_estado_asistencia_check
    CHECK (estado_asistencia IN ('presente', 'ausente', 'tarde', 'excusa'));

ALTER TABLE asistencias DROP CONSTRAINT IF EXISTS asistencias_inscripcion_clase_key;
ALTER TABLE asistencias
    ADD CONSTRAINT asistencias_inscripcion_clase_key UNIQUE (id_inscripcion, id_clase);

-- La inscripcion debe pertenecer al grupo de la clase
CREATE OR REPLACE FUNCTION trg_validar_asistencia_grupo()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM inscripciones i
        JOIN clases cl ON cl.id_grupo = i.id_grupo
        WHERE i.id_inscripcion = NEW.id_inscripcion
          AND cl.id_clase = NEW.id_clase
    ) THEN
        RAISE EXCEPTION 'La inscripcion % no pertenece al grupo de la clase %',
            NEW.id_inscripcion, NEW.id_clase;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validar_asistencia_grupo ON asistencias;
CREATE TRIGGER trg_validar_asistencia_grupo
BEFORE INSERT OR UPDATE OF id_inscripcion, id_clase ON asistencias
FOR EACH ROW EXECUTE FUNCTION trg_validar_asistencia_grupo();


-- ---------------------------------------------------------------------
-- 8. SEGUIMIENTO DE ESTUDIANTES POR PROFESOR
-- ---------------------------------------------------------------------
-- A cada profesor se le asigna cierta cantidad de estudiantes. Un
-- profesor solo puede consultar los puntajes de los que tiene asignados.
-- Se asigna por inscripcion porque los puntajes son por inscripcion.

CREATE TABLE IF NOT EXISTS seguimiento_docente (
    id_seguimiento    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_docente        INTEGER NOT NULL REFERENCES docentes (id_docente),
    id_inscripcion    INTEGER NOT NULL REFERENCES inscripciones (id_inscripcion),
    fecha_asignacion  DATE    NOT NULL DEFAULT CURRENT_DATE,
    activo            BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (id_docente, id_inscripcion)
);

CREATE INDEX IF NOT EXISTS idx_seguimiento_docente     ON seguimiento_docente (id_docente);
CREATE INDEX IF NOT EXISTS idx_seguimiento_inscripcion ON seguimiento_docente (id_inscripcion);


-- ---------------------------------------------------------------------
-- 9. VISTAS
-- ---------------------------------------------------------------------

-- Saldo: ahora incluye TODAS las inscripciones (activa, retirada,
-- finalizada) para no perder deudas de estudiantes que ya salieron.
-- Mismas columnas y orden de antes; solo se quita el filtro.
CREATE OR REPLACE VIEW vista_saldo_inscripcion AS
SELECT
    i.id_inscripcion,
    e.nombre_completo AS estudiante,
    c.nombre_curso AS curso,
    i.valor_acordado,
    COALESCE(SUM(p.monto_pagado), 0) AS total_pagado,
    i.valor_acordado - COALESCE(SUM(p.monto_pagado), 0) AS saldo_pendiente,
    g.nombre_grupo,
    i.estado
FROM inscripciones i
JOIN estudiantes e ON e.id_estudiante = i.id_estudiante
JOIN cursos c ON c.id_curso = i.id_curso
LEFT JOIN grupos g ON g.id_grupo = i.id_grupo
LEFT JOIN pagos p ON p.id_inscripcion = i.id_inscripcion
GROUP BY
    i.id_inscripcion,
    e.nombre_completo,
    c.nombre_curso,
    i.valor_acordado,
    g.nombre_grupo,
    i.estado;

-- Cuotas en mora. Se compara lo pagado en total contra lo que ya se
-- debia acumulado hasta cada cuota, asi funciona aunque un pago no
-- tenga id_cuota (abono general).
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
    LEAST(a.valor, a.acumulado_exigible - COALESCE(p.total_pagado, 0)) AS valor_en_mora
FROM acumulado a
JOIN inscripciones i ON i.id_inscripcion = a.id_inscripcion
JOIN estudiantes   e ON e.id_estudiante  = i.id_estudiante
JOIN cursos        c ON c.id_curso       = i.id_curso
LEFT JOIN pagado   p ON p.id_inscripcion = a.id_inscripcion
WHERE a.fecha_vencimiento < CURRENT_DATE
  AND a.acumulado_exigible > COALESCE(p.total_pagado, 0);

-- Puntajes que puede consultar cada profesor (solo sus asignados).
-- El backend filtra con: WHERE id_docente = <docente del usuario>
CREATE OR REPLACE VIEW vista_resultados_por_docente AS
SELECT
    sd.id_docente,
    i.id_inscripcion,
    e.nombre_completo AS estudiante,
    c.nombre_curso AS curso,
    s.nombre AS simulacro,
    r.fecha_simulacro,
    r.puntaje_global,
    r.matematicas,
    r.lectura_critica,
    r.sociales_ciudadanas,
    r.ciencias_naturales,
    r.ingles
FROM seguimiento_docente sd
JOIN inscripciones i ON i.id_inscripcion = sd.id_inscripcion
JOIN estudiantes   e ON e.id_estudiante  = i.id_estudiante
JOIN cursos        c ON c.id_curso       = i.id_curso
JOIN resultado_simulacro r ON r.id_inscripcion = i.id_inscripcion
LEFT JOIN simulacros s ON s.id_simulacro = r.id_simulacro
WHERE sd.activo;

COMMIT;
