"""Reto diario de la app de estudiantes: una pregunta por dia y la racha.

- GET  /estudiante/diaria  -> la pregunta de hoy, la racha y los ultimos dias.
- POST /estudiante/diaria  -> guarda la respuesta de hoy (solo una vez por dia).

La racha son los dias SEGUIDOS en que el estudiante respondio (acierte o no):
lo que se premia es volver todos los dias. Si ayer respondio y hoy todavia no,
la racha sigue viva hasta que termine el dia.

De donde sale la pregunta: el servidor la crea sola con Gemini (generador.py)
y la guarda en preguntas_del_dia, asi todos ven la misma. La de mañana se
prepara por adelantado, en segundo plano, cuando alguien abre el reto de hoy.
Si no se pudo generar, ese dia se usa una del banco fijo (preguntas_diarias.py).
Tablas: respuestas_diarias (11_reto_diario.sql) y preguntas_del_dia
(12_preguntas_del_dia.sql).
"""

import time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from psycopg.errors import UndefinedTable
from psycopg.types.json import Jsonb
from pydantic import BaseModel, Field

import generador
from auth import requiere_estudiante
from db import obtener_conexion
from preguntas_diarias import AREAS, pregunta_del_dia

router = APIRouter(prefix="/estudiante")

DIAS_CAMINO = 30            # cuantos dias hacia atras se envian para pintar el camino
PAUSA_REINTENTO = 30 * 60   # segundos entre intentos de preparar la pregunta de mañana
_ultimo_intento = {}        # fecha -> cuando se intento generar por ultima vez


def _hoy():
    return datetime.now(ZoneInfo("America/Bogota")).date()


# ---------- la pregunta de cada dia ----------

def _leer_pregunta(cursor, dia):
    cursor.execute(
        "SELECT id_pregunta AS id, area, enunciado, opciones, correcta, explicacion "
        "FROM preguntas_del_dia WHERE fecha = %s",
        (dia,),
    )
    return cursor.fetchone()


def asegurar_pregunta(dia, con_respaldo):
    """Devuelve la pregunta de ese dia; si no existe, la crea y la guarda.

    con_respaldo=True  (hoy): si Gemini falla se guarda una del banco, porque
                       los estudiantes necesitan una pregunta ya.
    con_respaldo=False (mañana): si falla no se guarda nada y se reintenta luego.
    """
    try:
        return _asegurar_pregunta(dia, con_respaldo)
    except UndefinedTable:
        # Falta correr database/12_preguntas_del_dia.sql en esta base:
        # el reto sigue funcionando con el banco fijo, sin generar ni guardar.
        return pregunta_del_dia(dia) if con_respaldo else None


def _asegurar_pregunta(dia, con_respaldo):
    with obtener_conexion() as conexion:
        with conexion.cursor() as cursor:
            guardada = _leer_pregunta(cursor, dia)
            if guardada:
                return guardada
            cursor.execute(
                "SELECT enunciado FROM preguntas_del_dia WHERE area = %s ORDER BY fecha DESC LIMIT 12",
                (generador.area_del_dia(dia),),
            )
            recientes = [f["enunciado"] for f in cursor.fetchall()]

    # La llamada a Gemini va fuera de la conexion: puede tardar varios segundos
    nueva = generador.crear(dia, recientes)
    origen = "ia"
    if not nueva:
        if not con_respaldo:
            return None
        nueva, origen = pregunta_del_dia(dia), "banco"

    with obtener_conexion() as conexion:
        with conexion.cursor() as cursor:
            # Si dos personas llegan a la vez, vale la primera que se guardo
            cursor.execute(
                "INSERT INTO preguntas_del_dia (fecha, id_pregunta, area, enunciado, opciones, correcta, explicacion, origen) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT (fecha) DO NOTHING",
                (dia, nueva["id"], nueva["area"], nueva["enunciado"], Jsonb(nueva["opciones"]),
                 nueva["correcta"], nueva["explicacion"], origen),
            )
            return _leer_pregunta(cursor, dia)


def preparar_manana():
    """En segundo plano: deja lista la pregunta de mañana para que nadie espere."""
    manana = _hoy() + timedelta(days=1)
    ahora = time.monotonic()
    if ahora - _ultimo_intento.get(manana, -PAUSA_REINTENTO) < PAUSA_REINTENTO:
        return
    _ultimo_intento.clear()
    _ultimo_intento[manana] = ahora
    try:
        asegurar_pregunta(manana, con_respaldo=False)
    except Exception:   # es un adelanto: si falla, mañana se resuelve al abrir el reto
        pass


# ---------- racha ----------

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


def _estado(cursor, id_estudiante, hoy, pregunta):
    cursor.execute(
        "SELECT fecha, opcion, correcta FROM respuestas_diarias "
        "WHERE id_estudiante = %s ORDER BY fecha",
        (id_estudiante,),
    )
    filas = cursor.fetchall()
    racha, mejor = _rachas([f["fecha"] for f in filas], hoy)

    de_hoy = next((f for f in filas if f["fecha"] == hoy), None)
    reto = {
        "respondida": de_hoy is not None,
        "area": AREAS.get(pregunta["area"], pregunta["area"]),
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


# ---------- rutas ----------

@router.get("/diaria")
def diaria(tareas: BackgroundTasks, usuario: dict = Depends(requiere_estudiante)):
    hoy = _hoy()
    pregunta = asegurar_pregunta(hoy, con_respaldo=True)
    tareas.add_task(preparar_manana)
    with obtener_conexion() as conexion:
        with conexion.cursor() as cursor:
            return _estado(cursor, usuario["id_estudiante"], hoy, pregunta)


class Respuesta(BaseModel):
    opcion: int = Field(ge=0, le=3)


@router.post("/diaria")
def responder(datos: Respuesta, usuario: dict = Depends(requiere_estudiante)):
    # El propietario mira la app como un estudiante, pero no responde por el
    if usuario["rol"] != "estudiante":
        raise HTTPException(status_code=403, detail="Solo el estudiante puede responder su reto")

    hoy = _hoy()
    pregunta = asegurar_pregunta(hoy, con_respaldo=True)
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
            return _estado(cursor, usuario["id_estudiante"], hoy, pregunta)
