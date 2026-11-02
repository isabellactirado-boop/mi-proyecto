from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo
from typing import Literal

import psycopg
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import es_admin, requiere_admin, requiere_permiso
from db import obtener_conexion

router = APIRouter()

# Admin (propietario/administrador) ve y programa todo.
# Un profesor solo ve sus grupos y clases, y toma asistencia en ellas.


def _hoy() -> date:
    return datetime.now(ZoneInfo("America/Bogota")).date()


def _filtro_docente(usuario: dict, alias: str) -> tuple[str, list]:
    """Condicion SQL extra para que un profesor solo vea lo suyo."""
    if es_admin(usuario):
        return "", []
    return f" AND {alias}.id_docente = %s", [usuario["id_docente"]]


# ---------------------------------------------------------------------
# Docentes y grupos
# ---------------------------------------------------------------------
@router.get("/docentes")
def listar_docentes(usuario: dict = Depends(requiere_admin)):
    with obtener_conexion() as conexion:
        with conexion.cursor() as cursor:
            cursor.execute(
                "SELECT id_docente, nombre_completo, especialidad "
                "FROM docentes ORDER BY nombre_completo"
            )
            return cursor.fetchall()


@router.get("/cursos")
def listar_cursos(usuario: dict = Depends(requiere_admin)):
    with obtener_conexion() as conexion:
        with conexion.cursor() as cursor:
            cursor.execute(
                "SELECT id_curso, nombre_curso, fecha_inicio, fecha_fin "
                "FROM cursos WHERE activo ORDER BY fecha_inicio DESC"
            )
            return cursor.fetchall()


@router.get("/grupos")
def listar_grupos(usuario: dict = Depends(requiere_permiso("ver_asistencias"))):
    extra, params = _filtro_docente(usuario, "g")
    with obtener_conexion() as conexion:
        with conexion.cursor() as cursor:
            cursor.execute(
                "SELECT g.id_grupo, g.nombre_grupo, g.dia_semana, g.hora_inicio, g.hora_fin, "
                "       g.plataforma, g.enlace_reunion, g.capacidad_maxima, "
                "       c.id_curso, c.nombre_curso, d.id_docente, d.nombre_completo AS docente, "
                "       (SELECT COUNT(*) FROM inscripciones i "
                "        WHERE i.id_grupo = g.id_grupo AND i.estado = 'activa') AS inscritos "
                "FROM grupos g "
                "JOIN cursos c ON c.id_curso = g.id_curso "
                "LEFT JOIN docentes d ON d.id_docente = g.id_docente "
                "WHERE g.activo" + extra + " "
                "ORDER BY c.nombre_curso, g.nombre_grupo",
                params,
            )
            return cursor.fetchall()


class NuevoGrupo(BaseModel):
    id_curso: int
    nombre_grupo: str = Field(min_length=1, max_length=30)
    dia_semana: Literal["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]
    hora_inicio: time
    hora_fin: time
    capacidad_maxima: int = Field(default=40, ge=20, le=150)
    id_docente: int | None = None
    plataforma: str = "Google Meet"
    enlace_reunion: str | None = None


@router.post("/grupos", status_code=201)
def crear_grupo(datos: NuevoGrupo, usuario: dict = Depends(requiere_admin)):
    if datos.hora_fin <= datos.hora_inicio:
        raise HTTPException(status_code=400, detail="La hora de fin debe ser despues de la de inicio")
    try:
        with obtener_conexion() as conexion:
            with conexion.cursor() as cursor:
                cursor.execute(
                    "INSERT INTO grupos (id_curso, nombre_grupo, dia_semana, hora_inicio, hora_fin, "
                    "                    capacidad_maxima, id_docente, plataforma, enlace_reunion) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id_grupo",
                    (datos.id_curso, datos.nombre_grupo.strip(), datos.dia_semana, datos.hora_inicio,
                     datos.hora_fin, datos.capacidad_maxima, datos.id_docente, datos.plataforma,
                     (datos.enlace_reunion or "").strip() or None),
                )
                return {"id_grupo": cursor.fetchone()["id_grupo"]}
    except psycopg.errors.UniqueViolation:
        raise HTTPException(status_code=409, detail="Ese curso ya tiene un grupo con ese nombre")
    except psycopg.errors.ForeignKeyViolation:
        raise HTTPException(status_code=400, detail="El curso o el docente no existen")


# ---------------------------------------------------------------------
# Clases (sesiones con fecha)
# ---------------------------------------------------------------------
@router.get("/clases")
def listar_clases(
    desde: date | None = None,
    hasta: date | None = None,
    usuario: dict = Depends(requiere_permiso("ver_asistencias")),
):
    desde = desde or _hoy() - timedelta(days=7)
    hasta = hasta or _hoy() + timedelta(days=21)
    extra, params = _filtro_docente(usuario, "cl")
    with obtener_conexion() as conexion:
        with conexion.cursor() as cursor:
            cursor.execute(
                "SELECT cl.id_clase, cl.fecha_clase, cl.hora_inicio, cl.hora_fin, cl.tema, "
                "       COALESCE(cl.enlace_reunion, g.enlace_reunion) AS enlace_reunion, "
                "       g.id_grupo, g.nombre_grupo, c.nombre_curso, d.nombre_completo AS docente, "
                "       (SELECT COUNT(*) FROM inscripciones i "
                "        WHERE i.id_grupo = g.id_grupo AND i.estado = 'activa') AS inscritos, "
                "       (SELECT COUNT(*) FROM asistencias a WHERE a.id_clase = cl.id_clase) AS registradas "
                "FROM clases cl "
                "JOIN grupos g ON g.id_grupo = cl.id_grupo "
                "JOIN cursos c ON c.id_curso = g.id_curso "
                "JOIN docentes d ON d.id_docente = cl.id_docente "
                "WHERE cl.fecha_clase BETWEEN %s AND %s" + extra + " "
                "ORDER BY cl.fecha_clase, cl.hora_inicio",
                [desde, hasta] + params,
            )
            return cursor.fetchall()


class NuevaClase(BaseModel):
    id_grupo: int
    fecha_clase: date
    tema: str | None = Field(default=None, max_length=150)
    # Si no se envian, se toman del grupo:
    hora_inicio: time | None = None
    hora_fin: time | None = None
    id_docente: int | None = None
    enlace_reunion: str | None = None
    # 1 = solo esa fecha; 4 = esa fecha y las 3 semanas siguientes
    semanas: int = Field(default=1, ge=1, le=26)


@router.post("/clases", status_code=201)
def crear_clases(datos: NuevaClase, usuario: dict = Depends(requiere_admin)):
    with obtener_conexion() as conexion:
        with conexion.cursor() as cursor:
            cursor.execute(
                "SELECT hora_inicio, hora_fin, id_docente, plataforma FROM grupos "
                "WHERE id_grupo = %s AND activo",
                (datos.id_grupo,),
            )
            grupo = cursor.fetchone()
            if not grupo:
                raise HTTPException(status_code=404, detail="El grupo no existe o esta inactivo")

            id_docente = datos.id_docente or grupo["id_docente"]
            if not id_docente:
                raise HTTPException(
                    status_code=400, detail="El grupo no tiene docente: elige uno para la clase"
                )
            inicio = datos.hora_inicio or grupo["hora_inicio"]
            fin = datos.hora_fin or grupo["hora_fin"]
            if fin <= inicio:
                raise HTTPException(status_code=400, detail="La hora de fin debe ser despues de la de inicio")

            creadas, repetidas = [], []
            for semana in range(datos.semanas):
                fecha = datos.fecha_clase + timedelta(weeks=semana)
                # ON CONFLICT: si ya habia clase ese dia a esa hora, no se duplica
                cursor.execute(
                    "INSERT INTO clases (id_grupo, id_docente, fecha_clase, hora_inicio, hora_fin, "
                    "                    tema, plataforma, enlace_reunion) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s, %s) "
                    "ON CONFLICT (id_grupo, fecha_clase, hora_inicio) DO NOTHING "
                    "RETURNING id_clase",
                    (datos.id_grupo, id_docente, fecha, inicio, fin,
                     (datos.tema or "").strip() or None, grupo["plataforma"],
                     (datos.enlace_reunion or "").strip() or None),
                )
                fila = cursor.fetchone()
                (creadas if fila else repetidas).append(fecha.isoformat())

    return {"creadas": creadas, "ya_existian": repetidas}


class CambiosClase(BaseModel):
    tema: str | None = Field(default=None, max_length=150)
    enlace_reunion: str | None = None


@router.patch("/clases/{id_clase}")
def editar_clase(id_clase: int, datos: CambiosClase, usuario: dict = Depends(requiere_permiso("crear_asistencias"))):
    """El tema y el enlace los puede ajustar el admin o el profesor de la clase."""
    extra, params = _filtro_docente(usuario, "clases")
    with obtener_conexion() as conexion:
        with conexion.cursor() as cursor:
            cursor.execute(
                "UPDATE clases SET tema = %s, enlace_reunion = %s "
                "WHERE id_clase = %s" + extra + " RETURNING id_clase",
                [(datos.tema or "").strip() or None, (datos.enlace_reunion or "").strip() or None,
                 id_clase] + params,
            )
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="Clase no encontrada")
    return {"mensaje": "Clase actualizada"}


@router.delete("/clases/{id_clase}")
def borrar_clase(id_clase: int, usuario: dict = Depends(requiere_admin)):
    with obtener_conexion() as conexion:
        with conexion.cursor() as cursor:
            cursor.execute("SELECT 1 FROM asistencias WHERE id_clase = %s LIMIT 1", (id_clase,))
            if cursor.fetchone():
                raise HTTPException(
                    status_code=409, detail="La clase ya tiene asistencia registrada y no se puede borrar"
                )
            cursor.execute("DELETE FROM clases WHERE id_clase = %s RETURNING id_clase", (id_clase,))
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="Clase no encontrada")
    return {"mensaje": "Clase eliminada"}


# ---------------------------------------------------------------------
# Asistencia de una clase
# ---------------------------------------------------------------------
def _clase_visible(cursor, id_clase: int, usuario: dict) -> dict:
    extra, params = _filtro_docente(usuario, "cl")
    cursor.execute(
        "SELECT cl.id_clase, cl.id_grupo, cl.fecha_clase, cl.hora_inicio, cl.tema, "
        "       g.nombre_grupo, c.nombre_curso "
        "FROM clases cl JOIN grupos g ON g.id_grupo = cl.id_grupo "
        "JOIN cursos c ON c.id_curso = g.id_curso "
        "WHERE cl.id_clase = %s" + extra,
        [id_clase] + params,
    )
    clase = cursor.fetchone()
    if not clase:
        raise HTTPException(status_code=404, detail="Clase no encontrada")
    return clase


@router.get("/clases/{id_clase}/asistencia")
def ver_asistencia(id_clase: int, usuario: dict = Depends(requiere_permiso("ver_asistencias"))):
    """Lista del grupo con el estado de cada estudiante (null = sin registrar)."""
    with obtener_conexion() as conexion:
        with conexion.cursor() as cursor:
            clase = _clase_visible(cursor, id_clase, usuario)
            cursor.execute(
                "SELECT i.id_inscripcion, e.nombre_completo, e.doc_identidad, "
                "       a.estado_asistencia, a.observacion "
                "FROM inscripciones i "
                "JOIN estudiantes e ON e.id_estudiante = i.id_estudiante "
                "LEFT JOIN asistencias a ON a.id_inscripcion = i.id_inscripcion AND a.id_clase = %s "
                "WHERE i.id_grupo = %s AND i.estado = 'activa' "
                "ORDER BY e.nombre_completo",
                (id_clase, clase["id_grupo"]),
            )
            clase["estudiantes"] = cursor.fetchall()
    return clase


class RegistroAsistencia(BaseModel):
    id_inscripcion: int
    estado: Literal["presente", "ausente", "tarde", "excusa"]
    observacion: str | None = Field(default=None, max_length=200)


class ListaAsistencia(BaseModel):
    registros: list[RegistroAsistencia]


@router.put("/clases/{id_clase}/asistencia")
def guardar_asistencia(
    id_clase: int, datos: ListaAsistencia, usuario: dict = Depends(requiere_permiso("crear_asistencias"))
):
    with obtener_conexion() as conexion:
        with conexion.cursor() as cursor:
            _clase_visible(cursor, id_clase, usuario)
            try:
                for r in datos.registros:
                    # El trigger trg_validar_asistencia_grupo rechaza estudiantes de otro grupo
                    cursor.execute(
                        "INSERT INTO asistencias (id_inscripcion, id_clase, estado_asistencia, observacion) "
                        "VALUES (%s, %s, %s, %s) "
                        "ON CONFLICT (id_inscripcion, id_clase) DO UPDATE "
                        "SET estado_asistencia = EXCLUDED.estado_asistencia, "
                        "    observacion = EXCLUDED.observacion, fecha_registro = CURRENT_TIMESTAMP",
                        (r.id_inscripcion, id_clase, r.estado, (r.observacion or "").strip() or None),
                    )
            except psycopg.errors.RaiseException:
                raise HTTPException(status_code=400, detail="Hay estudiantes que no pertenecen al grupo de esta clase")
    return {"mensaje": "Asistencia guardada", "registros": len(datos.registros)}


# ---------------------------------------------------------------------
# Simulacros y resultados
# ---------------------------------------------------------------------
AREAS = ["lectura_critica", "matematicas", "sociales_ciudadanas", "ciencias_naturales", "ingles"]


@router.get("/simulacros")
def listar_simulacros(usuario: dict = Depends(requiere_permiso("ver_resultados"))):
    with obtener_conexion() as conexion:
        with conexion.cursor() as cursor:
            cursor.execute(
                "SELECT s.id_simulacro, s.nombre, s.descripcion, s.fecha_simulacro, "
                "       COUNT(r.id_resultado) AS resultados, "
                "       ROUND(AVG(r.puntaje_global)) AS promedio_global "
                "FROM simulacros s LEFT JOIN resultado_simulacro r ON r.id_simulacro = s.id_simulacro "
                "GROUP BY s.id_simulacro ORDER BY s.fecha_simulacro DESC"
            )
            return cursor.fetchall()


class NuevoSimulacro(BaseModel):
    nombre: str = Field(min_length=1, max_length=100)
    fecha_simulacro: date
    descripcion: str | None = None


@router.post("/simulacros", status_code=201)
def crear_simulacro(datos: NuevoSimulacro, usuario: dict = Depends(requiere_permiso("crear_resultados"))):
    with obtener_conexion() as conexion:
        with conexion.cursor() as cursor:
            cursor.execute(
                "INSERT INTO simulacros (nombre, fecha_simulacro, descripcion) "
                "VALUES (%s, %s, %s) RETURNING id_simulacro",
                (datos.nombre.strip(), datos.fecha_simulacro, datos.descripcion),
            )
            return {"id_simulacro": cursor.fetchone()["id_simulacro"]}


@router.get("/simulacros/{id_simulacro}/resultados")
def ver_resultados(
    id_simulacro: int,
    id_grupo: int | None = None,
    usuario: dict = Depends(requiere_permiso("ver_resultados")),
):
    """Todos los estudiantes activos (o los de un grupo) con su resultado, si ya lo tienen."""
    extra, params = "", []
    if id_grupo:
        extra, params = " AND i.id_grupo = %s", [id_grupo]
    if not es_admin(usuario):
        extra += " AND g.id_docente = %s"
        params.append(usuario["id_docente"])

    with obtener_conexion() as conexion:
        with conexion.cursor() as cursor:
            cursor.execute(
                "SELECT id_simulacro, nombre, fecha_simulacro FROM simulacros WHERE id_simulacro = %s",
                (id_simulacro,),
            )
            simulacro = cursor.fetchone()
            if not simulacro:
                raise HTTPException(status_code=404, detail="Simulacro no encontrado")
            cursor.execute(
                "SELECT i.id_inscripcion, e.nombre_completo, e.doc_identidad, c.nombre_curso, "
                "       g.nombre_grupo, r.puntaje_global, r.lectura_critica, r.matematicas, "
                "       r.sociales_ciudadanas, r.ciencias_naturales, r.ingles "
                "FROM inscripciones i "
                "JOIN estudiantes e ON e.id_estudiante = i.id_estudiante "
                "JOIN cursos c ON c.id_curso = i.id_curso "
                "LEFT JOIN grupos g ON g.id_grupo = i.id_grupo "
                "LEFT JOIN resultado_simulacro r ON r.id_inscripcion = i.id_inscripcion "
                "                              AND r.id_simulacro = %s "
                "WHERE i.estado = 'activa'" + extra + " "
                "ORDER BY e.nombre_completo",
                [id_simulacro] + params,
            )
            simulacro["estudiantes"] = cursor.fetchall()
    return simulacro


class Resultado(BaseModel):
    id_inscripcion: int
    puntaje_global: int | None = Field(default=None, ge=0, le=500)
    lectura_critica: int | None = Field(default=None, ge=0, le=100)
    matematicas: int | None = Field(default=None, ge=0, le=100)
    sociales_ciudadanas: int | None = Field(default=None, ge=0, le=100)
    ciencias_naturales: int | None = Field(default=None, ge=0, le=100)
    ingles: int | None = Field(default=None, ge=0, le=100)


class ListaResultados(BaseModel):
    registros: list[Resultado]


def puntaje_global(r: Resultado) -> int | None:
    """Formula del Saber 11: las 4 areas pesan 3 e ingles pesa 1, sobre 500."""
    if r.puntaje_global is not None:
        return r.puntaje_global
    notas = [getattr(r, a) for a in AREAS]
    if any(n is None for n in notas):
        return None
    lc, mat, soc, cn, ing = notas
    return round((3 * (lc + mat + soc + cn) + ing) / 13 * 5)


@router.put("/simulacros/{id_simulacro}/resultados")
def guardar_resultados(
    id_simulacro: int, datos: ListaResultados, usuario: dict = Depends(requiere_permiso("crear_resultados"))
):
    guardados = 0
    with obtener_conexion() as conexion:
        with conexion.cursor() as cursor:
            cursor.execute(
                "SELECT fecha_simulacro FROM simulacros WHERE id_simulacro = %s", (id_simulacro,)
            )
            simulacro = cursor.fetchone()
            if not simulacro:
                raise HTTPException(status_code=404, detail="Simulacro no encontrado")

            for r in datos.registros:
                total = puntaje_global(r)
                if total is None:
                    raise HTTPException(
                        status_code=400,
                        detail="Cada fila necesita el puntaje global o las 5 areas completas",
                    )
                valores = [total] + [getattr(r, a) for a in AREAS]
                # Un resultado por estudiante y simulacro: si ya existe se actualiza
                cursor.execute(
                    "UPDATE resultado_simulacro SET puntaje_global = %s, lectura_critica = %s, "
                    "       matematicas = %s, sociales_ciudadanas = %s, ciencias_naturales = %s, ingles = %s "
                    "WHERE id_inscripcion = %s AND id_simulacro = %s RETURNING id_resultado",
                    valores + [r.id_inscripcion, id_simulacro],
                )
                if not cursor.fetchone():
                    cursor.execute(
                        "INSERT INTO resultado_simulacro (id_inscripcion, id_simulacro, fecha_simulacro, "
                        "       puntaje_global, lectura_critica, matematicas, sociales_ciudadanas, "
                        "       ciencias_naturales, ingles) "
                        "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)",
                        [r.id_inscripcion, id_simulacro, simulacro["fecha_simulacro"]] + valores,
                    )
                guardados += 1
    return {"mensaje": "Resultados guardados", "registros": guardados}
