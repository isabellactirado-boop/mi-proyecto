/* =====================================================================
   academico.js - cursos, grupos, inscripciones, pagos, clases,
   asistencia y simulacros.
   Lo usan los dos paneles:
   - dashboard-admin.html: programa grupos y clases, toma asistencia y
     carga resultados de simulacros.
   - dashboard-docente.html: ve sus clases y toma asistencia.
   Cada parte solo se activa si su contenedor existe en la pagina.
   Es independiente de api.js (todo va dentro de una funcion para no
   chocar con sus nombres). Abre la pagina con ?demo para datos de ejemplo.
   ===================================================================== */

(function () {
  const API = window.PREICMA_API;   // se define en config.js
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
      let codigo = null;
      if (Array.isArray(detalle)) detalle = "Revisa los datos del formulario";
      else if (detalle && typeof detalle === "object") { codigo = detalle.codigo; detalle = detalle.mensaje; }
      const error = new Error(detalle || "Error " + respuesta.status);
      error.codigo = codigo;
      throw error;
    }
    return datos;
  }

  // Descarga un archivo protegido (con el token) para mostrarlo
  async function apiArchivo(ruta) {
    if (DEMO) {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="520"><rect width="100%" height="100%" fill="#7a2fd0"/>' +
        '<text x="50%" y="45%" fill="#fff" font-size="28" text-anchor="middle" font-family="sans-serif">Nequi</text>' +
        '<text x="50%" y="55%" fill="#fff" font-size="18" text-anchor="middle" font-family="sans-serif">Ref. M1234567 · $200.000</text></svg>';
      return new Blob([svg], { type: "image/svg+xml" });
    }
    const respuesta = await fetch(API + ruta, { headers: { Authorization: "Bearer " + sessionStorage.getItem("token") } });
    if (!respuesta.ok) throw new Error(respuesta.status === 404 ? "Ese pago no tiene comprobante" : "Error " + respuesta.status);
    return respuesta.blob();
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
    const tabla = $("grupos-tabla");
    const editor = window.PreicmaEditar;
    const conInactivos = !!(tabla && editor && editor.esAdmin());
    let todos;
    try {
      todos = await api("/grupos" + (conInactivos ? "?incluir_inactivos=true" : ""));
    } catch (e) {
      grupos = [];
      if (tabla) filaVacia(tabla, 5, e.message);
      return;
    }
    // Los selectores solo ofrecen grupos activos; la tabla muestra todos para poder reactivarlos
    grupos = todos.filter((g) => g.activo !== false);

    if (tabla) {
      if (!todos.length) filaVacia(tabla, 5, "Aún no hay grupos. Crea el primero con el formulario.");
      else {
        tabla.textContent = "";
        todos.forEach((g) => {
          const activo = g.activo !== false;
          const tr = el("tr", activo ? null : "ed-inactivo");
          const tdN = el("td", null, g.nombre_curso + " · " + g.nombre_grupo);
          if (g.enlace_reunion) tdN.appendChild(el("small", "ac-sub", "Meet fijo"));
          tr.appendChild(tdN);
          tr.appendChild(el("td", null, DIA_SEMANA[g.dia_semana] + " " + hora12(g.hora_inicio) + " – " + hora12(g.hora_fin)));
          tr.appendChild(el("td", null, g.docente || "Sin asignar"));
          const td = el("td");
          const lleno = g.inscritos >= g.capacidad_maxima;
          td.appendChild(activo
            ? el("span", "badge " + (lleno ? "b-red" : "b-ok"), g.inscritos + " / " + g.capacidad_maxima)
            : el("span", "badge bx-gris", "Inactivo"));
          tr.appendChild(td);
          const tdA = el("td");
          if (conInactivos) {
            const caja = el("div", "ac-acciones");
            if (activo) {
              caja.appendChild(botonAccion("Editar", () => editarGrupo(g)));
              caja.appendChild(botonAccion("Desactivar", () => activarGrupo(g, false), "ed-peligro"));
            } else {
              caja.appendChild(botonAccion("Activar", () => activarGrupo(g, true)));
            }
            tdA.appendChild(caja);
          }
          tr.appendChild(tdA);
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

  /* ---------- editar grupos y cursos (usa edicion.js) ---------- */

  function botonAccion(texto, accion, clase) {
    const b = el("button", "btn sm" + (clase ? " " + clase : ""), texto);
    b.type = "button";
    b.addEventListener("click", accion);
    return b;
  }

  const DIAS_FORM = [["lunes", "Lunes"], ["martes", "Martes"], ["miercoles", "Miércoles"], ["jueves", "Jueves"],
    ["viernes", "Viernes"], ["sabado", "Sábado"], ["domingo", "Domingo"]];
  const horaCorta = (t) => String(t || "").slice(0, 5);

  async function editarGrupo(g) {
    let docentes = [];
    try { docentes = await api("/docentes"); } catch (e) { /* sin lista: solo "Sin asignar" */ }
    window.PreicmaEditar.formulario({
      titulo: "Editar grupo",
      sub: g.nombre_curso + " · " + g.nombre_grupo + " · " + g.inscritos + " inscrito(s)",
      campos: [
        { nombre: "nombre_grupo", etiqueta: "Nombre del grupo", valor: g.nombre_grupo, requerido: true, maxlength: 30, ancho: "medio" },
        { nombre: "dia_semana", etiqueta: "Día", tipo: "select", opciones: DIAS_FORM, valor: g.dia_semana, requerido: true, ancho: "medio" },
        { nombre: "hora_inicio", etiqueta: "Desde", tipo: "time", valor: horaCorta(g.hora_inicio), requerido: true, ancho: "medio" },
        { nombre: "hora_fin", etiqueta: "Hasta", tipo: "time", valor: horaCorta(g.hora_fin), requerido: true, ancho: "medio" },
        { nombre: "id_docente", etiqueta: "Docente", tipo: "select", requerido: true,
          opciones: [["", "Sin asignar"]].concat(docentes.map((d) => [d.id_docente, d.nombre_completo])),
          valor: g.id_docente || "", ancho: "medio" },
        { nombre: "capacidad_maxima", etiqueta: "Cupo máximo", tipo: "number", valor: g.capacidad_maxima,
          min: Math.max(20, g.inscritos), max: 150, requerido: true, ancho: "medio",
          ayuda: "Entre 20 y 150, y no menos que los inscritos." },
        { nombre: "enlace_reunion", etiqueta: "Enlace fijo de Meet", tipo: "url", valor: g.enlace_reunion, maxlength: 500,
          placeholder: "https://meet.google.com/…" },
      ],
      guardar: async (v) => {
        v.id_docente = v.id_docente ? Number(v.id_docente) : null;
        return (await api("/grupos/" + g.id_grupo, "PUT", v)).mensaje;
      },
      alGuardar: (texto) => { window.PreicmaEditar.aviso(texto); cargarGrupos(); cargarClases(); },
    });
  }

  function activarGrupo(g, activo) {
    window.PreicmaEditar.confirmar({
      titulo: activo ? "Activar grupo" : "Desactivar grupo",
      texto: activo
        ? g.nombre_curso + " · " + g.nombre_grupo + " vuelve a aparecer para inscribir estudiantes y programar clases."
        : g.nombre_curso + " · " + g.nombre_grupo + " dejará de aparecer para inscribir y programar clases. " +
          "Solo se puede si no tiene estudiantes activos. No se borra nada y lo puedes activar después.",
      textoBoton: activo ? "Activar" : "Desactivar",
      peligro: !activo,
      aceptar: async () => (await api("/grupos/" + g.id_grupo + "/activo", "PATCH", { activo })).mensaje,
      alTerminar: (texto) => { window.PreicmaEditar.aviso(texto); cargarGrupos(); cargarTablaCursos(); },
    });
  }

  async function cargarTablaCursos() {
    const tabla = $("cursos-tabla");
    if (!tabla) return;
    let cursos;
    try { cursos = await api("/cursos/todos"); } catch (e) { return filaVacia(tabla, 4, e.message); }
    if (!cursos.length) return filaVacia(tabla, 4, "Aún no hay cursos. Crea el primero con el formulario.");
    tabla.textContent = "";
    cursos.forEach((c) => {
      const tr = el("tr", c.activo ? null : "ed-inactivo");
      const tdN = el("td");
      tdN.appendChild(el("strong", null, c.nombre_curso));
      tdN.appendChild(el("small", "ac-sub", fechaCorta(c.fecha_inicio) + " – " + fechaCorta(c.fecha_fin)));
      tr.appendChild(tdN);
      tr.appendChild(el("td", null, dinero(c.valor_total)));
      const tdI = el("td", null, c.inscritos + (c.inscritos === 1 ? " estudiante" : " estudiantes"));
      tdI.appendChild(el("small", "ac-sub", c.grupos + (c.grupos === 1 ? " grupo activo" : " grupos activos")));
      tr.appendChild(tdI);
      const tdE = el("td");
      const caja = el("div", "ac-acciones");
      caja.appendChild(el("span", "badge " + (c.activo ? "b-ok" : "bx-gris"), c.activo ? "Activo" : "Inactivo"));
      caja.appendChild(botonAccion("Editar", () => editarCurso(c)));
      tdE.appendChild(caja);
      tr.appendChild(tdE);
      tabla.appendChild(tr);
    });
  }

  function editarCurso(c) {
    window.PreicmaEditar.formulario({
      titulo: "Editar curso",
      sub: c.nombre_curso,
      aviso: c.inscritos ? "Tiene " + c.inscritos + " estudiante(s) activo(s): si cambias el valor, ellos conservan el valor que se les acordó." : "",
      campos: [
        { nombre: "nombre_curso", etiqueta: "Nombre del curso", valor: c.nombre_curso, requerido: true, maxlength: 100 },
        { nombre: "fecha_inicio", etiqueta: "Inicia", tipo: "date", valor: c.fecha_inicio, requerido: true, ancho: "medio" },
        { nombre: "fecha_fin", etiqueta: "Termina", tipo: "date", valor: c.fecha_fin, requerido: true, ancho: "medio" },
        { nombre: "valor_total", etiqueta: "Valor total", tipo: "number", valor: Math.round(Number(c.valor_total)), min: 0, requerido: true, ancho: "medio" },
        { nombre: "activo", etiqueta: "Curso activo", tipo: "select", opciones: [["true", "Activo"], ["false", "Inactivo"]],
          valor: String(c.activo), requerido: true, ancho: "medio",
          ayuda: "Solo se puede desactivar si no tiene estudiantes activos." },
        { nombre: "descripcion", etiqueta: "Descripción", tipo: "textarea", valor: c.descripcion, maxlength: 500 },
      ],
      guardar: async (v) => {
        v.activo = v.activo === "true";
        return (await api("/cursos/" + c.id_curso, "PUT", v)).mensaje;
      },
      alGuardar: (texto) => { window.PreicmaEditar.aviso(texto); cargarTablaCursos(); cargarCursos(); cargarGrupos(); },
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
        cargarTablaCursos();
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

  /* ---------- pagos (admin) ---------- */

  const METODOS = { efectivo: "Efectivo", nequi_daviplata: "Nequi / Daviplata", transferencia: "Transferencia",
    tarjeta: "Tarjeta", otro: "Otro" };
  let inscripcionPago = null;

  function enlaceWhatsApp(telefono, texto) {
    const numero = String(telefono || "").replace(/\D/g, "");
    if (numero.length < 10) return null;
    const a = el("a", "ac-wa", "WhatsApp");
    a.href = "https://wa.me/" + (numero.length === 10 ? "57" + numero : numero) + "?text=" + encodeURIComponent(texto);
    a.target = "_blank";
    a.rel = "noopener";
    return a;
  }

  async function cargarCobros() {
    const tabla = $("cobro-tabla");
    if (!tabla) return;
    let lista;
    try {
      lista = await api("/cuotas-por-cobrar");
    } catch (e) {
      return filaVacia(tabla, 6, e.message);
    }
    if (!lista.length) return filaVacia(tabla, 6, "¡Todo al día! No hay cuotas vencidas ni por vencer en 15 días.");
    tabla.textContent = "";
    lista.forEach((c) => {
      const tr = el("tr");
      const tdE = el("td");
      tdE.appendChild(el("strong", null, c.estudiante));
      tdE.appendChild(el("small", "ac-sub", c.curso));
      tr.appendChild(tdE);
      tr.appendChild(el("td", null, c.numero_cuota + " de " + c.numero_cuotas));
      tr.appendChild(el("td", null, dinero(c.pendiente)));
      const tdS = el("td");
      tdS.appendChild(c.dias_mora > 0
        ? el("span", "badge b-red", c.dias_mora + (c.dias_mora === 1 ? " día de mora" : " días de mora"))
        : el("span", "badge b-warn", c.dias_mora === 0 ? "Vence hoy" : "Vence " + fechaCorta(c.fecha_vencimiento)));
      tr.appendChild(tdS);

      const tdC = el("td");
      const telefono = c.telefono_acudiente || c.telefono_estudiante;
      tdC.appendChild(el("span", null, c.acudiente || "Sin acudiente"));
      const texto = "Hola" + (c.acudiente ? " " + c.acudiente.split(" ")[0] : "") + ", te escribimos de PRE ICMA. " +
        (c.dias_mora > 0 ? "La cuota " + c.numero_cuota + " de " + c.estudiante + " está vencida" : "La cuota " + c.numero_cuota + " de " + c.estudiante + " vence el " + fechaCorta(c.fecha_vencimiento)) +
        " (" + dinero(c.pendiente) + "). ¡Gracias!";
      const wa = enlaceWhatsApp(telefono, texto);
      if (wa) { tdC.appendChild(el("br")); tdC.appendChild(wa); }
      tr.appendChild(tdC);

      const tdB = el("td");
      const b = el("button", "btn sm main", "Registrar pago");
      b.type = "button";
      b.addEventListener("click", async () => {
        try {
          const encontrados = await api("/pagos/buscar?q=" + encodeURIComponent(c.doc_identidad));
          const ins = encontrados.find((x) => x.id_inscripcion === c.id_inscripcion) || encontrados[0];
          if (ins) elegirInscripcion(ins, c.pendiente);
          $("form-pago").scrollIntoView({ behavior: "smooth", block: "center" });
          $("pg-monto").focus({ preventScroll: true });
        } catch (e) { alert(e.message); }
      });
      tdB.appendChild(b);
      tr.appendChild(tdB);
      tabla.appendChild(tr);
    });
  }

  async function cargarPagosRecientes() {
    const tabla = $("pagos-tabla");
    if (!tabla) return;
    const ref = $("pg-filtro-ref") ? $("pg-filtro-ref").value.trim() : "";
    let lista;
    try {
      lista = await api("/pagos/recientes" + (ref ? "?ref=" + encodeURIComponent(ref) : ""));
    } catch (e) {
      return filaVacia(tabla, 8, e.message);
    }
    if (!lista.length) return filaVacia(tabla, 8, ref ? "Ningún pago tiene una referencia parecida a «" + ref + "»." : "Aún no hay pagos registrados.");
    tabla.textContent = "";
    lista.forEach((p) => {
      const tr = el("tr");
      tr.appendChild(el("td", null, fechaCorta(p.fecha_pago)));
      const tdE = el("td");
      tdE.appendChild(el("strong", null, p.estudiante));
      if (p.descripcion) tdE.appendChild(el("small", "ac-sub", p.descripcion));
      tr.appendChild(tdE);
      tr.appendChild(el("td", null, p.curso));
      tr.appendChild(el("td", null, METODOS[p.metodo_pago] || p.metodo_pago));
      tr.appendChild(el("td", "ac-ref", p.referencia || "—"));
      tr.appendChild(el("td", null, dinero(p.monto_pagado)));
      const tdC = el("td");
      if (p.tiene_comprobante) {
        const ver = el("button", "btn sm", "Ver");
        ver.type = "button";
        ver.addEventListener("click", () => verComprobante(p));
        tdC.appendChild(ver);
      } else {
        tdC.appendChild(el("span", "ac-sub", "—"));
      }
      tr.appendChild(tdC);
      const tdA = el("td");
      if (window.PreicmaEditar && window.PreicmaEditar.puede("editar_pagos")) {
        const caja = el("div", "ac-acciones");
        caja.appendChild(botonAccion("Corregir", () => corregirPago(p)));
        caja.appendChild(botonAccion("Eliminar", () => eliminarPago(p), "ed-peligro"));
        tdA.appendChild(caja);
      }
      tr.appendChild(tdA);
      tabla.appendChild(tr);
    });
  }

  function refrescarPagos(texto) {
    window.PreicmaEditar.aviso(texto);
    cargarPagosRecientes();
    cargarCobros();
    if (typeof window.cargarResumen === "function") window.cargarResumen();
    if (window.PreicmaInformes) window.PreicmaInformes.recargarPagos();
  }

  function corregirPago(p) {
    window.PreicmaEditar.formulario({
      titulo: "Corregir pago",
      sub: p.estudiante + " · " + p.curso,
      aviso: p.tiene_comprobante ? "El comprobante adjunto se conserva." : "",
      campos: [
        { nombre: "monto_pagado", etiqueta: "Monto", tipo: "number", valor: Math.round(Number(p.monto_pagado)), min: 1, requerido: true, ancho: "medio" },
        { nombre: "fecha_pago", etiqueta: "Fecha del pago", tipo: "date", valor: p.fecha_pago, max: hoyIso(), requerido: true, ancho: "medio" },
        { nombre: "metodo_pago", etiqueta: "Método de pago", tipo: "select", requerido: true, valor: p.metodo_pago,
          opciones: Object.keys(METODOS).map((k) => [k, METODOS[k]]), ancho: "medio" },
        { nombre: "referencia", etiqueta: "Referencia", valor: p.referencia, maxlength: 60, ancho: "medio" },
        { nombre: "descripcion", etiqueta: "Nota", valor: p.descripcion, maxlength: 200 },
      ],
      guardar: async (v) => (await api("/pagos/" + p.id_pago, "PUT", v)).mensaje,
      alGuardar: refrescarPagos,
    });
  }

  function eliminarPago(p) {
    window.PreicmaEditar.confirmar({
      titulo: "Eliminar pago",
      texto: "Vas a eliminar el pago de " + dinero(p.monto_pagado) + " de " + p.estudiante + " (" + fechaCorta(p.fecha_pago) +
        (p.referencia ? ", ref. " + p.referencia : "") + ")" + (p.tiene_comprobante ? " y su comprobante" : "") +
        ". Úsalo solo si se registró por error. No se puede deshacer y el saldo del estudiante vuelve a subir.",
      textoBoton: "Sí, eliminar",
      peligro: true,
      aceptar: async () => (await api("/pagos/" + p.id_pago, "DELETE")).mensaje,
      alTerminar: refrescarPagos,
    });
  }

  async function verComprobante(p) {
    let blob;
    try { blob = await apiArchivo("/pagos/" + p.id_pago + "/comprobante"); } catch (e) { return alert(e.message); }
    const url = URL.createObjectURL(blob);
    if (blob.type === "application/pdf") {   // los PDF se abren en otra pestaña
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return;
    }
    let visor = $("ac-visor");
    if (!visor) {
      visor = el("div", "ac-modal ac-visor");
      visor.id = "ac-visor";
      visor.innerHTML = '<div class="ac-caja" role="dialog" aria-modal="true" aria-labelledby="ac-v-titulo">' +
        '<div class="ac-m-top"><div><h3 id="ac-v-titulo"></h3><p id="ac-v-sub"></p></div>' +
        '<button class="ac-cerrar" type="button" aria-label="Cerrar">×</button></div><img id="ac-v-img" alt="Comprobante de pago"></div>';
      document.body.appendChild(visor);
      const cerrar = () => { visor.hidden = true; URL.revokeObjectURL($("ac-v-img").src); };
      visor.querySelector(".ac-cerrar").addEventListener("click", cerrar);
      visor.addEventListener("click", (e) => { if (e.target === visor) cerrar(); });
    }
    $("ac-v-titulo").textContent = "Comprobante · " + p.estudiante;
    $("ac-v-sub").textContent = dinero(p.monto_pagado) + " · " + (METODOS[p.metodo_pago] || p.metodo_pago) +
      (p.referencia ? " · Ref. " + p.referencia : "") + " · " + fechaCorta(p.fecha_pago);
    $("ac-v-img").src = url;
    visor.hidden = false;
  }

  // Fotos: se reducen a 1600 px y JPEG para que pesen ~200-400 KB. Los PDF van tal cual.
  const MAX_BYTES = 2 * 1024 * 1024;
  function leerComoDataUrl(blob) {
    return new Promise((ok, mal) => {
      const lector = new FileReader();
      lector.onload = () => ok(lector.result);
      lector.onerror = () => mal(new Error("No se pudo leer el archivo"));
      lector.readAsDataURL(blob);
    });
  }
  async function prepararArchivo(archivo) {
    if (archivo.type === "application/pdf") {
      if (archivo.size > MAX_BYTES) throw new Error("El PDF pesa más de 2 MB. Toma una captura de pantalla en su lugar.");
      return leerComoDataUrl(archivo);
    }
    if (!/^image\//.test(archivo.type)) throw new Error("El comprobante debe ser una foto o un PDF");
    const imagen = await createImageBitmap(archivo).catch(() => { throw new Error("No se pudo abrir la foto"); });
    const escala = Math.min(1, 1600 / Math.max(imagen.width, imagen.height));
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(imagen.width * escala);
    lienzo.height = Math.round(imagen.height * escala);
    const ctx = lienzo.getContext("2d");
    ctx.fillStyle = "#fff";  // fondo blanco para PNG transparentes
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    ctx.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
    for (const calidad of [0.82, 0.7, 0.55]) {
      const blob = await new Promise((ok) => lienzo.toBlob(ok, "image/jpeg", calidad));
      if (blob && blob.size <= MAX_BYTES) return leerComoDataUrl(blob);
    }
    throw new Error("La foto es demasiado pesada incluso comprimida");
  }

  function elegirInscripcion(ins, montoSugerido) {
    inscripcionPago = ins;
    $("pg-sugerencias").hidden = true;
    $("pg-buscar").value = "";
    const caja = $("pg-elegido");
    caja.textContent = "";
    caja.hidden = false;
    const info = el("div");
    info.appendChild(el("strong", null, ins.estudiante));
    info.appendChild(el("small", null, ins.curso + (ins.nombre_grupo ? " · " + ins.nombre_grupo : "")));
    info.appendChild(el("small", null, "Saldo pendiente: " + dinero(ins.saldo_pendiente) +
      (Number(ins.valor_en_mora) > 0 ? " · en mora " + dinero(ins.valor_en_mora) : "")));
    caja.appendChild(info);
    const quitar = el("button", null, "×");
    quitar.type = "button";
    quitar.setAttribute("aria-label", "Quitar estudiante");
    quitar.addEventListener("click", () => { inscripcionPago = null; caja.hidden = true; $("pg-buscar").focus(); });
    caja.appendChild(quitar);
    $("pg-monto").max = Math.round(Number(ins.saldo_pendiente));
    if (montoSugerido) $("pg-monto").value = Math.round(Number(montoSugerido));
  }

  function prepararFormPago() {
    const form = $("form-pago");
    if (!form) return;
    $("pg-fecha").value = hoyIso();

    // Referencia y comprobante: obligatorio uno de los dos para Nequi/Daviplata y transferencia
    let comprobante = null;
    const conSoporte = () => ["nequi_daviplata", "transferencia", "tarjeta"].includes($("pg-metodo").value);
    const exigeSoporte = () => ["nequi_daviplata", "transferencia"].includes($("pg-metodo").value);
    const limpiarArchivo = () => { comprobante = null; $("pg-archivo").value = ""; $("pg-previa").hidden = true; };
    $("pg-metodo").addEventListener("change", () => { $("pg-soporte").hidden = !conSoporte(); });
    $("pg-archivo").addEventListener("change", async () => {
      const archivo = $("pg-archivo").files[0];
      const previa = $("pg-previa");
      if (!archivo) return limpiarArchivo();
      previa.hidden = false;
      previa.textContent = "Preparando…";
      try {
        comprobante = await prepararArchivo(archivo);
      } catch (e) {
        limpiarArchivo();
        return mensaje(form, e.message, "error");
      }
      previa.textContent = "";
      if (comprobante.startsWith("data:image/")) {
        const img = el("img");
        img.src = comprobante;
        img.alt = "Vista previa del comprobante";
        previa.appendChild(img);
      }
      const kb = Math.round((comprobante.length * 3) / 4 / 1024);
      previa.appendChild(el("span", null, archivo.name + " · " + kb + " KB"));
      const quitar = el("button", null, "×");
      quitar.type = "button";
      quitar.setAttribute("aria-label", "Quitar comprobante");
      quitar.addEventListener("click", limpiarArchivo);
      previa.appendChild(quitar);
    });

    let esperaFiltro = null;
    if ($("pg-filtro-ref")) {
      $("pg-filtro-ref").addEventListener("input", () => {
        clearTimeout(esperaFiltro);
        esperaFiltro = setTimeout(cargarPagosRecientes, 350);
      });
    }

    let espera = null;
    $("pg-buscar").addEventListener("input", () => {
      clearTimeout(espera);
      const q = $("pg-buscar").value.trim();
      const lista = $("pg-sugerencias");
      if (q.length < 2) { lista.hidden = true; return; }
      espera = setTimeout(async () => {
        let encontrados = [];
        try { encontrados = await api("/pagos/buscar?q=" + encodeURIComponent(q)); } catch (e) { /* sin resultados */ }
        lista.textContent = "";
        if (!encontrados.length) lista.appendChild(el("li", null, "Sin inscripciones activas con ese nombre o documento"));
        encontrados.forEach((ins) => {
          const li = el("li");
          li.tabIndex = 0;
          li.appendChild(document.createTextNode(ins.estudiante));
          li.appendChild(el("small", null, ins.doc_identidad + " · " + ins.curso + " · saldo " + dinero(ins.saldo_pendiente)));
          const elegir = () => elegirInscripcion(ins);
          li.addEventListener("click", elegir);
          li.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); elegir(); } });
          lista.appendChild(li);
        });
        lista.hidden = false;
      }, 300);
    });

    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      if (!inscripcionPago) return mensaje(form, "Busca y elige el estudiante.", "error");
      const referencia = conSoporte() ? $("pg-ref").value.trim() : "";
      if (exigeSoporte() && !referencia && !comprobante) {
        return mensaje(form, "Para Nequi, Daviplata o transferencia escribe la referencia o adjunta el comprobante.", "error");
      }
      const boton = form.querySelector('button[type="submit"]');
      boton.disabled = true;
      mensaje(form, comprobante ? "Subiendo comprobante…" : "Guardando…");
      const cuerpo = sinVacios({
        id_inscripcion: inscripcionPago.id_inscripcion,
        monto_pagado: Number($("pg-monto").value),
        metodo_pago: $("pg-metodo").value,
        fecha_pago: $("pg-fecha").value,
        descripcion: $("pg-nota").value.trim(),
        referencia: referencia,
        comprobante: conSoporte() ? comprobante : null,
      });
      try {
        let r;
        try {
          r = await api("/pagos", "POST", cuerpo);
        } catch (e) {
          // Referencia ya usada: puede ser un comprobante reutilizado. Se pide confirmar.
          if (e.codigo !== "referencia_repetida" || !confirm(e.message + "\n\n¿Seguro que quieres registrar este pago con la misma referencia?")) throw e;
          cuerpo.confirmar_referencia_repetida = true;
          r = await api("/pagos", "POST", cuerpo);
        }
        form.reset();
        $("pg-fecha").value = hoyIso();
        $("pg-elegido").hidden = true;
        $("pg-soporte").hidden = true;
        limpiarArchivo();
        inscripcionPago = null;
        mensaje(form, "Pago de " + r.estudiante + " guardado. Saldo restante: " + dinero(r.saldo_restante) + ".", "ok");
        cargarCobros();
        cargarPagosRecientes();
      } catch (e) {
        mensaje(form, e.message, "error");
      } finally {
        boton.disabled = false;
      }
    });
  }

  /* ---------- usuarios (solo el propietario) ---------- */

  const ROLES = { propietario: "Propietario", administrador: "Admin", profesor: "Docente", estudiante: "Estudiante" };
  let usuarios = [];

  function fechaHora(texto) {        // "2026-11-02T21:15:00" -> "2 nov · 9:15 pm"
    if (!texto) return "Nunca";
    const f = new Date(texto);
    if (isNaN(f)) return "—";
    return f.getDate() + " " + MESES[f.getMonth()] + " · " + hora12(f.getHours() + ":" + String(f.getMinutes()).padStart(2, "0"));
  }

  function pintarUsuarios() {
    const tabla = $("usuarios-tabla");
    if (!tabla) return;
    const rol = $("us-rol").value;
    const q = $("us-buscar").value.trim().toLowerCase();
    const yo = (sessionStorage.getItem("currentUser") || "").toLowerCase();
    const lista = usuarios.filter((u) => (!rol || u.rol === rol) &&
      (!q || u.nombre_usuario.toLowerCase().includes(q) ||
        String(u.nombre_docente || u.nombre_estudiante || "").toLowerCase().includes(q)));
    if (!lista.length) return filaVacia(tabla, 5, usuarios.length ? "Nadie coincide con ese filtro." : "Aún no hay usuarios.");

    tabla.textContent = "";
    lista.forEach((u) => {
      const tr = el("tr");
      const tdU = el("td");
      tdU.appendChild(el("strong", null, u.nombre_docente || u.nombre_estudiante || u.nombre_usuario));
      if (u.nombre_docente || u.nombre_estudiante) tdU.appendChild(el("small", "ac-sub", u.nombre_usuario));
      tr.appendChild(tdU);
      tr.appendChild(el("td", null, ROLES[u.rol] || u.rol));
      tr.appendChild(el("td", null, fechaHora(u.fecha_ultima_sesion)));

      const tdE = el("td");
      tdE.appendChild(el("span", "badge " + (u.activo ? "b-ok" : "b-red"), u.activo ? "Activo" : "Desactivado"));
      if (u.activo && u.debe_cambiar_contrasena) {
        tdE.appendChild(document.createTextNode(" "));
        tdE.appendChild(el("span", "badge b-warn", "Clave temporal"));
      }
      tr.appendChild(tdE);

      const tdA = el("td", "ac-acciones");
      const esYo = u.nombre_usuario.toLowerCase() === yo;
      if (!esYo) {
        const clave = el("button", "btn sm", "Nueva contraseña");
        clave.type = "button";
        clave.addEventListener("click", () => restablecer(u));
        tdA.appendChild(clave);
        const estado = el("button", "btn sm" + (u.activo ? " peligro" : ""), u.activo ? "Desactivar" : "Activar");
        estado.type = "button";
        estado.addEventListener("click", () => cambiarActivo(u, !u.activo));
        tdA.appendChild(estado);
        if (u.rol !== "propietario") {
          const borrar = el("button", "btn sm peligro", "Eliminar");
          borrar.type = "button";
          borrar.addEventListener("click", () => eliminarUsuario(u));
          tdA.appendChild(borrar);
        }
      } else {
        tdA.appendChild(el("span", "ac-sub", "Tu cuenta"));
      }
      tr.appendChild(tdA);
      tabla.appendChild(tr);
    });
  }

  async function cargarUsuarios() {
    const tabla = $("usuarios-tabla");
    if (!tabla) return;
    try {
      usuarios = await api("/usuarios");
    } catch (e) {
      if (!$("usuarios-tabla")) return;   // la pestaña se quito: no es propietario
      return filaVacia(tabla, 5, e.message);
    }
    pintarUsuarios();
  }

  async function restablecer(u) {
    const nombre = u.nombre_docente || u.nombre_estudiante || u.nombre_usuario;
    if (!confirm("¿Generar una contraseña nueva para " + nombre + "?\nLa actual deja de funcionar y su sesión se cierra.")) return;
    try {
      const r = await api("/usuarios/" + u.id_usuario + "/restablecer-contrasena", "POST");
      mostrarCuenta($("us-resultado"), r, "✓ Contraseña nueva para " + nombre);
      $("us-resultado").scrollIntoView({ behavior: "smooth", block: "center" });
      cargarUsuarios();
    } catch (e) {
      alert(e.message);
    }
  }

  async function cambiarActivo(u, activo) {
    const nombre = u.nombre_docente || u.nombre_estudiante || u.nombre_usuario;
    const aviso = activo
      ? "¿Activar de nuevo la cuenta de " + nombre + "?"
      : "¿Desactivar la cuenta de " + nombre + "?\nNo podrá entrar" + (u.rol === "estudiante" ? " a la app" : " al panel") +
        " y su sesión se cierra de inmediato. Sus datos no se borran.";
    if (!confirm(aviso)) return;
    try {
      await api("/usuarios/" + u.id_usuario + "/activo", "PATCH", { activo });
      cargarUsuarios();
    } catch (e) {
      alert(e.message);
    }
  }

  async function eliminarUsuario(u) {
    const nombre = u.nombre_docente || u.nombre_estudiante || u.nombre_usuario;
    const queda = u.rol === "estudiante" ? "Su ficha, pagos, asistencias y simulacros se conservan"
      : u.rol === "profesor" ? "Su ficha de docente y sus clases se conservan" : "Sus registros se conservan";
    const escrito = prompt(
      "Vas a eliminar para siempre la cuenta de " + nombre + " (" + u.nombre_usuario + ").\n" +
      "Ya no podrá entrar. " + queda + ", y luego le puedes crear una cuenta nueva.\n\n" +
      "Si solo quieres bloquearla un tiempo, usa Desactivar.\n\n" +
      "Para confirmar escribe ELIMINAR:");
    if (escrito === null) return;
    if (escrito.trim().toUpperCase() !== "ELIMINAR") return alert("No se eliminó: no escribiste ELIMINAR.");
    try {
      await api("/usuarios/" + u.id_usuario, "DELETE");
      cargarUsuarios();
    } catch (e) {
      alert(e.message);
    }
  }

  function prepararUsuarios() {
    if (!$("usuarios-tabla")) return;
    $("us-rol").addEventListener("change", pintarUsuarios);
    $("us-buscar").addEventListener("input", pintarUsuarios);

    const form = $("form-usuario");
    const esDocente = () => $("nu-rol").value === "profesor";
    $("nu-rol").addEventListener("change", () => { $("nu-docente").hidden = !esDocente(); });
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      if (esDocente() && (!$("nu-nombre").value.trim() || !$("nu-doc").value.trim())) {
        return mensaje(form, "Del docente faltan el nombre o el documento.", "error");
      }
      const boton = form.querySelector('button[type="submit"]');
      boton.disabled = true;
      mensaje(form, "Creando…");
      try {
        const r = await api("/usuarios", "POST", sinVacios(Object.assign(
          { correo: $("nu-correo").value.trim(), rol: $("nu-rol").value },
          esDocente() ? {
            nombre_completo: $("nu-nombre").value.trim(),
            tipo_documento: $("nu-tipo").value,
            doc_identidad: $("nu-doc").value.trim(),
            especialidad: $("nu-esp").value.trim(),
            telefono: $("nu-tel").value.trim(),
          } : {}
        )));
        form.reset();
        $("nu-docente").hidden = false;
        mensaje(form, "", "");
        mostrarCuenta($("nu-resultado"), r, "✓ Cuenta creada (" + (ROLES[r.rol] || r.rol) + ")");
        cargarUsuarios();
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
      if (!esAdmin) {
        // Panel del profesor: entrar a Meet y escribir el tema de la clase
        if (c.enlace_reunion) {
          const meet = el("a", "btn sm", "Meet");
          meet.href = c.enlace_reunion;
          meet.target = "_blank";
          meet.rel = "noopener";
          tdB.appendChild(meet);
        }
        if (window.PreicmaEditar) {
          const tema = el("button", "btn sm", "Tema");
          tema.type = "button";
          tema.addEventListener("click", () => editarTemaClase(c));
          tdB.appendChild(tema);
        }
      }
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
    // El Resumen del profesor se arma con estas mismas clases
    document.dispatchEvent(new CustomEvent("preicma:clases", { detail: clases }));
  }

  function editarTemaClase(c) {
    window.PreicmaEditar.formulario({
      titulo: "Tema y enlace de la clase",
      sub: c.nombre_curso + " · " + c.nombre_grupo + " · " + fechaCorta(c.fecha_clase),
      campos: [
        { nombre: "tema", etiqueta: "Tema", valor: c.tema, maxlength: 150, placeholder: "Ej: Funciones y gráficas" },
        { nombre: "enlace_reunion", etiqueta: "Enlace de Meet", tipo: "url", valor: c.enlace_reunion, maxlength: 500,
          ayuda: "Si lo dejas vacío se usa el enlace fijo del grupo." },
      ],
      guardar: async (v) => (await api("/clases/" + c.id_clase, "PATCH", v)).mensaje,
      alGuardar: (texto) => { window.PreicmaEditar.aviso(texto); cargarClases(); },
    });
  }

  // Para el Resumen del profesor
  window.PreicmaAcademico = { abrirAsistencia: (id) => abrirAsistencia(id), recargarClases: () => cargarClases() };

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
    cargarTablaCursos();
    prepararFormCurso();
    prepararFormGrupo();
    prepararFormInscripcion();
    prepararFormCuenta();
    prepararUsuarios();
    cargarUsuarios();
    prepararFormPago();
    cargarCobros();
    cargarPagosRecientes();
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
      if (ruta === "/pagos") {
        if (cuerpo.referencia === "M1234567" && !cuerpo.confirmar_referencia_repetida) {
          const e = new Error("La referencia M1234567 ya se usó en un pago de Isabella Tirado del 31/10/2026.");
          e.codigo = "referencia_repetida";
          return Promise.reject(e);
        }
        return Promise.resolve({ estudiante: "Juan Pérez", saldo_restante: 400000 });
      }
      if (/\/restablecer-contrasena$/.test(ruta)) return Promise.resolve({ usuario: "juan@correo.com", contrasena_temporal: "Rt8kPq2mWx", aviso: "Entrega esta contraseña a la persona. No se vuelve a mostrar y deberá cambiarla al entrar." });
      if (ruta === "/usuarios") return Promise.resolve({ usuario: cuerpo.correo, rol: cuerpo.rol, contrasena_temporal: "Hm4tZq9pLa", aviso: "Entrega esta contraseña a la persona." });
      if (/\/activo$/.test(ruta)) return Promise.resolve({ activo: cuerpo.activo });
      if (metodo === "DELETE" && ruta.indexOf("/usuarios/") === 0) return Promise.resolve({ mensaje: "Cuenta eliminada" });
      if (ruta === "/cuentas-estudiante") return Promise.resolve(Object.assign({ estudiante: "Juan Pérez" }, cuenta));
      return Promise.resolve({ registros: (cuerpo && cuerpo.registros || []).length });
    }
    if (ruta === "/grupos") return Promise.resolve([
      { id_grupo: 1, valor_total: 600000, nombre_curso: "Pre-ICFES Cal. B", nombre_grupo: "Grupo 2", dia_semana: "martes", hora_inicio: "18:00:00", hora_fin: "20:00:00", docente: "Laura Gómez", inscritos: 3, capacidad_maxima: 40 },
      { id_grupo: 2, valor_total: 750000, nombre_curso: "Pre-ICFES Cal. A", nombre_grupo: "Sábado AM", dia_semana: "sabado", hora_inicio: "08:00:00", hora_fin: "11:00:00", docente: null, inscritos: 40, capacidad_maxima: 40 },
    ]);
    if (ruta === "/usuarios") return Promise.resolve([
      { id_usuario: 1, nombre_usuario: "dueno@prueba.com", rol: "propietario", activo: true, debe_cambiar_contrasena: false, fecha_ultima_sesion: new Date().toISOString() },
      { id_usuario: 2, nombre_usuario: "laura@preicma.space", rol: "profesor", activo: true, debe_cambiar_contrasena: false, fecha_ultima_sesion: "2026-11-01T18:05:00", nombre_docente: "Laura Gómez" },
      { id_usuario: 3, nombre_usuario: "juan@correo.com", rol: "estudiante", activo: true, debe_cambiar_contrasena: true, fecha_ultima_sesion: null, nombre_estudiante: "Juan Pérez" },
      { id_usuario: 4, nombre_usuario: "ana@correo.com", rol: "estudiante", activo: false, debe_cambiar_contrasena: false, fecha_ultima_sesion: "2026-10-20T08:30:00", nombre_estudiante: "Ana Ruiz" },
    ]);
    if (ruta === "/cuotas-por-cobrar") return Promise.resolve([
      { id_inscripcion: 11, numero_cuota: 2, numero_cuotas: 3, fecha_vencimiento: dia(-8), dias_mora: 8, estudiante: "Juan Pérez", doc_identidad: "1002223334", curso: "Pre-ICFES Cal. B", pendiente: 200000, acudiente: "María Gómez", telefono_acudiente: "3001112233" },
      { id_inscripcion: 12, numero_cuota: 1, numero_cuotas: 1, fecha_vencimiento: dia(4), dias_mora: -4, estudiante: "Ana Ruiz", doc_identidad: "1009998887", curso: "Taller de Inglés", pendiente: 250000, acudiente: null, telefono_estudiante: "NO REGISTRADO" },
    ]);
    if (ruta.indexOf("/pagos/buscar") === 0) return Promise.resolve([
      { id_inscripcion: 11, doc_identidad: "1002223334", estudiante: "Juan Pérez", curso: "Pre-ICFES Cal. B", nombre_grupo: "Grupo 2", saldo_pendiente: 600000, valor_en_mora: 200000 },
    ]);
    if (ruta === "/pagos/recientes") return Promise.resolve([
      { id_pago: 7, fecha_pago: dia(-1), estudiante: "Isabella Tirado", curso: "Pre-ICFES Cal. B", metodo_pago: "nequi_daviplata", referencia: "M1234567", descripcion: "cuota 1", monto_pagado: 200000, tiene_comprobante: true },
      { id_pago: 6, fecha_pago: dia(-3), estudiante: "Ana Ruiz", curso: "Taller de Inglés", metodo_pago: "efectivo", referencia: null, descripcion: null, monto_pagado: 100000, tiene_comprobante: false },
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
