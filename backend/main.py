import os

import bcrypt
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from auth import crear_token, usuario_actual
from db import obtener_conexion
from estudiantes import router as router_estudiantes
from resumen import router as router_resumen
from usuarios import router as router_usuarios
from estudiante import router as router_estudiante
from academico import router as router_academico
from inscripciones import router as router_inscripciones
from pagos import router as router_pagos

load_dotenv()

app = FastAPI()

origenes = [
    "http://localhost:3000",
    "https://mi-proyecto-preicma.vercel.app",
    # App movil (Capacitor): Android sirve la app desde https://localhost
    "https://localhost",
    "capacitor://localhost",
]
frontend_url = os.getenv("FRONTEND_URL")
if frontend_url:
    origenes.append(frontend_url)

# Vercel crea una direccion temporal en cada subida, con esta forma:
# https://mi-proyecto-<codigo>-preicma.vercel.app  (equipo "preicma").
# Se aceptan solo esas, ademas de las direcciones exactas de arriba.
app.add_middleware(
    CORSMiddleware,
    allow_origins=origenes,
    allow_origin_regex=r"^https://mi-proyecto-[a-z0-9]+-preicma\.vercel\.app$",
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router_resumen)
app.include_router(router_estudiantes)
app.include_router(router_usuarios)
app.include_router(router_estudiante)
app.include_router(router_academico)
app.include_router(router_inscripciones)
app.include_router(router_pagos)


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
                "SELECT id_usuario, nombre_usuario, contrasena_hash, rol, debe_cambiar_contrasena "
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

    token = crear_token(
        fila["id_usuario"], fila["nombre_usuario"], fila["rol"], fila["contrasena_hash"]
    )
    return {
        "mensaje": "ok",
        "usuario": fila["nombre_usuario"],
        "rol": fila["rol"],
        "token": token,
        "debe_cambiar_contrasena": fila["debe_cambiar_contrasena"],
    }


@app.get("/yo")
def yo(usuario: dict = Depends(usuario_actual)):
    """Quien soy y que puedo hacer. La pagina lo usa para mostrar u ocultar secciones."""
    return {
        "usuario": usuario["nombre_usuario"],
        "rol": usuario["rol"],
        "debe_cambiar_contrasena": usuario["debe_cambiar_contrasena"],
        "permisos": sorted(usuario["permisos"]),
    }
