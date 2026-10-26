import os

import bcrypt
import psycopg
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

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


def obtener_conexion():
    url = os.getenv("DATABASE_URL")
    if url:
        return psycopg.connect(url)
    return psycopg.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=os.getenv("DB_PORT", "5433"),
        dbname=os.getenv("DB_NAME", "preicfes"),
        user=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD"),
    )


@app.get("/")
def inicio():
    return {"mensaje": "El backend esta funcionando"}


@app.get("/version-db")
def version_db():
    with obtener_conexion() as conexion:
        with conexion.cursor() as cursor:
            cursor.execute("SELECT version();")
            resultado = cursor.fetchone()
    return {"version_postgres": resultado[0]}


class DatosLogin(BaseModel):
    correo: str
    contrasena: str


@app.post("/login")
def login(datos: DatosLogin):
    correo = datos.correo.strip().lower()

    with obtener_conexion() as conexion:
        with conexion.cursor() as cursor:
            cursor.execute(
                "SELECT nombre_usuario, contrasena_hash, rol "
                "FROM usuarios WHERE lower(nombre_usuario) = %s",
                (correo,),
            )
            fila = cursor.fetchone()

    credenciales_ok = False
    if fila:
        try:
            credenciales_ok = bcrypt.checkpw(
                datos.contrasena.encode("utf-8"),
                fila[1].encode("utf-8"),
            )
        except ValueError:
            # el hash guardado no es un hash bcrypt valido (ej. usuarios de ejemplo)
            credenciales_ok = False

    if not credenciales_ok:
        raise HTTPException(status_code=401, detail="Correo o contraseña incorrectos")

    return {"mensaje": "ok", "usuario": fila[0], "rol": fila[2]}