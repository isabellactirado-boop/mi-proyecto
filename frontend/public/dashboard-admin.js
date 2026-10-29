
  // Nombre desde la sesión del login (si existe). No bloquea la vista previa.
  try {
    const u = sessionStorage.getItem("usuario");
    const r = sessionStorage.getItem("rol");
    if (u) {
      document.getElementById("uname").textContent = u;
      document.getElementById("hello").innerHTML = "Hola, <em></em>";
      document.querySelector("#hello em").textContent = u;
      document.getElementById("av").textContent = u.charAt(0).toUpperCase();
    }
    if (r) document.getElementById("urol").textContent = r.charAt(0).toUpperCase() + r.slice(1);
  } catch (e) {}
  const f = new Date().toLocaleDateString("es-CO", {weekday:"long", day:"numeric", month:"long", year:"numeric"});
  document.getElementById("today").textContent = f.charAt(0).toUpperCase() + f.slice(1);
