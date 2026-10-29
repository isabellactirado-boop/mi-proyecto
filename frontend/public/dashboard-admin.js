// 1. Manejo del nombre de usuario y la fecha actual en el panel
document.addEventListener('DOMContentLoaded', () => {
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
  const todayElement = document.getElementById("today");
  if (todayElement) {
    todayElement.textContent = f.charAt(0).toUpperCase() + f.slice(1);
  }

  // 2. Gestión segura del botón de Cerrar Sesión
  const btnLogout = document.querySelector('.logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', (e) => {
      e.preventDefault(); // Evita que recargue mal o navegue por defecto
      
      // Borramos las credenciales y la bandera de sesión del navegador
      localStorage.removeItem('isLoggedIn');
      
      try {
        sessionStorage.clear();
      } catch (err) {}

      // Redirigimos de forma limpia al login y evitamos bucles hacia atrás
      window.location.replace('index.html');
    });
  }
});