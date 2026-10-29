import os

import psycopg
from psycopg.rows import dict_row


def obtener_conexion():
    """Abre una conexion a PostgreSQL (Neon en produccion, local en desarrollo).

    Las filas llegan como diccionarios: fila["nombre_columna"].
    La rama de Neon (pruebas o production) se elige con la variable
    de entorno DATABASE_URL, sin tocar el codigo.
    """
    url = os.getenv("DATABASE_URL")
    if url:
        return psycopg.connect(url, row_factory=dict_row)
    return psycopg.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=os.getenv("DB_PORT", "5433"),
        dbname=os.getenv("DB_NAME", "preicfes"),
        user=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD"),
        row_factory=dict_row,
    )
