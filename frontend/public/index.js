
// Dirección del backend en Render
const API_URL = "https://preicma.onrender.com";

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("form-login");
    const boton = document.getElementById("btn-login");
    const mensaje = document.getElementById("mensaje");

    function mostrar(texto, tipo) {
        mensaje.textContent = texto;
        mensaje.className = "mensaje " + tipo;
    }

    if (form) {
        form.addEventListener("submit", async (evento) => {
            evento.preventDefault();

            const correo = document.getElementById("correo").value;
            const contrasena = document.getElementById("contrasena").value;

            boton.disabled = true;
            mostrar("Verificando... (si el servidor estaba dormido, puede tardar unos segundos)", "info");

            try {
                const respuesta = await fetch(API_URL + "/login", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ correo: correo, contrasena: contrasena })
                });

                if (respuesta.ok) {
                    const datos = await respuesta.json();
                    mostrar("¡Bienvenida! Entrando al panel...", "ok");

                    // Guardamos la sesión en sessionStorage (se borra al cerrar la pestaña)
                    sessionStorage.setItem('isLoggedIn', 'true');
                    sessionStorage.setItem("usuario", datos.usuario);
                    sessionStorage.setItem("rol", datos.rol);

                    setTimeout(() => {
                        if (datos.rol === "administrador") {
                            window.location.href = "dashboard-admin.html";
                        } else {
                            window.location.href = "dashboard.html";
                        }
                    }, 800);
                } else if (respuesta.status === 401) {
                    mostrar("Correo o contraseña incorrectos", "error");
                } else {
                    mostrar("Error del servidor (" + respuesta.status + ")", "error");
                }
            } catch (error) {
                mostrar("No se pudo conectar con el servidor. Intenta de nuevo.", "error");
            } finally {
                boton.disabled = false;
            }
        });
    }
});