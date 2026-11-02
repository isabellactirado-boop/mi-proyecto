// Dirección del backend en Render (la misma que usa index.js)
const API_URL = "https://preicma.onrender.com";

document.addEventListener("DOMContentLoaded", () => {
    const $ = (id) => document.getElementById(id);
    const form = $("form-cambio");
    const boton = $("btn-cambio");
    const mensaje = $("mensaje");

    function mostrar(texto, tipo) {
        mensaje.textContent = texto;
        mensaje.className = "mensaje " + tipo;
    }

    function irA(url) {
        window.location.replace(url);
    }

    // propietario y administrador van al panel de administración
    function destinoPorRol(rol) {
        return (rol === "administrador" || rol === "propietario")
            ? "dashboard-admin.html"
            : "dashboard-docente.html";
    }

    function cerrarSesion() {
        sessionStorage.clear();
        irA("index.html");
    }

    // Mostrar / ocultar cada contraseña
    document.querySelectorAll(".pw button").forEach((b) => {
        b.addEventListener("click", () => {
            const campo = $(b.dataset.target);
            const oculta = campo.type === "password";
            campo.type = oculta ? "text" : "password";
            b.textContent = oculta ? "Ocultar" : "Mostrar";
        });
    });

    $("salir").addEventListener("click", (e) => {
        e.preventDefault();
        cerrarSesion();
    });

    // Mismas reglas que el backend: 8 a 72 caracteres, una letra y un número
    function validar(actual, nueva, confirmar) {
        if (!actual) return "Escribe tu contraseña temporal.";
        if (nueva.length < 8) return "La contraseña nueva debe tener al menos 8 caracteres.";
        if (new TextEncoder().encode(nueva).length > 72) return "La contraseña nueva no puede pasar de 72 caracteres.";
        if (!/\p{L}/u.test(nueva) || !/\d/.test(nueva)) return "La contraseña nueva debe tener al menos una letra y un número.";
        if (nueva === actual) return "La contraseña nueva debe ser distinta a la temporal.";
        if (nueva !== confirmar) return "Las contraseñas nuevas no coinciden.";
        return null;
    }

    form.addEventListener("submit", async (evento) => {
        evento.preventDefault();

        const actual = $("actual").value;
        const nueva = $("nueva").value;
        const confirmar = $("confirmar").value;

        const problema = validar(actual, nueva, confirmar);
        if (problema) {
            mostrar(problema, "error");
            return;
        }

        const token = sessionStorage.getItem("token");
        if (!token) {
            cerrarSesion();
            return;
        }

        boton.disabled = true;
        mostrar("Guardando…", "info");

        let respuesta;
        try {
            respuesta = await fetch(API_URL + "/cambiar-contrasena", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + token
                },
                body: JSON.stringify({ contrasena_actual: actual, contrasena_nueva: nueva })
            });
        } catch (error) {
            mostrar("No se pudo conectar con el servidor. Intenta de nuevo.", "error");
            boton.disabled = false;
            return;
        }

        if (respuesta.status === 401) {
            // La sesión venció: hay que volver a iniciar sesión
            cerrarSesion();
            return;
        }

        if (!respuesta.ok) {
            let detalle = "No se pudo cambiar la contraseña.";
            try {
                const datos = await respuesta.json();
                if (typeof datos.detail === "string") detalle = datos.detail;
            } catch (error) { /* se deja el mensaje general */ }
            mostrar(detalle, "error");
            boton.disabled = false;
            return;
        }

        // El backend entrega un token nuevo: el anterior ya no sirve
        const datos = await respuesta.json();
        sessionStorage.setItem("token", datos.token);
        sessionStorage.setItem("debe_cambiar_contrasena", "false");

        mostrar("Contraseña actualizada. Entrando al panel…", "ok");
        setTimeout(() => irA(destinoPorRol(sessionStorage.getItem("rol"))), 900);
    });
});
