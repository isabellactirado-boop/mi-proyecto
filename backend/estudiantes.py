from fastapi import APIRouter, Depends, HTTPException

from auth import requiere_permiso
from db import obtener_conexion

router = APIRouter()


@router.get("/estudiantes")
def listar_estudiantes(usuario: dict = Depends(requiere_permiso("ver_estudiantes"))):
    """Directorio de estudiantes: una fila por estudiante.

    Cada fila trae la inscripcion mas relevante (la activa, y si no tiene, la
    mas reciente), el acudiente principal, la asistencia y el promedio de
    puntaje. El estado de pago solo se envia a quien tiene el permiso
    'ver_pagos' (los profesores no lo ven).
    """
    puede_ver_pagos = "ver_pagos" in usuario["permisos"]

    with obtener_conexion() as conexion:
        with conexion.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    e.id_estudiante,
                    e.tipo_documento,
                    e.doc_identidad,
                    e.nombre_completo,
                    e.telefono_celular,
                    e.correo_electronico,
                    e.estado_matricula,
                    ins.id_inscripcion,
                    ins.estado_inscripcion,
                    ins.curso,
                    ins.nombre_grupo,
                    ins.dia_semana,
                    ins.hora_inicio,
                    ac.nombre_completo AS acudiente,
                    ac.telefono        AS acudiente_telefono,
                    ea.parentesco      AS acudiente_parentesco,
                    asis.porcentaje_asistencia,
                    asis.total_clases,
                    des.promedio_global,
                    pag.estado_pago,
                    pag.saldo_pendiente,
                    pag.valor_en_mora
                FROM estudiantes e
                LEFT JOIN LATERAL (
                    SELECT i.id_inscripcion, i.estado AS estado_inscripcion,
                           c.nombre_curso AS curso, g.nombre_grupo,
                           g.dia_semana, g.hora_inicio
                    FROM inscripciones i
                    JOIN cursos c ON c.id_curso = i.id_curso
                    LEFT JOIN grupos g ON g.id_grupo = i.id_grupo
                    WHERE i.id_estudiante = e.id_estudiante
                    ORDER BY (i.estado = 'activa') DESC,
                             i.fecha_inscripcion DESC, i.id_inscripcion DESC
                    LIMIT 1
                ) ins ON TRUE
                LEFT JOIN estudiante_acudiente ea
                       ON ea.id_estudiante = e.id_estudiante AND ea.es_principal
                LEFT JOIN acudientes ac ON ac.id_acudiente = ea.id_acudiente
                LEFT JOIN vista_asistencia_por_estudiante asis
                       ON asis.id_inscripcion = ins.id_inscripcion
                LEFT JOIN vista_desempeno_estudiante des
                       ON des.id_inscripcion = ins.id_inscripcion
                LEFT JOIN vista_estado_pagos pag
                       ON pag.id_inscripcion = ins.id_inscripcion
                ORDER BY e.nombre_completo
                """
            )
            filas = cursor.fetchall()

    for fila in filas:
        if not puede_ver_pagos:
            fila["estado_pago"] = None
            fila["saldo_pendiente"] = None
            fila["valor_en_mora"] = None
    return {"estudiantes": filas, "puede_ver_pagos": puede_ver_pagos}


@router.get("/estudiantes/{id_estudiante}")
def detalle_estudiante(
    id_estudiante: int,
    usuario: dict = Depends(requiere_permiso("ver_estudiantes")),
):
    """Ficha completa: datos, acudientes, inscripciones, asistencia y puntajes."""
    puede_ver_pagos = "ver_pagos" in usuario["permisos"]
    puede_ver_resultados = "ver_resultados" in usuario["permisos"]
    puede_ver_asistencias = "ver_asistencias" in usuario["permisos"]

    with obtener_conexion() as conexion:
        with conexion.cursor() as cursor:
            cursor.execute(
                "SELECT id_estudiante, tipo_documento, doc_identidad, nombre_completo, "
                "       fecha_nacimiento, direccion, telefono_celular, correo_electronico, "
                "       estado_matricula, fecha_creacion "
                "FROM estudiantes WHERE id_estudiante = %s",
                (id_estudiante,),
            )
            estudiante = cursor.fetchone()
            if not estudiante:
                raise HTTPException(status_code=404, detail="El estudiante no existe")

            cursor.execute(
                "SELECT ac.id_acudiente, ac.nombre_completo, ac.tipo_documento, "
                "       ac.doc_identidad, ac.telefono, ac.correo_electronico, "
                "       ea.parentesco, ea.es_principal "
                "FROM estudiante_acudiente ea "
                "JOIN acudientes ac ON ac.id_acudiente = ea.id_acudiente "
                "WHERE ea.id_estudiante = %s "
                "ORDER BY ea.es_principal DESC, ac.nombre_completo",
                (id_estudiante,),
            )
            acudientes = cursor.fetchall()

            cursor.execute(
                "SELECT i.id_inscripcion, i.id_curso, i.id_grupo, i.estado, i.fecha_inscripcion, i.modalidad_pago, "
                "       i.numero_cuotas, i.valor_acordado, "
                "       c.nombre_curso AS curso, g.nombre_grupo, g.dia_semana, "
                "       g.hora_inicio, g.hora_fin, d.nombre_completo AS docente "
                "FROM inscripciones i "
                "JOIN cursos c ON c.id_curso = i.id_curso "
                "LEFT JOIN grupos g ON g.id_grupo = i.id_grupo "
                "LEFT JOIN docentes d ON d.id_docente = g.id_docente "
                "WHERE i.id_estudiante = %s "
                "ORDER BY (i.estado = 'activa') DESC, i.fecha_inscripcion DESC",
                (id_estudiante,),
            )
            inscripciones = cursor.fetchall()
            ids = [i["id_inscripcion"] for i in inscripciones]

            pagos = {}
            asistencia = {}
            resultados = {}

            if ids and puede_ver_pagos:
                cursor.execute(
                    "SELECT id_inscripcion, saldo_pendiente, total_pagado, "
                    "       cuotas_en_mora, valor_en_mora, estado_pago "
                    "FROM vista_estado_pagos WHERE id_inscripcion = ANY(%s)",
                    (ids,),
                )
                pagos = {f["id_inscripcion"]: f for f in cursor.fetchall()}

            if ids and puede_ver_asistencias:
                cursor.execute(
                    "SELECT id_inscripcion, total_clases, presentes, ausentes, tardes, "
                    "       excusas, porcentaje_asistencia "
                    "FROM vista_asistencia_por_estudiante WHERE id_inscripcion = ANY(%s)",
                    (ids,),
                )
                asistencia = {f["id_inscripcion"]: f for f in cursor.fetchall()}

            if ids and puede_ver_resultados:
                cursor.execute(
                    "SELECT id_inscripcion, simulacro, fecha_simulacro, puntaje_global, "
                    "       matematicas, lectura_critica, sociales_ciudadanas, "
                    "       ciencias_naturales, ingles "
                    "FROM vista_resultados_estudiantes WHERE id_inscripcion = ANY(%s) "
                    "ORDER BY fecha_simulacro DESC",
                    (ids,),
                )
                for fila in cursor.fetchall():
                    resultados.setdefault(fila["id_inscripcion"], []).append(fila)

    for inscripcion in inscripciones:
        ident = inscripcion["id_inscripcion"]
        inscripcion["pagos"] = pagos.get(ident)
        inscripcion["asistencia"] = asistencia.get(ident)
        inscripcion["resultados"] = resultados.get(ident, [])
        if not puede_ver_pagos:
            inscripcion["valor_acordado"] = None

    return {
        "estudiante": estudiante,
        "acudientes": acudientes,
        "inscripciones": inscripciones,
        "permisos": {
            "pagos": puede_ver_pagos,
            "resultados": puede_ver_resultados,
            "asistencias": puede_ver_asistencias,
        },
    }
