import os
from datetime import datetime, timedelta, timezone

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


def crear_token(id_usuario: int, usuario: str, rol: str) -> str:
    datos = {
        "sub": str(id_usuario),
        "usuario": usuario,
        "rol": rol,
        "exp": datetime.now(timezone.utc) + timedelta(hours=HORAS_SESION),
    }
    return jwt.encode(datos, _secreto(), algorithm=ALGORITMO)


def usuario_actual(
    credenciales: HTTPAuthorizationCredentials | None = Depends(esquema),
) -> dict:
    """Devuelve quien hace la peticion, con sus permisos reales de la BD.

    Los permisos se leen de la base de datos en cada peticion, asi que si se
    desactiva un usuario o se cambia su rol, el cambio aplica de inmediato.
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
                "SELECT id_usuario, nombre_usuario, rol, id_docente "
                "FROM usuarios WHERE id_usuario = %s AND activo",
                (id_usuario,),
            )
            usuario = cursor.fetchone()
            if not usuario:
                raise HTTPException(status_code=401, detail="Usuario inactivo o inexistente")

            cursor.execute(
                "SELECT p.nombre_permiso "
                "FROM usuarios u "
                "JOIN rol_permiso rp ON rp.id_rol = u.id_rol "
                "JOIN permisos p ON p.id_permiso = rp.id_permiso "
                "WHERE u.id_usuario = %s",
                (id_usuario,),
            )
            usuario["permisos"] = {fila["nombre_permiso"] for fila in cursor.fetchall()}

    return usuario


def requiere_permiso(nombre_permiso: str):
    """Uso: Depends(requiere_permiso("ver_pagos")). Responde 403 si no lo tiene."""

    def dependencia(usuario: dict = Depends(usuario_actual)) -> dict:
        if nombre_permiso not in usuario["permisos"]:
            raise HTTPException(status_code=403, detail="No tienes permiso para esta accion")
        return usuario

    return dependencia
