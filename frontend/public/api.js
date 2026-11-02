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

/* ---------- Estudiantes ---------- */

const ESTILOS_ESTUDIANTES = `
.bx-gris{background:var(--moon,#e8e0cd);color:var(--muted,#6b6790)}
.modal-est{position:fixed;inset:0;z-index:200;display:none;place-items:center;padding:16px;background:rgba(18,18,60,.65);overflow:auto}
.modal-est.open{display:grid}
.modal-est .caja{position:relative;width:100%;max-width:760px;max-height:92vh;overflow:auto;background:#fffdf8;border:3px solid var(--ink,#1a1240);border-radius:20px;padding:24px;box-shadow:8px 8px 0 var(--yellow,#ffd23f);color:var(--ink,#1a1240);font-family:'DM Sans',sans-serif}
.modal-est h3{margin:0 0 2px;font-size:1.4rem}
.modal-est h4{margin:18px 0 8px;font-size:.95rem;border-bottom:2px solid var(--ink,#1a1240);padding-bottom:4px}
.modal-est .sub{margin:0 0 4px;color:var(--muted,#6b6790);font-size:.88rem}
.modal-est .rejilla{display:grid;grid-template-columns:1fr 1fr;gap:6px 18px;font-size:.9rem}
.modal-est .tarjeta{background:var(--cream,#f6f1e7);border:2px solid var(--ink,#1a1240);border-radius:12px;padding:10px 12px;margin-bottom:8px;font-size:.9rem}
.modal-est table{width:100%;border-collapse:collapse;font-size:.85rem}
.modal-est th,.modal-est td{text-align:left;padding:5px 6px;border-bottom:1px solid var(--line,#e2d9c4)}
.modal-est .cierre{position:absolute;top:12px;right:14px;border:2px solid var(--ink,#1a1240);background:#fff;border-radius:99px;width:32px;height:32px;font-weight:700;cursor:pointer}
.modal-est .acciones{display:flex;gap:10px;justify-content:flex-end;margin-top:18px;flex-wrap:wrap}
@media(max-width:560px){.modal-est .rejilla{grid-template-columns:1fr}}
`;

let ESTUDIANTES_CACHE = [];

function inyectarEstilos() {
  if (document.getElementById("estilos-estudiantes")) return;
  const estilo = document.createElement("style");
  estilo.id = "estilos-estudiantes";
  estilo.textContent = ESTILOS_ESTUDIANTES;
  document.head.appendChild(estilo);
}

function crear(etiqueta, texto, clase) {
  const el = document.createElement(etiqueta);
  if (texto !== undefined && texto !== null) el.textContent = texto;
  if (clase) el.className = clase;
  return el;
}

function vacio(valor) {
  return valor === null || valor === undefined || valor === "" ? "—" : String(valor);
}

function fechaLarga(iso) {            // "2008-05-05" -> "5 may 2008"
  if (!iso) return "—";
  const p = String(iso).slice(0, 10).split("-");
  return Number(p[2]) + " " + MESES_CORTOS[Number(p[1]) - 1].toLowerCase() + " " + p[0];
}

function grupoTexto(f) {
  if (!f.nombre_grupo) return f.curso || "Sin grupo";
  const dia = DIAS_CORTOS[f.dia_semana] || f.dia_semana || "";
  return f.nombre_grupo + (dia ? " · " + dia + " " + hora12(f.hora_inicio) : "");
}

function etiquetaPago(f, puedeVerPagos) {
  if (!f.id_inscripcion) return { texto: "Sin inscripción", clase: "badge bx-gris" };
  if (f.estado_inscripcion !== "activa") {
    return { texto: f.estado_inscripcion === "retirada" ? "Retirado" : "Finalizado", clase: "badge bx-gris" };
  }
  if (!puedeVerPagos) return { texto: "—", clase: "" };
  if (f.estado_pago === "en_mora") return { texto: "En mora", clase: "badge b-red" };
  return { texto: "Al día", clase: "badge b-ok" };
}

function pintarEstudiantes(datos) {
  const cuerpo = document.getElementById("tbody-estudiantes");
  if (!cuerpo) return;
  cuerpo.textContent = "";
  ESTUDIANTES_CACHE = datos.estudiantes;

  if (datos.estudiantes.length === 0) {
    const fila = crear("tr");
    const celda = crear("td", "Todavía no hay estudiantes registrados.");
    celda.colSpan = 6;
    fila.appendChild(celda);
    cuerpo.appendChild(fila);
    return;
  }

  datos.estudiantes.forEach((f) => {
    const fila = crear("tr");
    fila.appendChild(crear("td", f.doc_identidad));
    fila.appendChild(crear("td", f.nombre_completo));
    fila.appendChild(crear("td", f.id_inscripcion ? grupoTexto(f) : "—"));
    fila.appendChild(crear("td", vacio(f.acudiente)));

    const estado = etiquetaPago(f, datos.puede_ver_pagos);
    const celdaEstado = crear("td");
    if (estado.clase) celdaEstado.appendChild(crear("span", estado.texto, estado.clase));
    else celdaEstado.textContent = estado.texto;
    fila.appendChild(celdaEstado);

    const celdaAccion = crear("td");
    const boton = crear("button", "Detalles", "btn sm");
    boton.type = "button";
    boton.addEventListener("click", () => abrirDetalleEstudiante(f.id_estudiante, boton));
    celdaAccion.appendChild(boton);
    fila.appendChild(celdaAccion);

    cuerpo.appendChild(fila);
  });
}

async function cargarEstudiantes() {
  const cuerpo = document.getElementById("tbody-estudiantes");
  if (!cuerpo) return;
  try {
    const datos = await pedirAlBackend("/estudiantes");
    pintarEstudiantes(datos);
  } catch (error) {
    if (error.message === "Sesion vencida" || error.message === "Sin sesion") return;
    cuerpo.textContent = "";
    const fila = crear("tr");
    const celda = crear("td", error.status === 403
      ? "Tu cuenta no tiene permiso para ver estudiantes."
      : "No se pudo cargar la lista. Si el servidor estaba dormido, intenta de nuevo en un minuto.");
    celda.colSpan = 6;
    fila.appendChild(celda);
    cuerpo.appendChild(fila);
    console.error("Estudiantes:", error);
  }
}

/* ---------- Ventana de Detalles ---------- */

function cerrarDetalle() {
  const modal = document.getElementById("modal-estudiante");
  if (modal) modal.classList.remove("open");
}

function fila2(etiqueta, valor) {
  const d = crear("div");
  d.appendChild(crear("strong", etiqueta + ": "));
  d.appendChild(document.createTextNode(vacio(valor)));
  return d;
}

function tablaSimple(encabezados, filas) {
  const t = crear("table");
  const cab = crear("tr");
  encabezados.forEach((h) => cab.appendChild(crear("th", h)));
  t.appendChild(cab);
  filas.forEach((cols) => {
    const f = crear("tr");
    cols.forEach((c) => f.appendChild(crear("td", c)));
    t.appendChild(f);
  });
  return t;
}

function pintarDetalle(d) {
  let modal = document.getElementById("modal-estudiante");
  if (!modal) {
    modal = crear("div", null, "modal-est");
    modal.id = "modal-estudiante";
    modal.addEventListener("click", (e) => { if (e.target === modal) cerrarDetalle(); });
    document.body.appendChild(modal);
  }
  modal.textContent = "";
  const caja = crear("div", null, "caja");
  caja.setAttribute("role", "dialog");
  caja.setAttribute("aria-modal", "true");

  const cierre = crear("button", "×", "cierre");
  cierre.type = "button";
  cierre.setAttribute("aria-label", "Cerrar");
  cierre.addEventListener("click", cerrarDetalle);
  caja.appendChild(cierre);

  const e = d.estudiante;
  caja.appendChild(crear("h3", e.nombre_completo));
  caja.appendChild(crear("p", e.tipo_documento + " " + e.doc_identidad + " · matrícula " + e.estado_matricula, "sub"));

  caja.appendChild(crear("h4", "Datos del estudiante"));
  const rej = crear("div", null, "rejilla");
  rej.appendChild(fila2("Teléfono", e.telefono_celular));
  rej.appendChild(fila2("Correo", e.correo_electronico));
  rej.appendChild(fila2("Nacimiento", fechaLarga(e.fecha_nacimiento)));
  rej.appendChild(fila2("Dirección", e.direccion));
  caja.appendChild(rej);

  caja.appendChild(crear("h4", "Acudientes"));
  if (d.acudientes.length === 0) {
    caja.appendChild(crear("p", "Este estudiante no tiene acudiente registrado.", "sub"));
  }
  d.acudientes.forEach((a) => {
    const t = crear("div", null, "tarjeta");
    t.appendChild(crear("strong", a.nombre_completo + " "));
    t.appendChild(crear("span", a.parentesco, "badge bx-gris"));
    if (a.es_principal) { t.appendChild(document.createTextNode(" ")); t.appendChild(crear("span", "Principal", "badge b-warn")); }
    const r = crear("div", null, "rejilla");
    r.style.marginTop = "6px";
    r.appendChild(fila2("Teléfono", a.telefono));
    r.appendChild(fila2("Correo", a.correo_electronico));
    t.appendChild(r);
    caja.appendChild(t);
  });

  caja.appendChild(crear("h4", "Inscripciones"));
  if (d.inscripciones.length === 0) {
    caja.appendChild(crear("p", "Todavía no tiene inscripciones.", "sub"));
  }
  d.inscripciones.forEach((i) => {
    const t = crear("div", null, "tarjeta");
    const dia = DIAS_CORTOS[i.dia_semana] || i.dia_semana;
    t.appendChild(crear("strong", i.curso + (i.nombre_grupo ? " · " + i.nombre_grupo : "") + " "));
    t.appendChild(crear("span", i.estado, i.estado === "activa" ? "badge b-ok" : "badge bx-gris"));
    const r = crear("div", null, "rejilla");
    r.style.marginTop = "6px";
    r.appendChild(fila2("Horario", i.hora_inicio ? dia + " " + hora12(i.hora_inicio) + " a " + hora12(i.hora_fin) : null));
    r.appendChild(fila2("Docente", i.docente));
    r.appendChild(fila2("Inscrito", fechaLarga(i.fecha_inscripcion)));
    if (d.permisos.pagos) {
      r.appendChild(fila2("Pago", i.modalidad_pago === "cuotas" ? i.numero_cuotas + " cuotas" : "Pago único"));
      r.appendChild(fila2("Valor acordado", dinero(i.valor_acordado)));
      if (i.pagos) {
        r.appendChild(fila2("Pagado", dinero(i.pagos.total_pagado)));
        r.appendChild(fila2("Saldo pendiente", dinero(i.pagos.saldo_pendiente)));
        if (Number(i.pagos.valor_en_mora) > 0) {
          r.appendChild(fila2("En mora", dinero(i.pagos.valor_en_mora) + " (" + i.pagos.cuotas_en_mora + " " + plural(Number(i.pagos.cuotas_en_mora), "cuota", "cuotas") + ")"));
        }
      }
    }
    t.appendChild(r);

    if (d.permisos.asistencias && i.asistencia && Number(i.asistencia.total_clases) > 0) {
      const a = i.asistencia;
      t.appendChild(crear("div", "Asistencia: " + a.presentes + " presentes, " + a.ausentes + " ausentes, " +
        a.tardes + " tardes, " + a.excusas + " excusas (" + String(a.porcentaje_asistencia).replace(".", ",") + "% presente)"))
        .style.marginTop = "6px";
    }
    if (d.permisos.resultados && i.resultados.length > 0) {
      const filas = i.resultados.map((x) => [x.simulacro || "Simulacro", fechaLarga(x.fecha_simulacro),
        x.puntaje_global + " / 500", x.matematicas, x.lectura_critica, x.sociales_ciudadanas, x.ciencias_naturales, x.ingles]);
      const caja2 = crear("div");
      caja2.style.cssText = "margin-top:8px;overflow-x:auto";
      caja2.appendChild(tablaSimple(["Simulacro", "Fecha", "Global", "Mat.", "Lect.", "Soc.", "Nat.", "Ing."], filas));
      t.appendChild(caja2);
    }
    caja.appendChild(t);
  });

  const acciones = crear("div", null, "acciones");
  const informe = crear("button", "Generar informe", "btn sm main");
  informe.type = "button";
  informe.addEventListener("click", () => generarInformeDesdeDetalle(d));
  const cerrar = crear("button", "Cerrar", "btn sm");
  cerrar.type = "button";
  cerrar.addEventListener("click", cerrarDetalle);
  acciones.appendChild(informe);
  acciones.appendChild(cerrar);
  caja.appendChild(acciones);

  modal.appendChild(caja);
  modal.classList.add("open");
  cierre.focus();
}

async function abrirDetalleEstudiante(id, boton) {
  if (boton) boton.disabled = true;
  try {
    const datos = await pedirAlBackend("/estudiantes/" + id);
    pintarDetalle(datos);
  } catch (error) {
    if (error.message === "Sesion vencida" || error.message === "Sin sesion") return;
    window.alert("No se pudo cargar el detalle del estudiante. Intenta de nuevo.");
    console.error("Detalle:", error);
  } finally {
    if (boton) boton.disabled = false;
  }
}

function escaparHtml(texto) {
  return String(texto === null || texto === undefined ? "" : texto)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Informe del estudiante con la misma estetica de los informes de pagos y
// asistencias (usa el molde de informes.js). Respeta lo que el rol puede ver.
function generarInformeDesdeDetalle(d) {
  const inf = window.PreicmaInformes;
  if (!inf) { window.alert("No se pudo preparar el informe. Recarga la página e intenta de nuevo."); return; }
  const esc = inf.escapar;
  const e = d.estudiante;
  const activas = d.inscripciones.filter((x) => x.estado === "activa");
  const pct = (v) => String(v).replace(".", ",") + " %";
  const dato = (etiqueta, valor) => `<div><b>${esc(etiqueta)}:</b>${esc(vacio(valor))}</div>`;
  const pill = (texto, tono) => `<span class="pill ${tono}">${esc(texto)}</span>`;

  // --- tarjetas de resumen (de las inscripciones activas) ---
  const resumen = [["Cursos activos", activas.length]];
  if (d.permisos.asistencias) {
    let tot = 0, pres = 0;
    activas.forEach((i) => { if (i.asistencia) { tot += Number(i.asistencia.total_clases) || 0; pres += Number(i.asistencia.presentes) || 0; } });
    const p = tot ? Math.round(1000 * pres / tot) / 10 : null;
    resumen.push(["Asistencia", p === null ? "—" : pct(p), p === null ? "" : p < 70 ? "mal" : "bien"]);
  }
  if (d.permisos.resultados) {
    const ultimos = activas.concat(d.inscripciones).map((i) => (i.resultados || [])[0]).filter(Boolean)
      .sort((x, y) => String(y.fecha_simulacro).localeCompare(String(x.fecha_simulacro)));
    resumen.push(["Último simulacro", ultimos.length ? ultimos[0].puntaje_global + " / 500" : "—"]);
  }
  if (d.permisos.pagos) {
    let saldo = 0, mora = 0;
    activas.forEach((i) => { if (i.pagos) { saldo += Number(i.pagos.saldo_pendiente) || 0; mora += Number(i.pagos.valor_en_mora) || 0; } });
    resumen.push(mora > 0 ? ["En mora", dinero(mora), "mal"] : ["Saldo pendiente", dinero(saldo), saldo > 0 ? "" : "bien"]);
  }

  // --- secciones ---
  const secciones = [];
  secciones.push({
    titulo: "Datos del estudiante",
    html: `<div class="datos">${dato("Documento", e.tipo_documento + " " + e.doc_identidad)}${dato("Teléfono", e.telefono_celular)}` +
      `${dato("Correo", e.correo_electronico)}${dato("Nacimiento", fechaLarga(e.fecha_nacimiento))}` +
      `${dato("Dirección", e.direccion)}${dato("Matrícula", e.estado_matricula)}</div>`,
  });

  secciones.push({
    titulo: "Acudientes",
    html: d.acudientes.length
      ? d.acudientes.map((a) => `<div class="tarjeta"><strong>${esc(a.nombre_completo)}</strong> ${pill(a.parentesco, "gris")}` +
          `${a.es_principal ? " " + pill("Principal", "amarillo") : ""}` +
          `<div class="datos">${dato("Teléfono", a.telefono)}${dato("Correo", a.correo_electronico)}</div></div>`).join("")
      : `<p class="nota">Este estudiante no tiene acudiente registrado.</p>`,
  });

  if (!d.inscripciones.length) {
    secciones.push({ titulo: "Cursos", html: `<p class="nota">Todavía no tiene inscripciones.</p>` });
  }
  d.inscripciones.forEach((i) => {
    const tono = i.estado === "activa" ? "verde" : "gris";
    const dia = DIAS_CORTOS[i.dia_semana] || i.dia_semana;
    let h = `<div class="datos">${dato("Horario", i.hora_inicio ? dia + " " + hora12(i.hora_inicio) + " a " + hora12(i.hora_fin) : null)}` +
      `${dato("Docente", i.docente)}${dato("Inscrito", fechaLarga(i.fecha_inscripcion))}` +
      (d.permisos.pagos ? dato("Forma de pago", i.modalidad_pago === "cuotas" ? i.numero_cuotas + " cuotas" : "Pago único") : "") +
      `</div>`;

    if (d.permisos.asistencias) {
      h += `<div class="sub-t">Asistencia</div>`;
      const a = i.asistencia;
      if (a && Number(a.total_clases) > 0) {
        const p = Number(a.porcentaje_asistencia);
        h += `<div class="asis">${inf.celdaHTML({ t: pct(a.porcentaje_asistencia), barra: p })}` +
          `<span>${esc(a.presentes)} presente · ${esc(a.tardes)} tarde · ${esc(a.ausentes)} ausente · ${esc(a.excusas)} excusa ` +
          `(de ${esc(a.total_clases)} clases)</span></div>`;
      } else h += `<p class="nota">Sin clases registradas.</p>`;
    }

    if (d.permisos.pagos && i.pagos) {
      const enMora = Number(i.pagos.valor_en_mora) > 0;
      h += `<div class="sub-t">Pagos ${enMora ? pill("En mora", "rojo") : pill("Al día", "verde")}</div>` +
        `<div class="datos">${dato("Valor acordado", dinero(i.valor_acordado))}${dato("Pagado", dinero(i.pagos.total_pagado))}` +
        `${dato("Saldo pendiente", dinero(i.pagos.saldo_pendiente))}` +
        (enMora ? dato("Vencido", dinero(i.pagos.valor_en_mora) + " (" + i.pagos.cuotas_en_mora + " " +
          plural(Number(i.pagos.cuotas_en_mora), "cuota", "cuotas") + ")") : "") + `</div>`;
    }

    if (d.permisos.resultados) {
      h += `<div class="sub-t">Simulacros</div>`;
      if (i.resultados && i.resultados.length) {
        const nota = (v) => (v === null || v === undefined ? "—" : v);
        h += `<table><thead><tr><th>Simulacro</th><th>Fecha</th><th>Global</th><th>Matemáticas</th><th>Lectura</th>` +
          `<th>Sociales</th><th>Naturales</th><th>Inglés</th></tr></thead><tbody>` +
          i.resultados.map((x) => `<tr><td>${inf.celdaHTML({ t: x.simulacro || "Simulacro" })}</td><td>${esc(fechaLarga(x.fecha_simulacro))}</td>` +
            `<td>${inf.celdaHTML({ t: x.puntaje_global + " / 500", barra: Number(x.puntaje_global) / 5 })}</td>` +
            `<td>${esc(nota(x.matematicas))}</td><td>${esc(nota(x.lectura_critica))}</td><td>${esc(nota(x.sociales_ciudadanas))}</td>` +
            `<td>${esc(nota(x.ciencias_naturales))}</td><td>${esc(nota(x.ingles))}</td></tr>`).join("") +
          `</tbody></table>`;
      } else h += `<p class="nota">Todavía no tiene resultados de simulacros.</p>`;
    }

    secciones.push({
      titulo: i.curso + (i.nombre_grupo ? " · " + i.nombre_grupo : ""),
      etiqueta: pill(i.estado ? i.estado.charAt(0).toUpperCase() + i.estado.slice(1) : "Sin estado", tono),
      html: h,
    });
  });

  const activo = activas.length > 0;
  inf.imprimir({
    titulo: "Informe del estudiante",
    subtitulo: e.nombre_completo + " · " + e.tipo_documento + " " + e.doc_identidad,
    etiqueta: e.nombre_completo,
    etiqueta2: activo ? { t: "Estudiante activo", tono: "verde" }
      : { t: d.inscripciones.length ? "Sin inscripción activa" : "Sin inscripción", tono: "gris" },
    resumen,
    secciones,
  });
}

document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") cerrarDetalle(); });

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
  inyectarEstilos();
  cargarPerfil();
  cargarResumen();
  cargarEstudiantes();

  // Al volver a la pestaña Estudiantes se refresca la lista
  const cambiarPestana = window.switchTab;
  window.switchTab = function (id) {
    cambiarPestana(id);
    if (id === "estudiantes") cargarEstudiantes();
  };
});
