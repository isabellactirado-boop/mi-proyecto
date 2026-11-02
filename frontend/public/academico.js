/* =====================================================================
   academico.js - clases, asistencia y simulacros.
   Lo usan los dos paneles:
   - dashboard-admin.html: programa grupos y clases, toma asistencia y
     carga resultados de simulacros.
   - dashboard-docente.html: ve sus clases y toma asistencia.
   Cada parte solo se activa si su contenedor existe en la pagina.
   Es independiente de api.js (todo va dentro de una funcion para no
   chocar con sus nombres). Abre la pagina con ?demo para datos de ejemplo.
   ===================================================================== */

(function () {
  const API = "https://preicma.onrender.com";
  const DEMO = new URLSearchParams(location.search).has("demo");
  const $ = (id) => document.getElementById(id);

  /* ---------- peticiones ---------- */

  async function api(ruta, metodo, cuerpo) {
    if (DEMO) return demo(ruta, metodo, cuerpo);
    const token = sessionStorage.getItem("token");
    if (!token) { window.location.replace("index.html"); throw new Error("Sin sesion"); }

    const respuesta = await fetch(API + ruta, {
      method: metodo || "GET",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    if (respuesta.status === 401) {
      sessionStorage.clear();
      window.location.replace("index.html");
      throw new Error("Sesion vencida");
    }
    let datos = null;
    try { datos = await respuesta.json(); } catch (e) { /* sin cuerpo */ }
    if (!respuesta.ok) {
      let detalle = datos && datos.detail;
      if (Array.isArray(detalle)) detalle = "Revisa los datos del formulario";
      throw new Error(detalle || "Error " + respuesta.status);
    }
    return datos;
  }

  /* ---------- formatos ---------- */

  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  const DIA_SEMANA = { lunes: "Lun", martes: "Mar", miercoles: "Mié", jueves: "Jue",
    viernes: "Vie", sabado: "Sáb", domingo: "Dom" };

  function fecha(texto) {
    const p = String(texto).split("-");
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }
  function fechaCorta(texto) {
    const f = fecha(texto);
    return DIAS[f.getDay()] + " " + f.getDate() + " " + MESES[f.getMonth()];
  }
  function hora12(texto) {
    if (!texto) return "";
    const p = String(texto).split(":");
    let h = Number(p[0]);
    const s = h >= 12 ? "pm" : "am";
    h = h % 12 || 12;
    return h + ":" + p[1] + " " + s;
  }
  function hoyIso() {
    const f = new Date();
    return f.getFullYear() + "-" + String(f.getMonth() + 1).padStart(2, "0") + "-" + String(f.getDate()).padStart(2, "0");
  }
  function el(etiqueta, clase, texto) {
    const n = document.createElement(etiqueta);
    if (clase) n.className = clase;
    if (texto !== undefined && texto !== null) n.textContent = texto;
    return n;
  }
  function filaVacia(tbody, columnas, texto) {
    tbody.textContent = "";
    const tr = el("tr");
    const td = el("td", "ac-vacio", texto);
    td.colSpan = columnas;
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
  function opcion(select, valor, texto) {
    const o = el("option", null, texto);
    o.value = valor;
    select.appendChild(o);
  }
  function mensaje(form, texto, tipo) {
    const m = form.querySelector(".ac-msg");
    if (!m) return;
    m.textContent = texto;
    m.className = "ac-msg " + (tipo || "");
  }
  function sinVacios(objeto) {
    Object.keys(objeto).forEach((k) => { if (objeto[k] === "" || objeto[k] === null) delete objeto[k]; });
    return objeto;
  }

  /* ---------- grupos (admin) ---------- */

  let grupos = [];

  async function cargarGrupos() {
    try {
      grupos = await api("/grupos");
    } catch (e) {
      grupos = [];
      if ($("grupos-tabla")) filaVacia($("grupos-tabla"), 4, e.message);
      return;
    }

    const tabla = $("grupos-tabla");
    if (tabla) {
      if (!grupos.length) filaVacia(tabla, 4, "Aún no hay grupos. Crea el primero con el formulario.");
      else {
        tabla.textContent = "";
        grupos.forEach((g) => {
          const tr = el("tr");
          tr.appendChild(el("td", null, g.nombre_curso + " · " + g.nombre_grupo));
          tr.appendChild(el("td", null, DIA_SEMANA[g.dia_semana] + " " + hora12(g.hora_inicio) + " – " + hora12(g.hora_fin)));
          tr.appendChild(el("td", null, g.docente || "Sin asignar"));
          const td = el("td");
          const lleno = g.inscritos >= g.capacidad_maxima;
          td.appendChild(el("span", "badge " + (lleno ? "b-red" : "b-ok"), g.inscritos + " / " + g.capacidad_maxima));
          tr.appendChild(td);
          tabla.appendChild(tr);
        });
      }
    }

    [$("cl-grupo"), $("res-grupo"), $("in-grupo")].forEach((select) => {
      if (!select) return;
      const anterior = select.value;
      const primera = select.id === "res-grupo" ? "Todos los grupos"
        : grupos.length ? "Elige un grupo" : "Primero crea un grupo en Docentes y clases";
      select.textContent = "";
      opcion(select, "", primera);
      grupos.forEach((g) => {
        const lleno = select.id === "in-grupo" && g.inscritos >= g.capacidad_maxima;
        opcion(select, g.id_grupo, g.nombre_curso + " · " + g.nombre_grupo +
          " (" + DIA_SEMANA[g.dia_semana] + " " + hora12(g.hora_inicio) + ")" + (lleno ? " — lleno" : ""));
        if (lleno) select.lastChild.disabled = true;
      });
      select.value = anterior;
    });

    pintarOcupacion();
  }

  function pintarOcupacion() {
    const caja = $("ocupacion");
    if (!caja) return;
    caja.textContent = "";
    if (!grupos.length) { caja.appendChild(el("p", "note", "Aún no hay grupos.")); return; }
    grupos.forEach((g) => {
      const pct = g.capacidad_maxima ? Math.round((g.inscritos / g.capacidad_maxima) * 100) : 0;
      const fila = el("div", "grp");
      const top = el("div");
      top.appendChild(el("span", null, g.nombre_curso + " · " + g.nombre_grupo));
      top.appendChild(el("small", null, g.inscritos + " / " + g.capacidad_maxima));
      fila.appendChild(top);
      const medidor = el("div", "meter");
      const relleno = el("i", pct >= 100 ? "full" : pct >= 80 ? "warn" : "");
      relleno.style.setProperty("--p", Math.min(100, pct) + "%");
      medidor.appendChild(relleno);
      fila.appendChild(medidor);
      caja.appendChild(fila);
    });
  }

  /* ---------- cursos (admin) ---------- */

  async function cargarCursos() {
    const sc = $("gr-curso");
    if (!sc) return;
    try {
      const cursos = await api("/cursos");
      sc.textContent = "";
      opcion(sc, "", cursos.length ? "Elige un curso" : "Primero crea un curso");
      cursos.forEach((c) => opcion(sc, c.id_curso, c.nombre_curso));
    } catch (e) {
      mensaje($("form-grupo"), e.message, "error");
    }
  }

  function prepararFormCurso() {
    const form = $("form-curso");
    if (!form) return;
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const boton = form.querySelector("button");
      boton.disabled = true;
      mensaje(form, "Guardando…");
      try {
        await api("/cursos", "POST", sinVacios({
          nombre_curso: $("cu-nombre").value.trim(),
          fecha_inicio: $("cu-inicio").value,
          fecha_fin: $("cu-fin").value,
          valor_total: Number($("cu-valor").value),
          descripcion: $("cu-desc").value.trim(),
        }));
        form.reset();
        mensaje(form, "Curso creado. Ahora crea su grupo.", "ok");
        cargarCursos();
      } catch (e) {
        mensaje(form, e.message, "error");
      } finally {
        boton.disabled = false;
      }
    });
  }

  async function prepararFormGrupo() {
    const form = $("form-grupo");
    if (!form) return;
    cargarCursos();
    try {
      const docentes = await api("/docentes");
      docentes.forEach((d) => opcion($("gr-docente"), d.id_docente, d.nombre_completo));
    } catch (e) {
      mensaje(form, e.message, "error");
    }

    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const boton = form.querySelector("button");
      boton.disabled = true;
      mensaje(form, "Guardando…");
      try {
        await api("/grupos", "POST", sinVacios({
          id_curso: Number($("gr-curso").value),
          nombre_grupo: $("gr-nombre").value.trim(),
          dia_semana: $("gr-dia").value,
          hora_inicio: $("gr-inicio").value,
          hora_fin: $("gr-fin").value,
          capacidad_maxima: Number($("gr-cupo").value),
          id_docente: $("gr-docente").value ? Number($("gr-docente").value) : null,
          enlace_reunion: $("gr-enlace").value.trim(),
        }));
        form.reset();
        mensaje(form, "Grupo creado.", "ok");
        cargarGrupos();
      } catch (e) {
        mensaje(form, e.message, "error");
      } finally {
        boton.disabled = false;
      }
    });
  }

  /* ---------- inscripciones (admin) ---------- */

  function dinero(valor) {
    return "$ " + Math.round(Number(valor) || 0).toLocaleString("es-CO");
  }

  // Caja con la contrasena temporal: se muestra una sola vez
  function mostrarCuenta(caja, cuenta, titulo) {
    caja.textContent = "";
    caja.hidden = false;
    caja.appendChild(el("strong", null, titulo));
    if (cuenta) {
      const p = el("p", null, "Usuario: ");
      p.appendChild(el("b", null, cuenta.usuario));
      caja.appendChild(p);
      const clave = el("div", "ac-clave");
      clave.appendChild(el("code", null, cuenta.contrasena_temporal));
      const copiar = el("button", "btn sm", "Copiar");
      copiar.type = "button";
      copiar.addEventListener("click", () => {
        const texto = "App PRE ICMA\nUsuario: " + cuenta.usuario + "\nContraseña temporal: " + cuenta.contrasena_temporal;
        (navigator.clipboard ? navigator.clipboard.writeText(texto) : Promise.reject())
          .then(() => { copiar.textContent = "Copiado"; })
          .catch(() => { copiar.textContent = "Cópiala a mano"; });
      });
      clave.appendChild(copiar);
      caja.appendChild(clave);
      caja.appendChild(el("small", null, cuenta.aviso));
    }
  }

  function planCuotas(valor, numero, primera) {   // vista previa, igual que el backend
    if (!(valor > 0)) return [];
    let base = Math.round(valor / numero / 100) * 100;
    if (base <= 0) { base = valor; numero = 1; }
    const f = primera ? fecha(primera) : new Date();
    const plan = [];
    for (let n = 1; n <= numero; n++) {
      const vence = new Date(f.getFullYear(), f.getMonth() + n - 1, 1);
      vence.setDate(Math.min(f.getDate(), new Date(vence.getFullYear(), vence.getMonth() + 1, 0).getDate()));
      plan.push({ valor: n < numero ? base : valor - base * (numero - 1), vence });
    }
    return plan;
  }

  function prepararFormInscripcion() {
    const form = $("form-inscripcion");
    if (!form) return;
    $("in-primera").value = hoyIso();

    const grupoElegido = () => grupos.find((g) => String(g.id_grupo) === $("in-grupo").value);
    const actualizarPlan = () => {
      const g = grupoElegido();
      if (g && document.activeElement !== $("in-valor") && !$("in-valor").dataset.tocado) {
        $("in-valor").value = Math.round(Number(g.valor_total) || 0);
      }
      const valor = Number($("in-valor").value);
      const plan = planCuotas(valor, Number($("in-cuotas").value), $("in-primera").value);
      $("in-plan").textContent = !plan.length ? (g ? "Sin cobro." : "")
        : plan.length === 1 ? "Un pago de " + dinero(plan[0].valor) + " que vence el " + plan[0].vence.toLocaleDateString("es-CO") + "."
          : plan.length + " cuotas: " + plan.map((c) => dinero(c.valor) + " (" + c.vence.getDate() + " " + MESES[c.vence.getMonth()] + ")").join(" · ");
    };
    $("in-valor").addEventListener("input", () => { $("in-valor").dataset.tocado = "1"; actualizarPlan(); });
    $("in-grupo").addEventListener("change", () => { delete $("in-valor").dataset.tocado; actualizarPlan(); });
    ["in-cuotas", "in-primera"].forEach((id) => $(id).addEventListener("change", actualizarPlan));

    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const acudienteNombre = $("ac-nombre").value.trim();
      if (acudienteNombre && (!$("ac-doc").value.trim() || !$("ac-tel").value.trim())) {
        return mensaje(form, "Del acudiente faltan la cédula o el teléfono.", "error");
      }
      if ($("in-cuenta").checked && !$("in-correo").value.trim()) {
        return mensaje(form, "Para crear la cuenta de la app escribe el correo del estudiante, o desmarca la casilla.", "error");
      }
      const boton = form.querySelector('button[type="submit"]');
      boton.disabled = true;
      mensaje(form, "Inscribiendo…");
      try {
        const r = await api("/inscripciones", "POST", sinVacios({
          estudiante: sinVacios({
            tipo_documento: $("in-tipo").value,
            doc_identidad: $("in-doc").value.trim(),
            nombre_completo: $("in-nombre").value.trim(),
            fecha_nacimiento: $("in-nac").value,
            telefono_celular: $("in-cel").value.trim(),
            correo_electronico: $("in-correo").value.trim(),
          }),
          acudiente: acudienteNombre ? {
            nombre_completo: acudienteNombre,
            doc_identidad: $("ac-doc").value.trim(),
            telefono: $("ac-tel").value.trim(),
            parentesco: $("ac-parentesco").value,
          } : null,
          id_grupo: Number($("in-grupo").value),
          valor_acordado: $("in-valor").value === "" ? null : Number($("in-valor").value),
          numero_cuotas: Number($("in-cuotas").value),
          primera_cuota: $("in-primera").value,
          crear_cuenta: $("in-cuenta").checked,
        }));
        const nombre = $("in-nombre").value.trim();
        form.reset();
        delete $("in-valor").dataset.tocado;
        $("in-primera").value = hoyIso();
        $("in-plan").textContent = "";
        mensaje(form, "", "");
        mostrarCuenta($("in-resultado"), r.cuenta,
          "✓ " + nombre + " quedó inscrito en " + r.curso + " · " + r.grupo +
          (r.cuotas.length ? " con " + r.cuotas.length + (r.cuotas.length === 1 ? " pago." : " cuotas.") : "."));
        cargarGrupos();
      } catch (e) {
        mensaje(form, e.message, "error");
      } finally {
        boton.disabled = false;
      }
    });
  }

  function prepararFormCuenta() {
    const form = $("form-cuenta");
    if (!form) return;
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const boton = form.querySelector("button");
      boton.disabled = true;
      mensaje(form, "Creando…");
      try {
        const r = await api("/cuentas-estudiante", "POST", sinVacios({
          doc_identidad: $("cu-doc").value.trim(),
          correo: $("cu-correo").value.trim(),
        }));
        form.reset();
        mensaje(form, "", "");
        mostrarCuenta($("cu-resultado"), r, "✓ Cuenta creada para " + r.estudiante);
      } catch (e) {
        mensaje(form, e.message, "error");
      } finally {
        boton.disabled = false;
      }
    });
  }

  /* ---------- clases ---------- */

  async function cargarClases() {
    const tabla = $("clases-tabla");
    if (!tabla) return;
    let clases;
    try {
      clases = await api("/clases");
    } catch (e) {
      return filaVacia(tabla, tabla.closest("table").querySelectorAll("th").length, e.message);
    }
    const columnas = tabla.closest("table").querySelectorAll("th").length;
    if (!clases.length) return filaVacia(tabla, columnas, "No hay clases programadas en estas fechas.");

    const esAdmin = !!$("form-clase");
    const hoy = hoyIso();
    tabla.textContent = "";
    clases.forEach((c) => {
      const tr = el("tr", c.fecha_clase === hoy ? "ac-hoy" : "");
      const tdF = el("td");
      tdF.appendChild(el("strong", null, c.fecha_clase === hoy ? "Hoy" : fechaCorta(c.fecha_clase)));
      tdF.appendChild(el("small", "ac-sub", hora12(c.hora_inicio) + " – " + hora12(c.hora_fin)));
      tr.appendChild(tdF);
      tr.appendChild(el("td", null, c.nombre_curso + " · " + c.nombre_grupo));
      if (esAdmin) tr.appendChild(el("td", null, c.docente));
      tr.appendChild(el("td", "ac-tema", c.tema || "—"));

      const tdA = el("td");
      const pasada = c.fecha_clase <= hoy;
      const completa = c.inscritos > 0 && c.registradas >= c.inscritos;
      tdA.appendChild(el("span", "badge " + (completa ? "b-ok" : pasada && c.registradas < c.inscritos ? "b-warn" : ""),
        c.registradas + " / " + c.inscritos));
      tr.appendChild(tdA);

      const tdB = el("td", "ac-acciones");
      const tomar = el("button", "btn sm main", "Asistencia");
      tomar.type = "button";
      tomar.addEventListener("click", () => abrirAsistencia(c.id_clase));
      tdB.appendChild(tomar);
      if (esAdmin && c.registradas === 0) {
        const borrar = el("button", "btn sm", "Borrar");
        borrar.type = "button";
        borrar.addEventListener("click", async () => {
          if (!confirm("¿Borrar la clase del " + fechaCorta(c.fecha_clase) + "?")) return;
          try { await api("/clases/" + c.id_clase, "DELETE"); cargarClases(); } catch (e) { alert(e.message); }
        });
        tdB.appendChild(borrar);
      }
      tr.appendChild(tdB);
      tabla.appendChild(tr);
    });
  }

  function prepararFormClase() {
    const form = $("form-clase");
    if (!form) return;
    $("cl-fecha").value = hoyIso();

    // Al elegir el grupo, sugerir la proxima fecha que cae en su dia
    $("cl-grupo").addEventListener("change", () => {
      const g = grupos.find((x) => String(x.id_grupo) === $("cl-grupo").value);
      if (!g) return;
      const orden = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
      const f = new Date();
      while (orden[f.getDay()] !== g.dia_semana) f.setDate(f.getDate() + 1);
      $("cl-fecha").value = f.getFullYear() + "-" + String(f.getMonth() + 1).padStart(2, "0") + "-" + String(f.getDate()).padStart(2, "0");
    });

    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const boton = form.querySelector("button");
      boton.disabled = true;
      mensaje(form, "Programando…");
      try {
        const r = await api("/clases", "POST", sinVacios({
          id_grupo: Number($("cl-grupo").value),
          fecha_clase: $("cl-fecha").value,
          tema: $("cl-tema").value.trim(),
          enlace_reunion: $("cl-enlace").value.trim(),
          semanas: Number($("cl-semanas").value),
        }));
        let texto = r.creadas.length === 1 ? "Clase programada." : r.creadas.length + " clases programadas.";
        if (r.ya_existian.length) texto += " " + r.ya_existian.length + " ya existían y no se duplicaron.";
        mensaje(form, texto, "ok");
        $("cl-tema").value = "";
        $("cl-enlace").value = "";
        cargarClases();
      } catch (e) {
        mensaje(form, e.message, "error");
      } finally {
        boton.disabled = false;
      }
    });
  }

  /* ---------- asistencia (ventana) ---------- */

  const ESTADOS = [
    ["presente", "Presente", "P"], ["tarde", "Tarde", "T"],
    ["ausente", "Ausente", "A"], ["excusa", "Excusa", "E"],
  ];

  function crearModal() {
    let fondo = $("ac-modal");
    if (fondo) return fondo;
    fondo = el("div", "ac-modal");
    fondo.id = "ac-modal";
    fondo.hidden = true;
    fondo.innerHTML =
      '<div class="ac-caja" role="dialog" aria-modal="true" aria-labelledby="ac-m-titulo">' +
      '  <div class="ac-m-top"><div><h3 id="ac-m-titulo"></h3><p id="ac-m-sub"></p></div>' +
      '  <button class="ac-cerrar" type="button" aria-label="Cerrar">×</button></div>' +
      '  <div class="ac-m-barra"><span id="ac-m-cuenta"></span>' +
      '  <button class="btn sm" type="button" id="ac-todos">Todos presentes</button></div>' +
      '  <ul class="ac-lista" id="ac-m-lista"></ul>' +
      '  <p class="ac-msg" id="ac-m-msg" role="status"></p>' +
      '  <button class="btn main" type="button" id="ac-m-guardar">Guardar asistencia</button>' +
      "</div>";
    document.body.appendChild(fondo);
    const cerrar = () => { fondo.hidden = true; };
    fondo.querySelector(".ac-cerrar").addEventListener("click", cerrar);
    fondo.addEventListener("click", (e) => { if (e.target === fondo) cerrar(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrar(); });
    return fondo;
  }

  async function abrirAsistencia(idClase) {
    const modal = crearModal();
    const lista = $("ac-m-lista");
    $("ac-m-titulo").textContent = "Cargando…";
    $("ac-m-sub").textContent = "";
    $("ac-m-msg").textContent = "";
    lista.textContent = "";
    modal.hidden = false;

    let clase;
    try {
      clase = await api("/clases/" + idClase + "/asistencia");
    } catch (e) {
      $("ac-m-titulo").textContent = "No se pudo abrir la clase";
      $("ac-m-msg").textContent = e.message;
      return;
    }

    $("ac-m-titulo").textContent = clase.tema || clase.nombre_curso;
    $("ac-m-sub").textContent = clase.nombre_curso + " · " + clase.nombre_grupo + " · " +
      fechaCorta(clase.fecha_clase) + " " + hora12(clase.hora_inicio);

    const estado = {};
    const actualizarCuenta = () => {
      const marcados = Object.keys(estado).length;
      $("ac-m-cuenta").textContent = marcados + " de " + clase.estudiantes.length + " marcados";
    };

    if (!clase.estudiantes.length) {
      lista.appendChild(el("li", "ac-vacio", "Este grupo no tiene estudiantes inscritos."));
    }
    clase.estudiantes.forEach((e) => {
      if (e.estado_asistencia) estado[e.id_inscripcion] = e.estado_asistencia;
      const li = el("li");
      const nombre = el("div", "ac-nombre");
      nombre.appendChild(el("strong", null, e.nombre_completo));
      nombre.appendChild(el("small", null, e.doc_identidad));
      li.appendChild(nombre);
      const grupo = el("div", "ac-estados");
      ESTADOS.forEach(([valor, texto, letra]) => {
        const b = el("button", "ac-e ac-" + valor, letra);
        b.type = "button";
        b.title = texto;
        b.setAttribute("aria-label", texto + ": " + e.nombre_completo);
        b.setAttribute("aria-pressed", String(estado[e.id_inscripcion] === valor));
        b.addEventListener("click", () => {
          estado[e.id_inscripcion] = valor;
          grupo.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
          actualizarCuenta();
        });
        grupo.appendChild(b);
      });
      li.appendChild(grupo);
      lista.appendChild(li);
    });
    actualizarCuenta();

    $("ac-todos").onclick = () => {
      clase.estudiantes.forEach((e) => { estado[e.id_inscripcion] = "presente"; });
      lista.querySelectorAll(".ac-estados").forEach((g) => {
        g.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x.classList.contains("ac-presente"))));
      });
      actualizarCuenta();
    };

    $("ac-m-guardar").onclick = async () => {
      const registros = Object.keys(estado).map((id) => ({ id_inscripcion: Number(id), estado: estado[id] }));
      if (!registros.length) { $("ac-m-msg").textContent = "Marca al menos un estudiante."; return; }
      const boton = $("ac-m-guardar");
      boton.disabled = true;
      $("ac-m-msg").textContent = "Guardando…";
      try {
        await api("/clases/" + idClase + "/asistencia", "PUT", { registros });
        $("ac-m-msg").textContent = "Asistencia guardada.";
        cargarClases();
        setTimeout(() => { modal.hidden = true; }, 700);
      } catch (e) {
        $("ac-m-msg").textContent = e.message;
      } finally {
        boton.disabled = false;
      }
    };
  }

  /* ---------- simulacros (admin) ---------- */

  const AREAS = ["lectura_critica", "matematicas", "sociales_ciudadanas", "ciencias_naturales", "ingles"];
  let simulacroActual = null;

  async function cargarSimulacros() {
    const tabla = $("sim-tabla");
    if (!tabla) return;
    let lista;
    try {
      lista = await api("/simulacros");
    } catch (e) {
      return filaVacia(tabla, 5, e.message);
    }
    if (!lista.length) return filaVacia(tabla, 5, "Aún no hay simulacros. Crea el primero con el formulario.");
    tabla.textContent = "";
    lista.forEach((s) => {
      const tr = el("tr");
      tr.appendChild(el("td", null, s.nombre));
      tr.appendChild(el("td", null, fechaCorta(s.fecha_simulacro)));
      tr.appendChild(el("td", null, String(s.resultados)));
      tr.appendChild(el("td", null, s.promedio_global === null ? "—" : Math.round(s.promedio_global) + " / 500"));
      const td = el("td");
      const b = el("button", "btn sm main", "Cargar resultados");
      b.type = "button";
      b.addEventListener("click", () => abrirResultados(s));
      td.appendChild(b);
      tr.appendChild(td);
      tabla.appendChild(tr);
    });
  }

  function prepararFormSimulacro() {
    const form = $("form-simulacro");
    if (!form) return;
    $("sim-fecha").value = hoyIso();
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const boton = form.querySelector("button");
      boton.disabled = true;
      try {
        const r = await api("/simulacros", "POST", sinVacios({
          nombre: $("sim-nombre").value.trim(),
          fecha_simulacro: $("sim-fecha").value,
          descripcion: $("sim-desc").value.trim(),
        }));
        const nuevo = { id_simulacro: r.id_simulacro, nombre: $("sim-nombre").value.trim(), fecha_simulacro: $("sim-fecha").value };
        form.reset();
        $("sim-fecha").value = hoyIso();
        mensaje(form, "Simulacro creado. Ya puedes cargar sus resultados.", "ok");
        await cargarSimulacros();
        abrirResultados(nuevo);
      } catch (e) {
        mensaje(form, e.message, "error");
      } finally {
        boton.disabled = false;
      }
    });
  }

  function globalCalculado(fila) {   // misma formula que el backend
    const notas = AREAS.map((a) => fila.querySelector('[data-area="' + a + '"]').value);
    if (notas.some((n) => n === "")) return null;
    const [lc, mat, soc, cn, ing] = notas.map(Number);
    return Math.round((3 * (lc + mat + soc + cn) + ing) / 13 * 5);
  }

  async function abrirResultados(simulacro) {
    simulacroActual = simulacro;
    const panel = $("res-panel");
    panel.hidden = false;
    $("res-titulo").textContent = "Resultados · " + simulacro.nombre;
    $("res-msg").textContent = "";
    const tabla = $("res-tabla");
    filaVacia(tabla, 8, "Cargando estudiantes…");
    panel.scrollIntoView({ behavior: "smooth", block: "start" });

    const grupo = $("res-grupo").value;
    let datos;
    try {
      datos = await api("/simulacros/" + simulacro.id_simulacro + "/resultados" + (grupo ? "?id_grupo=" + grupo : ""));
    } catch (e) {
      return filaVacia(tabla, 8, e.message);
    }
    if (!datos.estudiantes.length) return filaVacia(tabla, 8, "No hay estudiantes con inscripción activa" + (grupo ? " en este grupo." : "."));

    tabla.textContent = "";
    datos.estudiantes.forEach((e) => {
      const tr = el("tr");
      tr.dataset.inscripcion = e.id_inscripcion;
      const tdN = el("td");
      tdN.appendChild(el("strong", null, e.nombre_completo));
      tdN.appendChild(el("small", "ac-sub", e.doc_identidad));
      tr.appendChild(tdN);
      tr.appendChild(el("td", null, e.nombre_grupo || "—"));
      AREAS.forEach((a) => {
        const td = el("td");
        const input = el("input", "input-space ac-nota");
        input.type = "number"; input.min = "0"; input.max = "100"; input.inputMode = "numeric";
        input.dataset.area = a;
        input.value = e[a] === null ? "" : e[a];
        td.appendChild(input);
        tr.appendChild(td);
      });
      const tdG = el("td");
      const global = el("input", "input-space ac-nota ac-global");
      global.type = "number"; global.min = "0"; global.max = "500";
      global.dataset.area = "puntaje_global";
      global.value = e.puntaje_global === null ? "" : e.puntaje_global;
      global.dataset.manual = e.puntaje_global !== null && e.puntaje_global !== globalDe(e) ? "1" : "";
      tdG.appendChild(global);
      tr.appendChild(tdG);

      tr.addEventListener("input", (ev) => {
        if (ev.target === global) { global.dataset.manual = global.value ? "1" : ""; return; }
        if (!global.dataset.manual) {
          const g = globalCalculado(tr);
          global.value = g === null ? "" : g;
        }
      });
      tabla.appendChild(tr);
    });
  }

  function globalDe(e) {
    if (AREAS.some((a) => e[a] === null)) return null;
    return Math.round((3 * (e.lectura_critica + e.matematicas + e.sociales_ciudadanas + e.ciencias_naturales) + e.ingles) / 13 * 5);
  }

  function prepararResultados() {
    if (!$("res-guardar")) return;
    $("res-grupo").addEventListener("change", () => { if (simulacroActual) abrirResultados(simulacroActual); });
    $("res-guardar").addEventListener("click", async () => {
      const registros = [];
      let incompletas = 0;
      $("res-tabla").querySelectorAll("tr[data-inscripcion]").forEach((tr) => {
        const valores = {};
        tr.querySelectorAll("input").forEach((i) => { if (i.value !== "") valores[i.dataset.area] = Number(i.value); });
        if (!Object.keys(valores).length) return;  // fila vacia: no se guarda
        if (valores.puntaje_global === undefined) { incompletas++; return; }
        valores.id_inscripcion = Number(tr.dataset.inscripcion);
        registros.push(valores);
      });
      const msg = $("res-msg");
      if (incompletas) { msg.textContent = incompletas + " fila(s) sin puntaje global: completa las 5 áreas o escribe el global."; msg.className = "ac-msg error"; return; }
      if (!registros.length) { msg.textContent = "No hay resultados para guardar."; msg.className = "ac-msg error"; return; }
      const boton = $("res-guardar");
      boton.disabled = true;
      msg.textContent = "Guardando…"; msg.className = "ac-msg";
      try {
        const r = await api("/simulacros/" + simulacroActual.id_simulacro + "/resultados", "PUT", { registros });
        msg.textContent = r.registros + " resultado(s) guardado(s)."; msg.className = "ac-msg ok";
        cargarSimulacros();
      } catch (e) {
        msg.textContent = e.message; msg.className = "ac-msg error";
      } finally {
        boton.disabled = false;
      }
    });
  }

  /* ---------- arranque ---------- */

  document.addEventListener("DOMContentLoaded", () => {
    if ($("grupos-tabla") || $("cl-grupo") || $("in-grupo")) cargarGrupos();
    prepararFormCurso();
    prepararFormGrupo();
    prepararFormInscripcion();
    prepararFormCuenta();
    prepararFormClase();
    cargarClases();
    prepararFormSimulacro();
    prepararResultados();
    cargarSimulacros();
  });

  /* ---------- datos de ejemplo (?demo) ---------- */

  function demo(ruta, metodo, cuerpo) {
    const dia = (n) => { const f = new Date(); f.setDate(f.getDate() + n); return f.getFullYear() + "-" + String(f.getMonth() + 1).padStart(2, "0") + "-" + String(f.getDate()).padStart(2, "0"); };
    if (metodo && metodo !== "GET") {
      console.info("[demo]", metodo, ruta, cuerpo);
      if (ruta === "/clases") return Promise.resolve({ creadas: [cuerpo.fecha_clase], ya_existian: [] });
      if (ruta === "/simulacros") return Promise.resolve({ id_simulacro: 9 });
      if (ruta === "/cursos" || ruta === "/grupos") return Promise.resolve({ id: 9 });
      const cuenta = { usuario: "juan@correo.com", contrasena_temporal: "Kp7mWq3xRa", aviso: "Entrega esta contraseña al estudiante. No se vuelve a mostrar." };
      if (ruta === "/inscripciones") return Promise.resolve({ curso: "Pre-ICFES Cal. B", grupo: "Grupo 2", cuotas: [{}, {}, {}], cuenta: cuerpo.crear_cuenta ? cuenta : null });
      if (ruta === "/cuentas-estudiante") return Promise.resolve(Object.assign({ estudiante: "Juan Pérez" }, cuenta));
      return Promise.resolve({ registros: (cuerpo && cuerpo.registros || []).length });
    }
    if (ruta === "/grupos") return Promise.resolve([
      { id_grupo: 1, valor_total: 600000, nombre_curso: "Pre-ICFES Cal. B", nombre_grupo: "Grupo 2", dia_semana: "martes", hora_inicio: "18:00:00", hora_fin: "20:00:00", docente: "Laura Gómez", inscritos: 3, capacidad_maxima: 40 },
      { id_grupo: 2, valor_total: 750000, nombre_curso: "Pre-ICFES Cal. A", nombre_grupo: "Sábado AM", dia_semana: "sabado", hora_inicio: "08:00:00", hora_fin: "11:00:00", docente: null, inscritos: 40, capacidad_maxima: 40 },
    ]);
    if (ruta === "/cursos") return Promise.resolve([{ id_curso: 1, nombre_curso: "Pre-ICFES Cal. B" }, { id_curso: 2, nombre_curso: "Pre-ICFES Cal. A" }]);
    if (ruta === "/docentes") return Promise.resolve([{ id_docente: 1, nombre_completo: "Laura Gómez" }, { id_docente: 2, nombre_completo: "Carlos Ruiz" }]);
    if (ruta.indexOf("/clases?") === 0 || ruta === "/clases") return Promise.resolve([
      { id_clase: 1, fecha_clase: dia(-5), hora_inicio: "18:00:00", hora_fin: "20:00:00", tema: "Probabilidad", nombre_curso: "Pre-ICFES Cal. B", nombre_grupo: "Grupo 2", docente: "Laura Gómez", inscritos: 3, registradas: 3 },
      { id_clase: 2, fecha_clase: dia(0), hora_inicio: "18:00:00", hora_fin: "20:00:00", tema: "Funciones y gráficas", nombre_curso: "Pre-ICFES Cal. B", nombre_grupo: "Grupo 2", docente: "Laura Gómez", inscritos: 3, registradas: 1 },
      { id_clase: 3, fecha_clase: dia(7), hora_inicio: "18:00:00", hora_fin: "20:00:00", tema: null, nombre_curso: "Pre-ICFES Cal. B", nombre_grupo: "Grupo 2", docente: "Laura Gómez", inscritos: 3, registradas: 0 },
    ]);
    if (/^\/clases\/\d+\/asistencia$/.test(ruta)) return Promise.resolve({
      id_clase: 2, fecha_clase: dia(0), hora_inicio: "18:00:00", tema: "Funciones y gráficas", nombre_curso: "Pre-ICFES Cal. B", nombre_grupo: "Grupo 2",
      estudiantes: [
        { id_inscripcion: 11, nombre_completo: "Isabella Tirado", doc_identidad: "1001234567", estado_asistencia: "presente" },
        { id_inscripcion: 12, nombre_completo: "Juan Pérez", doc_identidad: "1002223334", estado_asistencia: null },
        { id_inscripcion: 13, nombre_completo: "María López", doc_identidad: "1005556667", estado_asistencia: null },
      ],
    });
    if (ruta === "/simulacros") return Promise.resolve([
      { id_simulacro: 2, nombre: "Simulacro 2", fecha_simulacro: dia(-10), resultados: 2, promedio_global: 300.5 },
      { id_simulacro: 1, nombre: "Simulacro 1", fecha_simulacro: dia(-40), resultados: 3, promedio_global: 271 },
    ]);
    if (/^\/simulacros\/\d+\/resultados/.test(ruta)) return Promise.resolve({
      id_simulacro: 2, nombre: "Simulacro 2", fecha_simulacro: dia(-10),
      estudiantes: [
        { id_inscripcion: 11, nombre_completo: "Isabella Tirado", doc_identidad: "1001234567", nombre_grupo: "Grupo 2", puntaje_global: 316, lectura_critica: 72, matematicas: 44, sociales_ciudadanas: 68, ciencias_naturales: 63, ingles: 80 },
        { id_inscripcion: 12, nombre_completo: "Juan Pérez", doc_identidad: "1002223334", nombre_grupo: "Grupo 2", puntaje_global: null, lectura_critica: null, matematicas: null, sociales_ciudadanas: null, ciencias_naturales: null, ingles: null },
      ],
    });
    return Promise.resolve([]);
  }
})();
