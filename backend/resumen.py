from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends

from auth import requiere_permiso
from db import obtener_conexion

router = APIRouter()


def _inicio_de_mes(fecha, meses_atras: int):
    """Primer dia del mes, `meses_atras` meses antes de `fecha`."""
    anio, mes = fecha.year, fecha.month - meses_atras
    while mes < 1:
        mes += 12
        anio -= 1
    return fecha.replace(year=anio, month=mes, day=1)


@router.get("/resumen")
def resumen(usuario: dict = Depends(requiere_permiso("ver_pagos"))):
    """Datos de las tarjetas, 'Mision de hoy' e ingresos del dashboard de admin."""
    hoy = datetime.now(ZoneInfo("America/Bogota")).date()
    desde = _inicio_de_mes(hoy, 4)  # 5 meses: el actual y los 4 anteriores

    with obtener_conexion() as conexion:
        with conexion.cursor() as cursor:
            # Estudiantes e inscripciones activas
            cursor.execute(
                "SELECT COUNT(DISTINCT id_estudiante) AS estudiantes, COUNT(*) AS inscripciones "
                "FROM inscripciones WHERE estado = 'activa'"
            )
            activos = cursor.fetchone()

            # Recaudo por mes
            cursor.execute(
                "SELECT date_trunc('month', fecha_pago)::date AS mes, SUM(monto_pagado) AS total "
                "FROM pagos WHERE fecha_pago >= %s GROUP BY 1",
                (desde,),
            )
            por_mes = {fila["mes"]: fila["total"] for fila in cursor.fetchall()}

            # Saldo pendiente (solo inscripciones activas con deuda)
            cursor.execute(
                "SELECT COUNT(*) AS inscripciones, COALESCE(SUM(saldo_pendiente), 0) AS total "
                "FROM vista_saldo_inscripcion WHERE estado = 'activa' AND saldo_pendiente > 0"
            )
            saldo = cursor.fetchone()

            # Cuotas en mora
            cursor.execute(
                "SELECT COUNT(*) AS cuotas, COALESCE(SUM(valor_en_mora), 0) AS valor "
                "FROM vista_cuotas_vencidas WHERE estado = 'activa'"
            )
            mora = cursor.fetchone()

            # Cuotas que vencen en los proximos 7 dias y aun no estan pagadas
            cursor.execute(
                "WITH pagado AS ("
                "    SELECT id_inscripcion, SUM(monto_pagado) AS total FROM pagos GROUP BY 1"
                "), acumulado AS ("
                "    SELECT id_inscripcion, fecha_vencimiento,"
                "           SUM(valor) OVER (PARTITION BY id_inscripcion ORDER BY numero_cuota) AS exigible"
                "    FROM cuotas"
                ") "
                "SELECT COUNT(*) AS cuotas "
                "FROM acumulado a "
                "JOIN inscripciones i ON i.id_inscripcion = a.id_inscripcion AND i.estado = 'activa' "
                "LEFT JOIN pagado p ON p.id_inscripcion = a.id_inscripcion "
                "WHERE a.fecha_vencimiento BETWEEN %(hoy)s::date AND %(hoy)s::date + 7 "
                "  AND a.exigible > COALESCE(p.total, 0)",
                {"hoy": hoy},
            )
            por_vencer = cursor.fetchone()

            # Estudiantes con 3 o mas inasistencias seguidas
            cursor.execute("SELECT COUNT(*) AS estudiantes FROM vista_inasistencias_seguidas")
            faltas = cursor.fetchone()

            # Grupos activos: cupos y si tienen docente
            cursor.execute(
                "SELECT g.id_grupo, g.nombre_grupo, g.dia_semana, g.hora_inicio, g.hora_fin, "
                "       g.capacidad_maxima, g.id_docente, cal.nombre_calendario, "
                "       COUNT(i.id_inscripcion) AS ocupados "
                "FROM grupos g "
                "JOIN cursos c ON c.id_curso = g.id_curso "
                "LEFT JOIN calendarios cal ON cal.id_calendario = c.id_calendario "
                "LEFT JOIN inscripciones i ON i.id_grupo = g.id_grupo AND i.estado = 'activa' "
                "WHERE g.activo "
                "GROUP BY g.id_grupo, cal.nombre_calendario "
                "ORDER BY g.id_grupo"
            )
            filas_grupos = cursor.fetchall()

    # Ingresos de los ultimos 5 meses (los meses sin pagos salen en 0)
    ingresos = []
    for atras in range(4, -1, -1):
        mes = _inicio_de_mes(hoy, atras)
        ingresos.append({"mes": mes.strftime("%Y-%m"), "total": por_mes.get(mes, 0)})

    actual = ingresos[-1]["total"]
    anterior = ingresos[-2]["total"]
    variacion = round((actual - anterior) * 100 / anterior, 1) if anterior else None

    grupos = []
    for g in filas_grupos:
        grupos.append(
            {
                "id_grupo": g["id_grupo"],
                "nombre_grupo": g["nombre_grupo"],
                "calendario": g["nombre_calendario"],
                "dia_semana": g["dia_semana"],
                "hora_inicio": g["hora_inicio"],
                "hora_fin": g["hora_fin"],
                "capacidad": g["capacidad_maxima"],
                "ocupados": g["ocupados"],
                "cupos_disponibles": max(g["capacidad_maxima"] - g["ocupados"], 0),
                "tiene_docente": g["id_docente"] is not None,
            }
        )

    return {
        "estudiantes_activos": activos["estudiantes"],
        "inscripciones_activas": activos["inscripciones"],
        "recaudo": {
            "mes": ingresos[-1]["mes"],
            "mes_actual": actual,
            "mes_anterior": anterior,
            "variacion_pct": variacion,
        },
        "saldo_pendiente": {"total": saldo["total"], "inscripciones": saldo["inscripciones"]},
        "cuotas_en_mora": {"cuotas": mora["cuotas"], "valor": mora["valor"]},
        "cupos": {
            "disponibles": sum(g["cupos_disponibles"] for g in grupos),
            "grupos_abiertos": sum(1 for g in grupos if g["cupos_disponibles"] > 0),
        },
        "mision_hoy": {
            "cuotas_vencidas": mora["cuotas"],
            "cuotas_por_vencer_7_dias": por_vencer["cuotas"],
            "estudiantes_con_inasistencias_seguidas": faltas["estudiantes"],
            "grupos_sin_docente": [g for g in grupos if not g["tiene_docente"]],
        },
        "ingresos_por_mes": ingresos,
        "grupos": grupos,
    }
