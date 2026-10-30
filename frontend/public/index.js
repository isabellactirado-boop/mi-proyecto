// Dirección del backend en Render
const API_URL = "https://preicma.onrender.com";

document.addEventListener("DOMContentLoaded", () => {
    const $ = (id) => document.getElementById(id);
    const form = $("form-login");
    const boton = $("btn-login");
    const mensaje = $("mensaje");
    const modal = $("modal-rol");
    const hint = $("hint");
    const badge = $("rol-badge");
    const rolNombre = $("rol-nombre");
    const loader = $("loader");
    const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let rolElegido = null;
    let modalYaAbierto = false;

    function mostrar(texto, tipo) {
        mensaje.textContent = texto;
        mensaje.className = "mensaje " + tipo;
    }

    const etiqueta = { docente: "Docente", administrador: "Administrador" };
    const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
    const rand = (a, b) => a + Math.random() * (b - a);

    /* ---------- estrellas de fondo ---------- */
    function estrellas(contenedor, n) {
        for (let i = 0; i < n; i++) {
            const s = document.createElement("i");
            s.className = "star";
            s.style.left = rand(0, 100) + "%";
            s.style.top = rand(0, 100) + "%";
            const t = rand(1.5, 4.5);
            s.style.setProperty("--t", t + "s");
            s.style.setProperty("--dl", rand(0, 3) + "s");
            const z = rand(2, 4);
            s.style.width = s.style.height = z + "px";
            contenedor.appendChild(s);
        }
    }
    estrellas($("side"), 28);
    estrellas($("loader-stars"), 70);

    /* ---------- parallax de la mascota ---------- */
    const side = $("side");
    const mascota = $("mascot");
    if (!reducido && window.matchMedia("(min-width: 861px)").matches) {
        side.addEventListener("mousemove", (e) => {
            const r = side.getBoundingClientRect();
            const x = (e.clientX - r.left) / r.width - 0.5;
            const y = (e.clientY - r.top) / r.height - 0.5;
            mascota.style.translate = (-x * 26) + "px " + (-y * 20) + "px";
        });
        side.addEventListener("mouseleave", () => { mascota.style.translate = "0 0"; });
        mascota.style.transition = "translate .25s ease-out";
    }

    /* ---------- selector de rol ---------- */
    function abrirModal() {
        modal.classList.add("open");
        modal.setAttribute("aria-hidden", "false");
        hint.classList.add("off");
        const primero = modal.querySelector(".rol-card");
        setTimeout(() => primero && primero.focus({ preventScroll: true }), 350);
    }

    function cerrarModal() {
        modal.classList.remove("open");
        modal.setAttribute("aria-hidden", "true");
    }

    function primerToque() {
        if (modalYaAbierto) return;
        modalYaAbierto = true;
        abrirModal();
    }
    document.addEventListener("pointerdown", primerToque, { once: true });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Tab" || e.key === "Shift") return;
        primerToque();
    }, { once: true });

    modal.querySelectorAll(".rol-card").forEach((card) => {
        card.addEventListener("click", (e) => {
            e.stopPropagation();
            rolElegido = card.dataset.rol;
            rolNombre.textContent = etiqueta[rolElegido];
            badge.hidden = false;
            form.classList.remove("locked");
            boton.querySelector("span").textContent = "Iniciar sesión como " + etiqueta[rolElegido].toLowerCase();
            mostrar("", "info");
            cerrarModal();
            setTimeout(() => $("correo").focus({ preventScroll: true }), 400);
        });
    });

    $("btn-cambiar").addEventListener("click", abrirModal);

    /* ---------- animación del cohete ---------- */
    const rocket = $("rocket");
    const flash = $("flash");
    const ring = $("ring");
    const ring2 = $("ring2");
    const burst = $("burst");
    const estado = $("loader-status");
    const scoreNum = $("score-num");

    const textos = [
        "500", "485", "412", "¡Top 10%!", "Lectura Crítica", "Matemáticas",
        "Ciencias Naturales", "Sociales", "Inglés", "A+", "100", "92", "★",
        "✓", "+10", "Puntaje Global", "¡Pasé!", "PRE-ICMA", "4.8", "¡Excelente!"
    ];
    const colores = ["#ffd23f", "#ff7a3d", "#ffffff", "#7fe3ff", "#b6ff8a", "#ff9ecb"];

    function humo(x, y) {
        const p = document.createElement("div");
        p.className = "smoke";
        const t = rand(14, 30);
        p.style.width = p.style.height = t + "px";
        p.style.left = (x - t / 2 + rand(-8, 8)) + "px";
        p.style.top = y + "px";
        loader.appendChild(p);
        const a = p.animate([
            { transform: "scale(.5)", opacity: 0.85 },
            { transform: "scale(2.6) translateY(30px)", opacity: 0 }
        ], { duration: rand(600, 1000), easing: "ease-out" });
        a.onfinish = () => p.remove();
    }

    function contarPuntaje(duracion, destino) {
        const ini = performance.now();
        function paso(ahora) {
            const t = Math.min(1, (ahora - ini) / duracion);
            const e = 1 - Math.pow(1 - t, 3);
            scoreNum.textContent = Math.round(destino * e);
            if (t < 1) requestAnimationFrame(paso);
        }
        requestAnimationFrame(paso);
    }

    function explosion(cx, cy) {
        loader.classList.add("shake");
        setTimeout(() => loader.classList.remove("shake"), 520);

        flash.style.left = cx + "px";
        flash.style.top = cy + "px";
        flash.animate(
            [{ opacity: 1, transform: "scale(.5)" }, { opacity: 0, transform: "scale(14)" }],
            { duration: 650, easing: "ease-out" }
        );

        [[ring, 1100, 22], [ring2, 1500, 34]].forEach(([el, dur, esc]) => {
            el.style.left = cx + "px";
            el.style.top = cy + "px";
            el.animate(
                [{ opacity: 1, transform: "scale(.3)" }, { opacity: 0, transform: "scale(" + esc + ")" }],
                { duration: dur, easing: "cubic-bezier(.1,.8,.3,1)" }
            );
        });

        const W = window.innerWidth;
        const alcance = Math.min(W, 900) * 0.5;

        // Puntajes y palabras del ICFES
        const total = W < 600 ? 16 : 24;
        for (let i = 0; i < total; i++) {
            const el = document.createElement("div");
            el.className = "chunk";
            el.textContent = textos[i % textos.length];
            el.style.color = colores[i % colores.length];
            const grande = /^\d|★|A\+/.test(el.textContent);
            el.style.fontSize = (grande ? rand(26, 44) : rand(14, 20)) + "px";
            el.style.left = cx + "px";
            el.style.top = cy + "px";
            burst.appendChild(el);

            const ang = (Math.PI * 2 * i) / total + rand(-0.25, 0.25);
            const dist = rand(0.35, 1) * alcance;
            const dx = Math.cos(ang) * dist;
            const dy = Math.sin(ang) * dist * 0.9;
            const giro = rand(-35, 35);
            const caida = rand(70, 180);
            const dur = rand(1700, 2500);

            const a = el.animate([
                { opacity: 1, transform: "translate(-50%,-50%) translate(0,0) scale(.1) rotate(0deg)" },
                { opacity: 1, offset: 0.55, transform: "translate(-50%,-50%) translate(" + dx + "px," + dy + "px) scale(1.15) rotate(" + giro + "deg)" },
                { opacity: 0, transform: "translate(-50%,-50%) translate(" + dx * 1.1 + "px," + (dy + caida) + "px) scale(.9) rotate(" + giro * 1.6 + "deg)" }
            ], { duration: dur, easing: "cubic-bezier(.15,.8,.3,1)", fill: "forwards" });
            a.onfinish = () => el.remove();
        }

        // Chispas
        for (let i = 0; i < 46; i++) {
            const d = document.createElement("div");
            d.className = "dot";
            const t = rand(4, 11);
            d.style.width = d.style.height = t + "px";
            d.style.background = colores[Math.floor(rand(0, colores.length))];
            d.style.left = cx + "px";
            d.style.top = cy + "px";
            burst.appendChild(d);
            const ang = rand(0, Math.PI * 2);
            const dist = rand(80, alcance * 1.2);
            const dx = Math.cos(ang) * dist;
            const dy = Math.sin(ang) * dist;
            const a = d.animate([
                { opacity: 1, transform: "translate(-50%,-50%) translate(0,0) scale(1)" },
                { opacity: 0, transform: "translate(-50%,-50%) translate(" + dx + "px," + (dy + rand(40, 120)) + "px) scale(.2)" }
            ], { duration: rand(900, 1700), easing: "cubic-bezier(.1,.8,.3,1)", fill: "forwards" });
            a.onfinish = () => d.remove();
        }
    }

    // Un ciclo completo: despegue → explosión → puntajes
    async function cicloCohete(numero) {
        rocket.style.visibility = "visible";
        rocket.style.transform = "none";
        estado.textContent = numero > 1 ? "Despertando el servidor…" : "Encendiendo motores…";
        scoreNum.textContent = "0";

        // Temblor en la plataforma
        const vib = rocket.animate([
            { transform: "translate(0,0)" }, { transform: "translate(-3px,1px)" },
            { transform: "translate(3px,-1px)" }, { transform: "translate(-2px,0)" },
            { transform: "translate(2px,1px)" }, { transform: "translate(0,0)" }
        ], { duration: 120, iterations: 6 });
        const intervaloHumo = setInterval(() => {
            const r = rocket.getBoundingClientRect();
            humo(r.left + r.width / 2, r.bottom - 6);
        }, 55);
        await vib.finished.catch(() => {});

        estado.textContent = "¡Despegue!";
        const h = window.innerHeight;
        const subida = h * 0.62;
        const vuelo = rocket.animate([
            { transform: "translateY(0) scale(1)" },
            { transform: "translateY(" + (-subida * 0.35) + "px) scale(1)", offset: 0.4 },
            { transform: "translateY(" + (-subida) + "px) scale(.85)" }
        ], { duration: 1500, easing: "cubic-bezier(.5,0,.9,.6)", fill: "forwards" });
        await vuelo.finished.catch(() => {});
        clearInterval(intervaloHumo);

        // Boom
        const r = rocket.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        rocket.style.visibility = "hidden";
        vuelo.cancel();
        estado.textContent = "¡Calculando tu puntaje!";
        explosion(cx, cy);
        contarPuntaje(2000, Math.round(rand(430, 500)));

        await esperar(2400);
        estado.textContent = "Preparando tu panel…";
        await esperar(500);
    }

    async function mostrarCarga(promesa) {
        loader.classList.add("on");
        loader.setAttribute("aria-hidden", "false");
        let listo = false;
        promesa.then(() => { listo = true; }, () => { listo = true; });
        let n = 0;
        do {
            n++;
            await cicloCohete(n);
        } while (!listo);
        return promesa;
    }

    function ocultarCarga() {
        loader.classList.remove("on");
        loader.setAttribute("aria-hidden", "true");
        rocket.style.visibility = "visible";
        burst.innerHTML = "";
    }

    /* ---------- login ---------- */
    async function hacerLogin(correo, contrasena) {
        const respuesta = await fetch(API_URL + "/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ correo: correo, contrasena: contrasena })
        });
        if (respuesta.ok) {
            return { ok: true, datos: await respuesta.json() };
        }
        return { ok: false, status: respuesta.status };
    }

    if (form) {
        form.addEventListener("submit", async (evento) => {
            evento.preventDefault();

            if (!rolElegido) {
                abrirModal();
                return;
            }

            const correo = $("correo").value;
            const contrasena = $("contrasena").value;

            boton.disabled = true;
            mostrar("", "info");

            const promesa = hacerLogin(correo, contrasena);
            let resultado = null;
            let fallo = false;

            try {
                resultado = await mostrarCarga(promesa);
            } catch (error) {
                fallo = true;
            }

            if (fallo) {
                ocultarCarga();
                mostrar("No se pudo conectar con el servidor. Intenta de nuevo.", "error");
                boton.disabled = false;
                return;
            }

            if (!resultado.ok) {
                ocultarCarga();
                if (resultado.status === 401) {
                    mostrar("Correo o contraseña incorrectos", "error");
                } else {
                    mostrar("Error del servidor (" + resultado.status + ")", "error");
                }
                boton.disabled = false;
                return;
            }

            const datos = resultado.datos;
            const esAdmin = datos.rol === "administrador";

            // El rol elegido debe coincidir con el de la cuenta
            if (rolElegido === "administrador" && !esAdmin) {
                ocultarCarga();
                mostrar("Esta cuenta no tiene permisos de administrador.", "error");
                boton.disabled = false;
                return;
            }
            if (rolElegido === "docente" && esAdmin) {
                ocultarCarga();
                mostrar("Esta cuenta es de administrador. Pulsa «Cambiar» y elige Administrador.", "error");
                boton.disabled = false;
                return;
            }

            // Guardamos la sesión en sessionStorage de forma estricta
            sessionStorage.setItem("isLoggedIn", "true");
            sessionStorage.setItem("usuario", datos.usuario);
            sessionStorage.setItem("rol", datos.rol);

            $("loader-status").textContent = "¡Bienvenida! Entrando al panel…";
            await esperar(600);
            window.location.href = esAdmin ? "dashboard-admin.html" : "dashboard.html";
        });
    }
});