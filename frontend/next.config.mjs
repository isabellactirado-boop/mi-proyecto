// Paginas del panel (archivos .html de public/) y la direccion limpia con
// la que se ven en el navegador: /login en vez de /index.html, etc.
const PAGINAS = {
  login: "index",
  "dashboard-admin": "dashboard-admin",
  "dashboard-docente": "dashboard-docente",
  "cambiar-contrasena": "cambiar-contrasena",
  modulos: "modulos",
};

/** @type {import('next').NextConfig} */
const nextConfig = {
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
