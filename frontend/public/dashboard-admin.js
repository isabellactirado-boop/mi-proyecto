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
    cajaComprobante.style.display = (metodo === 'nequi' || metodo === 'transferencia') ? 'block' : 'none';
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
 * Generar reporte imprimible/PDF del estudiante
 */
function generarInformePDF(nombre, doc, grupo, acudiente, tel, email, estado, asistencia, mora, puntaje) {
  const printWindow = window.open('', '_blank');
  
  const htmlContent = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Reporte Académico - ${nombre}</title>
      <style>
        body { font-family: Arial, sans-serif; color: #1a1240; padding: 30px; line-height: 1.5; }
        .header { border-bottom: 3px solid #1a1240; padding-bottom: 15px; margin-bottom: 25px; display: flex; justify-content: space-between; }
        .header h1 { margin: 0; font-size: 22px; }
        .badge { background: #ffd23f; padding: 5px 12px; border-radius: 20px; font-weight: bold; font-size: 11px; border: 1.5px solid #1a1240; }
        .section { background: #f6f1e7; border: 2px solid #1a1240; border-radius: 10px; padding: 15px; margin-bottom: 15px; }
        .section h2 { font-size: 15px; margin-top: 0; border-bottom: 1px solid #1a1240; padding-bottom: 5px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px; }
        .footer { margin-top: 30px; text-align: center; font-size: 11px; color: #6b6790; }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <h1>PRE-ICMA | Reporte Docente</h1>
          <p>Seguimiento de Rendimiento y Asistencia</p>
        </div>
        <span class="badge">ESTUDIANTE ACTIVO</span>
      </div>
      <div class="section">
        <h2>Datos del Alumno</h2>
        <div class="grid">
          <div><strong>Nombre:</strong> ${nombre}</div>
          <div><strong>Documento:</strong> ${doc}</div>
          <div><strong>Grupo:</strong> ${grupo}</div>
          <div><strong>Asistencia:</strong> ${asistencia}</div>
        </div>
      </div>
      <div class="section">
        <h2>Contacto del Acudiente</h2>
        <div class="grid">
          <div><strong>Acudiente:</strong> ${acudiente}</div>
          <div><strong>Teléfono:</strong> ${tel}</div>
        </div>
      </div>
      <div class="section">
        <h2>Desempeño Académico</h2>
        <div class="grid">
          <div><strong>Puntaje Simulacro:</strong> ${puntaje}</div>
        </div>
      </div>
      <div class="footer">Generado desde el Portal Docente PRE-ICMA.</div>
      <script>window.onload = function() { window.print(); }</script>
    </body>
    </html>
  `;
  printWindow.document.write(htmlContent);
  printWindow.document.close();
}

/**
 * Cerrar sesión
 */
function logout() {
  sessionStorage.clear();
  window.location.replace('index.html');
}