// Paginas del panel (archivos .html de public/) y la direccion limpia con
// la que se ven en el navegador: /login en vez de /index.html, etc.
const PAGINAS = {
  login: "index",
  "dashboard-admin": "dashboard-admin",
  "dashboard-docente": "dashboard-docente",
  "cambiar-contrasena": "cambiar-contrasena",
  modulos: "modulos",
};

// ---------------------------------------------------------------------
// Cabeceras de seguridad para todas las paginas del sitio.
// ---------------------------------------------------------------------
const API = "https://preicma.onrender.com"; // el mismo de public/config.js
const enDesarrollo = process.env.NODE_ENV !== "production";

// Que puede cargar cada pagina (CSP). Lo que no esta aqui se bloquea.
// 'unsafe-inline' en scripts: los paneles usan onclick="..." y un <script>
// corto en el HTML. El resto igual protege: no se pueden cargar scripts de
// otros sitios, ni meter la pagina en un iframe, ni enviar datos a otro lado.
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${enDesarrollo ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  `connect-src 'self' ${API}${enDesarrollo ? " http://localhost:8000 ws:" : ""}`,
  "frame-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const CABECERAS_SEGURIDAD = [
  { key: "Content-Security-Policy", value: CSP },
  // Nadie puede mostrar el panel dentro de su pagina (evita clickjacking)
  { key: "X-Frame-Options", value: "DENY" },
  // El navegador no adivina el tipo de archivo
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Al abrir enlaces externos no se envia la direccion completa del panel
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // El sitio no usa camara, microfono ni ubicacion
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: CABECERAS_SEGURIDAD }];
  },
  /* config options here */
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async redirects() {
    return [
      { source: "/", destination: "/login", permanent: false },
      // Las direcciones viejas con .html (enlaces guardados y los que usa el
      // propio panel) llevan a la direccion limpia.
      ...Object.entries(PAGINAS).map(([limpia, archivo]) => ({
        source: `/${archivo}.html`,
        destination: `/${limpia}`,
        permanent: false,
      })),
      // enlace corto para estudiantes (iPhone y cualquier navegador)
      { source: "/app", destination: "/app/index.html", permanent: false },
    ];
  },
  async rewrites() {
    // La direccion limpia muestra el archivo .html sin cambiar lo que se ve arriba
    return Object.entries(PAGINAS).map(([limpia, archivo]) => ({
      source: `/${limpia}`,
      destination: `/${archivo}.html`,
    }));
  },
};

export default nextConfig;
