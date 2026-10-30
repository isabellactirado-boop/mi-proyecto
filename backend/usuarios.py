import re
import secrets
from typing import Literal

import bcrypt
import psycopg
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import crear_token, generar_hash, requiere_permiso, usuario_actual
from db import obtener_conexion

router = APIRouter()

# Sin 0/O, 1/l/I para que la contrasena temporal sea facil de dictar
_ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
_CORREO = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def contrasena_temporal() -> str:
    while True:
        clave = "".join(secrets.choice(_ALFABETO) for _ in range(10))
        if any(c.isdigit() for c in clave) and any(c.isalpha() for c in clave):
            return clave


def validar_contrasena_nueva(contrasena: str) -> None:
    """Regla de contrasenas: 8 a 72 caracteres, con al menos una letra y un numero."""
    if len(contrasena.encode("utf-8")) > 72:
        raise HTTPException(status_code=400, detail="La contraseña no puede pasar de 72 caracteres")
    if len(contrasena) < 8:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 8 caracteres")
    if not any(c.isalpha() for c in contrasena) or not any(c.isdigit() for c in contrasena):
        raise HTTPException(
            status_code=400, detail="La contraseña debe tener al menos una letra y un numero"
        )


# ---------------------------------------------------------------------
# Cambiar mi propia contrasena (cualquier usuario con sesion)
# ---------------------------------------------------------------------
class CambioContrasena(BaseModel):
    contrasena_actual: str
    contrasena_nueva: str


@router.post("/cambiar-contrasena")
def cambiar_contrasena(datos: CambioContrasena, usuario: dict = Depends(usuario_actual)):
    validar_contrasena_nueva(datos.contrasena_nueva)
    if datos.contrasena_nueva == datos.contrasena_actual:
        raise HTTPException(status_code=400, detail="La contraseña nueva debe ser distinta a la actual")

    with obtener_conexion() as conexion:
        with conexion.cursor() as cursor:
            cursor.execute(
                "SELECT contrasena_hash FROM usuarios WHERE id_usuario = %s",
                (usuario["id_usuario"],),
            )
            guardado = cursor.fetchone()["contrasena_hash"]
            try:
                actual_ok = bcrypt.checkpw(
                    datos.contrasena_actual.encode("utf-8"), guardado.encode("utf-8")
                )
            except ValueError:
                actual_ok = False
            if not actual_ok:
                raise HTTPException(status_code=400, detail="La contraseña actual no es correcta")

            nuevo_hash = generar_hash(datos.contrasena_nueva)
            cursor.execute(
                "UPDATE usuarios SET contrasena_hash = %s, debe_cambiar_contrasena = FALSE "
                "WHERE id_usuario = %s",
                (nuevo_hash, usuario["id_usuario"]),
            )

    # Al cambiar la contrasena los tokens viejos dejan de servir; se entrega uno nuevo.
    token = crear_token(usuario["id_usuario"], usuario["nombre_usuario"], usuario["rol"], nuevo_hash)
    return {"mensaje": "Contraseña actualizada", "token": token}


# ---------------------------------------------------------------------
# Gestion de usuarios (solo quien tenga el permiso gestionar_usuarios:
# el propietario / superadmin)
# ---------------------------------------------------------------------
@router.get("/usuarios")
def listar_usuarios(usuario: dict = Depends(requiere_permiso("gestionar_usuarios"))):
    with obtener_conexion() as conexion:
        with conexion.cursor() as cursor:
            cursor.execute(
                "SELECT u.id_usuario, u.nombre_usuario, u.rol, u.activo, "
                "       u.debe_cambiar_contrasena, u.fecha_ultima_sesion, "
                "       d.nombre_completo AS nombre_docente "
                "FROM usuarios u LEFT JOIN docentes d ON d.id_docente = u.id_docente "
                "ORDER BY u.id_usuario"
            )
            return cursor.fetchall()


class NuevoUsuario(BaseModel):
    correo: str
    rol: Literal["administrador", "profesor"]
    # Solo para profesores (se crea tambien su ficha de docente):
    nombre_completo: str | None = None
    tipo_documento: Literal["TI", "CC", "CE", "PPT", "OTRO"] | None = None
    doc_identidad: str | None = None
    especialidad: str | None = None
    telefono: str | None = None


@router.post("/usuarios", status_code=201)
def crear_usuario(
    datos: NuevoUsuario, usuario: dict = Depends(requiere_permiso("gestionar_usuarios"))
):
    correo = datos.correo.strip().lower()
    if not _CORREO.match(correo):
        raise HTTPException(status_code=400, detail="El correo no es valido")

    if datos.rol == "profesor":
        if not (datos.nombre_completo and datos.nombre_completo.strip()):
            raise HTTPException(status_code=400, detail="Falta el nombre completo del profesor")
        if not datos.tipo_documento or not (datos.doc_identidad and datos.doc_identidad.strip()):
            raise HTTPException(
                status_code=400, detail="Faltan el tipo y el numero de documento del profesor"
            )

    temporal = contrasena_temporal()
    try:
        with obtener_conexion() as conexion:
            with conexion.cursor() as cursor:
                id_docente = None
                if datos.rol == "profesor":
                    cursor.execute(
                        "INSERT INTO docentes (nombre_completo, tipo_documento, doc_identidad, "
                        "                      especialidad, telefono, correo_electronico) "
                        "VALUES (%s, %s, %s, %s, %s, %s) RETURNING id_docente",
                        (
                            datos.nombre_completo.strip(),
                            datos.tipo_documento,
                            datos.doc_identidad.strip(),
                            datos.especialidad,
                            datos.telefono,
                            correo,
                        ),
                    )
                    id_docente = cursor.fetchone()["id_docente"]

                cursor.execute(
                    "INSERT INTO usuarios (nombre_usuario, contrasena_hash, rol, id_docente, "
                    "                      debe_cambiar_contrasena) "
                    "VALUES (%s, %s, %s, %s, TRUE) RETURNING id_usuario",
                    (correo, generar_hash(temporal), datos.rol, id_docente),
                )
                id_usuario = cursor.fetchone()["id_usuario"]
    except psycopg.errors.UniqueViolation as error:
        restriccion = (error.diag.constraint_name or "").lower()
        if "doc_identidad" in restriccion:
            detalle = "Ya existe un docente con ese documento"
        else:
            detalle = "Ya existe un usuario o docente con ese correo"
        raise HTTPException(status_code=409, detail=detalle)

    return {
        "id_usuario": id_usuario,
        "usuario": correo,
        "rol": datos.rol,
        "contrasena_temporal": temporal,
        "aviso": "Entrega esta contraseña a la persona. No se vuelve a mostrar y debera cambiarla al entrar.",
    }


@router.post("/usuarios/{id_usuario}/restablecer-contrasena")
def restablecer_contrasena(
    id_usuario: int, usuario: dict = Depends(requiere_permiso("gestionar_usuarios"))
):
    if id_usuario == usuario["id_usuario"]:
        raise HTTPException(
            status_code=400, detail="Para cambiar tu propia contraseña usa 'Cambiar contraseña'"
        )

    temporal = contrasena_temporal()
    with obtener_conexion() as conexion:
        with conexion.cursor() as cursor:
            cursor.execute(
                "UPDATE usuarios SET contrasena_hash = %s, debe_cambiar_contrasena = TRUE "
                "WHERE id_usuario = %s RETURNING nombre_usuario",
                (generar_hash(temporal), id_usuario),
            )
            fila = cursor.fetchone()
            if not fila:
                raise HTTPException(status_code=404, detail="Usuario no encontrado")

    return {
        "id_usuario": id_usuario,
        "usuario": fila["nombre_usuario"],
        "contrasena_temporal": temporal,
        "aviso": "Entrega esta contraseña a la persona. No se vuelve a mostrar y debera cambiarla al entrar.",
    }
