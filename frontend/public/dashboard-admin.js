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

  // Mostrar u ocultar los botones de acción según el menú (solo visible en Resumen)
  const heroActions = document.getElementById('hero-actions');
  if (heroActions) {
    if (tabId === 'resumen') {
      heroActions.style.display = 'flex';
    } else {
      heroActions.style.display = 'none';
    }
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

  if (valorSeleccionado === 'nequi' || valorSeleccionado === 'transferencia') {
    seccionComprobante.style.display = 'block';
  } else {
    seccionComprobante.style.display = 'none';
  }
}

/**
 * Genera e imprime un reporte completo en PDF con los datos del estudiante
 */
function generarInformePDF(nombre, doc, grupo, acudiente, tel, email, estado, asistencia, mora, puntaje) {
  const printWindow = window.open('', '_blank');
  
  const htmlContent = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Ficha Espacial del Estudiante - ${nombre}</title>
      <style>
        body {
          font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
          color: #1a1240;
          padding: 30px;
          line-height: 1.5;
        }
        .header {
          border-bottom: 3px solid #1a1240;
          padding-bottom: 15px;
          margin-bottom: 25px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .header h1 {
          margin: 0;
          font-size: 24px;
          color: #1a1240;
        }
        .header p {
          margin: 4px 0 0 0;
          color: #6b6790;
          font-weight: bold;
        }
        .badge {
          background: #ffd23f;
          padding: 6px 14px;
          border-radius: 20px;
          font-weight: bold;
          font-size: 12px;
          border: 1.5px solid #1a1240;
        }
        .section {
          background: #f6f1e7;
          border: 2px solid #1a1240;
          border-radius: 12px;
          padding: 18px;
          margin-bottom: 20px;
        }
        .section h2 {
          font-size: 16px;
          margin-top: 0;
          margin-bottom: 12px;
          border-bottom: 1.5px solid #1a1240;
          padding-bottom: 6px;
        }
        .grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .data-item {
          font-size: 14px;
        }
        .data-item strong {
          color: #1a1240;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 10px;
        }
        th, td {
          border: 1px solid #1a1240;
          padding: 8px 12px;
          text-align: left;
          font-size: 13px;
        }
        th {
          background: #ffd23f;
        }
        .footer {
          margin-top: 40px;
          text-align: center;
          font-size: 11px;
          color: #6b6790;
          border-top: 1px solid #e2d9c4;
          padding-top: 15px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <h1>PRE-ICMA | Centro de Misión</h1>
          <p>Informe Oficial de Seguimiento del Estudiante</p>
        </div>
        <span class="badge">ESTADO: ${estado.toUpperCase()}</span>
      </div>

      <div class="section">
        <h2>1. Información del Astronauta (Estudiante)</h2>
        <div class="grid">
          <div class="data-item"><strong>Nombre Completo:</strong> ${nombre}</div>
          <div class="data-item"><strong>Documento de Identidad:</strong> ${doc}</div>
          <div class="data-item"><strong>Grupo / Jornada:</strong> ${grupo}</div>
          <div class="data-item"><strong>Asistencia General:</strong> ${asistencia}</div>
        </div>
      </div>

      <div class="section">
        <h2>2. Datos de Contacto y Acudiente</h2>
        <div class="grid">
          <div class="data-item"><strong>Nombre del Acudiente:</strong> ${acudiente}</div>
          <div class="data-item"><strong>Teléfono / WhatsApp:</strong> ${tel}</div>
          <div class="data-item"><strong>Correo Electrónico:</strong> ${email}</div>
          <div class="data-item"><strong>Estado Financiero:</strong> ${mora === '$ 0' ? 'Al día' : 'Pendiente: ' + mora}</div>
        </div>
      </div>

      <div class="section">
        <h2>3. Registro de Clases e Ingressos Recientes</h2>
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Materia / Modulo</th>
              <th>Docente</th>
              <th>Asistencia</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Sábado anterior</td>
              <td>Lectura Crítica</td>
              <td>Prof. Daniel Castro</td>
              <td>Presente</td>
            </tr>
            <tr>
              <td>Hace 2 semanas</td>
              <td>Matemáticas</td>
              <td>Prof. Andrea Ruiz</td>
              <td>Presente</td>
            </tr>
            <tr>
              <td>Hace 3 semanas</td>
              <td>Ciencias Naturales</td>
              <td>Prof. Sofía Mejía</td>
              <td>Presente</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="section">
        <h2>4. Desempeño Académico e ICFES</h2>
        <div class="grid">
          <div class="data-item"><strong>Último Puntaje Simulacro:</strong> ${puntaje}</div>
          <div class="data-item"><strong>Nivel Global:</strong> Avanzado</div>
        </div>
      </div>

      <div class="footer">
        Este documento fue generado automáticamente desde la plataforma de administración PRE-ICMA.
      </div>

      <script>
        window.onload = function() {
          window.print();
        };
      </script>
    </body>
    </html>
  `;

  printWindow.document.write(htmlContent);
  printWindow.document.close();
}

/**
  * Función para el botón de cerrar sesión
  */
function logout() {
  sessionStorage.clear();
  window.location.replace('index.html');
}