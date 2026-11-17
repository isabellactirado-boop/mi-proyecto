"""Reto diario de la app de estudiantes: una pregunta por dia y la racha.

- GET  /estudiante/diaria  -> la pregunta de hoy, la racha y los ultimos dias.
- POST /estudiante/diaria  -> guarda la respuesta de hoy (solo una vez por dia).

La racha son los dias SEGUIDOS en que el estudiante respondio (acierte o no):
lo que se premia es volver todos los dias. Si ayer respondio y hoy todavia no,
la racha sigue viva hasta que termine el dia.
Las preguntas estan en preguntas_diarias.py; la tabla es respuestas_diarias
(database/11_reto_diario.sql).
"""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import requiere_estudiante
from db import obtener_conexion
from preguntas_diarias import AREAS, pregunta_del_dia

router = APIRouter(prefix="/estudiante")

DIAS_CAMINO = 30   # cuantos dias hacia atras se envian para pintar el camino


def _hoy():
    return datetime.now(ZoneInfo("America/Bogota")).date()


def _rachas(fechas, hoy):
    """(racha actual, mejor racha) a partir de las fechas respondidas."""
    dias = set(fechas)

    actual = 0
    dia = hoy if hoy in dias else hoy - timedelta(days=1)
    while dia in dias:
        actual += 1
        dia -= timedelta(days=1)

    mejor = seguidos = 0
    anterior = None
    for dia in sorted(dias):
        seguidos = seguidos + 1 if anterior and dia - anterior == timedelta(days=1) else 1
        mejor = max(mejor, seguidos)
        anterior = dia
    return actual, mejor


def _estado(cursor, id_estudiante):
    hoy = _hoy()
    cursor.execute(
        "SELECT fecha, opcion, correcta FROM respuestas_diarias "
        "WHERE id_estudiante = %s ORDER BY fecha",
        (id_estudiante,),
    )
    filas = cursor.fetchall()
    racha, mejor = _rachas([f["fecha"] for f in filas], hoy)

    pregunta = pregunta_del_dia(hoy)
    de_hoy = next((f for f in filas if f["fecha"] == hoy), None)
    reto = {
        "respondida": de_hoy is not None,
        "area": AREAS[pregunta["area"]],
        "enunciado": pregunta["enunciado"],
        "opciones": pregunta["opciones"],
    }
    # La respuesta correcta solo viaja despues de responder
    if de_hoy:
        reto.update(
            elegida=de_hoy["opcion"],
            correcta=pregunta["correcta"],
            acerto=de_hoy["correcta"],
            explicacion=pregunta["explicacion"],
        )

    desde = hoy - timedelta(days=DIAS_CAMINO)
    return {
        "fecha": hoy,
        "racha": racha,
        "mejor_racha": mejor,
        "respondidas": len(filas),
        "aciertos": sum(1 for f in filas if f["correcta"]),
        "hoy": reto,
        "dias": [{"fecha": f["fecha"], "acerto": f["correcta"]} for f in filas if f["fecha"] >= desde],
    }


@router.get("/diaria")
def diaria(usuario: dict = Depends(requiere_estudiante)):
    with obtener_conexion() as conexion:
        with conexion.cursor() as cursor:
            return _estado(cursor, usuario["id_estudiante"])


class Respuesta(BaseModel):
    opcion: int = Field(ge=0, le=3)


@router.post("/diaria")
def responder(datos: Respuesta, usuario: dict = Depends(requiere_estudiante)):
    # El propietario mira la app como un estudiante, pero no responde por el
    if usuario["rol"] != "estudiante":
        raise HTTPException(status_code=403, detail="Solo el estudiante puede responder su reto")

    hoy = _hoy()
    pregunta = pregunta_del_dia(hoy)
    with obtener_conexion() as conexion:
        with conexion.cursor() as cursor:
            # Si ya respondio hoy (doble toque, dos celulares) vale la primera
            cursor.execute(
                "INSERT INTO respuestas_diarias (id_estudiante, fecha, id_pregunta, opcion, correcta) "
                "VALUES (%s, %s, %s, %s, %s) "
                "ON CONFLICT (id_estudiante, fecha) DO NOTHING",
                (usuario["id_estudiante"], hoy, pregunta["id"], datos.opcion,
                 datos.opcion == pregunta["correcta"]),
            )
            return _estado(cursor, usuario["id_estudiante"])
