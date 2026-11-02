document.addEventListener('DOMContentLoaded', () => {
  // 1. Mostrar la fecha actual
  const todayElement = document.getElementById('today');
  if (todayElement) {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const now = new Date();
    const formattedDate = now.toLocaleDateString('es-ES', options);
    todayElement.textContent = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);
  }

  // 2. Cargar datos del usuario
  const activeUser = sessionStorage.getItem('currentUser') || 'Administrador';
  
  const displayUser = document.getElementById('display-user');
  if (displayUser) displayUser.textContent = activeUser;

  const uname = document.getElementById('uname');
  if (uname) uname.textContent = activeUser;

  const av = document.getElementById('av');
  if (av && activeUser) av.textContent = activeUser.charAt(0).toUpperCase();
});

/**
 * Alternar pestañas del panel
 */
function switchTab(tabId) {
  const tabs = document.querySelectorAll('.tab-content');
  tabs.forEach(tab => tab.classList.remove('active'));

  const navLinks = document.querySelectorAll('.nav a');
  navLinks.forEach(link => link.classList.remove('on'));

  const selectedTab = document.getElementById(`tab-${tabId}`);
  if (selectedTab) {
    selectedTab.classList.add('active');
  }

  const activeLink = Array.from(navLinks).find(link => 
    link.getAttribute('onclick') && link.getAttribute('onclick').includes(tabId)
  );
  if (activeLink) {
    activeLink.classList.add('on');
  }

  const heroActions = document.getElementById('hero-actions');
  if (heroActions) {
    heroActions.style.display = (tabId === 'resumen') ? 'flex' : 'none';
  }
}

/**
 * Mostrar/Ocultar campo de comprobante según método de pago
 */
function toggleComprobante() {
  const metodo = document.getElementById('metodo-pago').value;
  const cajaComprobante = document.getElementById('seccion-comprobante');
  if (cajaComprobante) {
    cajaComprobante.style.display = (metodo === 'nequi_daviplata' || metodo === 'transferencia') ? 'block' : 'none';
  }
}

/**
 * Filtro en tiempo real para la tabla de estudiantes
 */
function filtrarTablaEstudiantes() {
  const input = document.getElementById('searchInput');
  const filter = input.value.toLowerCase();
  const table = document.getElementById('tablaEstudiantes');
  const tr = table.getElementsByTagName('tr');

  for (let i = 1; i < tr.length; i++) {
    let tdDoc = tr[i].getElementsByTagName('td')[0];
    let tdName = tr[i].getElementsByTagName('td')[1];
    if (tdDoc || tdName) {
      let txtDoc = tdDoc.textContent || tdDoc.innerText;
      let txtName = tdName.textContent || tdName.innerText;
      if (txtDoc.toLowerCase().indexOf(filter) > -1 || txtName.toLowerCase().indexOf(filter) > -1) {
        tr[i].style.display = "";
      } else {
        tr[i].style.display = "none";
      }
    }
  }
}

/**
 * Cerrar sesión
 */
function logout() {
  sessionStorage.clear();
  window.location.replace('index.html');
}