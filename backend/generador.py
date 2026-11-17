"""Crea la pregunta del reto diario con la API de Gemini (Google).

Nadie tiene que escribir preguntas: cada dia el servidor le pide una nueva a
Gemini, la revisa y la guarda (reto.py). Pasos:
  1. Pide una pregunta del area que toca, sobre un tema elegido por la fecha.
  2. Revisa que tenga la forma correcta (4 opciones distintas, textos cortos).
  3. Desordena las opciones y le pide a Gemini que la RESPONDA sin ver la clave.
     Si no llega a la misma respuesta, la pregunta se descarta (clave dudosa).
Si algo falla (sin clave, sin cupo, sin internet) devuelve None y reto.py usa
el banco fijo de preguntas_diarias.py.

Variables de entorno (Render):
  GEMINI_API_KEY   clave de Google AI Studio. Sin ella no se genera nada.
  GEMINI_MODEL     opcional; modelo a usar (por defecto, uno rapido y barato).
"""

import json
import logging
import os
import random
import urllib.error
import urllib.request
from datetime import date

from preguntas_diarias import AREAS

log = logging.getLogger("reto")

MODELO = "gemini-3.5-flash-lite"
URL = "https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent"
ESPERA = 20          # segundos por llamada
INTENTOS = 2         # preguntas que se piden antes de rendirse

# Temas por area: la fecha elige uno, asi las preguntas no se parecen entre si
TEMAS = {
    "lectura_critica": [
        "inferir información que el texto no dice de forma explícita", "identificar la tesis de un texto argumentativo",
        "función de un conector dentro de un párrafo", "distinguir hechos de opiniones",
        "intención del autor", "ironía y sentido figurado", "evaluar si un argumento sustenta una conclusión",
        "idea principal de un párrafo", "significado de una palabra por su contexto",
        "relación entre dos afirmaciones de un texto", "interpretar un texto filosófico corto",
        "tipo de texto y su propósito", "voces o puntos de vista presentes en un texto",
    ],
    "matematicas": [
        "porcentajes y descuentos", "regla de tres y proporcionalidad", "promedio, mediana y moda",
        "probabilidad simple", "ecuaciones lineales", "áreas y perímetros", "volumen de sólidos",
        "razones y escalas", "interés simple", "funciones lineales en contexto", "conteo y combinaciones sencillas",
        "teorema de Pitágoras", "conversión de unidades", "fracciones y decimales en situaciones cotidianas",
        "sistemas de dos ecuaciones en contexto", "variación porcentual",
    ],
    "sociales_ciudadanas": [
        "Constitución de 1991 y derechos fundamentales", "ramas del poder público y sus funciones",
        "mecanismos de participación ciudadana", "acción de tutela y otros mecanismos de protección",
        "analizar un conflicto desde los intereses de distintos actores", "evaluar la confiabilidad de una fuente",
        "falacias y argumentos débiles en un debate", "conceptos básicos de economía (inflación, oferta y demanda)",
        "historia de Colombia en el siglo XIX", "historia de Colombia en el siglo XX",
        "organismos de control del Estado", "geografía y problemas ambientales de Colombia",
        "globalización y sus efectos", "diversidad cultural y derechos de las minorías",
    ],
    "ciencias_naturales": [
        "célula y sus organelos", "genética y herencia", "ecosistemas y cadenas alimenticias",
        "fotosíntesis y respiración", "leyes de Newton", "energía y sus transformaciones",
        "circuitos eléctricos sencillos", "estados de la materia y cambios físicos y químicos",
        "tabla periódica y estructura atómica", "mezclas y métodos de separación", "pH, ácidos y bases",
        "variables y control en un experimento", "ondas, sonido y luz", "gases: presión, volumen y temperatura",
        "impacto ambiental de la actividad humana",
    ],
    "ingles": [
        "present simple", "past simple", "comparatives and superlatives", "first conditional",
        "vocabulary: jobs and places", "understanding a public sign or notice", "completing a short conversation",
        "prepositions of time and place", "modal verbs (can, must, should)", "quantifiers (some, any, much, many)",
        "present perfect", "reading a short text and answering about it", "matching a description with a word",
    ],
}

ESQUEMA_PREGUNTA = {
    "type": "OBJECT",
    "properties": {
        "enunciado": {"type": "STRING"},
        "opciones": {"type": "ARRAY", "items": {"type": "STRING"}},
        "correcta": {"type": "INTEGER"},
        "explicacion": {"type": "STRING"},
    },
    "required": ["enunciado", "opciones", "correcta", "explicacion"],
}
ESQUEMA_RESPUESTA = {
    "type": "OBJECT",
    "properties": {
        "respuesta": {"type": "INTEGER"},
        "unica_correcta": {"type": "BOOLEAN"},
    },
    "required": ["respuesta", "unica_correcta"],
}

SISTEMA = (
    "Eres un docente colombiano experto en preparar estudiantes de grado 11 para la prueba Saber 11 (ICFES). "
    "Escribes preguntas de selección múltiple con única respuesta: claras, correctas y sin trampas de redacción."
)


def area_del_dia(dia: date) -> str:
    """Las cinco areas se van turnando, una por dia."""
    areas = list(AREAS)
    return areas[dia.toordinal() % len(areas)]


def _pedir(instruccion, esquema, temperatura):
    """Una llamada a Gemini que devuelve JSON con la forma de `esquema`."""
    cuerpo = {
        "systemInstruction": {"parts": [{"text": SISTEMA}]},
        "contents": [{"role": "user", "parts": [{"text": instruccion}]}],
        "generationConfig": {
            "temperature": temperatura,
            "responseMimeType": "application/json",
            "responseSchema": esquema,
        },
    }
    peticion = urllib.request.Request(
        URL.format(modelo=os.getenv("GEMINI_MODEL") or MODELO),
        data=json.dumps(cuerpo).encode("utf-8"),
        headers={"Content-Type": "application/json", "x-goog-api-key": os.environ["GEMINI_API_KEY"]},
        method="POST",
    )
    with urllib.request.urlopen(peticion, timeout=ESPERA) as respuesta:
        datos = json.load(respuesta)
    partes = datos["candidates"][0]["content"]["parts"]
    return json.loads("".join(p.get("text", "") for p in partes))


def _valida(p):
    """True si la pregunta tiene la forma que la app sabe mostrar."""
    try:
        opciones = [str(o).strip() for o in p["opciones"]]
        return (
            20 <= len(p["enunciado"].strip()) <= 900
            and len(opciones) == 4
            and len({o.lower() for o in opciones}) == 4
            and all(1 <= len(o) <= 180 for o in opciones)
            and isinstance(p["correcta"], int) and not isinstance(p["correcta"], bool)
            and 0 <= p["correcta"] <= 3
            and 10 <= len(p["explicacion"].strip()) <= 600
        )
    except (KeyError, TypeError, AttributeError):
        return False


def _instruccion(area, tema, recientes):
    partes = [
        f"Crea UNA pregunta tipo Saber 11 del área «{AREAS[area]}» sobre el tema: {tema}.",
        "Requisitos:",
        "- Nivel de grado 11, como las del examen real: que haga pensar, no de memoria pura.",
        "- Debe entenderse sola: sin imágenes, tablas ni gráficas. Si necesita un texto o situación, "
        "inclúyelo dentro del enunciado en pocas líneas.",
        "- Exactamente 4 opciones, cortas, sin letras (A, B...) ni numeración. Solo UNA es correcta y "
        "las otras tres son errores creíbles. Nada de «todas las anteriores» ni «ninguna de las anteriores».",
        "- «correcta» es la posición de la opción correcta, contando desde 0.",
        "- «explicacion»: en español, 1 o 2 frases que digan por qué esa es la correcta. "
        "No menciones letras ni posiciones de las opciones.",
        "- Verifica los cálculos y los datos antes de responder.",
    ]
    if area == "ingles":
        partes.append("- El enunciado y las opciones van en inglés (nivel A2-B1). La explicación va en español.")
    else:
        partes.append("- Todo en español de Colombia.")
    if recientes:
        partes.append("No repitas ni parafrasees estas preguntas recientes:")
        partes.extend("  · " + r[:160] for r in recientes)
    return "\n".join(partes)


def crear(dia: date, recientes=()):
    """Una pregunta nueva y revisada para ese dia, o None si no se pudo."""
    if not os.getenv("GEMINI_API_KEY"):
        return None

    area = area_del_dia(dia)
    azar = random.Random(dia.toordinal())
    temas = TEMAS[area][:]
    azar.shuffle(temas)

    for intento in range(INTENTOS):
        try:
            p = _pedir(_instruccion(area, temas[intento % len(temas)], list(recientes)), ESQUEMA_PREGUNTA, 0.9)
            if not _valida(p):
                log.warning("Reto diario: Gemini devolvio una pregunta con mala forma")
                continue

            # Se desordenan las opciones: los modelos tienden a repetir la misma posicion
            opciones = [str(o).strip() for o in p["opciones"]]
            buena = opciones[p["correcta"]]
            random.shuffle(opciones)

            # Segunda pasada: que la resuelva sin ver la clave
            revision = _pedir(
                "Resuelve esta pregunta de selección múltiple paso a paso y con cuidado.\n\n"
                + p["enunciado"].strip() + "\n\n"
                + "\n".join(f"{i}. {o}" for i, o in enumerate(opciones))
                + "\n\n«respuesta» es el número de la opción correcta. «unica_correcta» es true solo si "
                "exactamente una opción es correcta y la pregunta no es ambigua.",
                ESQUEMA_RESPUESTA,
                0,
            )
            if revision.get("unica_correcta") is not True or revision.get("respuesta") != opciones.index(buena):
                log.warning("Reto diario: la revision no confirmo la clave; se descarta la pregunta")
                continue

            return {
                "id": "ia-" + dia.strftime("%Y%m%d"),
                "area": area,
                "enunciado": p["enunciado"].strip(),
                "opciones": opciones,
                "correcta": opciones.index(buena),
                "explicacion": p["explicacion"].strip(),
            }
        except urllib.error.HTTPError as error:
            # 429 = sin cupo, 400/403 = clave o modelo mal: reintentar ya no ayuda
            log.warning("Reto diario: Gemini respondio %s", error.code)
            return None
        except Exception as error:  # sin internet, tiempo agotado, JSON raro
            log.warning("Reto diario: fallo la generacion (%s)", type(error).__name__)
    return None
