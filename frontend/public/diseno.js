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

  function contar(nodo) {
    const p = partes(nodo.textContent);
    if (!p || p.valor === 0 || reducido) return;
    const inicio = performance.now();
    const duracion = 900;
    nodo.dataset.animando = "1";
    function paso(t) {
      const avance = Math.min(1, (t - inicio) / duracion);
      const suave = 1 - Math.pow(1 - avance, 3);
      nodo.textContent = p.antes + Math.round(p.valor * suave).toLocaleString("es-CO") + p.despues;
      if (avance < 1) requestAnimationFrame(paso);
      else delete nodo.dataset.animando;
    }
    requestAnimationFrame(paso);
  }

  function observarKpis() {
    document.querySelectorAll(".kpi strong").forEach((nodo) => {
      new MutationObserver(() => {
        if (nodo.dataset.animando) return;   // cambios hechos por la propia animacion
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

  document.addEventListener("DOMContentLoaded", () => {
    saludar();
    observarKpis();
    observarPendientes();
  });
})();
