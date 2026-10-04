import os
from dotenv import load_dotenv
from fastapi import FastAPI
import psycopg

load_dotenv()

app = FastAPI()


def obtener_conexion():
    return psycopg.connect(
        host=os.getenv("DB_HOST"),
        port=os.getenv("DB_PORT"),
        dbname=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
    )


@app.get("/")
def inicio():
    return {"mensaje": "El backend está funcionando"}


@app.get("/version-db")
def version_db():
    conexion = obtener_conexion()
    cursor = conexion.cursor()
    cursor.execute("SELECT version();")
    resultado = cursor.fetchone()
    cursor.close()
    conexion.close()
    return {"version_postgres": resultado[0]}
