-- =====================================================================
-- Base de datos: Pre-ICFES
-- Motor: PostgreSQL
-- Archivo: database/01_schema.sql
-- Descripcion: creacion de tablas, restricciones, indices y una vista
-- Orden: las tablas se crean de las "independientes" a las que dependen
--        de otras (por las llaves foraneas).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. PERSONAS: estudiantes, acudientes y docentes
-- ---------------------------------------------------------------------

CREATE TABLE estudiantes (
    id_estudiante       INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tipo_documento      VARCHAR(10)  NOT NULL
                        CHECK (tipo_documento IN ('TI', 'CC', 'CE', 'PPT', 'OTRO')),
    doc_identidad       VARCHAR(20)  NOT NULL UNIQUE,
    nombre_completo     VARCHAR(120) NOT NULL,
    fecha_nacimiento    DATE         NOT NULL,
    direccion           VARCHAR(150),
    telefono            VARCHAR(20),
    correo_electronico  VARCHAR(100)
);

CREATE TABLE acudientes (
    id_acudiente        INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tipo_documento      VARCHAR(10)  NOT NULL
                        CHECK (tipo_documento IN ('TI', 'CC', 'CE', 'PPT', 'OTRO')),
    doc_identidad       VARCHAR(20)  NOT NULL UNIQUE,
    nombre_completo     VARCHAR(120) NOT NULL,
    telefono            VARCHAR(20)  NOT NULL,
    correo_electronico  VARCHAR(100),
    direccion           VARCHAR(150)
);

-- Relacion muchos a muchos: un estudiante puede tener varios acudientes
-- y un acudiente puede responder por varios estudiantes (ej. hermanos).
-- El parentesco va aqui porque depende de la pareja estudiante-acudiente.
CREATE TABLE estudiante_acudiente (
    id_estudiante  INTEGER     NOT NULL
                   REFERENCES estudiantes (id_estudiante) ON DELETE CASCADE,
    id_acudiente   INTEGER     NOT NULL
                   REFERENCES acudientes (id_acudiente) ON DELETE CASCADE,
    parentesco     VARCHAR(30) NOT NULL,
    PRIMARY KEY (id_estudiante, id_acudiente)
);

CREATE TABLE docentes (
    id_docente          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre_completo     VARCHAR(120) NOT NULL,
    doc_identidad       VARCHAR(20)  NOT NULL UNIQUE,
    especialidad        VARCHAR(80),
    telefono            VARCHAR(20),
    correo_electronico  VARCHAR(100)
);


-- ---------------------------------------------------------------------
-- 2. USUARIOS DEL SISTEMA (administrador y profesores)
-- ---------------------------------------------------------------------
-- Nunca se guarda la contrasena en texto plano: solo su hash.
-- Un usuario con rol 'profesor' debe estar ligado a un docente.

CREATE TABLE usuarios (
    id_usuario       INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre_usuario   VARCHAR(50)  NOT NULL UNIQUE,
    contrasena_hash  VARCHAR(255) NOT NULL,
    rol              VARCHAR(15)  NOT NULL
                     CHECK (rol IN ('administrador', 'profesor')),
    id_docente       INTEGER UNIQUE REFERENCES docentes (id_docente),
    activo           BOOLEAN NOT NULL DEFAULT TRUE,
    CHECK (rol <> 'profesor' OR id_docente IS NOT NULL)
);


-- ---------------------------------------------------------------------
-- 3. CURSOS Y HORARIOS
-- ---------------------------------------------------------------------

CREATE TABLE cursos (
    id_curso      INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre_curso  VARCHAR(100)  NOT NULL,
    descripcion   TEXT,
    fecha_inicio  DATE          NOT NULL,
    fecha_fin     DATE          NOT NULL,
    valor_total   NUMERIC(12,2) NOT NULL CHECK (valor_total >= 0),
    CHECK (fecha_fin >= fecha_inicio)
);

CREATE TABLE clases_horarios (
    id_clase     INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_curso     INTEGER     NOT NULL REFERENCES cursos (id_curso),
    id_docente   INTEGER     NOT NULL REFERENCES docentes (id_docente),
    dia_semana   VARCHAR(10) NOT NULL
                 CHECK (dia_semana IN ('lunes', 'martes', 'miercoles', 'jueves',
                                       'viernes', 'sabado', 'domingo')),
    hora_inicio  TIME        NOT NULL,
    hora_fin     TIME        NOT NULL,
    aula         VARCHAR(30),
    CHECK (hora_fin > hora_inicio)
);


-- ---------------------------------------------------------------------
-- 4. INSCRIPCIONES (une estudiantes con cursos)
-- ---------------------------------------------------------------------
-- valor_acordado: lo que realmente debe pagar el estudiante (puede ser
--   distinto de cursos.valor_total si hay descuento o cambio de precio).
-- modalidad_pago: 'unico' = 1 sola cuota; 'cuotas' = 2 o mas.
-- No se borran inscripciones: si el estudiante se va, estado = 'retirada'.

CREATE TABLE inscripciones (
    id_inscripcion     INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_estudiante      INTEGER       NOT NULL REFERENCES estudiantes (id_estudiante),
    id_curso           INTEGER       NOT NULL REFERENCES cursos (id_curso),
    fecha_inscripcion  DATE          NOT NULL DEFAULT CURRENT_DATE,
    estado             VARCHAR(15)   NOT NULL DEFAULT 'activa'
                       CHECK (estado IN ('activa', 'retirada', 'finalizada')),
    valor_acordado     NUMERIC(12,2) NOT NULL CHECK (valor_acordado >= 0),
    modalidad_pago     VARCHAR(10)   NOT NULL
                       CHECK (modalidad_pago IN ('unico', 'cuotas')),
    numero_cuotas      SMALLINT      NOT NULL DEFAULT 1,
    UNIQUE (id_estudiante, id_curso),
    CHECK (   (modalidad_pago = 'unico'  AND numero_cuotas = 1)
           OR (modalidad_pago = 'cuotas' AND numero_cuotas >= 2))
);


-- ---------------------------------------------------------------------
-- 5. PAGOS: plan de cuotas y pagos realizados
-- ---------------------------------------------------------------------
-- cuotas: lo que se DEBE pagar y cuando (el plan).
--   Si la modalidad es 'unico', se registra una sola cuota (numero 1).
-- pagos: lo que se PAGO realmente. id_cuota es opcional por si se hace
--   un abono que no corresponde a una cuota especifica.

CREATE TABLE cuotas (
    id_cuota           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_inscripcion     INTEGER       NOT NULL REFERENCES inscripciones (id_inscripcion),
    numero_cuota       SMALLINT      NOT NULL CHECK (numero_cuota >= 1),
    valor              NUMERIC(12,2) NOT NULL CHECK (valor > 0),
    fecha_vencimiento  DATE          NOT NULL,
    UNIQUE (id_inscripcion, numero_cuota)
);

CREATE TABLE pagos (
    id_pago         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_inscripcion  INTEGER       NOT NULL REFERENCES inscripciones (id_inscripcion),
    id_cuota        INTEGER       REFERENCES cuotas (id_cuota),
    fecha_pago      DATE          NOT NULL DEFAULT CURRENT_DATE,
    monto_pagado    NUMERIC(12,2) NOT NULL CHECK (monto_pagado > 0),
    metodo_pago     VARCHAR(20)   NOT NULL
                    CHECK (metodo_pago IN ('efectivo', 'transferencia', 'tarjeta', 'otro')),
    descripcion     VARCHAR(200)
);


-- ---------------------------------------------------------------------
-- 6. ASISTENCIAS Y RESULTADOS DE SIMULACROS
-- ---------------------------------------------------------------------

CREATE TABLE asistencias (
    id_asistencia   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_inscripcion  INTEGER NOT NULL REFERENCES inscripciones (id_inscripcion),
    id_clase        INTEGER NOT NULL REFERENCES clases_horarios (id_clase),
    fecha_clase     DATE    NOT NULL,
    asistio         BOOLEAN NOT NULL DEFAULT TRUE,
    observacion     VARCHAR(200),
    UNIQUE (id_inscripcion, id_clase, fecha_clase)
);

-- Puntaje global del Saber 11: 0 a 500. Puntaje por area: 0 a 100.
CREATE TABLE resultado_simulacro (
    id_resultado        INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_inscripcion      INTEGER  NOT NULL REFERENCES inscripciones (id_inscripcion),
    fecha_simulacro     DATE     NOT NULL,
    puntaje_global      SMALLINT NOT NULL CHECK (puntaje_global BETWEEN 0 AND 500),
    matematicas         SMALLINT CHECK (matematicas BETWEEN 0 AND 100),
    lectura_critica     SMALLINT CHECK (lectura_critica BETWEEN 0 AND 100),
    sociales_ciudadanas SMALLINT CHECK (sociales_ciudadanas BETWEEN 0 AND 100),
    ciencias_naturales  SMALLINT CHECK (ciencias_naturales BETWEEN 0 AND 100),
    ingles              SMALLINT CHECK (ingles BETWEEN 0 AND 100)
);


-- ---------------------------------------------------------------------
-- 7. INDICES sobre llaves foraneas (aceleran los JOIN y las busquedas)
-- ---------------------------------------------------------------------

CREATE INDEX idx_estudiante_acudiente_acudiente ON estudiante_acudiente (id_acudiente);
CREATE INDEX idx_inscripciones_curso            ON inscripciones (id_curso);
CREATE INDEX idx_clases_horarios_curso          ON clases_horarios (id_curso);
CREATE INDEX idx_clases_horarios_docente        ON clases_horarios (id_docente);
CREATE INDEX idx_pagos_inscripcion              ON pagos (id_inscripcion);
CREATE INDEX idx_pagos_cuota                    ON pagos (id_cuota);
CREATE INDEX idx_asistencias_clase              ON asistencias (id_clase);
CREATE INDEX idx_resultado_inscripcion          ON resultado_simulacro (id_inscripcion);


-- ---------------------------------------------------------------------
-- 8. VISTA: saldo pendiente por inscripcion
-- ---------------------------------------------------------------------
-- El saldo NO se guarda en una tabla, se calcula: valor acordado
-- menos la suma de los pagos hechos.

CREATE VIEW vista_saldo_inscripcion AS
SELECT
    i.id_inscripcion,
    e.nombre_completo                                   AS estudiante,
    c.nombre_curso                                      AS curso,
    i.valor_acordado,
    COALESCE(SUM(p.monto_pagado), 0)                    AS total_pagado,
    i.valor_acordado - COALESCE(SUM(p.monto_pagado), 0) AS saldo_pendiente
FROM inscripciones i
JOIN estudiantes e ON e.id_estudiante = i.id_estudiante
JOIN cursos      c ON c.id_curso      = i.id_curso
LEFT JOIN pagos  p ON p.id_inscripcion = i.id_inscripcion
GROUP BY i.id_inscripcion, e.nombre_completo, c.nombre_curso, i.valor_acordado;
