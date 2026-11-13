"""Protecciones compartidas: limite de intentos de inicio de sesion y
validacion de enlaces que escribe un usuario (Meet, etc.)."""

import re
import threading
import time

from fastapi import HTTPException, Request

# ---------------------------------------------------------------------
# Limite de intentos fallidos de inicio de sesion
# ---------------------------------------------------------------------
# Solo cuentan los intentos FALLIDOS dentro de la ventana. Se llevan tres
# cuentas a la vez; basta con que una llegue a su tope para bloquear:
#   - misma direccion + mismo correo: alguien probando claves de una cuenta
#   - misma direccion: alguien probando muchas cuentas
#   - mismo correo desde cualquier direccion: ataque repartido
# La cuenta vive en memoria (un solo servidor en Render): se reinicia si el
# servidor se reinicia, y eso esta bien para frenar ataques de fuerza bruta.
VENTANA_SEGUNDOS = 15 * 60
MAX_POR_DIRECCION_Y_CORREO = 8
MAX_POR_CORREO = 20
MAX_POR_DIRECCION = 40
_MAX_CLAVES = 20_000  # tope de memoria

_fallos: dict[tuple[str, str], list[float]] = {}
_candado = threading.Lock()


def direccion_cliente(request: Request) -> str:
    """Direccion de quien hace la peticion (detras del proxy de Render)."""
    reenviado = request.headers.get("x-forwarded-for", "")
    primera = reenviado.split(",")[0].strip()
    if primera:
        return primera[:64]
    return request.client.host if request.client else "desconocida"


def _claves(direccion: str, correo: str) -> list[tuple[tuple[str, str], int]]:
    correo = correo[:120]
    return [
        (("par", direccion + "|" + correo), MAX_POR_DIRECCION_Y_CORREO),
        (("correo", correo), MAX_POR_CORREO),
        (("dir", direccion), MAX_POR_DIRECCION),
    ]


def _recientes(clave: tuple[str, str], ahora: float) -> list[float]:
    marcas = [m for m in _fallos.get(clave, ()) if ahora - m < VENTANA_SEGUNDOS]
    if marcas:
        _fallos[clave] = marcas
    else:
        _fallos.pop(clave, None)
    return marcas


def revisar_intentos(direccion: str, correo: str) -> None:
    """Responde 429 si ya hubo demasiados intentos fallidos. Va ANTES de revisar la clave."""
    ahora = time.monotonic()
    with _candado:
        for clave, maximo in _claves(direccion, correo):
            marcas = _recientes(clave, ahora)
            if len(marcas) >= maximo:
                espera = int(VENTANA_SEGUNDOS - (ahora - marcas[0])) + 1
                minutos = max(1, round(espera / 60))
                raise HTTPException(
                    status_code=429,
                    detail=f"Demasiados intentos. Espera {minutos} minuto(s) e intenta de nuevo.",
                    headers={"Retry-After": str(espera)},
                )


def anotar_fallo(direccion: str, correo: str) -> None:
    ahora = time.monotonic()
    with _candado:
        if len(_fallos) >= _MAX_CLAVES:
            for clave in list(_fallos):
                _recientes(clave, ahora)
            if len(_fallos) >= _MAX_CLAVES:
                _fallos.clear()
        for clave, _ in _claves(direccion, correo):
            _fallos.setdefault(clave, []).append(ahora)


def anotar_exito(direccion: str, correo: str) -> None:
    """Al entrar bien se olvidan los fallos de esa persona desde esa direccion."""
    with _candado:
        _fallos.pop(("par", direccion + "|" + correo[:120]), None)


# ---------------------------------------------------------------------
# Enlaces escritos por usuarios
# ---------------------------------------------------------------------
_CON_PROTOCOLO = re.compile(r"^https?://[^\s]+$", re.I)
_SOLO_DOMINIO = re.compile(r"^[a-z0-9-]+(\.[a-z0-9-]+)+(/[^\s]*)?$", re.I)


def limpiar_enlace(texto: str | None) -> str | None:
    """Devuelve el enlace listo para guardar, o None si viene vacio.

    Solo se aceptan enlaces web (http/https). Asi nadie puede guardar un
    enlace 'javascript:...' que se ejecute en el navegador de quien le de
    clic. Si escriben 'meet.google.com/abc' se completa con https://.
    """
    enlace = (texto or "").strip()
    if not enlace:
        return None
    if len(enlace) > 500:
        raise HTTPException(status_code=400, detail="El enlace es demasiado largo")
    if _CON_PROTOCOLO.match(enlace):
        return enlace
    if _SOLO_DOMINIO.match(enlace):
        return "https://" + enlace
    raise HTTPException(
        status_code=400, detail="El enlace no es valido: debe empezar por https://"
    )
