from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends

from auth import requiere_estudiante
from db import obtener_conexion

router = APIRouter(prefix="/estudiante")

# Cada estudiante solo ve SUS datos: todas las consultas filtran por el
# id_estudiante de la cuenta que hizo la peticion, nunca por un parametro.


def _hoy():
    return datetime.now(ZoneInfo("America/Bogota")).date()


@router.get("/inicio")
def inicio(usuario: dict = Depends(requiere_estudiante)):
    """Pantalla principal de la app: quien soy, mis cursos, proxima clase y asistencia."""
    id_estudiante = usuario["id_estudiante"]
    ahora = datetime.now(ZoneInfo("America/Bogota"))

    with obtener_conexion() as conexion:
        with conexion.cursor() as cursor:
            cursor.execute(
                "SELECT nombre_completo, doc_identidad, correo_electronico "
                "FROM estudiantes WHERE id_estudiante = %s",
                (id_estudiante,),
            )
            perfil = cursor.fetchone()

            # Cursos activos con su grupo (horario semanal) y estado de pagos
            cursor.execute(
                "SELECT i.id_inscripcion, c.nombre_curso, c.fecha_inicio, c.fecha_fin, "
                "       g.nombre_grupo, g.dia_semana, g.hora_inicio, g.hora_fin, "
                "       g.plataforma, g.enlace_reunion, d.nombre_completo AS docente, "
                "       i.valor_acordado, COALESCE(ep.total_pagado, 0) AS total_pagado, "
                "       COALESCE(ep.saldo_pendiente, 0) AS saldo_pendiente, "
                "       COALESCE(ep.estado_pago, 'al_dia') AS estado_pago "
                "FROM inscripciones i "
                "JOIN cursos c ON c.id_curso = i.id_curso "
                "LEFT JOIN grupos g ON g.id_grupo = i.id_grupo "
                "LEFT JOIN docentes d ON d.id_docente = g.id_docente "
                "LEFT JOIN vista_estado_pagos ep ON ep.id_inscripcion = i.id_inscripcion "
                "WHERE i.id_estudiante = %s AND i.estado = 'activa' "
                "ORDER BY c.fecha_inicio",
                (id_estudiante,),
            )
            cursos = cursor.fetchall()

            # La proxima sesion programada (hoy que aun no termina, o despues)
            cursor.execute(
                "SELECT cl.fecha_clase, cl.hora_inicio, cl.hora_fin, cl.tema, "
                "       COALESCE(cl.plataforma, g.plataforma) AS plataforma, "
                "       COALESCE(cl.enlace_reunion, g.enlace_reunion) AS enlace_reunion, "
                "       c.nombre_curso, d.nombre_completo AS docente "
                "FROM clases cl "
                "JOIN grupos g ON g.id_grupo = cl.id_grupo "
                "JOIN inscripciones i ON i.id_grupo = g.id_grupo "
                "JOIN cursos c ON c.id_curso = i.id_curso "
                "JOIN docentes d ON d.id_docente = cl.id_docente "
                "WHERE i.id_estudiante = %s AND i.estado = 'activa' "
                "  AND (cl.fecha_clase > %s OR (cl.fecha_clase = %s AND cl.hora_fin > %s)) "
                "ORDER BY cl.fecha_clase, cl.hora_inicio LIMIT 1",
                (id_estudiante, ahora.date(), ahora.date(), ahora.time()),
            )
            proxima = cursor.fetchone()

            cursor.execute(
                "SELECT COUNT(*) AS total, "
                "       COUNT(*) FILTER (WHERE a.estado_asistencia IN ('presente', 'tarde')) AS asistio, "
                "       COUNT(*) FILTER (WHERE a.estado_asistencia = 'ausente') AS faltas "
                "FROM asistencias a "
                "JOIN inscripciones i ON i.id_inscripcion = a.id_inscripcion "
                "WHERE i.id_estudiante = %s AND i.estado = 'activa'",
                (id_estudiante,),
            )
            asistencia = cursor.fetchone()

    total = asistencia["total"]
    return {
        "perfil": perfil,
        "cursos": cursos,
        "proxima_clase": proxima,
        "asistencia": {
            "clases_registradas": total,
            "asistio": asistencia["asistio"],
            "faltas": asistencia["faltas"],
            "porcentaje": round(asistencia["asistio"] * 100 / total) if total else None,
        },
    }


@router.get("/clases")
def clases(usuario: dict = Depends(requiere_estudiante)):
    """Proximas sesiones (30 dias) y las ultimas 20 con su asistencia."""
    id_estudiante = usuario["id_estudiante"]
    hoy = _hoy()

    consulta = (
        "SELECT cl.id_clase, cl.fecha_clase, cl.hora_inicio, cl.hora_fin, cl.tema, "
        "       COALESCE(cl.plataforma, g.plataforma) AS plataforma, "
        "       COALESCE(cl.enlace_reunion, g.enlace_reunion) AS enlace_reunion, "
        "       c.nombre_curso, d.nombre_completo AS docente, a.estado_asistencia "
        "FROM clases cl "
        "JOIN grupos g ON g.id_grupo = cl.id_grupo "
        "JOIN inscripciones i ON i.id_grupo = g.id_grupo "
        "JOIN cursos c ON c.id_curso = i.id_curso "
        "JOIN docentes d ON d.id_docente = cl.id_docente "
        "LEFT JOIN asistencias a ON a.id_clase = cl.id_clase "
        "                       AND a.id_inscripcion = i.id_inscripcion "
        "WHERE i.id_estudiante = %(id)s AND i.estado = 'activa' "
    )

    with obtener_conexion() as conexion:
        with conexion.cursor() as cursor:
            cursor.execute(
                consulta + "AND cl.fecha_clase BETWEEN %(hoy)s::date AND %(hoy)s::date + 30 "
                "ORDER BY cl.fecha_clase, cl.hora_inicio",
                {"id": id_estudiante, "hoy": hoy},
            )
            proximas = cursor.fetchall()

            cursor.execute(
                consulta + "AND cl.fecha_clase < %(hoy)s "
                "ORDER BY cl.fecha_clase DESC, cl.hora_inicio DESC LIMIT 20",
                {"id": id_estudiante, "hoy": hoy},
            )
            anteriores = cursor.fetchall()

    return {"proximas": proximas, "anteriores": anteriores}


@router.get("/resultados")
def resultados(usuario: dict = Depends(requiere_estudiante)):
    """Resultados de simulacros, del mas reciente al mas antiguo."""
    with obtener_conexion() as conexion:
        with conexion.cursor() as cursor:
            cursor.execute(
                "SELECT r.fecha_simulacro, s.nombre AS simulacro, r.puntaje_global, "
                "       r.lectura_critica, r.matematicas, r.sociales_ciudadanas, "
                "       r.ciencias_naturales, r.ingles "
                "FROM resultado_simulacro r "
                "JOIN inscripciones i ON i.id_inscripcion = r.id_inscripcion "
                "LEFT JOIN simulacros s ON s.id_simulacro = r.id_simulacro "
                "WHERE i.id_estudiante = %s "
                "ORDER BY r.fecha_simulacro DESC",
                (usuario["id_estudiante"],),
            )
            return cursor.fetchall()
