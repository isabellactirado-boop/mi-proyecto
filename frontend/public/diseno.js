/* =====================================================================
   diseno.js - detalles visuales del panel. No pide datos: observa lo que
   pintan api.js y academico.js y lo anima.
   - Saludo segun la hora y nombre legible en vez del correo.
   - Los numeros de las tarjetas cuentan hacia arriba al llegar.
   - "Pendientes de hoy": los que estan en 0 se ven apagados.
   - La tarjeta de mora se marca solo si hay cuotas en mora.
   ===================================================================== */

(function () {
  const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- saludo ---------- */

  function nombreLegible(texto) {         // "dueno.prueba@x.com" -> "Dueno"
    const base = String(texto || "").split("@")[0].split(/[._-]/)[0];
    return base ? base.charAt(0).toUpperCase() + base.slice(1) : texto;
  }

  function saludar() {
    const h = new Date().getHours();
    const saludo = document.getElementById("saludo-hora");
    if (saludo) saludo.textContent = h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
    const nombre = document.getElementById("display-user");
    if (nombre && nombre.textContent.includes("@")) nombre.textContent = nombreLegible(nombre.textContent);
  }

  /* ---------- numeros que cuentan ---------- */

  // "$ 3.050.000" -> { antes: "$ ", valor: 3050000, despues: "" }
  function partes(texto) {
    const m = String(texto).match(/^(\D*?)(\d{1,3}(?:\.\d{3})+|\d+)(\D*)$/);
    if (!m) return null;
    return { antes: m[1], valor: Number(m[2].replace(/\./g, "")), despues: m[3] };
  }

  // Guarda el ultimo texto que escribio la animacion: el observador lo ignora.
  // (El aviso del observador llega despues del cambio, asi que una marca que se
  // borra al terminar no sirve: el ultimo cuadro volvia a arrancar el conteo.)
  const escrito = new WeakMap();

  function contar(nodo) {
    const final = nodo.textContent;
    const p = partes(final);
    if (!p || p.valor === 0 || reducido) return;
    const inicio = performance.now();
    const duracion = 900;
    function paso(t) {
      if (nodo.dataset.objetivo !== final) return;  // llego un valor nuevo: esta animacion se detiene
      const avance = Math.min(1, (t - inicio) / duracion);
      const suave = 1 - Math.pow(1 - avance, 3);
      const texto = avance < 1 ? p.antes + Math.round(p.valor * suave).toLocaleString("es-CO") + p.despues : final;
      escrito.set(nodo, texto);
      nodo.textContent = texto;
      if (avance < 1) requestAnimationFrame(paso);
    }
    nodo.dataset.objetivo = final;
    requestAnimationFrame(paso);
  }

  function observarKpis() {
    document.querySelectorAll(".kpi strong").forEach((nodo) => {
      new MutationObserver(() => {
        if (nodo.textContent === escrito.get(nodo)) return;   // lo escribio la propia animacion
        const kpi = nodo.closest(".kpi");
        if (kpi.classList.contains("bad")) {
          const p = partes(nodo.textContent);
          kpi.classList.toggle("activo", !!p && p.valor > 0);
        }
        contar(nodo);
      }).observe(nodo, { childList: true, characterData: true, subtree: true });
    });
  }

  /* ---------- pendientes en cero ---------- */

  function observarPendientes() {
    document.querySelectorAll(".todo .n").forEach((nodo) => {
      const revisar = () => nodo.classList.toggle("cero", nodo.textContent.trim() === "0" || nodo.textContent.trim() === "—");
      revisar();
      new MutationObserver(revisar).observe(nodo, { childList: true, characterData: true, subtree: true });
    });
  }

  /* ---------- accesos del propietario (CEO) ---------- */

  // Abre la app de estudiantes con la misma sesion (la app la guarda en localStorage)
  window.abrirApp = function (evento) {
    if (evento) evento.preventDefault();
    try {
      localStorage.setItem("token", sessionStorage.getItem("token"));
      localStorage.setItem("rol", "propietario");
    } catch (e) { /* sin almacenamiento: la app pedira iniciar sesion */ }
    window.open("app/index.html?desde=panel", "_blank");
  };

  function accesosDueno() {
    if (sessionStorage.getItem("rol") !== "propietario") return;
    document.querySelectorAll(".solo-dueno").forEach((el) => { el.hidden = false; });
  }

  document.addEventListener("DOMContentLoaded", () => {
    accesosDueno();
    saludar();
    observarKpis();
    observarPendientes();
  });
})();
