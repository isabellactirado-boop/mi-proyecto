/* =====================================================================
   dashboard-docente.js - panel del profesor.
   Pestañas: Resumen, Mis clases, Estudiantes, Resultados, Informe.
   Lo que hace cada parte:
   - Resumen: se arma con las clases que carga academico.js (evento
     "preicma:clases"), los grupos del profesor y el informe de asistencias.
   - Estudiantes: la tabla y "Detalles" vienen de api.js; aqui solo el
     buscador y el filtro "Solo mis grupos".
   - Resultados: solo lectura (los puntajes los carga la administracion).
   Permisos del profesor: ver estudiantes, ver/tomar/corregir asistencia y
   ver resultados. No ve pagos ni edita datos (el backend tambien lo impide).
   ===================================================================== */

/* ---------- pestañas y sesión ---------- */

function switchTab(tabId) {
  document.querySelectorAll(".tab-content").forEach((t) => t.classList.remove("active"));
  document.querySelectorAll(".nav a").forEach((a) => a.classList.remove("on"));
  const tab = document.getElementById("tab-" + tabId);
  if (tab) tab.classList.add("active");
  const link = Array.from(document.querySelectorAll(".nav a"))
    .find((a) => (a.getAttribute("onclick") || "").includes("'" + tabId + "'"));
  if (link) link.classList.add("on");
  const acciones = document.getElementById("hero-actions");
  if (acciones) acciones.style.display = tabId === "resumen" ? "flex" : "none";
  if (tabId === "resultados") Docente.cargarResultados();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function logout() {
  sessionStorage.clear();
  window.location.replace("index.html");
}

const Docente = (function () {
  const $ = (id) => document.getElementById(id);
  const ROL = sessionStorage.getItem("rol");
  const ES_DUENO = ROL === "propietario" || ROL === "administrador";

  function el(tag, clase, texto) {
    const n = document.createElement(tag);
    if (clase) n.className = clase;
    if (texto !== undefined && texto !== null) n.textContent = texto;
    return n;
  }
  const api = (ruta) => window.PreicmaEditar.api(ruta);
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  function fecha(iso) { const p = String(iso).split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function iso(f) { return f.getFullYear() + "-" + String(f.getMonth() + 1).padStart(2, "0") + "-" + String(f.getDate()).padStart(2, "0"); }
  const hoy = () => iso(new Date());
  function fechaCorta(t) { const f = fecha(t); return DIAS[f.getDay()] + " " + f.getDate() + " " + MESES[f.getMonth()]; }
  function hora12(t) {
    if (!t) return "";
    const p = String(t).split(":"); let h = +p[0]; const s = h >= 12 ? "pm" : "am"; h = h % 12 || 12;
    return h + ":" + p[1] + " " + s;
  }
  const plural = (n, a, b) => n + " " + (n === 1 ? a : b);
  function poner(id, texto) { const n = $(id); if (n) n.textContent = texto; }

  function whatsapp(tel, texto) {
    const n = String(tel || "").replace(/\D/g, "");
    if (n.length < 10) return null;
    const a = el("a", "ac-wa", "WhatsApp");
    a.href = "https://wa.me/" + (n.length === 10 ? "57" + n : n) + "?text=" + encodeURIComponent(texto);
    a.target = "_blank";
    a.rel = "noopener";
    return a;
  }

  /* ---------- datos compartidos ---------- */

  let misGrupos = null;           // Set con los id_grupo del profesor
  let gruposLista = [];
  let clases = null;
  let informe = null;

  async function cargarGrupos() {
    try {
      gruposLista = await api("/grupos");
      misGrupos = new Set(gruposLista.map((g) => g.id_grupo));
    } catch (e) {
      gruposLista = [];
      misGrupos = new Set();
    }
    pintarResumen();
    if (typeof window.repintarEstudiantes === "function") window.repintarEstudiantes();
  }

  async function cargarInforme() {
    try { informe = await api("/reportes/asistencias"); } catch (e) { informe = { estudiantes: [], resumen: {} }; }
    pintarResumen();
  }

  /* ---------- Resumen ---------- */

  function inicioSemana() {
    const f = new Date();
    const dia = (f.getDay() + 6) % 7;      // lunes = 0
    f.setDate(f.getDate() - dia);
    return iso(f);
  }

  function pintarResumen() {
    // Grupos y estudiantes
    if (misGrupos) {
      const inscritos = gruposLista.reduce((s, g) => s + (Number(g.inscritos) || 0), 0);
      const cupo = gruposLista.reduce((s, g) => s + (Number(g.capacidad_maxima) || 0), 0);
      poner("dk-grupos", String(gruposLista.length));
      poner("dk-grupos-sub", gruposLista.length ? "cupo total " + cupo : "Aún no tienes grupos asignados");
      poner("dk-estudiantes", String(inscritos));
      poner("dk-estudiantes-sub", inscritos ? "activos en tus grupos" : "sin estudiantes activos");
    }

    // Clases
    if (clases) {
      const h = hoy(), lunes = inicioSemana();
      const domingo = iso(new Date(fecha(lunes).getTime() + 6 * 864e5));
      const semana = clases.filter((c) => c.fecha_clase >= lunes && c.fecha_clase <= domingo);
      const proxima = clases.find((c) => c.fecha_clase >= h);
      poner("dk-semana", String(semana.length));
      poner("dk-semana-sub", proxima ? "próxima: " + (proxima.fecha_clase === h ? "hoy" : fechaCorta(proxima.fecha_clase)) + " " + hora12(proxima.hora_inicio) : "sin clases próximas");

      const pasadas = clases.filter((c) => c.fecha_clase <= h && Number(c.inscritos) > 0);
      const pendientes = pasadas.filter((c) => Number(c.registradas) < Number(c.inscritos));
      poner("dk-pendientes", String(pendientes.length));
      poner("dk-pendientes-sub", pendientes.length ? "de la última semana" : "¡todo al día!");

      pintarProxima(proxima, pendientes);
    }

    // Faltas seguidas (solo estudiantes de mis grupos)
    if (informe && misGrupos) {
      const minimo = Number(informe.resumen && informe.resumen.minimo_faltas_seguidas) || 3;
      const mios = informe.estudiantes.filter((f) => ES_DUENO || misGrupos.has(f.id_grupo));
      const faltando = mios.filter((f) => Number(f.faltas_seguidas) >= minimo)
        .sort((x, y) => y.faltas_seguidas - x.faltas_seguidas);
      poner("dk-faltas", String(faltando.length));
      poner("dk-faltas-sub", minimo + " o más faltas seguidas");
      pintarFaltando(faltando);
      pintarTodo(faltando.length);
    }
  }

  function pintarProxima(c, pendientes) {
    const caja = $("dk-proxima");
    if (!caja) return;
    caja.textContent = "";
    if (!c) {
      caja.appendChild(el("p", "ac-vacio", "No tienes clases programadas en las próximas semanas."));
      pintarTodo();
      return;
    }
    const esHoy = c.fecha_clase === hoy();
    const tarjeta = el("div", "dk-clase" + (esHoy ? " hoy" : ""));
    const cuando = el("div", "dk-cuando");
    cuando.appendChild(el("strong", null, esHoy ? "Hoy" : fechaCorta(c.fecha_clase)));
    cuando.appendChild(el("span", null, hora12(c.hora_inicio) + " – " + hora12(c.hora_fin)));
    tarjeta.appendChild(cuando);
    const info = el("div", "dk-info");
    info.appendChild(el("strong", null, c.nombre_curso + " · " + c.nombre_grupo));
    info.appendChild(el("small", null, c.tema ? "Tema: " + c.tema : "Sin tema todavía"));
    tarjeta.appendChild(info);
    const botones = el("div", "dk-botones");
    if (c.fecha_clase <= hoy()) {
      const b = el("button", "btn sm main", "Tomar asistencia");
      b.type = "button";
      b.addEventListener("click", () => window.PreicmaAcademico.abrirAsistencia(c.id_clase));
      botones.appendChild(b);
    }
    if (c.enlace_reunion) {
      const m = el("a", "btn sm", "Entrar a Meet");
      m.href = c.enlace_reunion; m.target = "_blank"; m.rel = "noopener";
      botones.appendChild(m);
    }
    if (botones.children.length) tarjeta.appendChild(botones);
    caja.appendChild(el("p", "dk-etiqueta", esHoy ? "Tu clase de hoy" : "Tu próxima clase"));
    caja.appendChild(tarjeta);
    pintarTodo(undefined, pendientes);
  }

  let ultimoPendientes = [], ultimoFaltando = 0;
  function pintarTodo(faltando, pendientes) {
    if (pendientes !== undefined) ultimoPendientes = pendientes;
    if (faltando !== undefined) ultimoFaltando = faltando;
    const ul = $("dk-todo");
    if (!ul) return;
    ul.textContent = "";
    const item = (n, clase, texto, sub, accion) => {
      const li = el("li", accion ? "dk-click" : "");
      li.appendChild(el("span", "n " + clase + (n === 0 ? " cero" : ""), String(n)));
      const d = el("div", null, texto);
      d.appendChild(el("small", null, sub));
      li.appendChild(d);
      if (accion) { li.tabIndex = 0; li.addEventListener("click", accion); li.addEventListener("keydown", (e) => { if (e.key === "Enter") accion(); }); }
      ul.appendChild(li);
    };
    const p = ultimoPendientes;
    item(p.length, "r", "Clases con asistencia sin tomar",
      p.length ? fechaCorta(p[0].fecha_clase) + " · " + p[0].nombre_grupo + (p.length > 1 ? " y " + (p.length - 1) + " más" : "") : "Todas al día",
      p.length ? () => window.PreicmaAcademico.abrirAsistencia(p[0].id_clase) : null);
    item(ultimoFaltando, "y", "Estudiantes faltando seguido", ultimoFaltando ? "Escríbele a su acudiente" : "Nadie viene faltando",
      ultimoFaltando ? () => $("dk-faltando").scrollIntoView({ behavior: "smooth", block: "center" }) : null);
    const sinTema = (clases || []).filter((c) => c.fecha_clase <= hoy() && !c.tema).length;
    item(sinTema, "t", "Clases sin tema", sinTema ? "Escríbelo en Mis clases" : "Todas tienen tema",
      sinTema ? () => switchTab("clases") : null);
  }

  function pintarFaltando(lista) {
    const ul = $("dk-faltando");
    if (!ul) return;
    ul.textContent = "";
    if (!lista.length) { ul.appendChild(el("li", "ac-vacio", "¡Nadie viene faltando! Tus estudiantes están asistiendo.")); return; }
    lista.slice(0, 8).forEach((f) => {
      const li = el("li");
      const n = el("span", "dk-num", String(f.faltas_seguidas));
      n.title = "faltas seguidas";
      li.appendChild(n);
      const d = el("div", "dk-quien");
      d.appendChild(el("strong", null, f.estudiante));
      d.appendChild(el("small", null, f.curso + " · " + f.nombre_grupo + " · " +
        (f.porcentaje_asistencia === null ? "sin asistencia" : String(f.porcentaje_asistencia).replace(".", ",") + " % de asistencia")));
      li.appendChild(d);
      const tel = f.telefono_acudiente || f.telefono_estudiante;
      const wa = whatsapp(tel, "Hola" + (f.acudiente ? " " + f.acudiente.split(" ")[0] : "") +
        ", te escribimos de PRE ICMA. " + f.estudiante + " ha faltado a sus últimas " + f.faltas_seguidas +
        " clases de " + f.curso + ". ¿Todo bien?");
      if (wa) li.appendChild(wa);
      ul.appendChild(li);
    });
    if (lista.length > 8) ul.appendChild(el("li", "ac-vacio", "y " + (lista.length - 8) + " más en el Informe de asistencias"));
  }

  /* ---------- Estudiantes: buscador y "Solo mis grupos" ---------- */

  function prepararEstudiantes() {
    const buscar = $("dk-buscar"), mios = $("dk-mis-grupos");
    if (!buscar) return;
    if (ES_DUENO && mios) mios.closest("label").hidden = true;   // el propietario ve a todos
    const sinTildes = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    window.filtroEstudiantes = (f) => {
      if (!ES_DUENO && mios && mios.checked && misGrupos) {
        const grupos = f.grupos_activos || [];
        if (!grupos.some((g) => misGrupos.has(g))) return false;
      }
      const q = sinTildes(buscar.value.trim());
      return !q || sinTildes(f.nombre_completo).includes(q) || String(f.doc_identidad).includes(q);
    };
    const repintar = () => { if (typeof window.repintarEstudiantes === "function") window.repintarEstudiantes(); };
    buscar.addEventListener("input", repintar);
    if (mios) mios.addEventListener("change", repintar);
  }

  /* ---------- Resultados (solo lectura) ---------- */

  const AREAS = [
    ["lectura_critica", "Lectura crítica", "pl-pink", "var(--pink)"],
    ["matematicas", "Matemáticas", "pl-teal", "var(--teal)"],
    ["sociales_ciudadanas", "Sociales", "pl-orange", "var(--orange)"],
    ["ciencias_naturales", "Ciencias", "pl-red", "var(--red)"],
    ["ingles", "Inglés", "pl-ring", "var(--violet)"],
  ];
  let simulacrosListos = false, resultados = null;

  async function cargarResultados() {
    const sel = $("dk-simulacro");
    if (!sel || simulacrosListos) return;
    simulacrosListos = true;
    let lista;
    try { lista = await api("/simulacros"); } catch (e) {
      simulacrosListos = false;
      sel.textContent = ""; sel.appendChild(el("option", null, "No se pudieron cargar"));
      return vacioRes(e.message);
    }
    sel.textContent = "";
    if (!lista.length) { sel.appendChild(el("option", null, "Sin simulacros")); return vacioRes("Todavía no hay simulacros registrados."); }
    lista.forEach((s) => {
      const o = el("option", null, s.nombre + " · " + fechaCorta(s.fecha_simulacro) + " (" + plural(Number(s.resultados), "resultado", "resultados") + ")");
      o.value = s.id_simulacro;
      sel.appendChild(o);
    });
    // Por defecto, el mas reciente que ya tenga resultados
    const conDatos = lista.find((s) => Number(s.resultados) > 0);
    if (conDatos) sel.value = conDatos.id_simulacro;
    sel.addEventListener("change", verSimulacro);
    $("dk-res-grupo").addEventListener("change", pintarResultados);
    verSimulacro();
  }

  function vacioRes(texto) {
    const t = $("dk-res-tabla");
    t.textContent = "";
    const tr = el("tr"); const td = el("td", "ac-vacio", texto); td.colSpan = 8; tr.appendChild(td); t.appendChild(tr);
    $("dk-score").textContent = ""; $("dk-areas").textContent = "";
  }

  async function verSimulacro() {
    const id = $("dk-simulacro").value;
    if (!id) return;
    vacioRes("Cargando…");
    try { resultados = await api("/simulacros/" + id + "/resultados"); } catch (e) { return vacioRes(e.message); }
    // Grupos que aparecen en el simulacro
    const sg = $("dk-res-grupo"), antes = sg.value;
    sg.textContent = "";
    sg.appendChild(Object.assign(el("option", null, "Todos los grupos"), { value: "" }));
    if (!ES_DUENO && misGrupos && misGrupos.size) sg.appendChild(Object.assign(el("option", null, "Solo mis grupos"), { value: "mios" }));
    const vistos = new Map();
    resultados.estudiantes.forEach((f) => { if (f.id_grupo && !vistos.has(f.id_grupo)) vistos.set(f.id_grupo, f.nombre_curso + " · " + f.nombre_grupo); });
    [...vistos.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"))
      .forEach(([v, t]) => sg.appendChild(Object.assign(el("option", null, t), { value: v })));
    sg.value = [...sg.options].some((o) => o.value === antes) ? antes : "";
    pintarResultados();
  }

  function pintarResultados() {
    if (!resultados) return;
    const g = $("dk-res-grupo").value;
    const lista = resultados.estudiantes.filter((f) =>
      !g ? true : g === "mios" ? misGrupos && misGrupos.has(f.id_grupo) : String(f.id_grupo) === g);
    const con = lista.filter((f) => f.puntaje_global !== null && f.puntaje_global !== undefined);
    const prom = (k) => {
      const v = lista.map((f) => f[k]).filter((x) => x !== null && x !== undefined).map(Number);
      return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
    };

    // Puntaje global promedio
    const score = $("dk-score");
    score.textContent = "";
    const pg = prom("puntaje_global");
    const s = el("div", "score");
    s.appendChild(el("strong", null, pg === null ? "—" : String(pg)));
    s.appendChild(el("span", null, "/ 500 de promedio global"));
    score.appendChild(s);
    const mejor = con.slice().sort((a, b) => b.puntaje_global - a.puntaje_global)[0];
    score.appendChild(el("p", "dk-dato", plural(con.length, "estudiante", "estudiantes") + " con resultado de " + lista.length));
    if (mejor) score.appendChild(el("p", "dk-dato", "Mejor puntaje: " + mejor.nombre_completo + " (" + mejor.puntaje_global + ")"));

    // Promedio por area
    const areas = $("dk-areas");
    areas.textContent = "";
    AREAS.forEach(([k, nombre, planeta, color]) => {
      const v = prom(k);
      const fila = el("div", "area");
      fila.style.setProperty("--c", color);
      const svgNS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(svgNS, "svg");
      if (planeta === "pl-ring") svg.setAttribute("viewBox", "0 0 70 60");
      const use = document.createElementNS(svgNS, "use");
      use.setAttribute("href", "#" + planeta);
      svg.appendChild(use);
      fila.appendChild(svg);
      fila.appendChild(el("span", null, nombre));
      const m = el("div", "meter");
      const i = el("i");
      i.style.setProperty("--p", (v === null ? 0 : v) + "%");
      m.appendChild(i);
      fila.appendChild(m);
      fila.appendChild(el("b", null, v === null ? "—" : String(v)));
      areas.appendChild(fila);
    });

    // Tabla
    const t = $("dk-res-tabla");
    t.textContent = "";
    if (!lista.length) return vacioResTabla("No hay estudiantes activos en ese grupo.");
    lista.slice().sort((a, b) => (b.puntaje_global ?? -1) - (a.puntaje_global ?? -1)).forEach((f) => {
      const tr = el("tr", misGrupos && misGrupos.has(f.id_grupo) && !ES_DUENO ? "dk-mio" : "");
      const tdE = el("td"); tdE.appendChild(el("strong", null, f.nombre_completo)); tdE.appendChild(el("small", "ac-sub", f.doc_identidad));
      tr.appendChild(tdE);
      const tdG = el("td", null, f.nombre_curso); tdG.appendChild(el("small", "ac-sub", f.nombre_grupo || "")); tr.appendChild(tdG);
      AREAS.forEach(([k]) => tr.appendChild(el("td", null, f[k] === null || f[k] === undefined ? "—" : String(f[k]))));
      const tdP = el("td");
      if (f.puntaje_global === null || f.puntaje_global === undefined) tdP.appendChild(el("span", "badge bx-gris", "Sin resultado"));
      else {
        const p = Number(f.puntaje_global);
        tdP.appendChild(el("span", "badge " + (p >= 350 ? "b-ok" : p >= 250 ? "b-warn" : "b-red"), p + " / 500"));
      }
      tr.appendChild(tdP);
      t.appendChild(tr);
    });
  }
  function vacioResTabla(texto) {
    const t = $("dk-res-tabla"); const tr = el("tr"); const td = el("td", "ac-vacio", texto); td.colSpan = 8; tr.appendChild(td); t.appendChild(tr);
  }

  /* ---------- arranque ---------- */

  document.addEventListener("preicma:clases", (e) => { clases = e.detail || []; pintarResumen(); });

  document.addEventListener("DOMContentLoaded", () => {
    const usuario = sessionStorage.getItem("currentUser") || "Profesor";
    poner("uname", usuario);
    poner("display-user", usuario);
    poner("av", usuario.charAt(0).toUpperCase());
    if (ES_DUENO) poner("urol", "Panel docente · todos los grupos");
    const f = new Date().toLocaleDateString("es-CO", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    poner("today", f.charAt(0).toUpperCase() + f.slice(1));
    prepararEstudiantes();
    cargarGrupos();
    cargarInforme();
  });

  return { cargarResultados };
})();
