from fastapi import FastAPI
import psycopg

app = FastAPI()

@app.get("/")
def inicio():
    return {"mensaje": "El backend está funcionando"}

@app.get("/version-db")
def version_db():
    conexion = psycopg.connect(
    host="localhost",
    port="5433",
    dbname="postgres",
    user="postgres",
    password="miclave"
)
    cursor = conexion.cursor()
    cursor.execute("SELECT version();")
    resultado = cursor.fetchone()
    cursor.close()
    conexion.close()
    return {"version_postgres": resultado[0]}