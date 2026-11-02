from datetime import date
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException

from auth import requiere_permiso
from db import obtener_conexion

router = APIRouter()

ALERTA_FALTAS_SEGUIDAS = 3  # mismo minimo que la vista vista_inasistencias_seguidas


@router.get("/reportes/asistencias")
def informe_asistencias(
    id_grupo: Optional[int] = None,
    desde: Optional[date] = None,
    hasta: Optional[date] = None,
    usuario: dict = Depends(requiere_permiso("ver_asistencias")),
):
    """Informe de asistencias por estudiante (inscripciones activas).

    - Sin filtros: todos los grupos. Con `id_grupo`: solo ese grupo.
    - `desde` / `hasta` (AAAA-MM-DD) limitan las clases que se cuentan.
    - Un profesor solo ve los grupos que dicta; el administrador y el propietario ven todos.
    - `faltas_seguidas` es la racha actual de ausencias (no depende de las fechas).
    """
    if desde and hasta and desde > hasta:
        raise HTTPException(status_code=422, detail="La fecha 'desde' no puede ser posterior a 'hasta'")

    es_profesor = usuario["rol"] == "profesor"
    id_docente = usuario["id_docente"] if es_profesor else None
    if es_profesor and id_docente is None:
        return {"filtro": {"id_grupo": id_grupo, "desde": desde, "hasta": hasta},
                "resumen": _resumen_vacio(), "estudiantes": []}

    with obtener_conexion() as conexion:
        with conexion.cursor() as cursor:
            if id_grupo is not None:
                cursor.execute(
                    "SELECT id_docente FROM grupos WHERE id_grupo = %s", (id_grupo,)
                )
                grupo = cursor.fetchone()
                if not grupo:
                    raise HTTPException(status_code=404, detail="El grupo no existe")
                if es_profesor and grupo["id_docente"] != id_docente:
                    raise HTTPException(status_code=403, detail="Ese grupo no es tuyo")

            cursor.execute(
                """
                SELECT
                    i.id_inscripcion,
                    e.doc_identidad,
                    e.nombre_completo AS estudiante,
                    g.id_grupo,
                    g.nombre_grupo,
                    c.nombre_curso    AS curso,
                    COUNT(x.estado)                                   AS total_clases,
                    COUNT(*) FILTER (WHERE x.estado = 'presente')     AS presentes,
                    COUNT(*) FILTER (WHERE x.estado = 'ausente')      AS ausentes,
                    COUNT(*) FILTER (WHERE x.estado = 'tarde')        AS tardes,
                    COUNT(*) FILTER (WHERE x.estado = 'excusa')       AS excusas,
                    ROUND(100.0 * COUNT(*) FILTER (WHERE x.estado = 'presente')
                          / NULLIF(COUNT(x.estado), 0), 1)            AS porcentaje_asistencia,
                    COALESCE(rs.faltas_seguidas, 0)                   AS faltas_seguidas,
                    ac.nombre_completo AS acudiente,
                    ac.telefono        AS telefono_acudiente,
                    e.telefono_celular AS telefono_estudiante
                FROM inscripciones i
                JOIN estudiantes e ON e.id_estudiante = i.id_estudiante
                JOIN grupos g      ON g.id_grupo      = i.id_grupo
                JOIN cursos c      ON c.id_curso      = i.id_curso
                LEFT JOIN LATERAL (
                    SELECT a.estado_asistencia AS estado
                    FROM asistencias a
                    JOIN clases cl ON cl.id_clase = a.id_clase
                    WHERE a.id_inscripcion = i.id_inscripcion
                      AND (%(desde)s::date IS NULL OR cl.fecha_clase >= %(desde)s::date)
                      AND (%(hasta)s::date IS NULL OR cl.fecha_clase <= %(hasta)s::date)
                ) x ON TRUE
                LEFT JOIN vista_inasistencias_seguidas rs ON rs.id_inscripcion = i.id_inscripcion
                LEFT JOIN estudiante_acudiente ea
                       ON ea.id_estudiante = e.id_estudiante AND ea.es_principal
                LEFT JOIN acudientes ac ON ac.id_acudiente = ea.id_acudiente
                WHERE i.estado = 'activa'
                  AND (%(grupo)s::int   IS NULL OR g.id_grupo   = %(grupo)s::int)
                  AND (%(docente)s::int IS NULL OR g.id_docente = %(docente)s::int)
                GROUP BY i.id_inscripcion, e.doc_identidad, e.nombre_completo, e.telefono_celular,
                         g.id_grupo, g.nombre_grupo, c.nombre_curso, rs.faltas_seguidas,
                         ac.nombre_completo, ac.telefono
                ORDER BY g.nombre_grupo, e.nombre_completo
                """,
                {"desde": desde, "hasta": hasta, "grupo": id_grupo, "docente": id_docente},
            )
            filas = cursor.fetchall()

    total = sum(f["total_clases"] for f in filas)
    presentes = sum(f["presentes"] for f in filas)
    resumen = {
        "estudiantes": len(filas),
        "registros_de_asistencia": total,
        "porcentaje_asistencia": round(100.0 * presentes / total, 1) if total else None,
        "con_inasistencias_seguidas": sum(1 for f in filas if f["faltas_seguidas"] >= ALERTA_FALTAS_SEGUIDAS),
        "minimo_faltas_seguidas": ALERTA_FALTAS_SEGUIDAS,
    }
    return {"filtro": {"id_grupo": id_grupo, "desde": desde, "hasta": hasta},
            "resumen": resumen, "estudiantes": filas}


def _resumen_vacio() -> dict:
    return {"estudiantes": 0, "registros_de_asistencia": 0, "porcentaje_asistencia": None,
            "con_inasistencias_seguidas": 0, "minimo_faltas_seguidas": ALERTA_FALTAS_SEGUIDAS}


@router.get("/reportes/pagos")
def reporte_pagos(
    estado: Literal["en_mora", "al_dia", "todos"] = "todos",
    usuario: dict = Depends(requiere_permiso("ver_pagos")),
):
    """Reporte de pagos por inscripcion activa: quien esta en mora y quien esta al dia.

    `estado=en_mora` lista los atrasados (los de mas dias primero), `estado=al_dia`
    los que no deben cuotas vencidas y `todos` ambos. El resumen siempre cuenta
    todas las inscripciones activas, sin importar el filtro.
    """
    with obtener_conexion() as conexion:
        with conexion.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    COUNT(*) FILTER (WHERE estado_pago = 'en_mora')            AS en_mora,
                    COUNT(*) FILTER (WHERE estado_pago = 'al_dia')             AS al_dia,
                    COALESCE(SUM(valor_en_mora), 0)                            AS valor_en_mora,
                    COALESCE(SUM(saldo_pendiente) FILTER (WHERE saldo_pendiente > 0), 0)
                                                                               AS saldo_pendiente
                FROM vista_estado_pagos
                """
            )
            resumen = cursor.fetchone()

            cursor.execute(
                """
                SELECT p.id_inscripcion, p.doc_identidad, p.estudiante, p.curso, p.nombre_grupo,
                       p.valor_acordado, p.total_pagado, p.saldo_pendiente,
                       p.cuotas_en_mora, p.valor_en_mora, p.dias_mora_maximo, p.estado_pago,
                       p.acudiente_principal AS acudiente,
                       p.telefono_acudiente,
                       e.telefono_celular    AS telefono_estudiante
                FROM vista_estado_pagos p
                JOIN inscripciones i ON i.id_inscripcion = p.id_inscripcion
                JOIN estudiantes e   ON e.id_estudiante  = i.id_estudiante
                WHERE %(estado)s = 'todos' OR p.estado_pago = %(estado)s
                ORDER BY p.dias_mora_maximo DESC, p.estudiante
                """,
                {"estado": estado},
            )
            filas = cursor.fetchall()

    return {"filtro": {"estado": estado}, "resumen": resumen, "inscripciones": filas}
