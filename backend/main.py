import os

import bcrypt
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from auth import crear_token, usuario_actual
from db import obtener_conexion
from resumen import router as router_resumen

load_dotenv()

app = FastAPI()

origenes = [
    "http://localhost:3000",
    "https://mi-proyecto-preicma.vercel.app",
]
frontend_url = os.getenv("FRONTEND_URL")
if frontend_url:
    origenes.append(frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origenes,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router_resumen)


@app.get("/")
def inicio():
    return {"mensaje": "El backend esta funcionando"}


@app.get("/version-db")
def version_db():
    with obtener_conexion() as conexion:
        with conexion.cursor() as cursor:
            cursor.execute("SELECT version() AS version;")
            resultado = cursor.fetchone()
    return {"version_postgres": resultado["version"]}


class DatosLogin(BaseModel):
    correo: str
    contrasena: str


@app.post("/login")
def login(datos: DatosLogin):
    correo = datos.correo.strip().lower()

    with obtener_conexion() as conexion:
        with conexion.cursor() as cursor:
            cursor.execute(
                "SELECT id_usuario, nombre_usuario, contrasena_hash, rol "
                "FROM usuarios WHERE lower(nombre_usuario) = %s AND activo",
                (correo,),
            )
            fila = cursor.fetchone()

            credenciales_ok = False
            if fila:
                try:
                    credenciales_ok = bcrypt.checkpw(
                        datos.contrasena.encode("utf-8"),
                        fila["contrasena_hash"].encode("utf-8"),
                    )
                except ValueError:
                    # el hash guardado no es un hash bcrypt valido (ej. usuarios de ejemplo)
                    credenciales_ok = False

            if not credenciales_ok:
                raise HTTPException(status_code=401, detail="Correo o contraseña incorrectos")

            cursor.execute(
                "UPDATE usuarios SET fecha_ultima_sesion = CURRENT_TIMESTAMP WHERE id_usuario = %s",
                (fila["id_usuario"],),
            )

    token = crear_token(fila["id_usuario"], fila["nombre_usuario"], fila["rol"])
    return {
        "mensaje": "ok",
        "usuario": fila["nombre_usuario"],
        "rol": fila["rol"],
        "token": token,
    }


@app.get("/yo")
def yo(usuario: dict = Depends(usuario_actual)):
    """Quien soy y que puedo hacer. La pagina lo usa para mostrar u ocultar secciones."""
    return {
        "usuario": usuario["nombre_usuario"],
        "rol": usuario["rol"],
        "permisos": sorted(usuario["permisos"]),
    }
