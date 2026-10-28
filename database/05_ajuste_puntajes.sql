-- =====================================================================
-- Base de datos: Pre-ICFES
-- Archivo: database/05_ajuste_puntajes.sql
-- Descripcion: todos los profesores pueden consultar los puntajes de
--              TODOS los estudiantes (se quita la asignacion por profesor).
-- Orden de ejecucion: ... -> 03_ajustes.sql -> 05_ajuste_puntajes.sql
-- Todo va dentro de una transaccion: si algo falla, no se aplica nada.
-- =====================================================================

BEGIN;

-- 1. Descripcion del rol profesor
UPDATE roles SET descripcion =
    'Registra y consulta asistencias de sus grupos virtuales y consulta los puntajes de todos los estudiantes.'
WHERE nombre_rol = 'profesor';

-- 2. Vista nueva: puntajes de todos los estudiantes (sin filtro por docente)
CREATE OR REPLACE VIEW vista_resultados_estudiantes AS
SELECT
    i.id_inscripcion,
    e.nombre_completo AS estudiante,
    c.nombre_curso AS curso,
    i.estado AS estado_inscripcion,
    s.nombre AS simulacro,
    r.fecha_simulacro,
    r.puntaje_global,
    r.matematicas,
    r.lectura_critica,
    r.sociales_ciudadanas,
    r.ciencias_naturales,
    r.ingles
FROM resultado_simulacro r
JOIN inscripciones i ON i.id_inscripcion = r.id_inscripcion
JOIN estudiantes   e ON e.id_estudiante  = i.id_estudiante
JOIN cursos        c ON c.id_curso       = i.id_curso
LEFT JOIN simulacros s ON s.id_simulacro = r.id_simulacro;

-- 3. Se elimina lo que ya no se usa
DROP VIEW  IF EXISTS vista_resultados_por_docente;
DROP TABLE IF EXISTS seguimiento_docente;

COMMIT;
