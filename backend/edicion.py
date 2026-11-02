"""Editar y corregir datos ya registrados.

A. Estudiantes y acudientes      (permiso editar_estudiantes)
B. Inscripciones: estado y grupo  (permiso editar_inscripciones)
C. Cursos y grupos                (propietario / administrador)
D. Pagos: corregir y eliminar     (permiso editar_pagos)

Nada se borra salvo un pago registrado por error (D). Las inscripciones
cambian de estado (activa / retirada / finalizada) y los grupos se
desactivan.
"""

from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Literal
from zoneinfo import ZoneInfo

import psycopg
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import requiere_admin, requiere_permiso
from db import obtener_conexion

router = APIRouter()

TipoDocumento = Literal["TI", "CC", "CE", "PPT", "OTRO"]


def _hoy() -> date:
    return datetime.now(ZoneInfo("America/Bogota")).date()


def _limpio(texto: str | None) -> str | None:
    return (texto or "").strip() or None


def _repetido(error: psycopg.errors.UniqueViolation, quien: str) -> HTTPException:
    restriccion = (error.diag.constraint_name or "").lower()
    if "correo" in restriccion:
        return HTTPException(status_code=409, detail=f"Ese correo ya lo tiene otro {quien}")
    if "doc_identidad" in restriccion:
        return HTTPException(status_code=409, detail=f"Ese documento ya lo tiene otro {quien}")
    return HTTPException(status_code=409, detail="Hay datos repetidos")


# =====================================================================
# A. Estudiantes y acudientes
# =====================================================================
class CambiosEstudiante(BaseModel):
    tipo_documento: TipoDocumento
    doc_identidad: str = Field(min_length=3, max_length=20)
    nombre_completo: str = Field(min_length=3, max_length=120)
    fecha_nacimiento: date
    telefono_celular: str = Field(min_length=7, max_length=20)
    correo_electronico: str | None = Field(default=None, max_length=100)
    direccion: str | None = Field(default=None, max_length=150)
    estado_matricula: Literal["activo", "inactivo"] = "activo"


@router.put("/estudiantes/{id_estudiante}")
def editar_estudiante(
    id_estudiante: int, datos: CambiosEstudiante,
    usuario: dict = Depends(requiere_permiso("editar_estudiantes")),
):
    if datos.fecha_nacimiento >= _hoy():
        raise HTTPException(status_code=400, detail="La fecha de nacimiento no es valida")
    try:
        with obtener_conexion() as conexion:
            with conexion.cursor() as cursor:
                cursor.execute(
                    "UPDATE estudiantes SET tipo_documento = %s, doc_identidad = %s, nombre_completo = %s, "
                    "       fecha_nacimiento = %s, telefono_celular = %s, correo_electronico = %s, "
                    "       direccion = %s, estado_matricula = %s "
                    "WHERE id_estudiante = %s RETURNING id_estudiante",
                    (datos.tipo_documento, datos.doc_identidad.strip(), datos.nombre_completo.strip(),
                     datos.fecha_nacimiento, datos.telefono_celular.strip(),
                     (_limpio(datos.correo_electronico) or "").lower() or None,
                     _limpio(datos.direccion), datos.estado_matricula, id_estudiante),
                )
                if not cursor.fetchone():
                    raise HTTPException(status_code=404, detail="El estudiante no existe")
    except psycopg.errors.UniqueViolation as error:
        raise _repetido(error, "estudiante")
    return {"mensaje": "Datos del estudiante actualizados"}


class DatosAcudiente(BaseModel):
    tipo_documento: TipoDocumento = "CC"
    doc_identidad: str = Field(min_length=3, max_length=20)
    nombre_completo: str = Field(min_length=3, max_length=120)
    telefono: str = Field(min_length=7, max_length=20)
    correo_electronico: str | None = Field(default=None, max_length=100)
    parentesco: str = Field(min_length=2, max_length=30)
    es_principal: bool = False


def _marcar_principal(cursor, id_estudiante: int, id_acudiente: int, principal: bool) -> None:
    """Solo puede haber un acudiente principal por estudiante."""
    if principal:
        cursor.execute(
            "UPDATE estudiante_acudiente SET es_principal = FALSE "
            "WHERE id_estudiante = %s AND id_acudiente <> %s AND es_principal",
            (id_estudiante, id_acudiente),
        )
    cursor.execute(
        "UPDATE estudiante_acudiente SET es_principal = %s WHERE id_estudiante = %s AND id_acudiente = %s",
        (principal, id_estudiante, id_acudiente),
    )


@router.put("/estudiantes/{id_estudiante}/acudientes/{id_acudiente}")
def editar_acudiente(
    id_estudiante: int, id_acudiente: int, datos: DatosAcudiente,
    usuario: dict = Depends(requiere_permiso("editar_estudiantes")),
):
    try:
        with obtener_conexion() as conexion:
            with conexion.cursor() as cursor:
                cursor.execute(
                    "SELECT 1 FROM estudiante_acudiente WHERE id_estudiante = %s AND id_acudiente = %s",
                    (id_estudiante, id_acudiente),
                )
                if not cursor.fetchone():
                    raise HTTPException(status_code=404, detail="Ese acudiente no esta ligado a este estudiante")
                cursor.execute(
                    "UPDATE acudientes SET tipo_documento = %s, doc_identidad = %s, nombre_completo = %s, "
                    "       telefono = %s, correo_electronico = %s WHERE id_acudiente = %s",
                    (datos.tipo_documento, datos.doc_identidad.strip(), datos.nombre_completo.strip(),
                     datos.telefono.strip(), (_limpio(datos.correo_electronico) or "").lower() or None,
                     id_acudiente),
                )
                cursor.execute(
                    "UPDATE estudiante_acudiente SET parentesco = %s WHERE id_estudiante = %s AND id_acudiente = %s",
                    (datos.parentesco.strip(), id_estudiante, id_acudiente),
                )
                _marcar_principal(cursor, id_estudiante, id_acudiente, datos.es_principal)
    except psycopg.errors.UniqueViolation as error:
        raise _repetido(error, "acudiente")
    return {"mensaje": "Acudiente actualizado"}


@router.post("/estudiantes/{id_estudiante}/acudientes", status_code=201)
def agregar_acudiente(
    id_estudiante: int, datos: DatosAcudiente,
    usuario: dict = Depends(requiere_permiso("editar_estudiantes")),
):
    """Si ya existe un acudiente con ese documento (ej. hermanos), se reutiliza."""
    try:
        with obtener_conexion() as conexion:
            with conexion.cursor() as cursor:
                cursor.execute("SELECT 1 FROM estudiantes WHERE id_estudiante = %s", (id_estudiante,))
                if not cursor.fetchone():
                    raise HTTPException(status_code=404, detail="El estudiante no existe")
                cursor.execute(
                    "INSERT INTO acudientes (tipo_documento, doc_identidad, nombre_completo, telefono, correo_electronico) "
                    "VALUES (%s, %s, %s, %s, %s) "
                    "ON CONFLICT (doc_identidad) DO UPDATE SET telefono = EXCLUDED.telefono "
                    "RETURNING id_acudiente",
                    (datos.tipo_documento, datos.doc_identidad.strip(), datos.nombre_completo.strip(),
                     datos.telefono.strip(), (_limpio(datos.correo_electronico) or "").lower() or None),
                )
                id_acudiente = cursor.fetchone()["id_acudiente"]
                cursor.execute(
                    "SELECT COUNT(*) AS n FROM estudiante_acudiente WHERE id_estudiante = %s AND es_principal",
                    (id_estudiante,),
                )
                sin_principal = cursor.fetchone()["n"] == 0
                cursor.execute(
                    "INSERT INTO estudiante_acudiente (id_estudiante, id_acudiente, parentesco, es_principal) "
                    "VALUES (%s, %s, %s, FALSE)",
                    (id_estudiante, id_acudiente, datos.parentesco.strip()),
                )
                # Si no tenia principal, el nuevo queda como principal
                _marcar_principal(cursor, id_estudiante, id_acudiente, datos.es_principal or sin_principal)
    except psycopg.errors.UniqueViolation as error:
        if "estudiante_acudiente_pkey" in (error.diag.constraint_name or ""):
            raise HTTPException(status_code=409, detail="Ese acudiente ya esta registrado para este estudiante")
        raise _repetido(error, "acudiente")
    return {"mensaje": "Acudiente agregado", "id_acudiente": id_acudiente}


# =====================================================================
# B. Inscripciones: retirar, finalizar, reactivar, cambiar de grupo
# =====================================================================
class CambiosInscripcion(BaseModel):
    estado: Literal["activa", "retirada", "finalizada"] | None = None
    id_grupo: int | None = None


@router.patch("/inscripciones/{id_inscripcion}")
def cambiar_inscripcion(
    id_inscripcion: int, datos: CambiosInscripcion,
    usuario: dict = Depends(requiere_permiso("editar_inscripciones")),
):
    if datos.estado is None and datos.id_grupo is None:
        raise HTTPException(status_code=400, detail="No hay cambios")
    try:
        with obtener_conexion() as conexion:
            with conexion.cursor() as cursor:
                cursor.execute(
                    "SELECT id_curso, id_grupo, estado FROM inscripciones WHERE id_inscripcion = %s FOR UPDATE",
                    (id_inscripcion,),
                )
                actual = cursor.fetchone()
                if not actual:
                    raise HTTPException(status_code=404, detail="La inscripcion no existe")

                id_grupo = actual["id_grupo"]
                if datos.id_grupo is not None and datos.id_grupo != actual["id_grupo"]:
                    cursor.execute(
                        "SELECT id_curso, activo, nombre_grupo FROM grupos WHERE id_grupo = %s", (datos.id_grupo,)
                    )
                    grupo = cursor.fetchone()
                    if not grupo or not grupo["activo"]:
                        raise HTTPException(status_code=404, detail="El grupo no existe o esta inactivo")
                    if grupo["id_curso"] != actual["id_curso"]:
                        raise HTTPException(status_code=400, detail="Solo se puede cambiar a un grupo del mismo curso")
                    id_grupo = datos.id_grupo

                estado = datos.estado or actual["estado"]
                # el trigger de capacidad revisa el cupo al reactivar o cambiar de grupo
                cursor.execute(
                    "UPDATE inscripciones SET estado = %s, id_grupo = %s WHERE id_inscripcion = %s",
                    (estado, id_grupo, id_inscripcion),
                )
    except psycopg.errors.RaiseException as error:
        raise HTTPException(status_code=409, detail=str(error.diag.message_primary or "El grupo esta lleno"))
    except psycopg.errors.UniqueViolation:
        raise HTTPException(status_code=409, detail="Datos repetidos")
    return {"mensaje": "Inscripcion actualizada", "estado": estado, "id_grupo": id_grupo}


# =====================================================================
# C. Cursos y grupos
# =====================================================================
@router.get("/cursos/todos")
def listar_todos_los_cursos(usuario: dict = Depends(requiere_admin)):
    """Todos los cursos (activos e inactivos) con sus grupos e inscritos, para editarlos."""
    with obtener_conexion() as conexion:
        with conexion.cursor() as cursor:
            cursor.execute(
                "SELECT c.id_curso, c.nombre_curso, c.descripcion, c.fecha_inicio, c.fecha_fin, "
                "       c.valor_total, COALESCE(c.activo, TRUE) AS activo, "
                "       (SELECT COUNT(*) FROM grupos g WHERE g.id_curso = c.id_curso AND g.activo) AS grupos, "
                "       (SELECT COUNT(*) FROM inscripciones i "
                "        WHERE i.id_curso = c.id_curso AND i.estado = 'activa') AS inscritos "
                "FROM cursos c ORDER BY COALESCE(c.activo, TRUE) DESC, c.fecha_inicio DESC"
            )
            return cursor.fetchall()


class CambiosCurso(BaseModel):
    nombre_curso: str = Field(min_length=3, max_length=100)
    descripcion: str | None = Field(default=None, max_length=500)
    fecha_inicio: date
    fecha_fin: date
    valor_total: Decimal = Field(ge=0)
    activo: bool = True


@router.put("/cursos/{id_curso}")
def editar_curso(id_curso: int, datos: CambiosCurso, usuario: dict = Depends(requiere_admin)):
    """El valor nuevo aplica a las inscripciones futuras; las ya hechas guardan su valor acordado."""
    if datos.fecha_fin < datos.fecha_inicio:
        raise HTTPException(status_code=400, detail="La fecha de fin no puede ser antes del inicio")
    with obtener_conexion() as conexion:
        with conexion.cursor() as cursor:
            if not datos.activo:
                cursor.execute(
                    "SELECT COUNT(*) AS n FROM inscripciones WHERE id_curso = %s AND estado = 'activa'",
                    (id_curso,),
                )
                n = cursor.fetchone()["n"]
                if n:
                    raise HTTPException(
                        status_code=409,
                        detail=f"No se puede desactivar: el curso tiene {n} estudiante(s) activo(s). "
                               "Retíralos o finalízalos primero.",
                    )
            cursor.execute(
                "UPDATE cursos SET nombre_curso = %s, descripcion = %s, fecha_inicio = %s, fecha_fin = %s, "
                "       valor_total = %s, activo = %s WHERE id_curso = %s RETURNING id_curso",
                (datos.nombre_curso.strip(), _limpio(datos.descripcion), datos.fecha_inicio,
                 datos.fecha_fin, datos.valor_total, datos.activo, id_curso),
            )
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="El curso no existe")
    return {"mensaje": "Curso actualizado"}


class CambiosGrupo(BaseModel):
    nombre_grupo: str = Field(min_length=1, max_length=30)
    dia_semana: Literal["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]
    hora_inicio: time
    hora_fin: time
    capacidad_maxima: int = Field(ge=20, le=150)
    id_docente: int | None = None
    enlace_reunion: str | None = Field(default=None, max_length=500)


@router.put("/grupos/{id_grupo}")
def editar_grupo(id_grupo: int, datos: CambiosGrupo, usuario: dict = Depends(requiere_admin)):
    if datos.hora_fin <= datos.hora_inicio:
        raise HTTPException(status_code=400, detail="La hora de fin debe ser después de la de inicio")
    try:
        with obtener_conexion() as conexion:
            with conexion.cursor() as cursor:
                cursor.execute(
                    "SELECT COUNT(*) AS n FROM inscripciones WHERE id_grupo = %s AND estado = 'activa'",
                    (id_grupo,),
                )
                inscritos = cursor.fetchone()["n"]
                if datos.capacidad_maxima < inscritos:
                    raise HTTPException(
                        status_code=409,
                        detail=f"El cupo no puede ser menor a los {inscritos} estudiantes activos del grupo",
                    )
                cursor.execute(
                    "UPDATE grupos SET nombre_grupo = %s, dia_semana = %s, hora_inicio = %s, hora_fin = %s, "
                    "       capacidad_maxima = %s, id_docente = %s, enlace_reunion = %s "
                    "WHERE id_grupo = %s RETURNING id_grupo",
                    (datos.nombre_grupo.strip(), datos.dia_semana, datos.hora_inicio, datos.hora_fin,
                     datos.capacidad_maxima, datos.id_docente, _limpio(datos.enlace_reunion), id_grupo),
                )
                if not cursor.fetchone():
                    raise HTTPException(status_code=404, detail="El grupo no existe")
    except psycopg.errors.UniqueViolation:
        raise HTTPException(status_code=409, detail="Ya hay un grupo con ese nombre en el mismo curso")
    except psycopg.errors.ForeignKeyViolation:
        raise HTTPException(status_code=400, detail="Ese docente no existe")
    return {"mensaje": "Grupo actualizado"}


class EstadoGrupo(BaseModel):
    activo: bool


@router.patch("/grupos/{id_grupo}/activo")
def activar_grupo(id_grupo: int, datos: EstadoGrupo, usuario: dict = Depends(requiere_admin)):
    with obtener_conexion() as conexion:
        with conexion.cursor() as cursor:
            if not datos.activo:
                cursor.execute(
                    "SELECT COUNT(*) AS n FROM inscripciones WHERE id_grupo = %s AND estado = 'activa'",
                    (id_grupo,),
                )
                n = cursor.fetchone()["n"]
                if n:
                    raise HTTPException(
                        status_code=409,
                        detail=f"No se puede desactivar: el grupo tiene {n} estudiante(s) activo(s). "
                               "Cámbialos de grupo, retíralos o finalízalos primero.",
                    )
            else:
                cursor.execute(
                    "SELECT COALESCE(c.activo, TRUE) AS activo FROM grupos g "
                    "JOIN cursos c ON c.id_curso = g.id_curso WHERE g.id_grupo = %s",
                    (id_grupo,),
                )
                curso = cursor.fetchone()
                if curso and not curso["activo"]:
                    raise HTTPException(status_code=409, detail="El curso de este grupo está inactivo. Actívalo primero.")
            cursor.execute(
                "UPDATE grupos SET activo = %s WHERE id_grupo = %s RETURNING id_grupo", (datos.activo, id_grupo)
            )
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="El grupo no existe")
    return {"mensaje": "Grupo activado" if datos.activo else "Grupo desactivado"}


# =====================================================================
# D. Pagos: corregir y eliminar
# =====================================================================
class CambiosPago(BaseModel):
    monto_pagado: Decimal = Field(gt=0)
    metodo_pago: Literal["efectivo", "nequi_daviplata", "transferencia", "tarjeta", "otro"]
    fecha_pago: date
    referencia: str | None = Field(default=None, max_length=60)
    descripcion: str | None = Field(default=None, max_length=200)


@router.get("/pagos/{id_pago}")
def ver_pago(id_pago: int, usuario: dict = Depends(requiere_permiso("ver_pagos"))):
    with obtener_conexion() as conexion:
        with conexion.cursor() as cursor:
            cursor.execute(
                "SELECT p.id_pago, p.id_inscripcion, p.fecha_pago, p.monto_pagado, p.metodo_pago, "
                "       p.referencia, p.descripcion, e.nombre_completo AS estudiante, c.nombre_curso AS curso, "
                "       EXISTS (SELECT 1 FROM comprobantes_pago cp WHERE cp.id_pago = p.id_pago) AS tiene_comprobante "
                "FROM pagos p JOIN inscripciones i ON i.id_inscripcion = p.id_inscripcion "
                "JOIN estudiantes e ON e.id_estudiante = i.id_estudiante "
                "JOIN cursos c ON c.id_curso = i.id_curso WHERE p.id_pago = %s",
                (id_pago,),
            )
            pago = cursor.fetchone()
    if not pago:
        raise HTTPException(status_code=404, detail="El pago no existe")
    return pago


@router.put("/pagos/{id_pago}")
def corregir_pago(id_pago: int, datos: CambiosPago, usuario: dict = Depends(requiere_permiso("editar_pagos"))):
    if datos.fecha_pago > _hoy() + timedelta(days=1):
        raise HTTPException(status_code=400, detail="La fecha del pago no puede ser futura")
    with obtener_conexion() as conexion:
        with conexion.cursor() as cursor:
            cursor.execute(
                "SELECT p.id_inscripcion, i.valor_acordado FROM pagos p "
                "JOIN inscripciones i ON i.id_inscripcion = p.id_inscripcion "
                "WHERE p.id_pago = %s FOR UPDATE OF i",
                (id_pago,),
            )
            pago = cursor.fetchone()
            if not pago:
                raise HTTPException(status_code=404, detail="El pago no existe")
            # Lo pagado en los OTROS pagos + el monto nuevo no puede pasar el valor acordado
            cursor.execute(
                "SELECT COALESCE(SUM(monto_pagado), 0) AS total FROM pagos "
                "WHERE id_inscripcion = %s AND id_pago <> %s",
                (pago["id_inscripcion"], id_pago),
            )
            maximo = pago["valor_acordado"] - cursor.fetchone()["total"]
            if datos.monto_pagado > maximo:
                raise HTTPException(
                    status_code=400,
                    detail=f"El monto supera lo que se debe en esa inscripción (máximo ${maximo:,.0f})".replace(",", "."),
                )
            cursor.execute(
                "UPDATE pagos SET monto_pagado = %s, metodo_pago = %s, fecha_pago = %s, referencia = %s, "
                "       descripcion = %s WHERE id_pago = %s",
                (datos.monto_pagado, datos.metodo_pago, datos.fecha_pago,
                 _limpio(datos.referencia), _limpio(datos.descripcion), id_pago),
            )
    return {"mensaje": "Pago corregido"}


@router.delete("/pagos/{id_pago}")
def eliminar_pago(id_pago: int, usuario: dict = Depends(requiere_permiso("editar_pagos"))):
    """Para pagos registrados por error (duplicados o a otro estudiante).
    Su comprobante se borra con el (ON DELETE CASCADE)."""
    with obtener_conexion() as conexion:
        with conexion.cursor() as cursor:
            cursor.execute("DELETE FROM pagos WHERE id_pago = %s RETURNING monto_pagado", (id_pago,))
            borrado = cursor.fetchone()
    if not borrado:
        raise HTTPException(status_code=404, detail="El pago no existe")
    return {"mensaje": "Pago eliminado", "monto": borrado["monto_pagado"]}
