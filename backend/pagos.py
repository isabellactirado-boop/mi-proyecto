from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import requiere_permiso
from db import obtener_conexion

router = APIRouter()


def _hoy() -> date:
    return datetime.now(ZoneInfo("America/Bogota")).date()


@router.get("/cuotas-por-cobrar")
def cuotas_por_cobrar(dias: int = 15, usuario: dict = Depends(requiere_permiso("ver_pagos"))):
    """Cuotas vencidas sin pagar y las que vencen en los proximos `dias`.

    Los pagos no se atan a una cuota: se suman y van cubriendo las cuotas en
    orden. Una cuota esta pendiente si lo exigible hasta ella supera lo pagado.
    """
    hoy = _hoy()
    with obtener_conexion() as conexion:
        with conexion.cursor() as cursor:
            cursor.execute(
                "WITH pagado AS ("
                "  SELECT id_inscripcion, SUM(monto_pagado) AS total FROM pagos GROUP BY id_inscripcion"
                "), acumulado AS ("
                "  SELECT cu.*, SUM(cu.valor) OVER (PARTITION BY cu.id_inscripcion "
                "                                   ORDER BY cu.numero_cuota) AS exigible "
                "  FROM cuotas cu"
                ") "
                "SELECT a.id_inscripcion, a.numero_cuota, a.fecha_vencimiento, "
                "       i.numero_cuotas, e.nombre_completo AS estudiante, e.doc_identidad, "
                "       c.nombre_curso AS curso, "
                "       LEAST(a.valor, a.exigible - COALESCE(p.total, 0)) AS pendiente, "
                "       %(hoy)s::date - a.fecha_vencimiento AS dias_mora, "
                "       ac.nombre_completo AS acudiente, ac.telefono AS telefono_acudiente, "
                "       e.telefono_celular AS telefono_estudiante "
                "FROM acumulado a "
                "JOIN inscripciones i ON i.id_inscripcion = a.id_inscripcion AND i.estado = 'activa' "
                "JOIN estudiantes e ON e.id_estudiante = i.id_estudiante "
                "JOIN cursos c ON c.id_curso = i.id_curso "
                "LEFT JOIN pagado p ON p.id_inscripcion = a.id_inscripcion "
                "LEFT JOIN estudiante_acudiente ea ON ea.id_estudiante = e.id_estudiante AND ea.es_principal "
                "LEFT JOIN acudientes ac ON ac.id_acudiente = ea.id_acudiente "
                "WHERE a.exigible > COALESCE(p.total, 0) "
                "  AND a.fecha_vencimiento <= %(hoy)s::date + %(dias)s "
                "ORDER BY a.fecha_vencimiento, e.nombre_completo",
                {"hoy": hoy, "dias": max(0, min(dias, 90))},
            )
            return cursor.fetchall()


@router.get("/pagos/buscar")
def buscar_inscripcion(q: str, usuario: dict = Depends(requiere_permiso("ver_pagos"))):
    """Inscripciones activas por nombre o documento, con su saldo."""
    texto = q.strip()
    if len(texto) < 2:
        return []
    with obtener_conexion() as conexion:
        with conexion.cursor() as cursor:
            cursor.execute(
                "SELECT id_inscripcion, doc_identidad, estudiante, curso, nombre_grupo, "
                "       valor_acordado, total_pagado, saldo_pendiente, estado_pago, valor_en_mora "
                "FROM vista_estado_pagos "
                "WHERE estudiante ILIKE %s OR doc_identidad LIKE %s "
                "ORDER BY estudiante LIMIT 10",
                ("%" + texto + "%", texto + "%"),
            )
            return cursor.fetchall()


@router.get("/pagos/recientes")
def pagos_recientes(usuario: dict = Depends(requiere_permiso("ver_pagos"))):
    with obtener_conexion() as conexion:
        with conexion.cursor() as cursor:
            cursor.execute(
                "SELECT p.id_pago, p.fecha_pago, p.monto_pagado, p.metodo_pago, p.descripcion, "
                "       e.nombre_completo AS estudiante, c.nombre_curso AS curso "
                "FROM pagos p "
                "JOIN inscripciones i ON i.id_inscripcion = p.id_inscripcion "
                "JOIN estudiantes e ON e.id_estudiante = i.id_estudiante "
                "JOIN cursos c ON c.id_curso = i.id_curso "
                "ORDER BY p.fecha_pago DESC, p.id_pago DESC LIMIT 15"
            )
            return cursor.fetchall()


class NuevoPago(BaseModel):
    id_inscripcion: int
    monto_pagado: Decimal = Field(gt=0)
    metodo_pago: Literal["efectivo", "nequi_daviplata", "transferencia", "tarjeta", "otro"]
    fecha_pago: date | None = None
    descripcion: str | None = Field(default=None, max_length=200)


@router.post("/pagos", status_code=201)
def registrar_pago(datos: NuevoPago, usuario: dict = Depends(requiere_permiso("crear_pagos"))):
    fecha = datos.fecha_pago or _hoy()
    if fecha > _hoy() + timedelta(days=1):
        raise HTTPException(status_code=400, detail="La fecha del pago no puede ser futura")

    with obtener_conexion() as conexion:
        with conexion.cursor() as cursor:
            # FOR UPDATE: dos pagos simultaneos de la misma inscripcion no pueden pasarse del saldo
            cursor.execute(
                "SELECT i.valor_acordado, e.nombre_completo FROM inscripciones i "
                "JOIN estudiantes e ON e.id_estudiante = i.id_estudiante "
                "WHERE i.id_inscripcion = %s AND i.estado = 'activa' FOR UPDATE OF i",
                (datos.id_inscripcion,),
            )
            inscripcion = cursor.fetchone()
            if not inscripcion:
                raise HTTPException(status_code=404, detail="La inscripcion no existe o no esta activa")

            cursor.execute(
                "SELECT COALESCE(SUM(monto_pagado), 0) AS total FROM pagos WHERE id_inscripcion = %s",
                (datos.id_inscripcion,),
            )
            saldo = inscripcion["valor_acordado"] - cursor.fetchone()["total"]
            if datos.monto_pagado > saldo:
                raise HTTPException(
                    status_code=400,
                    detail=f"El pago supera el saldo pendiente (${saldo:,.0f})".replace(",", "."),
                )

            cursor.execute(
                "INSERT INTO pagos (id_inscripcion, fecha_pago, monto_pagado, metodo_pago, descripcion) "
                "VALUES (%s, %s, %s, %s, %s) RETURNING id_pago",
                (datos.id_inscripcion, fecha, datos.monto_pagado, datos.metodo_pago,
                 (datos.descripcion or "").strip() or None),
            )
            id_pago = cursor.fetchone()["id_pago"]

    return {
        "id_pago": id_pago,
        "estudiante": inscripcion["nombre_completo"],
        "saldo_restante": saldo - datos.monto_pagado,
    }
