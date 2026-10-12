from fastapi import FastAPI
import os
from dotenv import load_dotenv
import psycopg

load_dotenv()

app = FastAPI()

@app.get("/")
def inicio():
    return {"mensaje": "El backend esta funcionando"}

@app.get("/version-db")
def version_db():
    conexion = psycopg.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=os.getenv("DB_PORT", "5433"),
        dbname=os.getenv("DB_NAME", "postgres"),
        user=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD", "miclave")
    )
    cursor = conexion.cursor()
    cursor.execute("SELECT version();")
    resultado = cursor.fetchone()
    cursor.close()
    conexion.close()
    return {"version_postgres": resultado[0]}
