"use client";

import { useEffect, useState } from "react";

export default function Home() {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch("http://localhost:8000/")
      .then((res) => res.json())
      .then((data) => setDatos(data))
      .catch(() => setError("No pude conectar con el backend"));
  }, []);

  return (
    <main className="p-10">
      <h1 className="text-2xl font-bold">Frontend conectado al backend</h1>
      {error && <p className="text-red-600">{error}</p>}
      {datos && <pre>{JSON.stringify(datos, null, 2)}</pre>}
    </main>
  );
}