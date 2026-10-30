import hashlib
import os
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from db import obtener_conexion

ALGORITMO = "HS256"
HORAS_SESION = 8

esquema = HTTPBearer(auto_error=False)


def _secreto() -> str:
    secreto = os.getenv("JWT_SECRET")
    if not secreto or len(secreto) < 32:
        raise HTTPException(
            status_code=500,
            detail="El servidor no tiene JWT_SECRET configurado (minimo 32 caracteres)",
        )
    return secreto


def generar_hash(contrasena: str) -> str:
    """Convierte una contrasena en su hash bcrypt (lo unico que se guarda)."""
    return bcrypt.hashpw(contrasena.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def huella_contrasena(contrasena_hash: str) -> str:
    """Huella corta del hash guardado. Va dentro del token: si la contrasena
    cambia, la huella cambia y los tokens anteriores dejan de servir."""
    return hashlib.sha256(contrasena_hash.encode("utf-8")).hexdigest()[:16]


def crear_token(id_usuario: int, usuario: str, rol: str, contrasena_hash: str) -> str:
    datos = {
        "sub": str(id_usuario),
        "usuario": usuario,
        "rol": rol,
        "h": huella_contrasena(contrasena_hash),
        "exp": datetime.now(timezone.utc) + timedelta(hours=HORAS_SESION),
    }
    return jwt.encode(datos, _secreto(), algorithm=ALGORITMO)


def usuario_actual(
    credenciales: HTTPAuthorizationCredentials | None = Depends(esquema),
) -> dict:
    """Devuelve quien hace la peticion, con sus permisos reales de la BD.

    Los permisos se leen de la base de datos en cada peticion, asi que si se
    desactiva un usuario, se cambia su rol o su contrasena, el cambio aplica
    de inmediato.
    """
    if credenciales is None:
        raise HTTPException(status_code=401, detail="Debes iniciar sesion")

    try:
        datos = jwt.decode(credenciales.credentials, _secreto(), algorithms=[ALGORITMO])
        id_usuario = int(datos["sub"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="La sesion expiro, inicia sesion de nuevo")
    except (jwt.InvalidTokenError, KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Sesion invalida")

    with obtener_conexion() as conexion:
        with conexion.cursor() as cursor:
            cursor.execute(
                "SELECT id_usuario, nombre_usuario, rol, id_docente, "
                "       contrasena_hash, debe_cambiar_contrasena "
                "FROM usuarios WHERE id_usuario = %s AND activo",
                (id_usuario,),
            )
            usuario = cursor.fetchone()
            if not usuario:
                raise HTTPException(status_code=401, detail="Usuario inactivo o inexistente")

            if datos.get("h") != huella_contrasena(usuario["contrasena_hash"]):
                raise HTTPException(
                    status_code=401,
                    detail="Tu contraseña cambio, inicia sesion de nuevo",
                )

            cursor.execute(
                "SELECT p.nombre_permiso "
                "FROM usuarios u "
                "JOIN rol_permiso rp ON rp.id_rol = u.id_rol "
                "JOIN permisos p ON p.id_permiso = rp.id_permiso "
                "WHERE u.id_usuario = %s",
                (id_usuario,),
            )
            usuario["permisos"] = {fila["nombre_permiso"] for fila in cursor.fetchall()}

    del usuario["contrasena_hash"]  # el hash no sale de esta funcion
    return usuario


def requiere_permiso(nombre_permiso: str):
    """Uso: Depends(requiere_permiso("ver_pagos")). Responde 403 si no lo tiene."""

    def dependencia(usuario: dict = Depends(usuario_actual)) -> dict:
        if nombre_permiso not in usuario["permisos"]:
            raise HTTPException(status_code=403, detail="No tienes permiso para esta accion")
        return usuario

    return dependencia
