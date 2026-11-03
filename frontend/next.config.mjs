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
      { source: "/", destination: "/index.html", permanent: false },
      // enlace corto para estudiantes (iPhone y cualquier navegador)
      { source: "/app", destination: "/app/index.html", permanent: false },    ];
  },
};

export default nextConfig;