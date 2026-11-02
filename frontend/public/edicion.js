/* =====================================================================
   edicion.js - ventanas para editar y corregir datos.
   - PreicmaEditar.formulario({...}): ventana con un formulario. Llama a
     `guardar(valores)`; si falla, muestra el error sin cerrar.
   - PreicmaEditar.confirmar({...}): ventana de "¿Seguro?".
   - PreicmaEditar.api(ruta, metodo, cuerpo): peticion con el token.
   - PreicmaEditar.puede(permiso) / esAdmin(): para mostrar u ocultar botones
     (el backend igual revisa los permisos).
   La usan api.js (Detalles del estudiante) y academico.js (grupos, cursos, pagos).
   ===================================================================== */

(function () {
  const API = window.PREICMA_API;   // se define en config.js
  const DEMO = new URLSearchParams(location.search).has("demo");

  async function api(ruta, metodo, cuerpo) {
    if (DEMO) { console.info("[demo]", metodo, ruta, cuerpo); return { mensaje: "ok" }; }
    const token = sessionStorage.getItem("token");
    if (!token) { window.location.replace("index.html"); throw new Error("Sin sesion"); }
    const r = await fetch(API + ruta, {
      method: metodo || "GET",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    if (r.status === 401) { sessionStorage.clear(); window.location.replace("index.html"); throw new Error("Sesion vencida"); }
    let datos = null;
    try { datos = await r.json(); } catch (e) { /* sin cuerpo */ }
    if (!r.ok) {
      let d = datos && datos.detail;
      if (Array.isArray(d)) d = "Revisa los datos: " + d.map((x) => (x.loc || []).slice(-1)[0]).filter(Boolean).join(", ");
      else if (d && typeof d === "object") d = d.mensaje;
      throw new Error(d || (r.status === 403 ? "No tienes permiso para hacer esto" : "Error " + r.status));
    }
    return datos;
  }

  /* ---------- permisos (los llena api.js con /yo) ---------- */

  let permisos = null;
  function rol() { return sessionStorage.getItem("rol"); }
  function esAdmin() { return rol() === "propietario" || rol() === "administrador"; }
  function puede(permiso) { return permisos ? permisos.indexOf(permiso) !== -1 : esAdmin(); }

  /* ---------- ventana base ---------- */

  function el(tag, clase, texto) {
    const n = document.createElement(tag);
    if (clase) n.className = clase;
    if (texto !== undefined && texto !== null) n.textContent = texto;
    return n;
  }

  let abierta = null;
  function cerrar() { if (abierta) { abierta.remove(); abierta = null; } }
  // En captura sobre window: Escape cierra solo esta ventana, no la de Detalles que queda debajo
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && abierta) { e.stopPropagation(); cerrar(); }
  }, true);

  function ventana(titulo, sub) {
    cerrar();
    const fondo = el("div", "ac-modal ed-modal");
    const caja = el("div", "ac-caja ed-caja");
    caja.setAttribute("role", "dialog");
    caja.setAttribute("aria-modal", "true");
    const top = el("div", "ac-m-top");
    const txt = el("div");
    txt.appendChild(el("h3", null, titulo));
    if (sub) txt.appendChild(el("p", null, sub));
    top.appendChild(txt);
    const x = el("button", "ac-cerrar", "×");
    x.type = "button";
    x.setAttribute("aria-label", "Cerrar");
    x.addEventListener("click", cerrar);
    top.appendChild(x);
    caja.appendChild(top);
    fondo.appendChild(caja);
    fondo.addEventListener("click", (e) => { if (e.target === fondo) cerrar(); });
    document.body.appendChild(fondo);
    abierta = fondo;
    return caja;
  }

  /* ---------- formulario ----------
     campos: [{ nombre, etiqueta, tipo: text|email|tel|date|time|number|url|select|textarea|check,
                valor, opciones: [[valor, texto]], requerido, min, max, maxlength, ayuda, ancho: "medio" }] */
  function formulario(cfg) {
    const caja = ventana(cfg.titulo, cfg.sub);
    const form = el("form", "space-form ac-form ed-form");
    form.noValidate = false;
    if (cfg.aviso) form.appendChild(el("p", "ed-aviso", cfg.aviso));
    const rejilla = el("div", "ed-rejilla");
    const entradas = {};

    cfg.campos.forEach((c, i) => {
      const id = "ed-" + c.nombre + "-" + i;
      const caja1 = el("div", "ed-campo" + (c.ancho === "medio" ? " medio" : ""));
      let input;
      if (c.tipo === "check") {
        const lab = el("label", "ed-check");
        input = el("input");
        input.type = "checkbox";
        input.id = id;
        input.checked = !!c.valor;
        lab.appendChild(input);
        lab.appendChild(el("span", null, c.etiqueta));
        caja1.appendChild(lab);
      } else {
        const lab = el("label", null, c.etiqueta + (c.requerido ? "" : " (opcional)"));
        lab.htmlFor = id;
        caja1.appendChild(lab);
        if (c.tipo === "select") {
          input = el("select", "input-space");
          (c.opciones || []).forEach(([v, t]) => { const o = el("option", null, t); o.value = v; input.appendChild(o); });
        } else if (c.tipo === "textarea") {
          input = el("textarea", "input-space");
          input.rows = 3;
        } else {
          input = el("input", "input-space");
          input.type = c.tipo || "text";
          if (c.tipo === "number") input.step = c.paso || "1";
        }
        input.id = id;
        if (c.valor !== null && c.valor !== undefined) input.value = c.valor;
        if (c.requerido) input.required = true;
        if (c.min !== undefined) input.min = c.min;
        if (c.max !== undefined) input.max = c.max;
        if (c.maxlength) input.maxLength = c.maxlength;
        if (c.placeholder) input.placeholder = c.placeholder;
        caja1.appendChild(input);
      }
      if (c.ayuda) caja1.appendChild(el("small", "note", c.ayuda));
      entradas[c.nombre] = { input, campo: c };
      rejilla.appendChild(caja1);
    });
    form.appendChild(rejilla);

    const msg = el("p", "ac-msg");
    msg.setAttribute("role", "status");
    form.appendChild(msg);
    const botones = el("div", "ed-botones");
    const cancelar = el("button", "btn", "Cancelar");
    cancelar.type = "button";
    cancelar.addEventListener("click", cerrar);
    const ok = el("button", "btn main", cfg.textoBoton || "Guardar cambios");
    ok.type = "submit";
    botones.appendChild(cancelar);
    botones.appendChild(ok);
    form.appendChild(botones);

    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const valores = {};
      Object.keys(entradas).forEach((k) => {
        const { input, campo } = entradas[k];
        if (campo.tipo === "check") valores[k] = input.checked;
        else if (campo.tipo === "number") valores[k] = input.value === "" ? null : Number(input.value);
        else { const v = input.value.trim(); valores[k] = v === "" ? null : v; }
      });
      ok.disabled = true;
      msg.className = "ac-msg";
      msg.textContent = "Guardando…";
      try {
        const texto = await cfg.guardar(valores);
        cerrar();
        if (cfg.alGuardar) cfg.alGuardar(texto);
      } catch (e) {
        msg.className = "ac-msg error";
        msg.textContent = e.message;
        ok.disabled = false;
      }
    });

    caja.appendChild(form);
    const primero = form.querySelector("input:not([type=checkbox]),select,textarea");
    if (primero) primero.focus();
  }

  /* ---------- confirmar ---------- */
  function confirmar(cfg) {
    const caja = ventana(cfg.titulo, null);
    caja.classList.add("ed-confirmar");
    caja.appendChild(el("p", "ed-texto", cfg.texto));
    const msg = el("p", "ac-msg");
    msg.setAttribute("role", "status");
    caja.appendChild(msg);
    const botones = el("div", "ed-botones");
    const cancelar = el("button", "btn", "Cancelar");
    cancelar.type = "button";
    cancelar.addEventListener("click", cerrar);
    const ok = el("button", "btn main" + (cfg.peligro ? " ed-peligro" : ""), cfg.textoBoton || "Sí, continuar");
    ok.type = "button";
    ok.addEventListener("click", async () => {
      ok.disabled = true;
      msg.className = "ac-msg";
      msg.textContent = "Un momento…";
      try {
        const r = await cfg.aceptar();
        cerrar();
        if (cfg.alTerminar) cfg.alTerminar(r);
      } catch (e) {
        msg.className = "ac-msg error";
        msg.textContent = e.message;
        ok.disabled = false;
      }
    });
    if (!cfg.soloAceptar) botones.appendChild(cancelar);
    botones.appendChild(ok);
    caja.appendChild(botones);
    ok.focus();
  }

  /* ---------- aviso corto (abajo a la derecha) ---------- */
  function aviso(texto) {
    const t = el("div", "ed-toast", texto);
    t.setAttribute("role", "status");
    document.body.appendChild(t);
    setTimeout(() => t.classList.add("fuera"), 2600);
    setTimeout(() => t.remove(), 3100);
  }

  window.PreicmaEditar = {
    api, formulario, confirmar, aviso, cerrar, esAdmin, puede,
    ponerPermisos(lista) { permisos = lista; },
  };
})();
