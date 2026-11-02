import psycopg
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import requiere_permiso
from db import obtener_conexion

router = APIRouter()


class CambioActivo(BaseModel):
    activo: bool


@router.patch("/usuarios/{id_usuario}/activo")
def activar_o_desactivar_usuario(
    id_usuario: int,
    datos: CambioActivo,
    usuario: dict = Depends(requiere_permiso("gestionar_usuarios")),
):
    """Desactiva o reactiva una cuenta. Solo quien tiene 'gestionar_usuarios' (el propietario).

    Una cuenta desactivada no puede iniciar sesion y su sesion actual deja de
    servir de inmediato (la sesion se valida contra la base en cada peticion).
    Los datos del usuario no se borran: se puede reactivar cuando se quiera.
    """
    if id_usuario == usuario["id_usuario"] and not datos.activo:
        raise HTTPException(status_code=400, detail="No puedes desactivar tu propia cuenta")

    try:
        with obtener_conexion() as conexion:
            with conexion.cursor() as cursor:
                cursor.execute(
                    "UPDATE usuarios SET activo = %s WHERE id_usuario = %s "
                    "RETURNING id_usuario, nombre_usuario, rol, activo",
                    (datos.activo, id_usuario),
                )
                fila = cursor.fetchone()
    except psycopg.errors.RaiseException as error:
        # reglas de la base, por ejemplo: solo puede haber un propietario activo
        raise HTTPException(status_code=409, detail=str(error).splitlines()[0])

    if not fila:
        raise HTTPException(status_code=404, detail="El usuario no existe")
    return fila


@router.delete("/usuarios/{id_usuario}")
def eliminar_usuario(
    id_usuario: int,
    usuario: dict = Depends(requiere_permiso("gestionar_usuarios")),
):
    """Elimina para siempre la cuenta de acceso (correo y contraseña).

    No borra la ficha del estudiante o del docente ni su historial (pagos,
    asistencias, resultados, clases): esos datos siguen en el panel y se le
    puede volver a crear una cuenta. Para un bloqueo reversible, desactivar.
    """
    if id_usuario == usuario["id_usuario"]:
        raise HTTPException(status_code=400, detail="No puedes eliminar tu propia cuenta")

    with obtener_conexion() as conexion:
        with conexion.cursor() as cursor:
            cursor.execute("SELECT rol FROM usuarios WHERE id_usuario = %s", (id_usuario,))
            fila = cursor.fetchone()
            if not fila:
                raise HTTPException(status_code=404, detail="El usuario no existe")
            if fila["rol"] == "propietario":
                raise HTTPException(status_code=400, detail="La cuenta del propietario no se puede eliminar")
            cursor.execute(
                "DELETE FROM usuarios WHERE id_usuario = %s RETURNING nombre_usuario", (id_usuario,)
            )
            eliminado = cursor.fetchone()

    return {"mensaje": "Cuenta eliminada", "usuario": eliminado["nombre_usuario"]}
