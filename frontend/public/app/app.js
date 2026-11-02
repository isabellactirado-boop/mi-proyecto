/* =====================================================================
   app.js - app movil de estudiantes PRE ICMA (Capacitor).
   - Inicia sesion contra el mismo backend del panel (/login).
   - Solo acepta cuentas con rol "estudiante".
   - Guarda el token en localStorage para no pedir login cada vez.
   - Abre con ?demo para ver la app con datos de ejemplo, sin backend.
   El contenido de tips y preguntas esta en tips.js (PLANES).
   ===================================================================== */

// La app del celular no lee config.js (el APK solo lleva la carpeta app/).
// Si el backend cambia de direccion, cambialo aqui y en config.js.
const API_URL = "https://preicma.onrender.com";
const DEMO = new URLSearchParams(location.search).has("demo");

const $ = (id) => document.getElementById(id);

let datosClases = null;     // se reutiliza entre Inicio (semana) y Clases
let relojCuenta = null;     // intervalo de la cuenta regresiva

/* ---------- sesion ---------- */

function leer(clave) {
  try { return localStorage.getItem(clave); } catch (e) { return null; }
}
function guardar(clave, valor) {
  try { localStorage.setItem(clave, valor); } catch (e) { /* sin almacenamiento */ }
}
function cerrarSesion() {
  try { ["token", "rol", "ver_como"].forEach((k) => localStorage.removeItem(k)); } catch (e) { /* nada */ }
  cerrarPerfil();
  clearInterval(relojCuenta);
  datosClases = null;
  mostrarPantalla("login");
}

/* ---------- carga (avisa si Render esta despertando) ---------- */

let cargas = 0;
let temporizador = null;
function empezarCarga() {
  cargas++;
  $("loader-txt").textContent = "Cargando…";
  $("loader").hidden = false;
  clearTimeout(temporizador);
  temporizador = setTimeout(() => {
    $("loader-txt").textContent = "Despertando el servidor… puede tardar hasta un minuto.";
  }, 4000);
}
function terminarCarga() {
  cargas = Math.max(0, cargas - 1);
  if (cargas === 0) {
    clearTimeout(temporizador);
    $("loader").hidden = true;
  }
}

/* ---------- peticiones ---------- */

/* El propietario (CEO) puede ver la app como cualquier estudiante. */
function esPropietario() {
  return leer("rol") === "propietario";
}
function verComo() {
  try { return JSON.parse(leer("ver_como") || "null"); } catch (e) { return null; }
}

async function pedir(ruta, opciones) {
  if (DEMO) return datosDemo(ruta);

  const elegido = verComo();
  if (esPropietario() && elegido && ruta.indexOf("/estudiante/") === 0) {
    ruta += (ruta.indexOf("?") === -1 ? "?" : "&") + "id_estudiante=" + elegido.id;
  }

  const config = Object.assign({}, opciones);
  config.headers = Object.assign({ "Content-Type": "application/json" }, config.headers);
  const token = leer("token");
  if (token) config.headers.Authorization = "Bearer " + token;

  empezarCarga();
  let respuesta;
  try {
    respuesta = await fetch(API_URL + ruta, config);
  } finally {
    terminarCarga();
  }

  let datos = null;
  try { datos = await respuesta.json(); } catch (e) { /* respuesta sin cuerpo */ }

  if (!respuesta.ok) {
    const error = new Error((datos && datos.detail) || "Error " + respuesta.status);
    error.status = respuesta.status;
    throw error;
  }
  return datos;
}

/* ---------- formatos ---------- */

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const DIAS_LARGOS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const DIA_SEMANA = { lunes: "Lunes", martes: "Martes", miercoles: "Miércoles", jueves: "Jueves",
  viernes: "Viernes", sabado: "Sábado", domingo: "Domingo" };

function fecha(texto) {               // "2026-11-03" -> Date local
  const p = String(texto).split("-");
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

function iso(f) {                     // Date -> "2026-11-03"
  return f.getFullYear() + "-" + String(f.getMonth() + 1).padStart(2, "0") + "-" +
    String(f.getDate()).padStart(2, "0");
}

function conHora(textoFecha, textoHora) {
  const f = fecha(textoFecha);
  const p = String(textoHora).split(":");
  f.setHours(Number(p[0]), Number(p[1]), 0, 0);
  return f;
}

function hora12(texto) {              // "18:00:00" -> "6:00 pm"
  if (!texto) return "";
  const partes = String(texto).split(":");
  let h = Number(partes[0]);
  const sufijo = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return h + ":" + partes[1] + " " + sufijo;
}

function diasDesdeHoy(textoFecha) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  return Math.round((fecha(textoFecha) - hoy) / 86400000);
}

function cuando(textoFecha) {         // "Hoy", "Mañana" o "jueves 6 nov"
  const dias = diasDesdeHoy(textoFecha);
  if (dias === 0) return "Hoy";
  if (dias === 1) return "Mañana";
  const f = fecha(textoFecha);
  return DIAS_LARGOS[f.getDay()] + " " + f.getDate() + " " + MESES[f.getMonth()];
}

function dinero(valor) {
  return "$ " + Math.round(Number(valor) || 0).toLocaleString("es-CO");
}

function primerNombre(nombre) {
  return String(nombre || "").trim().split(/\s+/)[0] || "";
}

function el(etiqueta, clase, texto) {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (texto !== undefined && texto !== null) nodo.textContent = texto;
  return nodo;
}

function revelar(nodo, posicion) {    // animacion de entrada escalonada
  nodo.classList.add("reveal");
  nodo.style.setProperty("--i", posicion);
  return nodo;
}

function enlaceSeguro(url) {
  return /^https?:\/\//i.test(url || "") ? url : null;
}

function enlaceExterno(url, clase, texto) {
  const a = el("a", clase, texto);
  a.href = url; a.target = "_blank"; a.rel = "noopener";
  return a;
}

function vacio(contenedor, texto) {
  contenedor.textContent = "";
  contenedor.appendChild(el("p", "vacio", texto));
}

function mostrarAviso(texto) {
  $("aviso").textContent = texto;
  $("aviso").hidden = !texto;
}

function contar(nodo, hasta, sufijo) { // numero que sube de 0 al valor
  const fin = Number(hasta) || 0;
  const inicio = performance.now();
  const dur = 900;
  function paso(t) {
    const p = Math.min(1, (t - inicio) / dur);
    const suave = 1 - Math.pow(1 - p, 3);
    nodo.textContent = Math.round(fin * suave) + (sufijo || "");
    if (p < 1) requestAnimationFrame(paso);
  }
  requestAnimationFrame(paso);
}

/* ---------- pantallas ---------- */

function mostrarPantalla(nombre) {
  ["login", "clave", "elegir", "app"].forEach((p) => { $("pantalla-" + p).hidden = p !== nombre; });
  window.scrollTo(0, 0);
}

function mostrarTab(nombre) {
  document.querySelectorAll(".bottom button").forEach((b) => {
    b.classList.toggle("on", b.dataset.tab === nombre);
  });
  document.querySelectorAll(".tab").forEach((t) => { t.hidden = t.id !== "tab-" + nombre; });
  window.scrollTo(0, 0);
  if (nombre === "clases") cargarClases();
  if (nombre === "resultados") cargarResultados();
}

/* ---------- perfil (hoja que sube al tocar el avatar) ---------- */

function abrirPerfil() {
  document.body.classList.add("perfil-open");
  $("perfil").setAttribute("aria-hidden", "false");
}
function cerrarPerfil() {
  document.body.classList.remove("perfil-open");
  $("perfil").setAttribute("aria-hidden", "true");
}

function pintarPerfil(perfil, cursos) {
  $("perfil-nombre").textContent = perfil.nombre_completo;
  $("perfil-av").textContent = perfil.nombre_completo.trim().charAt(0).toUpperCase();
  $("perfil-doc").textContent = perfil.doc_identidad ? "Documento " + perfil.doc_identidad : "";
  $("perfil-correo").textContent = perfil.correo_electronico || "";

  const caja = $("perfil-pagos");
  if (!cursos.length) return vacio(caja, "No tienes cursos activos.");
  caja.textContent = "";
  cursos.forEach((c) => {
    const total = Number(c.valor_acordado) || 0;
    const pagado = Number(c.total_pagado) || 0;
    const pago = el("div", "pago");
    const top = el("div", "pago-top");
    top.appendChild(el("strong", null, c.nombre_curso));
    top.appendChild(c.estado_pago === "en_mora"
      ? el("span", "pill bad", "Pago vencido")
      : Number(c.saldo_pendiente) > 0 ? el("span", "pill warn", "Con saldo") : el("span", "pill ok", "Al día"));
    pago.appendChild(top);
    const barra = el("div", "bar");
    const relleno = el("i");
    relleno.style.width = (total > 0 ? Math.min(100, (pagado / total) * 100) : 100) + "%";
    barra.appendChild(relleno);
    pago.appendChild(barra);
    pago.appendChild(el("p", null, "Pagado " + dinero(pagado) + " de " + dinero(total) +
      (Number(c.saldo_pendiente) > 0 ? " · faltan " + dinero(c.saldo_pendiente) : "")));
    caja.appendChild(pago);
  });
}

/* ---------- Inicio ---------- */

function saludo(nombre) {
  const h = new Date().getHours();
  const parte = h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
  const titulo = $("saludo");
  titulo.textContent = parte + ", ";
  titulo.appendChild(el("em", null, primerNombre(nombre)));
}

function textoCuenta(c) {
  const ahora = new Date();
  const inicio = conHora(c.fecha_clase, c.hora_inicio);
  const fin = conHora(c.fecha_clase, c.hora_fin);
  if (ahora >= inicio && ahora < fin) return { vivo: true, texto: "En vivo · termina " + hora12(c.hora_fin) };
  const s = Math.max(0, Math.floor((inicio - ahora) / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d >= 1) return { vivo: false, texto: "Faltan " + d + " d " + h + " h" };
  const dos = (n) => String(n).padStart(2, "0");
  return { vivo: false, texto: "Empieza en " + dos(h) + ":" + dos(m) + ":" + dos(s % 60) };
}

function pintarProxima(c) {
  clearInterval(relojCuenta);
  const caja = $("proxima");
  if (!c) return vacio(caja, "No tienes clases programadas por ahora. ¡Aprovecha para repasar!");

  caja.textContent = "";
  const f = fecha(c.fecha_clase);
  const ticket = revelar(el("div", "ticket"), 0);

  const stub = el("div", "ticket-stub");
  stub.appendChild(el("small", null, DIAS[f.getDay()]));
  stub.appendChild(el("b", null, String(f.getDate())));
  stub.appendChild(el("span", null, MESES[f.getMonth()]));
  ticket.appendChild(stub);

  const cuerpo = el("div", "ticket-body");
  cuerpo.appendChild(el("h3", null, c.tema || c.nombre_curso));
  cuerpo.appendChild(el("p", null, cuando(c.fecha_clase) + " · " + hora12(c.hora_inicio) + " – " + hora12(c.hora_fin)));
  cuerpo.appendChild(el("p", null, c.docente + (c.plataforma ? " · " + c.plataforma : "")));
  const cuenta = el("span", "cuenta");
  cuerpo.appendChild(cuenta);
  const url = enlaceSeguro(c.enlace_reunion);
  if (url) cuerpo.appendChild(enlaceExterno(url, "btn main", "Entrar a la clase"));
  ticket.appendChild(cuerpo);
  caja.appendChild(ticket);

  const tic = () => {
    const t = textoCuenta(c);
    cuenta.textContent = t.texto;
    cuenta.classList.toggle("vivo", t.vivo);
  };
  tic();
  relojCuenta = setInterval(tic, 1000);
}

function pintarSemana(clases) {
  const porDia = {};
  clases.forEach((c) => { (porDia[c.fecha_clase] = porDia[c.fecha_clase] || []).push(c); });

  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const lunes = new Date(hoy);
  lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
  const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6);
  $("semana-rango").textContent = lunes.getDate() + " " + MESES[lunes.getMonth()] + " – " +
    domingo.getDate() + " " + MESES[domingo.getMonth()];

  const caja = $("semana");
  caja.textContent = "";
  const botones = [];

  function elegir(boton, dia) {
    botones.forEach((b) => b.classList.remove("sel"));
    boton.classList.add("sel");
    const detalle = $("dia-detalle");
    const lista = porDia[iso(dia)] || [];
    if (!lista.length) return vacio(detalle, "Día libre en " + DIAS_LARGOS[dia.getDay()] + ". Un repaso de 20 minutos suma.");
    detalle.textContent = "";
    lista.forEach((c, i) => detalle.appendChild(revelar(itemClase(c, diasDesdeHoy(c.fecha_clase) >= 0), i)));
  }

  for (let i = 0; i < 7; i++) {
    const dia = new Date(lunes); dia.setDate(lunes.getDate() + i);
    const boton = el("button", "dia");
    boton.setAttribute("role", "tab");
    boton.appendChild(el("small", null, DIAS[dia.getDay()]));
    boton.appendChild(el("b", null, String(dia.getDate())));
    boton.appendChild(el("i"));
    if (porDia[iso(dia)]) boton.classList.add("tiene");
    if (dia.getTime() === hoy.getTime()) boton.classList.add("hoy");
    boton.addEventListener("click", () => elegir(boton, dia));
    botones.push(boton);
    caja.appendChild(revelar(boton, i));
  }
  elegir(botones[(hoy.getDay() + 6) % 7], hoy);
}

function racha(anteriores) {          // clases seguidas asistidas, desde la mas reciente
  let n = 0;
  for (const c of anteriores) {
    if (c.estado_asistencia === "presente" || c.estado_asistencia === "tarde") n++;
    else if (c.estado_asistencia === "ausente") break;
  }
  return n;
}

function pintarStats(asistencia, anteriores) {
  const pct = asistencia.porcentaje;
  if (pct === null) {
    $("st-asistencia").textContent = "–";
  } else {
    contar($("st-asistencia"), pct, "%");
    requestAnimationFrame(() => {
      $("ring-asistencia").style.strokeDashoffset = String(113.1 * (1 - pct / 100));
    });
  }
  const r = racha(anteriores);
  contar($("st-racha"), r);
  document.querySelector(".racha").classList.toggle("apagada", r === 0);
}

function pintarCursos(cursos) {
  const caja = $("cursos");
  if (!cursos.length) return vacio(caja, "No tienes cursos activos.");
  caja.textContent = "";
  cursos.forEach((c, i) => {
    const fila = revelar(el("div", "curso"), i);
    fila.appendChild(el("div", "curso-ico", c.nombre_curso.trim().charAt(0).toUpperCase()));
    const info = el("div");
    info.appendChild(el("h3", null, c.nombre_curso));
    const partes = [];
    if (c.dia_semana) partes.push((DIA_SEMANA[c.dia_semana] || c.dia_semana) + " " + hora12(c.hora_inicio));
    partes.push(c.docente || "Docente por asignar");
    if (c.nombre_grupo) partes.push(c.nombre_grupo);
    info.appendChild(el("p", null, partes.join(" · ")));
    fila.appendChild(info);
    caja.appendChild(fila);
  });
}

async function cargarInicio() {
  try {
    const [d, clases] = await Promise.all([pedir("/estudiante/inicio"), pedir("/estudiante/clases")]);
    datosClases = clases;
    mostrarAviso("");
    const nombre = d.perfil.nombre_completo;
    $("nombre").textContent = nombre;
    $("av").textContent = nombre.trim().charAt(0).toUpperCase();
    saludo(nombre);
    pintarProxima(d.proxima_clase);
    pintarSemana(clases.proximas.concat(clases.anteriores));
    pintarStats(d.asistencia, clases.anteriores);
    pintarCursos(d.cursos);
    pintarPerfil(d.perfil, d.cursos);
  } catch (error) {
    manejarError(error, "No se pudo cargar tu información.");
  }
}

/* ---------- Clases (linea de tiempo) ---------- */

const ESTADOS = {
  presente: ["ok", "Asistió"], tarde: ["warn", "Tarde"],
  ausente: ["bad", "Faltó"], excusa: ["mute", "Excusa"],
};

function itemClase(c, conEnlace) {
  const item = el("div", "clase");
  const info = el("div", "info");
  info.appendChild(el("small", null, cuando(c.fecha_clase) + " · " + hora12(c.hora_inicio)));
  info.appendChild(el("strong", null, c.tema || c.nombre_curso));
  info.appendChild(el("span", null, (c.tema ? c.nombre_curso + " · " : "") + c.docente));
  item.appendChild(info);

  const url = enlaceSeguro(c.enlace_reunion);
  if (conEnlace && url) {
    item.appendChild(enlaceExterno(url, null, "Entrar"));
  } else if (!conEnlace) {
    const estado = ESTADOS[c.estado_asistencia] || ["mute", "Sin registro"];
    item.appendChild(el("span", "pill " + estado[0], estado[1]));
  }
  return item;
}

function grupoLinea(titulo, clases, conEnlace, color, desde) {
  const frag = document.createDocumentFragment();
  frag.appendChild(el("p", "grupo-t", titulo));
  const linea = el("div", "linea");
  clases.forEach((c, i) => {
    const paso = revelar(el("div", "paso"), desde + i);
    paso.style.setProperty("--d", conEnlace ? color : (ESTADOS[c.estado_asistencia] || ["mute"])[0] === "bad" ? "var(--red)" : color);
    if (diasDesdeHoy(c.fecha_clase) === 0) paso.classList.add("hoy");
    paso.appendChild(itemClase(c, conEnlace));
    linea.appendChild(paso);
  });
  frag.appendChild(linea);
  return frag;
}

async function cargarClases() {
  const caja = $("clases-lista");
  try {
    if (!datosClases) datosClases = await pedir("/estudiante/clases");
    const { proximas, anteriores } = datosClases;
    caja.textContent = "";
    if (!proximas.length && !anteriores.length) return vacio(caja, "Todavía no hay clases registradas.");

    const semana = proximas.filter((c) => diasDesdeHoy(c.fecha_clase) < 7);
    const luego = proximas.filter((c) => diasDesdeHoy(c.fecha_clase) >= 7);
    let n = 0;
    if (semana.length) { caja.appendChild(grupoLinea("Esta semana", semana, true, "var(--yellow)", n)); n += semana.length; }
    if (luego.length) { caja.appendChild(grupoLinea("Más adelante", luego, true, "var(--teal)", n)); n += luego.length; }
    if (!proximas.length) caja.appendChild(el("p", "vacio", "No hay clases programadas en los próximos 30 días."));
    if (anteriores.length) caja.appendChild(grupoLinea("Ya pasaron", anteriores, false, "var(--ok)", n));
  } catch (error) {
    manejarError(error, "No se pudieron cargar tus clases.");
  }
}

/* ---------- Simulacros ---------- */

const AREAS = [
  ["lectura_critica", "Lectura", "var(--teal)"],
  ["matematicas", "Matemáticas", "var(--pink)"],
  ["sociales_ciudadanas", "Sociales", "var(--orange)"],
  ["ciencias_naturales", "Ciencias", "var(--violet)"],
  ["ingles", "Inglés", "var(--yellow)"],
];

function sparkline(lista) {           // lista del mas antiguo al mas reciente
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 300 70");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("class", "spark");
  svg.setAttribute("aria-hidden", "true");

  const valores = lista.map((r) => r.puntaje_global);
  const min = Math.min.apply(null, valores) - 20;
  const max = Math.max.apply(null, valores) + 20;
  const puntos = valores.map((v, i) => [
    valores.length === 1 ? 150 : 8 + (i * 284) / (valores.length - 1),
    64 - ((v - min) / (max - min || 1)) * 56,
  ]);
  const linea = puntos.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");

  svg.innerHTML =
    '<defs><linearGradient id="sombra" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#ffd23f" stop-opacity=".35"/><stop offset="1" stop-color="#ffd23f" stop-opacity="0"/>' +
    "</linearGradient></defs>";
  const area = document.createElementNS(NS, "path");
  area.setAttribute("class", "a");
  area.setAttribute("d", linea + " L" + puntos[puntos.length - 1][0] + " 70 L" + puntos[0][0] + " 70 Z");
  svg.appendChild(area);
  const trazo = document.createElementNS(NS, "path");
  trazo.setAttribute("class", "l");
  trazo.setAttribute("d", linea);
  svg.appendChild(trazo);
  const ultimo = document.createElementNS(NS, "circle");
  ultimo.setAttribute("cx", puntos[puntos.length - 1][0]);
  ultimo.setAttribute("cy", puntos[puntos.length - 1][1]);
  ultimo.setAttribute("r", "5");
  svg.appendChild(ultimo);
  return svg;
}

function pintarQuiz(caja, plan) {
  let pos = 0;
  const marcas = [];

  function pregunta() {
    caja.textContent = "";
    const top = el("div", "quiz-top");
    top.appendChild(el("span", null, "Pregunta " + (pos + 1) + " de " + plan.preguntas.length));
    const dots = el("div", "dots");
    plan.preguntas.forEach((_, i) => dots.appendChild(el("i", marcas[i] || (i === pos ? "ya" : ""))));
    top.appendChild(dots);
    caja.appendChild(top);

    const p = plan.preguntas[pos];
    caja.appendChild(el("q", null, p.enunciado));
    const ops = el("div", "ops");
    const botones = p.opciones.map((texto, i) => {
      const b = el("button", "op");
      b.appendChild(el("em", null, "ABCD"[i]));
      b.appendChild(document.createTextNode(texto));
      b.addEventListener("click", () => responder(i, botones, p));
      ops.appendChild(b);
      return b;
    });
    caja.appendChild(ops);
  }

  function responder(elegida, botones, p) {
    const bien = elegida === p.correcta;
    marcas[pos] = bien ? "ok" : "bad";
    botones.forEach((b, i) => {
      b.disabled = true;
      if (i === p.correcta) b.classList.add("bien");
      else if (i === elegida) b.classList.add("mal");
    });
    caja.querySelectorAll(".dots i")[pos].className = marcas[pos];
    caja.appendChild(el("div", "expl", (bien ? "¡Correcto! " : "Casi. ") + p.explicacion));
    const ultima = pos === plan.preguntas.length - 1;
    const sig = el("button", "btn main", ultima ? "Ver mi resultado" : "Siguiente pregunta");
    sig.addEventListener("click", () => { if (ultima) final(); else { pos++; pregunta(); } });
    caja.appendChild(sig);
  }

  function final() {
    const aciertos = marcas.filter((m) => m === "ok").length;
    const total = plan.preguntas.length;
    caja.textContent = "";
    const f = el("div", "final reveal");
    f.appendChild(el("b", null, aciertos + "/" + total));
    f.appendChild(el("p", null, aciertos === total
      ? "¡Perfecto! Vas por buen camino. Sigue practicando en las plataformas de abajo."
      : aciertos > 0 ? "¡Bien! Revisa las explicaciones y vuelve a intentarlo."
        : "Tranquilo, para eso se practica. Mira los tips y vuelve a intentarlo."));
    f.appendChild(revelar(el("div", "dots"), 1));
    marcas.forEach((m) => f.lastChild.appendChild(el("i", m)));
    f.lastChild.style.justifyContent = "center";
    f.lastChild.style.marginTop = "10px";
    caja.appendChild(f);
    const otra = el("button", "btn", "Intentar de nuevo");
    otra.addEventListener("click", () => { pos = 0; marcas.length = 0; pregunta(); });
    caja.appendChild(otra);
  }

  pregunta();
}

function pintarPlan(caja, ultimo) {
  const conNota = AREAS.filter(([campo]) => ultimo[campo] !== null && ultimo[campo] !== undefined);
  if (!conNota.length) return;
  const [campo, nombre] = conNota.reduce((a, b) => (ultimo[b[0]] < ultimo[a[0]] ? b : a));
  const plan = PLANES[campo];
  const nota = ultimo[campo];

  const card = revelar(el("div", "plan"), 3);
  card.style.setProperty("--c2", plan.color);
  const head = el("div", "plan-head");
  head.appendChild(el("small", null, nota < 50 ? "Necesita atención · " + nota + "/100" : "Tu área a reforzar · " + nota + "/100"));
  head.appendChild(el("h3", null, "Plan para subir " + nombre));
  head.appendChild(el("p", null, nota < 50
    ? "Esta área está muy baja. Con práctica corta y constante puedes subirla rápido."
    : "Es tu puntaje más bajo del último simulacro. Aquí tienes con qué empezar."));
  card.appendChild(head);

  const tips = el("div", "plan-sec");
  tips.appendChild(el("h4", null, "Tips"));
  const lista = el("ol", "tips");
  plan.tips.forEach((t) => lista.appendChild(el("li", null, t)));
  tips.appendChild(lista);
  card.appendChild(tips);

  const quiz = el("div", "plan-sec");
  quiz.appendChild(el("h4", null, "Pon a prueba lo que sabes"));
  const cajaQuiz = el("div", "quiz");
  quiz.appendChild(cajaQuiz);
  card.appendChild(quiz);
  pintarQuiz(cajaQuiz, plan);

  const plats = el("div", "plan-sec");
  plats.appendChild(el("h4", null, "Practica en"));
  const fila = el("div", "plataformas");
  plan.plataformas.forEach((p) => {
    const a = enlaceExterno(p.url, "plat");
    a.appendChild(el("strong", null, p.nombre));
    a.appendChild(el("span", null, p.detalle));
    fila.appendChild(a);
  });
  plats.appendChild(fila);
  card.appendChild(plats);

  caja.appendChild(card);
}

async function cargarResultados() {
  const caja = $("resultados");
  try {
    const lista = await pedir("/estudiante/resultados");
    if (!lista.length) return vacio(caja, "Aún no tienes resultados de simulacros. Cuando presentes el primero, aquí verás tu progreso.");

    caja.textContent = "";
    const ultimo = lista[0];
    const anterior = lista[1];

    // Puntaje global con su evolucion
    const hero = revelar(el("div", "puntaje"), 0);
    const f = fecha(ultimo.fecha_simulacro);
    hero.appendChild(el("small", null, (ultimo.simulacro || "Último simulacro") + " · " +
      f.getDate() + " " + MESES[f.getMonth()] + " " + f.getFullYear()));
    const num = el("div", "num");
    const valor = el("strong", null, "0");
    num.appendChild(valor);
    num.appendChild(el("span", null, " / 500"));
    hero.appendChild(num);
    contar(valor, ultimo.puntaje_global);
    if (anterior) {
      const dif = ultimo.puntaje_global - anterior.puntaje_global;
      hero.appendChild(el("span", "delta " + (dif >= 0 ? "sube" : "baja"),
        (dif >= 0 ? "▲ +" : "▼ ") + dif + " puntos vs. el anterior"));
    }
    if (lista.length > 1) hero.appendChild(sparkline(lista.slice().reverse()));
    caja.appendChild(hero);

    // Areas del ultimo simulacro
    const conNota = AREAS.filter(([c]) => ultimo[c] !== null && ultimo[c] !== undefined);
    const minimo = Math.min.apply(null, conNota.map(([c]) => ultimo[c]));
    const areas = revelar(el("div", "card areas"), 1);
    conNota.forEach(([campo, nombre, color]) => {
      const fila = el("div", "area" + (ultimo[campo] === minimo ? " debil" : ""));
      fila.appendChild(el("span", null, nombre));
      const barra = el("div", "bar");
      const relleno = el("i");
      relleno.style.setProperty("--c2", color);
      barra.appendChild(relleno);
      fila.appendChild(barra);
      fila.appendChild(el("b", null, String(ultimo[campo])));
      areas.appendChild(fila);
      requestAnimationFrame(() => requestAnimationFrame(() => { relleno.style.width = ultimo[campo] + "%"; }));
    });
    caja.appendChild(areas);

    pintarPlan(caja, ultimo);

    // Historial
    if (lista.length > 1) {
      caja.appendChild(el("h2", "titulo", "Historial"));
      const hist = el("div", "historial");
      lista.forEach((r, i) => {
        const fila = revelar(el("div", "fila"), i);
        const izq = el("div");
        izq.appendChild(el("strong", null, r.simulacro || "Simulacro"));
        const fr = fecha(r.fecha_simulacro);
        izq.appendChild(el("small", null, fr.getDate() + " " + MESES[fr.getMonth()] + " " + fr.getFullYear()));
        fila.appendChild(izq);
        fila.appendChild(el("b", null, String(r.puntaje_global)));
        hist.appendChild(fila);
      });
      caja.appendChild(hist);
    }
  } catch (error) {
    manejarError(error, "No se pudieron cargar tus resultados.");
  }
}

/* ---------- errores ---------- */

function manejarError(error, texto) {
  console.error(error);
  if (error.status === 401 || error.status === 403) {
    cerrarSesion();
    $("msg-login").textContent = error.status === 401
      ? "Tu sesión terminó. Inicia sesión de nuevo."
      : error.message || "Esta cuenta no es de estudiante.";
    return;
  }
  if (esPropietario() && (error.status === 400 || error.status === 404)) {
    abrirElegir();   // el estudiante elegido ya no existe: elegir otro
    return;
  }
  mostrarAviso(error.status ? texto : "Sin conexión con el servidor. Revisa tu internet e intenta de nuevo.");
}

/* ---------- login y cambio de contraseña ---------- */

let claveTemporal = "";

function entrarApp() {
  if (esPropietario() && !verComo() && !DEMO) return abrirElegir();
  const elegido = verComo();
  $("vista-dueno").hidden = !esPropietario();
  $("btn-otro").hidden = !esPropietario();
  if (esPropietario() && elegido) $("vista-dueno").textContent = "Vista del propietario · " + primerNombre(elegido.nombre);
  datosClases = null;
  mostrarPantalla("app");
  mostrarTab("inicio");
  cargarInicio();
}

/* ---------- propietario: elegir a que estudiante ver ---------- */

let listaEstudiantes = [];

function pintarElegir() {
  const q = $("elegir-buscar").value.trim().toLowerCase();
  const caja = $("elegir-lista");
  const filtrados = listaEstudiantes.filter((e) =>
    !q || e.nombre_completo.toLowerCase().includes(q) || String(e.doc_identidad).includes(q));
  caja.textContent = "";
  if (!filtrados.length) return vacio(caja, listaEstudiantes.length ? "Nadie coincide con esa búsqueda." : "Aún no hay estudiantes registrados.");
  filtrados.slice(0, 50).forEach((e, i) => {
    const b = revelar(el("button", "elegible"), Math.min(i, 8));
    b.type = "button";
    b.appendChild(el("span", "curso-ico", e.nombre_completo.trim().charAt(0).toUpperCase()));
    const info = el("div");
    info.appendChild(el("strong", null, e.nombre_completo));
    info.appendChild(el("small", null, [e.doc_identidad, e.curso, e.nombre_grupo].filter(Boolean).join(" · ") ||
      "Sin inscripción activa"));
    b.appendChild(info);
    b.addEventListener("click", () => {
      guardar("ver_como", JSON.stringify({ id: e.id_estudiante, nombre: e.nombre_completo }));
      entrarApp();
    });
    caja.appendChild(b);
  });
}

async function abrirElegir() {
  cerrarPerfil();
  clearInterval(relojCuenta);
  mostrarPantalla("elegir");
  if (listaEstudiantes.length) return pintarElegir();
  try {
    const d = await pedir("/estudiantes");
    // primero los que tienen inscripcion activa
    listaEstudiantes = d.estudiantes.slice().sort((a, b) =>
      (b.estado_inscripcion === "activa") - (a.estado_inscripcion === "activa"));
    pintarElegir();
  } catch (error) {
    if (error.status === 401 || error.status === 403) return manejarError(error);
    vacio($("elegir-lista"), "No se pudo cargar la lista de estudiantes. Intenta de nuevo.");
  }
}

function despuesDeEntrar(d) {
  guardar("token", d.token);
  if (d.rol) guardar("rol", d.rol);
  try { localStorage.removeItem("ver_como"); } catch (e) { /* nada */ }
  entrarApp();
}

$("form-login").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const msg = $("msg-login");
  const correo = $("correo").value.trim();
  const contrasena = $("contrasena").value;
  if (!correo || !contrasena) { msg.textContent = "Escribe tu correo y tu contraseña."; return; }

  msg.textContent = "";
  $("btn-login").disabled = true;
  try {
    const d = await pedir("/login", { method: "POST", body: JSON.stringify({ correo, contrasena }) });
    if (d.rol !== "estudiante" && d.rol !== "propietario") {
      msg.textContent = "Esta app es solo para estudiantes. Usa el panel web.";
      return;
    }
    guardar("token", d.token);
    guardar("rol", d.rol);
    $("contrasena").value = "";
    if (d.debe_cambiar_contrasena) {
      claveTemporal = contrasena;
      $("clave-actual").value = contrasena;
      mostrarPantalla("clave");
    } else {
      despuesDeEntrar(d);
    }
  } catch (error) {
    msg.textContent = error.status === 401
      ? "Correo o contraseña incorrectos."
      : error.status ? "Error del servidor (" + error.status + ")." : "No se pudo conectar con el servidor.";
  } finally {
    $("btn-login").disabled = false;
  }
});

$("form-clave").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const msg = $("msg-clave");
  const actual = $("clave-actual").value || claveTemporal;
  const nueva = $("clave-nueva").value;
  if (nueva !== $("clave-repetir").value) { msg.textContent = "Las contraseñas nuevas no coinciden."; return; }

  msg.textContent = "";
  try {
    const d = await pedir("/cambiar-contrasena", {
      method: "POST",
      body: JSON.stringify({ contrasena_actual: actual, contrasena_nueva: nueva }),
    });
    claveTemporal = "";
    ["clave-actual", "clave-nueva", "clave-repetir"].forEach((id) => { $(id).value = ""; });
    despuesDeEntrar(d);
  } catch (error) {
    msg.textContent = error.message;
  }
});

$("av").addEventListener("click", abrirPerfil);
$("perfil-bg").addEventListener("click", cerrarPerfil);
$("btn-salir").addEventListener("click", cerrarSesion);
$("btn-otro").addEventListener("click", abrirElegir);
$("elegir-buscar").addEventListener("input", pintarElegir);
$("elegir-salir").addEventListener("click", cerrarSesion);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrarPerfil(); });

document.querySelectorAll(".bottom button").forEach((b) => {
  b.addEventListener("click", () => mostrarTab(b.dataset.tab));
});

/* ---------- boton "atras" de Android (solo dentro del APK) ---------- */

const appNativa = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
if (appNativa) {
  appNativa.addListener("backButton", () => {
    const tabActiva = document.querySelector(".bottom button.on");
    if (document.body.classList.contains("perfil-open")) cerrarPerfil();
    else if (!$("pantalla-app").hidden && tabActiva && tabActiva.dataset.tab !== "inicio") mostrarTab("inicio");
    else if (!$("pantalla-clave").hidden) cerrarSesion();
    else appNativa.exitApp();
  });
}

/* ---------- arranque ---------- */

// El panel web abre la app con ?desde=panel despues de copiar la sesion del CEO
if (new URLSearchParams(location.search).get("desde") === "panel") {
  try { localStorage.removeItem("ver_como"); } catch (e) { /* nada */ }
  history.replaceState(null, "", location.pathname);
}
if (DEMO || leer("token")) entrarApp(); else mostrarPantalla("login");

/* ---------- datos de ejemplo (?demo) ---------- */

function datosDemo(ruta) {
  const dia = (n) => { const f = new Date(); f.setDate(f.getDate() + n); return iso(f); };
  const ahora = new Date();
  const enUnRato = String(Math.min(22, ahora.getHours() + 2)).padStart(2, "0") + ":00:00";
  const fin = String(Math.min(23, ahora.getHours() + 4)).padStart(2, "0") + ":00:00";
  const base = { plataforma: "Google Meet", enlace_reunion: "https://meet.google.com/abc-defg-hij",
    docente: "Laura Gómez", nombre_curso: "Pre-ICFES Calendario B", hora_inicio: "18:00:00", hora_fin: "20:00:00" };
  const clase = (n, tema, estado) => Object.assign({}, base, { fecha_clase: dia(n), tema, estado_asistencia: estado });

  if (ruta === "/estudiante/inicio") {
    return Promise.resolve({
      perfil: { nombre_completo: "Isabella Tirado", doc_identidad: "1001234567", correo_electronico: "isabella@correo.com" },
      proxima_clase: Object.assign({}, base, { fecha_clase: dia(0), hora_inicio: enUnRato, hora_fin: fin, tema: "Funciones y gráficas" }),
      asistencia: { porcentaje: 92, faltas: 1 },
      cursos: [
        { nombre_curso: "Pre-ICFES Calendario B", nombre_grupo: "Grupo 2", dia_semana: "martes",
          hora_inicio: "18:00:00", docente: "Laura Gómez", valor_acordado: 600000, total_pagado: 420000,
          saldo_pendiente: 180000, estado_pago: "al_dia" },
        { nombre_curso: "Taller de Inglés", nombre_grupo: "Grupo 1", dia_semana: "sabado",
          hora_inicio: "09:00:00", docente: "Carlos Ruiz", valor_acordado: 250000, total_pagado: 250000,
          saldo_pendiente: 0, estado_pago: "al_dia" },
      ],
    });
  }
  if (ruta === "/estudiante/clases") {
    return Promise.resolve({
      proximas: [clase(0, "Funciones y gráficas"), clase(2, "Lectura crítica: inferencias"),
        clase(9, "Genética básica"), clase(16, "Constitución de 1991")],
      anteriores: [clase(-2, "Probabilidad", "presente"), clase(-5, "Ecuaciones", "presente"),
        clase(-7, "Comprensión de textos", "tarde"), clase(-9, "Química orgánica", "ausente"),
        clase(-12, "Estadística", "presente")],
    });
  }
  return Promise.resolve([
    { simulacro: "Simulacro 3", fecha_simulacro: dia(-6), puntaje_global: 312, lectura_critica: 72,
      matematicas: 44, sociales_ciudadanas: 68, ciencias_naturales: 63, ingles: 80 },
    { simulacro: "Simulacro 2", fecha_simulacro: dia(-30), puntaje_global: 289, lectura_critica: 66,
      matematicas: 48, sociales_ciudadanas: 60, ciencias_naturales: 58, ingles: 75 },
    { simulacro: "Simulacro 1", fecha_simulacro: dia(-60), puntaje_global: 254, lectura_critica: 58,
      matematicas: 41, sociales_ciudadanas: 55, ciencias_naturales: 52, ingles: 70 },
  ]);
}
