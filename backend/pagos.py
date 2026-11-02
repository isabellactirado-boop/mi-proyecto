import base64
import binascii
import re
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Response
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
def pagos_recientes(ref: str | None = None, usuario: dict = Depends(requiere_permiso("ver_pagos"))):
    """Ultimos 15 pagos, o los que tengan una referencia parecida a `ref`."""
    filtro, params = "", []
    if ref and ref.strip():
        filtro, params = "WHERE p.referencia ILIKE %s ", ["%" + ref.strip() + "%"]
    with obtener_conexion() as conexion:
        with conexion.cursor() as cursor:
            cursor.execute(
                "SELECT p.id_pago, p.fecha_pago, p.monto_pagado, p.metodo_pago, p.descripcion, "
                "       p.referencia, e.nombre_completo AS estudiante, c.nombre_curso AS curso, "
                "       EXISTS (SELECT 1 FROM comprobantes_pago cp WHERE cp.id_pago = p.id_pago) "
                "         AS tiene_comprobante "
                "FROM pagos p "
                "JOIN inscripciones i ON i.id_inscripcion = p.id_inscripcion "
                "JOIN estudiantes e ON e.id_estudiante = i.id_estudiante "
                "JOIN cursos c ON c.id_curso = i.id_curso " + filtro +
                "ORDER BY p.fecha_pago DESC, p.id_pago DESC LIMIT 15",
                params,
            )
            return cursor.fetchall()


# ---------------------------------------------------------------------
# Comprobantes (foto o PDF guardados en la base)
# ---------------------------------------------------------------------
MAX_COMPROBANTE = 2 * 1024 * 1024
_DATA_URL = re.compile(r"^data:(image/jpeg|image/png|image/webp|application/pdf);base64,(.+)$", re.S)
_FIRMAS = {  # primeros bytes de cada formato: evita que suban otra cosa con el nombre cambiado
    "image/jpeg": lambda b: b[:3] == b"\xff\xd8\xff",
    "image/png": lambda b: b[:8] == b"\x89PNG\r\n\x1a\n",
    "image/webp": lambda b: b[:4] == b"RIFF" and b[8:12] == b"WEBP",
    "application/pdf": lambda b: b[:5] == b"%PDF-",
}


def _leer_comprobante(data_url: str) -> tuple[str, bytes]:
    """Valida un 'data:<tipo>;base64,...' y devuelve (tipo, bytes)."""
    encontrado = _DATA_URL.match(data_url or "")
    if not encontrado:
        raise HTTPException(status_code=400, detail="El comprobante debe ser una foto (JPG, PNG, WEBP) o un PDF")
    tipo = encontrado.group(1)
    try:
        contenido = base64.b64decode(encontrado.group(2), validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail="El archivo del comprobante esta dañado")
    if len(contenido) > MAX_COMPROBANTE:
        raise HTTPException(status_code=400, detail="El comprobante pesa mas de 2 MB")
    if not contenido or not _FIRMAS[tipo](contenido):
        raise HTTPException(status_code=400, detail="El archivo no es realmente una imagen o un PDF")
    return tipo, contenido


def _guardar_comprobante(cursor, id_pago: int, data_url: str) -> None:
    tipo, contenido = _leer_comprobante(data_url)
    cursor.execute(
        "INSERT INTO comprobantes_pago (id_pago, tipo_mime, tamano_bytes, contenido) "
        "VALUES (%s, %s, %s, %s) "
        "ON CONFLICT (id_pago) DO UPDATE SET tipo_mime = EXCLUDED.tipo_mime, "
        "  tamano_bytes = EXCLUDED.tamano_bytes, contenido = EXCLUDED.contenido, "
        "  fecha_subida = CURRENT_TIMESTAMP",
        (id_pago, tipo, len(contenido), contenido),
    )


@router.get("/pagos/{id_pago}/comprobante")
def ver_comprobante(id_pago: int, usuario: dict = Depends(requiere_permiso("ver_pagos"))):
    with obtener_conexion() as conexion:
        with conexion.cursor() as cursor:
            cursor.execute(
                "SELECT tipo_mime, contenido FROM comprobantes_pago WHERE id_pago = %s", (id_pago,)
            )
            fila = cursor.fetchone()
    if not fila:
        raise HTTPException(status_code=404, detail="Ese pago no tiene comprobante")
    return Response(
        content=bytes(fila["contenido"]),
        media_type=fila["tipo_mime"],
        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"},
    )


class NuevoComprobante(BaseModel):
    comprobante: str


@router.put("/pagos/{id_pago}/comprobante")
def subir_comprobante(id_pago: int, datos: NuevoComprobante, usuario: dict = Depends(requiere_permiso("editar_pagos"))):
    """Para adjuntar (o cambiar) el comprobante de un pago ya registrado."""
    with obtener_conexion() as conexion:
        with conexion.cursor() as cursor:
            cursor.execute("SELECT 1 FROM pagos WHERE id_pago = %s", (id_pago,))
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="Pago no encontrado")
            _guardar_comprobante(cursor, id_pago, datos.comprobante)
    return {"mensaje": "Comprobante guardado"}


class NuevoPago(BaseModel):
    id_inscripcion: int
    monto_pagado: Decimal = Field(gt=0)
    metodo_pago: Literal["efectivo", "nequi_daviplata", "transferencia", "tarjeta", "otro"]
    fecha_pago: date | None = None
    descripcion: str | None = Field(default=None, max_length=200)
    referencia: str | None = Field(default=None, max_length=60)
    comprobante: str | None = None  # "data:image/jpeg;base64,..."
    # Si la referencia ya se uso en otro pago, el panel pregunta y reenvia con True
    confirmar_referencia_repetida: bool = False


METODOS_CON_SOPORTE = ("nequi_daviplata", "transferencia")


@router.post("/pagos", status_code=201)
def registrar_pago(datos: NuevoPago, usuario: dict = Depends(requiere_permiso("crear_pagos"))):
    fecha = datos.fecha_pago or _hoy()
    if fecha > _hoy() + timedelta(days=1):
        raise HTTPException(status_code=400, detail="La fecha del pago no puede ser futura")
    referencia = (datos.referencia or "").strip() or None
    if datos.metodo_pago in METODOS_CON_SOPORTE and not referencia and not datos.comprobante:
        raise HTTPException(
            status_code=400,
            detail="Para Nequi, Daviplata o transferencia escribe el numero de referencia o adjunta el comprobante",
        )

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

            if referencia and not datos.confirmar_referencia_repetida:
                cursor.execute(
                    "SELECT p.fecha_pago, e.nombre_completo FROM pagos p "
                    "JOIN inscripciones i ON i.id_inscripcion = p.id_inscripcion "
                    "JOIN estudiantes e ON e.id_estudiante = i.id_estudiante "
                    "WHERE LOWER(p.referencia) = LOWER(%s) ORDER BY p.id_pago LIMIT 1",
                    (referencia,),
                )
                repetido = cursor.fetchone()
                if repetido:
                    raise HTTPException(status_code=409, detail={
                        "codigo": "referencia_repetida",
                        "mensaje": f"La referencia {referencia} ya se uso en un pago de "
                                   f"{repetido['nombre_completo']} del {repetido['fecha_pago']:%d/%m/%Y}.",
                    })

            cursor.execute(
                "INSERT INTO pagos (id_inscripcion, fecha_pago, monto_pagado, metodo_pago, descripcion, referencia) "
                "VALUES (%s, %s, %s, %s, %s, %s) RETURNING id_pago",
                (datos.id_inscripcion, fecha, datos.monto_pagado, datos.metodo_pago,
                 (datos.descripcion or "").strip() or None, referencia),
            )
            id_pago = cursor.fetchone()["id_pago"]
            if datos.comprobante:
                _guardar_comprobante(cursor, id_pago, datos.comprobante)

    return {
        "id_pago": id_pago,
        "estudiante": inscripcion["nombre_completo"],
        "saldo_restante": saldo - datos.monto_pagado,
    }
