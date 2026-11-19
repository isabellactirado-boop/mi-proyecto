/* =====================================================================
   config.js - direccion del backend para todo el panel web.
   Si el backend cambia de direccion, se cambia SOLO aqui.
   (La app del celular tiene su propia linea en app/app.js, porque el APK
   se arma solo con la carpeta app/ y no puede leer este archivo.)
   ===================================================================== */
window.PREICMA_API = "https://preicma.onrender.com";

/* ---------------------------------------------------------------------
   Aviso de "servidor despertando" y errores de conexion en español.
   Render (plan gratis) apaga el backend cuando nadie lo usa y la primera
   peticion puede tardar casi un minuto. Todas las paginas del panel piden
   datos con fetch(), asi que aqui se vigila cada peticion al backend:
   - si tarda mas de 4 s, aparece un aviso abajo explicando la espera;
   - si no hay conexion, el error dice que paso (en vez de "Failed to fetch").
   --------------------------------------------------------------------- */
(function () {
  const fetchOriginal = window.fetch.bind(window);
  const ESPERA_AVISO = 4000;
  let pendientes = 0;
  let reloj = null;
  let aviso = null;

  function mostrarAviso() {
    if (!aviso) {
      aviso = document.createElement("div");
      aviso.setAttribute("role", "status");
      aviso.style.cssText =
        "position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:1000;" +
        "max-width:calc(100% - 32px);padding:10px 18px;border-radius:99px;" +
        "background:#1a1f36;color:#fff;font:500 .88rem 'DM Sans',sans-serif;" +
        "box-shadow:4px 4px 0 #ffd23f;text-align:center";
      aviso.textContent = "Despertando el servidor… la primera carga puede tardar hasta un minuto.";
    }
    if (!aviso.isConnected && document.body) document.body.appendChild(aviso);
  }

  function quitarAviso() {
    if (aviso && aviso.isConnected) aviso.remove();
  }

  window.fetch = function (recurso, opciones) {
    const url = typeof recurso === "string" ? recurso : (recurso && recurso.url) || "";
    if (url.indexOf(window.PREICMA_API) !== 0) return fetchOriginal(recurso, opciones);

    pendientes++;
    if (!reloj) reloj = setTimeout(mostrarAviso, ESPERA_AVISO);

    return fetchOriginal(recurso, opciones)
      .catch(() => {
        throw new Error("No se pudo conectar con el servidor. Revisa tu internet e intenta de nuevo.");
      })
      .finally(() => {
        pendientes--;
        if (pendientes === 0) {
          clearTimeout(reloj);
          reloj = null;
          quitarAviso();
        }
      });
  };
})();
