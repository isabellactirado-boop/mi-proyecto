from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from zoneinfo import ZoneInfo

import psycopg
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import generar_hash, requiere_admin, requiere_permiso
from db import obtener_conexion
from usuarios import _CORREO, contrasena_temporal

router = APIRouter()

TipoDocumento = Literal["TI", "CC", "CE", "PPT", "OTRO"]


def _hoy() -> date:
    return datetime.now(ZoneInfo("America/Bogota")).date()


def _sumar_meses(fecha: date, meses: int) -> date:
    """Misma fecha N meses despues; si el dia no existe (31 de feb) usa el ultimo del mes."""
    anio, mes = divmod(fecha.month - 1 + meses, 12)
    anio, mes = fecha.year + anio, mes + 1
    for dia in (fecha.day, 30, 29, 28):
        try:
            return date(anio, mes, dia)
        except ValueError:
            continue


def _plan_cuotas(valor: Decimal, numero: int, primera: date) -> list[tuple[int, Decimal, date]]:
    """Divide el valor en cuotas mensuales iguales (redondeadas a $100).
    La ultima cuota ajusta la diferencia para que la suma sea exacta."""
    base = (valor / numero / 100).quantize(Decimal("1")) * 100
    if base <= 0:  # valor muy pequeño para dividirlo: una sola cuota
        return [(1, valor, primera)]
    plan = []
    for n in range(1, numero + 1):
        monto = base if n < numero else valor - base * (numero - 1)
        plan.append((n, monto, _sumar_meses(primera, n - 1)))
    return plan


def _crear_cuenta(cursor, id_estudiante: int, correo: str) -> dict:
    """Cuenta de la app movil para un estudiante. Devuelve la contrasena temporal."""
    correo = correo.strip().lower()
    if not _CORREO.match(correo):
        raise HTTPException(status_code=400, detail="El correo para la cuenta no es valido")
    cursor.execute("SELECT 1 FROM usuarios WHERE id_estudiante = %s", (id_estudiante,))
    if cursor.fetchone():
        raise HTTPException(status_code=409, detail="Ese estudiante ya tiene cuenta en la app")
    cursor.execute("SELECT 1 FROM usuarios WHERE lower(nombre_usuario) = %s", (correo,))
    if cursor.fetchone():
        raise HTTPException(status_code=409, detail="Ya existe un usuario con ese correo")

    temporal = contrasena_temporal()
    cursor.execute(
        "INSERT INTO usuarios (nombre_usuario, contrasena_hash, rol, id_estudiante, "
        "                      debe_cambiar_contrasena) "
        "VALUES (%s, %s, 'estudiante', %s, TRUE)",
        (correo, generar_hash(temporal), id_estudiante),
    )
    return {
        "usuario": correo,
        "contrasena_temporal": temporal,
        "aviso": "Entrega esta contraseña al estudiante. No se vuelve a mostrar y debera cambiarla al entrar a la app.",
    }


# ---------------------------------------------------------------------
# Cursos
# ---------------------------------------------------------------------
class NuevoCurso(BaseModel):
    nombre_curso: str = Field(min_length=1, max_length=100)
    descripcion: str | None = None
    fecha_inicio: date
    fecha_fin: date
    valor_total: Decimal = Field(ge=0)


@router.post("/cursos", status_code=201)
def crear_curso(datos: NuevoCurso, usuario: dict = Depends(requiere_admin)):
    if datos.fecha_fin < datos.fecha_inicio:
        raise HTTPException(status_code=400, detail="La fecha de fin debe ser despues de la de inicio")
    with obtener_conexion() as conexion:
        with conexion.cursor() as cursor:
            cursor.execute(
                "INSERT INTO cursos (nombre_curso, descripcion, fecha_inicio, fecha_fin, valor_total) "
                "VALUES (%s, %s, %s, %s, %s) RETURNING id_curso",
                (datos.nombre_curso.strip(), (datos.descripcion or "").strip() or None,
                 datos.fecha_inicio, datos.fecha_fin, datos.valor_total),
            )
            return {"id_curso": cursor.fetchone()["id_curso"]}


# ---------------------------------------------------------------------
# Inscripcion completa: estudiante + acudiente + grupo + plan de cuotas
# ---------------------------------------------------------------------
class DatosEstudiante(BaseModel):
    tipo_documento: TipoDocumento
    doc_identidad: str = Field(min_length=3, max_length=20)
    nombre_completo: str = Field(min_length=3, max_length=120)
    fecha_nacimiento: date
    telefono_celular: str | None = Field(default=None, max_length=20)
    correo_electronico: str | None = Field(default=None, max_length=100)
    direccion: str | None = Field(default=None, max_length=150)


class DatosAcudiente(BaseModel):
    tipo_documento: TipoDocumento = "CC"
    doc_identidad: str = Field(min_length=3, max_length=20)
    nombre_completo: str = Field(min_length=3, max_length=120)
    telefono: str = Field(min_length=7, max_length=20)
    correo_electronico: str | None = Field(default=None, max_length=100)
    parentesco: str = Field(min_length=2, max_length=30)


class NuevaInscripcion(BaseModel):
    estudiante: DatosEstudiante
    acudiente: DatosAcudiente | None = None
    id_grupo: int
    valor_acordado: Decimal | None = Field(default=None, ge=0)  # vacio = valor del curso
    numero_cuotas: int = Field(default=1, ge=1, le=12)
    primera_cuota: date | None = None                            # vacio = hoy
    crear_cuenta: bool = False


def _limpio(texto: str | None) -> str | None:
    return (texto or "").strip() or None


@router.post("/inscripciones", status_code=201)
def inscribir(datos: NuevaInscripcion, usuario: dict = Depends(requiere_permiso("crear_inscripciones"))):
    e = datos.estudiante
    correo = (_limpio(e.correo_electronico) or "").lower() or None
    if correo and not _CORREO.match(correo):
        raise HTTPException(status_code=400, detail="El correo del estudiante no es valido")
    if datos.crear_cuenta and not correo:
        raise HTTPException(status_code=400, detail="Para crear la cuenta de la app hace falta el correo del estudiante")

    try:
        with obtener_conexion() as conexion:
            with conexion.cursor() as cursor:
                # Si el estudiante ya existe (mismo documento) se reutiliza su ficha
                # y solo se completan los datos de contacto que vengan.
                cursor.execute(
                    "INSERT INTO estudiantes (tipo_documento, doc_identidad, nombre_completo, "
                    "       fecha_nacimiento, telefono_celular, correo_electronico, direccion, estado_matricula) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s, 'activo') "
                    "ON CONFLICT (doc_identidad) DO UPDATE SET "
                    "  telefono_celular   = COALESCE(EXCLUDED.telefono_celular, estudiantes.telefono_celular), "
                    "  correo_electronico = COALESCE(EXCLUDED.correo_electronico, estudiantes.correo_electronico), "
                    "  direccion          = COALESCE(EXCLUDED.direccion, estudiantes.direccion), "
                    "  estado_matricula   = 'activo' "
                    "RETURNING id_estudiante, (xmax = 0) AS nuevo",
                    (e.tipo_documento, e.doc_identidad.strip(), e.nombre_completo.strip(), e.fecha_nacimiento,
                     _limpio(e.telefono_celular) or "NO REGISTRADO", correo, _limpio(e.direccion)),
                )
                fila = cursor.fetchone()
                id_estudiante, estudiante_nuevo = fila["id_estudiante"], fila["nuevo"]

                if datos.acudiente:
                    a = datos.acudiente
                    cursor.execute(
                        "INSERT INTO acudientes (tipo_documento, doc_identidad, nombre_completo, telefono, correo_electronico) "
                        "VALUES (%s, %s, %s, %s, %s) "
                        "ON CONFLICT (doc_identidad) DO UPDATE SET telefono = EXCLUDED.telefono "
                        "RETURNING id_acudiente",
                        (a.tipo_documento, a.doc_identidad.strip(), a.nombre_completo.strip(), a.telefono.strip(),
                         (_limpio(a.correo_electronico) or "").lower() or None),
                    )
                    id_acudiente = cursor.fetchone()["id_acudiente"]
                    # Sera el principal solo si el estudiante aun no tiene uno
                    cursor.execute(
                        "INSERT INTO estudiante_acudiente (id_estudiante, id_acudiente, parentesco, es_principal) "
                        "VALUES (%s, %s, %s, NOT EXISTS (SELECT 1 FROM estudiante_acudiente "
                        "                               WHERE id_estudiante = %s AND es_principal)) "
                        "ON CONFLICT (id_estudiante, id_acudiente) DO UPDATE SET parentesco = EXCLUDED.parentesco",
                        (id_estudiante, id_acudiente, a.parentesco.strip(), id_estudiante),
                    )

                cursor.execute(
                    "SELECT g.id_curso, c.valor_total, c.nombre_curso, g.nombre_grupo "
                    "FROM grupos g JOIN cursos c ON c.id_curso = g.id_curso "
                    "WHERE g.id_grupo = %s AND g.activo",
                    (datos.id_grupo,),
                )
                grupo = cursor.fetchone()
                if not grupo:
                    raise HTTPException(status_code=404, detail="El grupo no existe o esta inactivo")

                valor = datos.valor_acordado if datos.valor_acordado is not None else grupo["valor_total"]
                cuotas = datos.numero_cuotas if valor > 0 else 1
                cursor.execute(
                    "INSERT INTO inscripciones (id_estudiante, id_curso, id_grupo, valor_acordado, "
                    "                           modalidad_pago, numero_cuotas) "
                    "VALUES (%s, %s, %s, %s, %s, %s) RETURNING id_inscripcion",
                    (id_estudiante, grupo["id_curso"], datos.id_grupo, valor,
                     "unico" if cuotas == 1 else "cuotas", cuotas),
                )
                id_inscripcion = cursor.fetchone()["id_inscripcion"]

                plan = _plan_cuotas(Decimal(valor), cuotas, datos.primera_cuota or _hoy()) if valor > 0 else []
                for numero, monto, vence in plan:
                    cursor.execute(
                        "INSERT INTO cuotas (id_inscripcion, numero_cuota, valor, fecha_vencimiento) "
                        "VALUES (%s, %s, %s, %s)",
                        (id_inscripcion, numero, monto, vence),
                    )

                cuenta = _crear_cuenta(cursor, id_estudiante, correo) if datos.crear_cuenta else None

    except psycopg.errors.UniqueViolation as error:
        restriccion = (error.diag.constraint_name or "").lower()
        if "id_estudiante_id_curso" in restriccion or "inscripciones" in restriccion:
            detalle = "Ese estudiante ya esta inscrito en ese curso"
        elif "correo" in restriccion:
            detalle = "Ese correo ya lo tiene otro estudiante o acudiente"
        else:
            detalle = "Hay datos repetidos (documento o correo)"
        raise HTTPException(status_code=409, detail=detalle)
    except psycopg.errors.RaiseException as error:
        # trigger de capacidad: "El grupo X esta lleno"
        raise HTTPException(status_code=409, detail=str(error.diag.message_primary or "El grupo esta lleno"))

    return {
        "id_inscripcion": id_inscripcion,
        "id_estudiante": id_estudiante,
        "estudiante_nuevo": estudiante_nuevo,
        "curso": grupo["nombre_curso"],
        "grupo": grupo["nombre_grupo"],
        "cuotas": [{"numero": n, "valor": m, "vence": v} for n, m, v in plan],
        "cuenta": cuenta,
    }


# ---------------------------------------------------------------------
# Cuenta de la app para un estudiante ya registrado
# ---------------------------------------------------------------------
class NuevaCuenta(BaseModel):
    doc_identidad: str = Field(min_length=3, max_length=20)
    correo: str | None = None  # vacio = el correo de su ficha


@router.post("/cuentas-estudiante", status_code=201)
def crear_cuenta_estudiante(datos: NuevaCuenta, usuario: dict = Depends(requiere_permiso("crear_inscripciones"))):
    with obtener_conexion() as conexion:
        with conexion.cursor() as cursor:
            cursor.execute(
                "SELECT id_estudiante, nombre_completo, correo_electronico FROM estudiantes "
                "WHERE doc_identidad = %s",
                (datos.doc_identidad.strip(),),
            )
            ficha = cursor.fetchone()
            if not ficha:
                raise HTTPException(status_code=404, detail="No hay un estudiante registrado con ese documento")
            correo = _limpio(datos.correo) or ficha["correo_electronico"]
            if not correo:
                raise HTTPException(status_code=400, detail="El estudiante no tiene correo: escríbelo para crear la cuenta")
            cuenta = _crear_cuenta(cursor, ficha["id_estudiante"], correo)
    cuenta["estudiante"] = ficha["nombre_completo"]
    return cuenta
