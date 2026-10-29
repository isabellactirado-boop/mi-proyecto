document.addEventListener('DOMContentLoaded', () => {
  // 1. Mostrar la fecha actual con formato amigable
  const todayElement = document.getElementById('today');
  if (todayElement) {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const now = new Date();
    const formattedDate = now.toLocaleDateString('es-ES', options);
    todayElement.textContent = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);
  }

  // 2. Cargar usuario dinámico desde sessionStorage
  const activeUser = sessionStorage.getItem('currentUser') || 'Administrador';
  
  const displayUser = document.getElementById('display-user');
  if (displayUser) displayUser.textContent = activeUser;

  const uname = document.getElementById('uname');
  if (uname) uname.textContent = activeUser;

  const av = document.getElementById('av');
  if (av && activeUser) av.textContent = activeUser.charAt(0).toUpperCase();

  const tableUserEmail = document.getElementById('table-user-email');
  if (tableUserEmail) tableUserEmail.textContent = activeUser;
});

/**
  * Función principal para alternar vistas (pestañas)
  * @param {string} tabId Id del módulo a mostrar ('resumen', 'estudiantes', etc.)
  */
function switchTab(tabId) {
  // Ocultar todas las secciones
  const tabs = document.querySelectorAll('.tab-content');
  tabs.forEach(tab => tab.classList.remove('active'));

  // Desmarcar todos los botones del menú lateral
  const navLinks = document.querySelectorAll('.nav a');
  navLinks.forEach(link => link.classList.remove('on'));

  // Activar la vista correspondiente
  const selectedTab = document.getElementById(`tab-${tabId}`);
  if (selectedTab) {
    selectedTab.classList.add('active');
  }

  // Marcar como activo el elemento clicado en el sidebar
  const activeLink = Array.from(navLinks).find(link => 
    link.getAttribute('onclick') && link.getAttribute('onclick').includes(tabId)
  );
  if (activeLink) {
    activeLink.classList.add('on');
  }
}

/**
 * Muestra u oculta el campo de adjuntar comprobante según el método de pago seleccionado
 */
function toggleComprobante() {
  const selectMetodo = document.getElementById('metodo-pago');
  const seccionComprobante = document.getElementById('seccion-comprobante');
  
  if (!selectMetodo || !seccionComprobante) return;

  const valorSeleccionado = selectMetodo.value;

  // Si escogen Nequi, Daviplata o Transferencia, mostramos el campo
  if (valorSeleccionado === 'nequi' || valorSeleccionado === 'transferencia') {
    seccionComprobante.style.display = 'block';
  } else {
    // Si es efectivo, lo ocultamos
    seccionComprobante.style.display = 'none';
  }
}

/**
  * Función para el botón de cerrar sesión
  */
function logout() {
  sessionStorage.clear();
  window.location.replace('index.html');
}