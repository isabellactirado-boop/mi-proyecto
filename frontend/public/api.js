/* =====================================================================
   api.js - conecta el dashboard de administrador con el backend.
   - Lee el token que guardo el login (sessionStorage "token").
   - Pide los datos al backend y los pone en los elementos por su id.
   - No modifica el diseño: solo cambia textos y construye las barras.
   Se carga despues de dashboard-admin.js.
   ===================================================================== */

const API_URL = "https://preicma.onrender.com";

/* ---------- sesion y peticiones ---------- */

function cerrarSesionYVolver() {
  sessionStorage.clear();
  window.location.replace("index.html");
}

async function pedirAlBackend(ruta, opciones) {
  const token = sessionStorage.getItem("token");
  if (!token) {
    cerrarSesionYVolver();
    throw new Error("Sin sesion");
  }
  const config = Object.assign({}, opciones);
  config.headers = Object.assign({ Authorization: "Bearer " + token }, config.headers);

  const respuesta = await fetch(API_URL + ruta, config);

  if (respuesta.status === 401) {
    // Token vencido, usuario desactivado o contrasena cambiada
    cerrarSesionYVolver();
    throw new Error("Sesion vencida");
  }
  if (!respuesta.ok) {
    const error = new Error("Error " + respuesta.status);
    error.status = respuesta.status;
    throw error;
  }
  return respuesta.json();
}

/* ---------- formatos ---------- */

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
  "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const DIAS_CORTOS = { lunes: "Lun", martes: "Mar", miercoles: "Mié", jueves: "Jue",
  viernes: "Vie", sabado: "Sáb", domingo: "Dom" };

function dinero(valor) {
  const numero = Math.round(Number(valor) || 0);
  return "$ " + numero.toLocaleString("es-CO");
}

// $ 18,4M, $ 850K o $ 0 (para las barras)
function dineroCorto(valor) {
  const numero = Number(valor) || 0;
  if (numero >= 1000000) return "$" + (numero / 1000000).toFixed(1).replace(".", ",") + "M";
  if (numero >= 1000) return "$" + Math.round(numero / 1000) + "K";
  return "$" + Math.round(numero);
}

function nombreMes(aaaaMm) {          // "2026-10" -> "octubre"
  return MESES[Number(aaaaMm.split("-")[1]) - 1];
}

function mesCorto(aaaaMm) {           // "2026-10" -> "Oct"
  return MESES_CORTOS[Number(aaaaMm.split("-")[1]) - 1];
}

function hora12(texto) {              // "18:00:00" -> "6:00 pm"
  const partes = String(texto).split(":");
  let h = Number(partes[0]);
  const sufijo = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return h + ":" + partes[1] + " " + sufijo;
}

function plural(n, singular, pluralTexto) {
  return n === 1 ? singular : pluralTexto;
}

function poner(id, texto) {
  const elemento = document.getElementById(id);
  if (elemento) elemento.textContent = texto;
}

/* ---------- aviso de error (arriba del Resumen) ---------- */

function mostrarAviso(texto) {
  let aviso = document.getElementById("aviso-api");
  if (!aviso) {
    aviso = document.createElement("div");
    aviso.id = "aviso-api";
    aviso.setAttribute("role", "alert");
    aviso.style.cssText = "margin:0 0 14px;padding:10px 14px;border-radius:12px;" +
      "background:#ffe3e1;color:#7a1410;border:2px solid #1a1240;font-weight:600;";
    const resumen = document.getElementById("tab-resumen");
    if (resumen) resumen.insertBefore(aviso, resumen.firstChild);
  }
  aviso.textContent = texto;
}

function quitarAviso() {
  const aviso = document.getElementById("aviso-api");
  if (aviso) aviso.remove();
}

/* ---------- Resumen ---------- */

function pintarBarras(ingresos) {
  const contenedor = document.getElementById("barras-ingresos");
  if (!contenedor) return;
  contenedor.textContent = "";

  const maximo = Math.max.apply(null, ingresos.map((i) => Number(i.total) || 0));

  ingresos.forEach((item, posicion) => {
    const total = Number(item.total) || 0;
    const barra = document.createElement("div");
    barra.className = "bar" + (posicion === ingresos.length - 1 ? " cur" : "");

    const valor = document.createElement("em");
    valor.textContent = dineroCorto(total);

    const relleno = document.createElement("i");
    const altura = maximo > 0 ? Math.max((total / maximo) * 100, total > 0 ? 3 : 0) : 0;
    relleno.style.height = altura + "%";

    const mes = document.createElement("span");
    mes.textContent = mesCorto(item.mes);

    barra.appendChild(valor);
    barra.appendChild(relleno);
    barra.appendChild(mes);
    contenedor.appendChild(barra);
  });
}

function pintarResumen(d) {
  // Tarjetas
  poner("kpi-estudiantes", String(d.estudiantes_activos));
  poner("kpi-estudiantes-sub",
    d.inscripciones_activas + " " + plural(d.inscripciones_activas, "inscripción activa", "inscripciones activas"));

  const mesActual = nombreMes(d.recaudo.mes);
  const etiquetaRecaudo = document.getElementById("kpi-recaudo");
  if (etiquetaRecaudo && etiquetaRecaudo.previousElementSibling) {
    etiquetaRecaudo.previousElementSibling.textContent = "Recaudo de " + mesActual;
  }
  poner("kpi-recaudo", dinero(d.recaudo.mes_actual));
  const anterior = d.ingresos_por_mes.length > 1
    ? nombreMes(d.ingresos_por_mes[d.ingresos_por_mes.length - 2].mes) : "el mes anterior";
  if (d.recaudo.variacion_pct === null) {
    poner("kpi-recaudo-sub", "sin pagos en " + anterior);
  } else {
    const v = d.recaudo.variacion_pct;
    poner("kpi-recaudo-sub", (v > 0 ? "+" : "") + String(v).replace(".", ",") + "% vs. " + anterior);
  }

  poner("kpi-saldo", dinero(d.saldo_pendiente.total));
  poner("kpi-saldo-sub",
    "entre " + d.saldo_pendiente.inscripciones + " " +
    plural(d.saldo_pendiente.inscripciones, "inscripción", "inscripciones"));

  poner("kpi-mora", String(d.cuotas_en_mora.cuotas));
  poner("kpi-mora-sub", dinero(d.cuotas_en_mora.valor) + " vencidos");

  poner("kpi-cupos", String(d.cupos.disponibles));
  poner("kpi-cupos-sub",
    "en " + d.cupos.grupos_abiertos + " " + plural(d.cupos.grupos_abiertos, "grupo", "grupos"));

  // Mision de hoy
  const m = d.mision_hoy;
  poner("mision-vencidas", String(m.cuotas_vencidas));
  poner("mision-vencidas-sub", "Contactar a acudientes");
  poner("mision-por-vencer", String(m.cuotas_por_vencer_7_dias));
  poner("mision-por-vencer-sub", "Enviar recordatorio");
  poner("mision-faltas", String(m.estudiantes_con_inasistencias_seguidas));
  poner("mision-faltas-sub", "3 o más clases sin asistir");

  const sinDocente = m.grupos_sin_docente;
  poner("mision-sin-docente", String(sinDocente.length));
  if (sinDocente.length === 0) {
    poner("mision-sin-docente-sub", "Todos los grupos tienen docente");
  } else {
    const g = sinDocente[0];
    let detalle = (g.calendario ? g.calendario + " · " : g.nombre_grupo + " · ") +
      (DIAS_CORTOS[g.dia_semana] || g.dia_semana) + " " + hora12(g.hora_inicio);
    if (sinDocente.length > 1) detalle += " y " + (sinDocente.length - 1) + " más";
    poner("mision-sin-docente-sub", detalle);
  }

  pintarBarras(d.ingresos_por_mes);
}

async function cargarResumen() {
  try {
    const datos = await pedirAlBackend("/resumen");
    quitarAviso();
    pintarResumen(datos);
  } catch (error) {
    if (error.message === "Sesion vencida" || error.message === "Sin sesion") return;
    if (error.status === 403) {
      mostrarAviso("Tu cuenta no tiene permiso para ver el resumen.");
    } else {
      mostrarAviso("No se pudo cargar el resumen. Si el servidor estaba dormido, intenta de nuevo en un minuto.");
    }
    console.error("Resumen:", error);
  }
}

/* ---------- quien soy y que puedo ver ---------- */

async function cargarPerfil() {
  try {
    const yo = await pedirAlBackend("/yo");

    // Etiqueta bajo el nombre
    poner("urol", yo.rol === "propietario" ? "Superadmin" : "Panel de gestión");

    // La pestaña Usuarios solo la ve quien puede gestionar usuarios
    if (yo.permisos.indexOf("gestionar_usuarios") === -1) {
      const enlace = document.querySelector('.nav a[onclick*="usuarios"]');
      if (enlace && enlace.parentElement) enlace.parentElement.style.display = "none";
      const pestana = document.getElementById("tab-usuarios");
      if (pestana) pestana.remove();
    }
  } catch (error) {
    console.error("Perfil:", error);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  cargarPerfil();
  cargarResumen();
});
