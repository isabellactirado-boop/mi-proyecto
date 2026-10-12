-- =====================================================================
-- MIGRACION PARA PRE-ICFES (OPCIÓN A: mínima y segura)
-- Objetivo: corregir y complementar la estructura actual sin borrar
-- lo que ya existe.
-- NOTA: Todas las clases son VIRTUALES (la empresa es 100% remota)
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0. VALIDACIONES PREVIAS
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM usuarios
        GROUP BY nombre_usuario
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION
            'Hay usuarios duplicados en nombre_usuario. Corrige esos datos antes de continuar.';
    END IF;
END
$$;
-- ---------------------------------------------------------------------
-- 1. TABLAS PARA ROLES Y PERMISOS
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS roles (
    id_rol          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre_rol      VARCHAR(30) NOT NULL UNIQUE,
    descripcion     TEXT,
    activo          BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS permisos (
    id_permiso      INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre_permiso  VARCHAR(60) NOT NULL UNIQUE,
    modulo          VARCHAR(50) NOT NULL,
    accion          VARCHAR(50) NOT NULL,
    descripcion     TEXT
);

CREATE TABLE IF NOT EXISTS rol_permiso (
    id_rol          INTEGER NOT NULL REFERENCES roles(id_rol) ON DELETE CASCADE,
    id_permiso      INTEGER NOT NULL REFERENCES permisos(id_permiso) ON DELETE CASCADE,
    PRIMARY KEY (id_rol, id_permiso)
);

-- Insertar roles base (nota: sintaxis corregida)
INSERT INTO roles (nombre_rol, descripcion)
VALUES
    ('propietario', 'Acceso total al sistema. Puede gestionar usuarios, estudiantes, pagos y resultados.'),
    ('administrador', 'Gestiona estudiantes, pagos, resultados, inscripciones y reportes. No puede gestionar usuarios.'),
    ('profesor', 'Solo puede registrar y consultar asistencias de sus clases virtuales.')
ON CONFLICT (nombre_rol) DO NOTHING;

-- Insertar permisos base
INSERT INTO permisos (nombre_permiso, modulo, accion, descripcion)
VALUES
    ('ver_estudiantes', 'estudiantes', 'lectura', 'Consultar estudiantes'),
    ('crear_estudiantes', 'estudiantes', 'crear', 'Crear estudiantes'),
    ('editar_estudiantes', 'estudiantes', 'editar', 'Editar estudiantes'),
    ('desactivar_estudiantes', 'estudiantes', 'desactivar', 'Desactivar estudiantes'),

    ('ver_asistencias', 'asistencias', 'lectura', 'Consultar asistencias'),
    ('crear_asistencias', 'asistencias', 'crear', 'Registrar asistencias'),
    ('editar_asistencias', 'asistencias', 'editar', 'Editar asistencias'),

    ('ver_pagos', 'pagos', 'lectura', 'Consultar pagos'),
    ('crear_pagos', 'pagos', 'crear', 'Registrar pagos'),
    ('editar_pagos', 'pagos', 'editar', 'Editar pagos'),

    ('ver_resultados', 'resultados', 'lectura', 'Consultar resultados de simulacros'),
    ('crear_resultados', 'resultados', 'crear', 'Registrar resultados de simulacros'),
    ('editar_resultados', 'resultados', 'editar', 'Editar resultados de simulacros'),

    ('ver_inscripciones', 'inscripciones', 'lectura', 'Consultar inscripciones'),
    ('crear_inscripciones', 'inscripciones', 'crear', 'Crear inscripciones'),
    ('editar_inscripciones', 'inscripciones', 'editar', 'Editar inscripciones'),
    ('eliminar_inscripciones', 'inscripciones', 'eliminar', 'Eliminar inscripciones'),

    ('ver_reportes', 'reportes', 'lectura', 'Consultar reportes de desempeño y asistencia'),
    ('gestionar_usuarios', 'usuarios', 'admin', 'Crear, editar y desactivar usuarios del sistema'),
    ('access_total', 'sistema', 'todo', 'Acceso total al sistema')
ON CONFLICT (nombre_permiso) DO NOTHING;

-- Permisos por cada rol
-- PROPIETARIO: acceso total
INSERT INTO rol_permiso (id_rol, id_permiso)
SELECT r.id_rol, p.id_permiso
FROM roles r CROSS JOIN permisos p
WHERE r.nombre_rol = 'propietario'
ON CONFLICT DO NOTHING;

-- ADMINISTRADOR: todo menos gestionar usuarios
INSERT INTO rol_permiso (id_rol, id_permiso)
SELECT r.id_rol, p.id_permiso
FROM roles r CROSS JOIN permisos p
WHERE r.nombre_rol = 'administrador'
  AND p.nombre_permiso NOT IN ('gestionar_usuarios', 'access_total')
ON CONFLICT DO NOTHING;

-- PROFESOR: solo asistencias y consulta
INSERT INTO rol_permiso (id_rol, id_permiso)
SELECT r.id_rol, p.id_permiso
FROM roles r CROSS JOIN permisos p
WHERE r.nombre_rol = 'profesor'
  AND p.nombre_permiso IN (
      'ver_estudiantes',
      'ver_asistencias',
      'crear_asistencias',
      'editar_asistencias',
      'ver_inscripciones',
      'ver_resultados',
      'ver_reportes'
  )
ON CONFLICT DO NOTHING;


-- ---------------------------------------------------------------------
-- 2. TABLAS DE CALENDARIOS
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS calendarios (
    id_calendario     INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre_calendario VARCHAR(60) NOT NULL UNIQUE,
    tipo_calendario   VARCHAR(20) NOT NULL
                      CHECK (tipo_calendario IN ('A', 'B', 'VACACIONAL')),
    descripcion       TEXT,
    duracion_dias     INTEGER NOT NULL CHECK (duracion_dias > 0),
    fecha_inicio      DATE NOT NULL,
    fecha_fin         DATE NOT NULL,
    activo            BOOLEAN NOT NULL DEFAULT TRUE,
    CHECK (fecha_fin >= fecha_inicio)
);

-- ---------------------------------------------------------------------
-- 3. TABLA DE GRUPOS
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS grupos (
    id_grupo          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_curso          INTEGER NOT NULL REFERENCES cursos(id_curso) ON DELETE CASCADE,
    nombre_grupo      VARCHAR(30) NOT NULL,
    tipo_grupo        VARCHAR(20) NOT NULL DEFAULT 'A'
                      CHECK (tipo_grupo IN ('A', 'B', 'VACACIONAL')),
    capacidad_maxima  SMALLINT NOT NULL
                      CHECK (capacidad_maxima BETWEEN 20 AND 150),
    dia_semana        VARCHAR(10) NOT NULL
                      CHECK (dia_semana IN ('lunes','martes','miercoles','jueves',
                                            'viernes','sabado','domingo')),
    hora_inicio       TIME NOT NULL,
    hora_fin          TIME NOT NULL,
    id_docente        INTEGER REFERENCES docentes(id_docente),
    plataforma        VARCHAR(100) DEFAULT 'Google Meet',
    enlace_reunion    VARCHAR(500),
    activo            BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_creacion    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (id_curso, nombre_grupo),
    CHECK (hora_fin > hora_inicio)
);

-- ---------------------------------------------------------------------
-- 4. MODIFICAR TABLA estudiantes
-- ---------------------------------------------------------------------

ALTER TABLE estudiantes
    ADD COLUMN IF NOT EXISTS telefono_celular VARCHAR(20) DEFAULT 'NO REGISTRADO';

UPDATE estudiantes
SET telefono_celular = 'NO REGISTRADO'
WHERE telefono_celular IS NULL;

ALTER TABLE estudiantes
    ADD COLUMN IF NOT EXISTS estado_matricula VARCHAR(20) DEFAULT 'activo';

UPDATE estudiantes
SET estado_matricula = 'activo'
WHERE estado_matricula IS NULL;

ALTER TABLE estudiantes
    ADD COLUMN IF NOT EXISTS fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Hacer que el correo sea único si no lo es ya (case-sensitive original index kept)
CREATE UNIQUE INDEX IF NOT EXISTS idx_estudiantes_correo
ON estudiantes(correo_electronico)
WHERE correo_electronico IS NOT NULL;

ALTER TABLE estudiantes
    ALTER COLUMN telefono_celular SET NOT NULL;

-- ---------------------------------------------------------------------
-- 5. MODIFICAR TABLA acudientes
-- ---------------------------------------------------------------------

ALTER TABLE acudientes
    ADD COLUMN IF NOT EXISTS es_principal BOOLEAN DEFAULT FALSE;

ALTER TABLE acudientes
    ADD COLUMN IF NOT EXISTS fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Hacer que el correo sea único si no lo es ya
CREATE UNIQUE INDEX IF NOT EXISTS idx_acudientes_correo
ON acudientes(correo_electronico)
WHERE correo_electronico IS NOT NULL;

-- ---------------------------------------------------------------------
-- 6. MODIFICAR TABLA estudiante_acudiente
-- ---------------------------------------------------------------------

ALTER TABLE estudiante_acudiente
    ADD COLUMN IF NOT EXISTS es_principal BOOLEAN DEFAULT FALSE;

-- ---------------------------------------------------------------------
-- 7. MODIFICAR TABLA docentes
-- ---------------------------------------------------------------------

ALTER TABLE docentes
    ADD COLUMN IF NOT EXISTS tipo_documento VARCHAR(10) DEFAULT 'CC';

UPDATE docentes
SET tipo_documento = 'CC'
WHERE tipo_documento IS NULL;

ALTER TABLE docentes
    ADD COLUMN IF NOT EXISTS fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Hacer que el correo sea único si no lo es ya
CREATE UNIQUE INDEX IF NOT EXISTS idx_docentes_correo
ON docentes(correo_electronico)
WHERE correo_electronico IS NOT NULL;

-- ---------------------------------------------------------------------
-- 8. MODIFICAR TABLA usuarios
-- ---------------------------------------------------------------------

ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS id_rol INTEGER REFERENCES roles(id_rol);

-- Mapear roles antiguos (texto) a ids reales si existen datos antiguos
UPDATE usuarios u
SET id_rol = (
    SELECT r.id_rol
    FROM roles r
    WHERE r.nombre_rol = u.rol
)
WHERE u.id_rol IS NULL
  AND u.rol IS NOT NULL;

-- Fallback por seguridad: si sigue habiendo usuarios con rol inválido, asignar 'administrador'
UPDATE usuarios
SET rol = 'administrador'
WHERE rol IS NULL OR rol NOT IN ('propietario', 'administrador', 'profesor');

UPDATE usuarios u
SET id_rol = (SELECT r.id_rol FROM roles r WHERE r.nombre_rol = 'administrador')
WHERE u.id_rol IS NULL;

ALTER TABLE usuarios
    DROP CONSTRAINT IF EXISTS usuarios_rol_check;

ALTER TABLE usuarios
    ADD CONSTRAINT usuarios_rol_check
    CHECK (rol IN ('propietario', 'administrador', 'profesor', 'consultor'));

ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT TRUE;

UPDATE usuarios
SET activo = TRUE
WHERE activo IS NULL;

ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS fecha_ultima_sesion TIMESTAMP;

-- Hacer que el nombre de usuario sea único
CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_nombre
ON usuarios(nombre_usuario);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_usuarios_rol ON usuarios(id_rol);
CREATE INDEX IF NOT EXISTS idx_usuarios_activo ON usuarios(activo);

-- ---------------------------------------------------------------------
-- 9. MODIFICAR TABLA cursos
-- ---------------------------------------------------------------------

ALTER TABLE cursos
    ADD COLUMN IF NOT EXISTS id_calendario INTEGER REFERENCES calendarios(id_calendario);

ALTER TABLE cursos
    ADD COLUMN IF NOT EXISTS capacidad_maxima SMALLINT DEFAULT 100;

UPDATE cursos
SET capacidad_maxima = 100
WHERE capacidad_maxima IS NULL;

ALTER TABLE cursos
    ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT TRUE;

UPDATE cursos
SET activo = TRUE
WHERE activo IS NULL;

ALTER TABLE cursos
    ADD COLUMN IF NOT EXISTS fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_cursos_calendario ON cursos(id_calendario);
CREATE INDEX IF NOT EXISTS idx_cursos_activo ON cursos(activo);

-- ---------------------------------------------------------------------
-- 10. MODIFICAR TABLA inscripciones
-- ---------------------------------------------------------------------

ALTER TABLE inscripciones
    ADD COLUMN IF NOT EXISTS id_grupo INTEGER REFERENCES grupos(id_grupo);

ALTER TABLE inscripciones
    ADD COLUMN IF NOT EXISTS fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_inscripciones_grupo ON inscripciones(id_grupo);
CREATE INDEX IF NOT EXISTS idx_inscripciones_estado ON inscripciones(estado);

-- ---------------------------------------------------------------------
-- 11. MODIFICAR TABLA asistencias
-- ---------------------------------------------------------------------

ALTER TABLE asistencias
    ADD COLUMN IF NOT EXISTS estado_asistencia VARCHAR(20);

UPDATE asistencias
SET estado_asistencia = CASE
    WHEN asistio = TRUE THEN 'presente'
    WHEN asistio = FALSE THEN 'ausente'
    ELSE 'no_registrado'
END
WHERE estado_asistencia IS NULL;

ALTER TABLE asistencias
    ALTER COLUMN estado_asistencia SET DEFAULT 'presente';

ALTER TABLE asistencias
    ALTER COLUMN estado_asistencia SET NOT NULL;

ALTER TABLE asistencias
    ADD COLUMN IF NOT EXISTS fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

UPDATE asistencias
SET fecha_registro = CURRENT_TIMESTAMP
WHERE fecha_registro IS NULL;

CREATE INDEX IF NOT EXISTS idx_asistencias_estado
    ON asistencias(estado_asistencia);

CREATE INDEX IF NOT EXISTS idx_asistencias_fecha
    ON asistencias(fecha_registro);

-- ---------------------------------------------------------------------
-- 12. TABLA clases
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS clases (
    id_clase        INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_grupo        INTEGER NOT NULL REFERENCES grupos(id_grupo) ON DELETE CASCADE,
    id_docente      INTEGER NOT NULL REFERENCES docentes(id_docente),
    fecha_clase     DATE NOT NULL,
    hora_inicio     TIME NOT NULL,
    hora_fin        TIME NOT NULL,
    tema            VARCHAR(150),
    plataforma      VARCHAR(100) DEFAULT 'Google Meet',
    enlace_reunion  VARCHAR(255),
    fecha_creacion  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (id_grupo, fecha_clase, hora_inicio),
    CHECK (hora_fin > hora_inicio)
);

CREATE INDEX IF NOT EXISTS idx_clases_grupo ON clases(id_grupo);
CREATE INDEX IF NOT EXISTS idx_clases_fecha ON clases(fecha_clase);

-- ---------------------------------------------------------------------
-- 13. TABLA SIMULACROS
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS simulacros (
    id_simulacro    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre          VARCHAR(100) NOT NULL,
    descripcion     TEXT,
    fecha_simulacro DATE NOT NULL,
    fecha_creacion  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------
-- 14. MODIFICAR TABLA resultado_simulacro
-- ---------------------------------------------------------------------

ALTER TABLE resultado_simulacro
    ADD COLUMN IF NOT EXISTS id_simulacro INTEGER REFERENCES simulacros(id_simulacro);

ALTER TABLE resultado_simulacro
    ADD COLUMN IF NOT EXISTS fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_resultados_inscripcion ON resultado_simulacro(id_inscripcion);
CREATE INDEX IF NOT EXISTS idx_resultados_simulacro ON resultado_simulacro(id_simulacro);
CREATE INDEX IF NOT EXISTS idx_resultados_puntaje ON resultado_simulacro(puntaje_global);

-- ---------------------------------------------------------------------
-- 15. MODIFICAR TABLA PAGOS
-- ---------------------------------------------------------------------

ALTER TABLE pagos
    ADD COLUMN IF NOT EXISTS fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_pagos_fecha ON pagos(fecha_pago);

-- ---------------------------------------------------------------------
-- 15.b ADICIONES (OPCIÓN A): índices case-insensitive y validaciones
-- ---------------------------------------------------------------------

-- Índices únicos case-insensitive para evitar duplicados por mayúsculas/minúsculas
CREATE UNIQUE INDEX IF NOT EXISTS ux_usuarios_nombre_ci
ON usuarios (LOWER(nombre_usuario));

CREATE UNIQUE INDEX IF NOT EXISTS ux_estudiantes_correo_ci
ON estudiantes (LOWER(correo_electronico))
WHERE correo_electronico IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_acudientes_correo_ci
ON acudientes (LOWER(correo_electronico))
WHERE correo_electronico IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_docentes_correo_ci
ON docentes (LOWER(correo_electronico))
WHERE correo_electronico IS NOT NULL;

-- Índices compuestos para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_pagos_inscripcion_fecha
ON pagos (id_inscripcion, fecha_pago);

CREATE INDEX IF NOT EXISTS idx_asistencias_inscripcion_fecha
ON asistencias (id_inscripcion, fecha_clase);

CREATE INDEX IF NOT EXISTS idx_resultado_inscripcion_fecha
ON resultado_simulacro (id_inscripcion, fecha_simulacro);

-- Trigger: validar que la cuota del pago pertenece a la misma inscripción
CREATE OR REPLACE FUNCTION trg_validar_pago_cuota()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.id_cuota IS NOT NULL THEN
        IF EXISTS (
            SELECT 1
            FROM cuotas c
            WHERE c.id_cuota = NEW.id_cuota
              AND c.id_inscripcion <> NEW.id_inscripcion
        ) THEN
            RAISE EXCEPTION 'La cuota % no pertenece a la inscripción %',
                NEW.id_cuota, NEW.id_inscripcion;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validar_pago_cuota ON pagos;

CREATE TRIGGER trg_validar_pago_cuota
BEFORE INSERT OR UPDATE ON pagos
FOR EACH ROW
EXECUTE FUNCTION trg_validar_pago_cuota();

-- ---------------------------------------------------------------------
-- 16. VISTAS IMPORTANTES
-- ---------------------------------------------------------------------

-- Vista: saldo pendiente por inscripción
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
WHERE i.estado = 'activa'
GROUP BY
    i.id_inscripcion,
    e.nombre_completo,
    c.nombre_curso,
    i.valor_acordado,
    g.nombre_grupo,
    i.estado;

-- Vista: asistencia por estudiante
CREATE OR REPLACE VIEW vista_asistencia_por_estudiante AS
SELECT
    i.id_inscripcion,
    e.nombre_completo AS estudiante,
    c.nombre_curso,
    g.nombre_grupo,
    COUNT(a.id_asistencia) AS total_clases,
    SUM(CASE WHEN a.estado_asistencia = 'presente' THEN 1 ELSE 0 END) AS presentes,
    SUM(CASE WHEN a.estado_asistencia = 'ausente' THEN 1 ELSE 0 END) AS ausentes,
    SUM(CASE WHEN a.estado_asistencia = 'tarde' THEN 1 ELSE 0 END) AS tardes,
    SUM(CASE WHEN a.estado_asistencia = 'excusa' THEN 1 ELSE 0 END) AS excusas,
    ROUND(
        (SUM(CASE WHEN a.estado_asistencia = 'presente' THEN 1 ELSE 0 END) * 100.0) /
        NULLIF(COUNT(a.id_asistencia), 0),
        2
    ) AS porcentaje_asistencia
FROM inscripciones i
JOIN estudiantes e ON e.id_estudiante = i.id_estudiante
JOIN cursos c ON c.id_curso = i.id_curso
LEFT JOIN grupos g ON g.id_grupo = i.id_grupo
LEFT JOIN asistencias a ON a.id_inscripcion = i.id_inscripcion
WHERE i.estado = 'activa'
GROUP BY i.id_inscripcion, e.nombre_completo, c.nombre_curso, g.nombre_grupo;

-- Vista: desempeño por estudiante (promedio de simulacros)
CREATE OR REPLACE VIEW vista_desempeno_estudiante AS
SELECT
    i.id_inscripcion,
    e.nombre_completo AS estudiante,
    c.nombre_curso,
    g.nombre_grupo,
    COUNT(r.id_resultado) AS total_simulacros,
    ROUND(AVG(r.puntaje_global), 2) AS promedio_global,
    ROUND(AVG(r.lectura_critica), 2) AS promedio_lectura_critica,
    ROUND(AVG(r.matematicas), 2) AS promedio_matematicas,
    ROUND(AVG(r.ingles), 2) AS promedio_ingles,
    ROUND(AVG(r.ciencias_naturales), 2) AS promedio_ciencias_naturales,
    ROUND(AVG(r.sociales_ciudadanas), 2) AS promedio_sociales_ciudadanas,
    MAX(r.puntaje_global) AS mejor_puntaje,
    MIN(r.puntaje_global) AS peor_puntaje
FROM inscripciones i
JOIN estudiantes e ON e.id_estudiante = i.id_estudiante
JOIN cursos c ON c.id_curso = i.id_curso
LEFT JOIN grupos g ON g.id_grupo = i.id_grupo
LEFT JOIN resultado_simulacro r ON r.id_inscripcion = i.id_inscripcion
WHERE i.estado = 'activa'
GROUP BY i.id_inscripcion, e.nombre_completo, c.nombre_curso, g.nombre_grupo;

-- Vista: usuarios activos del sistema
CREATE OR REPLACE VIEW vista_usuarios_activos AS
SELECT
    u.id_usuario,
    u.nombre_usuario,
    r.nombre_rol,
    d.nombre_completo AS docente,
    u.activo,
    u.fecha_creacion,
    u.fecha_ultima_sesion
FROM usuarios u
JOIN roles r ON r.id_rol = u.id_rol
LEFT JOIN docentes d ON d.id_docente = u.id_docente
WHERE u.activo = TRUE
ORDER BY u.nombre_usuario;

COMMIT;