/* =====================================================================
   juego-icfes.js - Minijuego secreto del login: "MISION 500".
   Se abre al escribir  icfes  en la pantalla de inicio de sesion
   (con el teclado en cualquier parte, o como texto en el campo de correo).

   Un cohete rompe asteroides y atrapa las 5 materias del ICFES hasta
   llegar a 500 puntos. Todo vive en este archivo: crea su propia capa,
   sus estilos y su lienzo, y los borra al cerrar. No toca el login.
   ===================================================================== */
(function () {
    "use strict";

    const CLAVE = "icfes";
    const META = 500;
    const CLAVE_RECORD = "preicma_juego_record";
    const CLAVE_SILENCIO = "preicma_juego_silencio";

    const C = {
        fondo: "#0b0630", espacio: "#140b4f", tinta: "#1a1240", crema: "#f6f1e7",
        luna: "#e8e0cd", crater: "#cbc1a8", naranja: "#ff7a3d", amarillo: "#ffd23f",
        azul: "#1b2f6b", cian: "#7fe3ff", rosa: "#ff9ecb", verde: "#b6ff8a",
        violeta: "#8a5cf0", rojo: "#ff4d5e", lila: "#c9baff"
    };

    const MATERIAS = [
        { sigla: "MAT", nombre: "Matemáticas", color: C.amarillo },
        { sigla: "LEC", nombre: "Lectura Crítica", color: C.rosa },
        { sigla: "SOC", nombre: "Sociales", color: C.naranja },
        { sigla: "CIE", nombre: "Ciencias", color: C.verde },
        { sigla: "ING", nombre: "Inglés", color: C.cian }
    ];

    // El mismo cohete de la pantalla de carga del login (lienzo de 80 x 170)
    const FORMA = {
        llama1: new Path2D("M40 116c-12 8-14 28-8 52 3-8 6-10 8-10s5 2 8 10c6-24 4-44-8-52z"),
        llama2: new Path2D("M40 120c-6 6-8 18-4 34 2-4 3-6 4-6s2 2 4 6c4-16 2-28-4-34z"),
        aletaIzq: new Path2D("M20 92L2 124l24-10z"),
        aletaDer: new Path2D("M60 92l18 32-24-10z"),
        cuerpo: new Path2D("M40 4C58 26 62 60 58 116H22C18 60 22 26 40 4z"),
        punta: new Path2D("M40 4c8 10 13 20 15 31H25c2-11 7-21 15-31z"),
        chispa: new Path2D("M12 0c1 7 5 11 12 12-7 1-11 5-12 12-1-7-5-11-12-12 7-1 11-5 12-12z")
    };

    const TITULO = "'Bricolage Grotesque', 'DM Sans', sans-serif";
    const TEXTO = "'DM Sans', sans-serif";

    const azar = (a, b) => a + Math.random() * (b - a);
    const limitar = (v, a, b) => Math.max(a, Math.min(b, v));
    const mezcla = (a, b, t) => a + (b - a) * t;

    let abierto = false;

    /* ---------- como se abre: escribir "icfes" ---------- */
    let tecleado = "";
    document.addEventListener("keydown", (e) => {
        if (abierto || e.ctrlKey || e.metaKey || e.altKey) return;
        // Dentro de un campo no cuenta letra por letra: un correo o una
        // contraseña pueden llevar "icfes" adentro. Ahi vale solo el campo entero.
        const el = e.target;
        if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
        if (e.key.length !== 1) return;
        tecleado = (tecleado + e.key.toLowerCase()).slice(-CLAVE.length);
        if (tecleado === CLAVE) {
            tecleado = "";
            e.preventDefault();
            abrir();
        }
    });
    document.addEventListener("input", (e) => {
        if (abierto) return;
        const el = e.target;
        if (!el || el.tagName !== "INPUT" || el.type === "password") return;
        if (el.value.trim().toLowerCase() === CLAVE) {
            el.value = "";
            el.blur();
            abrir();
        }
    });

    /* ---------- estilos de la capa ---------- */
    function ponerEstilos() {
        if (document.getElementById("ji-estilos")) return;
        const st = document.createElement("style");
        st.id = "ji-estilos";
        st.textContent =
            "#juego-icfes{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;" +
            "background:radial-gradient(ellipse at 50% 110%,#2a1f6e 0%,#140b4f 45%,#0b0630 100%);" +
            "animation:ji-entra .35s ease-out both;outline:none;overflow:hidden}" +
            "@keyframes ji-entra{from{opacity:0}to{opacity:1}}" +
            ".ji-marco{position:relative;width:100%;height:100vh;height:100dvh;max-width:560px;overflow:hidden;background:#0b0630}" +
            "@media (min-width:600px) and (min-height:520px){.ji-marco{height:calc(100vh - 32px);height:calc(100dvh - 32px);" +
            "border:3px solid #1a1240;border-radius:24px;box-shadow:8px 8px 0 #ffd23f}}" +
            ".ji-marco canvas{display:block;width:100%;height:100%;touch-action:none;cursor:crosshair;" +
            "-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}" +
            ".ji-botones{position:absolute;top:12px;right:12px;display:flex;gap:8px}" +
            ".ji-btn{width:36px;height:36px;border-radius:50%;border:2.5px solid #1a1240;background:#f6f1e7;color:#1a1240;" +
            "font:800 14px/1 'DM Sans',sans-serif;cursor:pointer;display:grid;place-items:center;box-shadow:2px 2px 0 #7fe3ff;padding:0}" +
            ".ji-btn:hover{background:#ffd23f}" +
            ".ji-btn:focus-visible{outline:3px solid #ffd23f;outline-offset:2px}" +
            ".ji-btn.off{text-decoration:line-through;opacity:.6}";
        document.head.appendChild(st);
    }

    /* ---------- sonido (sintetizado, sin archivos) ---------- */
    let audio = null;
    let silencio = false;
    try { silencio = localStorage.getItem(CLAVE_SILENCIO) === "1"; } catch (e) { /* sin almacenamiento */ }

    function prenderAudio() {
        if (audio) { if (audio.state === "suspended") audio.resume(); return; }
        const Clase = window.AudioContext || window.webkitAudioContext;
        if (!Clase) return;
        try { audio = new Clase(); } catch (e) { audio = null; }
    }
    function tono(frec, dur, tipo, vol, frecFin, retraso) {
        if (!audio || silencio) return;
        const t = audio.currentTime + (retraso || 0);
        const osc = audio.createOscillator();
        const gan = audio.createGain();
        osc.type = tipo;
        osc.frequency.setValueAtTime(frec, t);
        if (frecFin) osc.frequency.exponentialRampToValueAtTime(frecFin, t + dur);
        gan.gain.setValueAtTime(vol, t);
        gan.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(gan);
        gan.connect(audio.destination);
        osc.start(t);
        osc.stop(t + dur + 0.02);
    }
    const sonido = {
        disparo: () => tono(900, 0.05, "square", 0.012, 500),
        romper: () => tono(170, 0.22, "sawtooth", 0.07, 45),
        materia: () => { tono(660, 0.09, "triangle", 0.09); tono(990, 0.14, "triangle", 0.09, 0, 0.08); },
        simulacro: () => [523, 659, 784, 1047].forEach((f, i) => tono(f, 0.16, "triangle", 0.09, 0, i * 0.09)),
        poder: () => tono(420, 0.3, "sine", 0.1, 1300),
        golpe: () => tono(240, 0.45, "sawtooth", 0.13, 50),
        escudo: () => tono(700, 0.2, "sine", 0.09, 250),
        victoria: () => [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tono(f, 0.22, "triangle", 0.1, 0, i * 0.13)),
        fin: () => [392, 330, 262, 196].forEach((f, i) => tono(f, 0.28, "triangle", 0.1, 0, i * 0.18))
    };

    /* ---------- el juego ---------- */
    function abrir() {
        if (abierto) return;
        abierto = true;
        ponerEstilos();

        const menosMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const focoAnterior = document.activeElement;

        const capa = document.createElement("div");
        capa.id = "juego-icfes";
        capa.tabIndex = -1;
        capa.setAttribute("role", "dialog");
        capa.setAttribute("aria-modal", "true");
        capa.setAttribute("aria-label", "Minijuego Misión 500");
        capa.innerHTML =
            '<div class="ji-marco">' +
            '<canvas aria-label="Juego: mueve el cohete, rompe asteroides y atrapa las materias"></canvas>' +
            '<div class="ji-botones">' +
            '<button type="button" class="ji-btn" data-a="sonido" aria-label="Activar o silenciar el sonido" title="Sonido (M)">♪</button>' +
            '<button type="button" class="ji-btn" data-a="pausa" aria-label="Pausar o seguir" title="Pausa (P)">II</button>' +
            '<button type="button" class="ji-btn" data-a="cerrar" aria-label="Cerrar el juego" title="Cerrar (Esc)">✕</button>' +
            "</div></div>";
        document.body.appendChild(capa);
        capa.focus({ preventScroll: true });

        const marco = capa.querySelector(".ji-marco");
        const lienzo = capa.querySelector("canvas");
        const ctx = lienzo.getContext("2d");
        const btnSonido = capa.querySelector('[data-a="sonido"]');
        btnSonido.classList.toggle("off", silencio);

        let W = 0, H = 0;
        let estado = "inicio";          // inicio | jugando | pausa | fin | victoria
        let antesDePausa = "jugando";
        let reloj = 0, ultimo = 0, cuadroId = 0;
        let espera = 0;                 // evita reiniciar sin querer al terminar

        let record = 0;
        try { record = Number(localStorage.getItem(CLAVE_RECORD)) || 0; } catch (e) { /* sin almacenamiento */ }
        let nuevoRecord = false;

        // Partida
        let puntaje, vidas, tiempo, invulnerable, escudo, triple, sacudida;
        let tAsteroide, tMateria, tPoder, tCometa, tDisparo, tFuegos;
        let atrapadas;                  // materias del simulacro actual
        let asteroides, balas, materias, poderes, particulas, avisos, cometas, alertas;
        const jugador = { x: 0, y: 0, inclinacion: 0 };

        // Controles
        const teclas = { izq: false, der: false };
        let objetivoX = null;
        let dedoAbajo = false;

        // Fondo
        let estrellas = [];
        let planeta = null;

        function medir() {
            const dpr = Math.min(2, window.devicePixelRatio || 1);
            W = marco.clientWidth;
            H = marco.clientHeight;
            lienzo.width = Math.round(W * dpr);
            lienzo.height = Math.round(H * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            if (!estrellas.length) crearFondo();
            jugador.x = limitar(jugador.x || W / 2, 24, W - 24);
            if (estado !== "victoria") jugador.y = H - 92;
        }

        function crearFondo() {
            estrellas = [];
            for (let i = 0; i < 90; i++) {
                const capaN = i % 3;    // 0 lejos, 2 cerca
                estrellas.push({
                    x: azar(0, 1), y: azar(0, 1),
                    t: [1, 1.6, 2.4][capaN], v: [14, 30, 62][capaN],
                    brillo: azar(0.35, 0.95), fase: azar(0, 6)
                });
            }
            nuevoPlaneta(true);
        }
        function nuevoPlaneta(alInicio) {
            const colores = [[C.rosa, "#d94f8c"], [C.cian, "#3aa3c4"], [C.naranja, "#c9531f"], [C.violeta, "#5a36b8"]];
            const par = colores[Math.floor(azar(0, colores.length))];
            const r = azar(26, 48);
            planeta = {
                x: azar(0.12, 0.88), y: alInicio ? azar(0.15, 0.4) * H : -r * 2,
                r: r, color: par[0], sombra: par[1], anillo: Math.random() < 0.5, v: azar(7, 12)
            };
        }

        function nuevaPartida() {
            puntaje = 0; vidas = 3; tiempo = 0;
            invulnerable = 1.2; escudo = false; triple = 0; sacudida = 0;
            tAsteroide = 0.8; tMateria = 1.6; tPoder = azar(10, 14); tCometa = azar(5, 7); tDisparo = 0; tFuegos = 0;
            atrapadas = [];
            asteroides = []; balas = []; materias = []; poderes = []; particulas = []; avisos = []; cometas = []; alertas = [];
            jugador.x = W / 2; jugador.y = H - 92; jugador.inclinacion = 0;
            objetivoX = null;
            nuevoRecord = false;
            estado = "jugando";
        }
        // Para que la pantalla de inicio tenga algo detras
        asteroides = []; balas = []; materias = []; poderes = []; particulas = []; avisos = []; cometas = []; alertas = [];
        puntaje = 0; vidas = 3; tiempo = 0; invulnerable = 0; escudo = false; triple = 0; sacudida = 0; atrapadas = [];

        /* ----- creacion de cosas ----- */
        function crearAsteroide(x, y, r, vx, vy) {
            const puntas = Math.floor(azar(9, 13));
            const forma = [];
            for (let i = 0; i < puntas; i++) forma.push(azar(0.78, 1.12));
            const crateres = [];
            const cuantos = r > 26 ? 3 : 2;
            for (let i = 0; i < cuantos; i++) {
                const a = azar(0, Math.PI * 2), d = azar(0.1, 0.5) * r;
                crateres.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: azar(0.14, 0.24) * r });
            }
            asteroides.push({
                x: x, y: y, r: r, vx: vx, vy: vy, giro: azar(0, 6), vGiro: azar(-1.4, 1.4),
                vida: r > 26 ? 3 : 1, grande: r > 26, forma: forma, crateres: crateres, destello: 0
            });
        }
        function lanzarAsteroide(nivel) {
            const grande = Math.random() < 0.22 + 0.2 * nivel;
            const r = grande ? azar(30, 40) : azar(15, 23);
            const vy = azar(90, 160) * (1 + nivel * 0.9) * (grande ? 0.7 : 1);
            const x = azar(r, W - r);
            // Algunos van directo a donde esta el cohete: quedarse quieto no sirve
            let vx = azar(-34, 34);
            if (Math.random() < 0.3 + 0.25 * nivel) {
                vx = limitar((jugador.x - x) / ((jugador.y + r) / vy), -150, 150);
            }
            crearAsteroide(x, -r - 6, r, vx, vy);
        }
        function lanzarMateria() {
            const faltan = MATERIAS.filter((m) => atrapadas.indexOf(m.sigla) === -1);
            const lista = faltan.length && Math.random() < 0.75 ? faltan : MATERIAS;
            const m = lista[Math.floor(azar(0, lista.length))];
            materias.push({ x: azar(30, W - 30), y: -24, r: 18, m: m, fase: azar(0, 6) });
        }
        function lanzarPoder() {
            const tipo = escudo ? "triple" : (Math.random() < 0.5 ? "escudo" : "triple");
            poderes.push({ x: azar(30, W - 30), y: -24, r: 16, tipo: tipo, fase: azar(0, 6) });
        }
        function chispas(x, y, color, cuantas, fuerza) {
            const n = menosMovimiento ? Math.ceil(cuantas / 3) : cuantas;
            for (let i = 0; i < n; i++) {
                const a = azar(0, Math.PI * 2), v = azar(0.25, 1) * fuerza;
                const dura = azar(0.35, 0.8);
                particulas.push({
                    x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
                    vida: dura, total: dura, t: azar(2, 5.5), color: color
                });
            }
        }
        function aviso(x, y, texto, color, grande) {
            avisos.push({ x: limitar(x, 60, W - 60), y: y, texto: texto, color: color, vida: 1.1, grande: !!grande });
        }
        function sumar(puntos) {
            puntaje = Math.min(META, puntaje + puntos);
        }

        /* ----- logica ----- */
        function romperAsteroide(a, conPuntos) {
            chispas(a.x, a.y, C.luna, a.grande ? 18 : 10, a.grande ? 240 : 170);
            chispas(a.x, a.y, C.amarillo, 5, 200);
            sonido.romper();
            if (a.grande) {
                crearAsteroide(a.x - 10, a.y, azar(15, 20), -azar(50, 90), a.vy + 20);
                crearAsteroide(a.x + 10, a.y, azar(15, 20), azar(50, 90), a.vy + 20);
            }
            if (conPuntos) {
                const pts = a.grande ? 6 : 3;
                sumar(pts);
                aviso(a.x, a.y, "+" + pts, C.crema);
            }
        }

        function golpeAlJugador(a) {
            if (a) romperAsteroide(a, false);
            if (escudo) {
                escudo = false;
                invulnerable = 0.8;
                sonido.escudo();
                aviso(jugador.x, jugador.y - 50, "¡Escudo!", C.cian);
                return;
            }
            vidas--;
            invulnerable = 1.8;
            sacudida = 0.5;
            triple = 0;
            sonido.golpe();
            chispas(jugador.x, jugador.y, C.naranja, 22, 280);
            if (vidas <= 0) terminar();
        }

        function guardarRecord() {
            if (puntaje > record) {
                record = puntaje;
                nuevoRecord = true;
                try { localStorage.setItem(CLAVE_RECORD, String(record)); } catch (e) { /* sin almacenamiento */ }
            }
        }
        function terminar() {
            estado = "fin";
            cometas = []; alertas = []; balas = [];
            espera = 0.9;
            guardarRecord();
            chispas(jugador.x, jugador.y, C.amarillo, 30, 340);
            sonido.fin();
        }
        function ganar() {
            estado = "victoria";
            espera = 1.2;
            guardarRecord();
            asteroides.forEach((a) => chispas(a.x, a.y, C.luna, 10, 200));
            asteroides = []; materias = []; poderes = []; balas = []; cometas = []; alertas = [];
            sonido.victoria();
        }

        function jugar(dt) {
            tiempo += dt;
            const nivel = puntaje / META;

            // Movimiento del cohete
            const xAntes = jugador.x;
            if (teclas.izq || teclas.der) {
                jugador.x += ((teclas.der ? 1 : 0) - (teclas.izq ? 1 : 0)) * 470 * dt;
                objetivoX = null;
            } else if (objetivoX !== null) {
                jugador.x += (objetivoX - jugador.x) * Math.min(1, dt * 16);
            }
            jugador.x = limitar(jugador.x, 22, W - 22);
            const empuje = limitar((jugador.x - xAntes) / Math.max(dt, 0.001) / 470, -1, 1) * 0.32;
            jugador.inclinacion += (empuje - jugador.inclinacion) * Math.min(1, dt * 10);

            invulnerable = Math.max(0, invulnerable - dt);
            triple = Math.max(0, triple - dt);

            // Disparo automatico
            tDisparo -= dt;
            if (tDisparo <= 0) {
                tDisparo = 0.2;
                const y = jugador.y - 34;
                balas.push({ x: jugador.x, y: y, vx: 0 });
                if (triple > 0) {
                    balas.push({ x: jugador.x - 8, y: y + 8, vx: -150 });
                    balas.push({ x: jugador.x + 8, y: y + 8, vx: 150 });
                }
                sonido.disparo();
            }

            // Apariciones
            tAsteroide -= dt;
            if (tAsteroide <= 0) {
                lanzarAsteroide(nivel);
                tAsteroide = mezcla(0.85, 0.36, nivel) * azar(0.7, 1.3);
            }
            tMateria -= dt;
            if (tMateria <= 0) { lanzarMateria(); tMateria = azar(2.2, 3.6); }
            tPoder -= dt;
            if (tPoder <= 0) { lanzarPoder(); tPoder = azar(12, 18); }
            // Cometa: primero avisa arriba, sobre la columna del cohete, y luego cae
            tCometa -= dt;
            if (tCometa <= 0) {
                alertas.push({ x: jugador.x, t: 0.85 });
                tCometa = mezcla(5, 2.3, nivel) * azar(0.8, 1.2);
            }

            // Balas
            for (let i = balas.length - 1; i >= 0; i--) {
                const b = balas[i];
                b.y -= 640 * dt;
                b.x += b.vx * dt;
                if (b.y < -20) { balas.splice(i, 1); continue; }
                for (let j = asteroides.length - 1; j >= 0; j--) {
                    const a = asteroides[j];
                    const dx = b.x - a.x, dy = b.y - a.y;
                    if (dx * dx + dy * dy < (a.r + 4) * (a.r + 4)) {
                        balas.splice(i, 1);
                        a.vida--;
                        a.destello = 0.1;
                        if (a.vida <= 0) {
                            asteroides.splice(j, 1);
                            romperAsteroide(a, true);
                        } else {
                            chispas(b.x, b.y, C.crema, 3, 110);
                        }
                        break;
                    }
                }
            }

            // Asteroides
            const jx = jugador.x, jy = jugador.y - 6;
            for (let i = asteroides.length - 1; i >= 0; i--) {
                const a = asteroides[i];
                a.x += a.vx * dt; a.y += a.vy * dt; a.giro += a.vGiro * dt;
                a.destello = Math.max(0, a.destello - dt);
                if (a.x < a.r && a.vx < 0) a.vx = -a.vx;
                if (a.x > W - a.r && a.vx > 0) a.vx = -a.vx;
                if (a.y > H + a.r + 10) { asteroides.splice(i, 1); continue; }
                const dx = a.x - jx, dy = a.y - jy;
                const toca = a.r * 0.88 + 15;
                if (invulnerable <= 0 && dx * dx + dy * dy < toca * toca) {
                    asteroides.splice(i, 1);
                    golpeAlJugador(a);
                    if (estado !== "jugando") return;
                }
            }

            // Materias
            for (let i = materias.length - 1; i >= 0; i--) {
                const m = materias[i];
                m.y += 135 * dt;
                if (m.y > H + 30) { materias.splice(i, 1); continue; }
                const dx = m.x - jx, dy = m.y - jy;
                if (dx * dx + dy * dy < (m.r + 22) * (m.r + 22)) {
                    materias.splice(i, 1);
                    sumar(10);
                    chispas(m.x, m.y, m.m.color, 12, 190);
                    aviso(m.x, m.y - 10, "+10 " + m.m.nombre, m.m.color);
                    if (atrapadas.indexOf(m.m.sigla) === -1) atrapadas.push(m.m.sigla);
                    if (atrapadas.length === MATERIAS.length) {
                        atrapadas = [];
                        sumar(30);
                        aviso(W / 2, H * 0.4, "¡Simulacro completo! +30", C.amarillo, true);
                        sonido.simulacro();
                    } else {
                        sonido.materia();
                    }
                }
            }

            // Poderes
            for (let i = poderes.length - 1; i >= 0; i--) {
                const p = poderes[i];
                p.y += 120 * dt;
                if (p.y > H + 30) { poderes.splice(i, 1); continue; }
                const dx = p.x - jx, dy = p.y - jy;
                if (dx * dx + dy * dy < (p.r + 22) * (p.r + 22)) {
                    poderes.splice(i, 1);
                    sonido.poder();
                    if (p.tipo === "escudo") {
                        escudo = true;
                        aviso(p.x, p.y - 10, "Escudo activado", C.cian);
                        chispas(p.x, p.y, C.cian, 12, 180);
                    } else {
                        triple = 9;
                        aviso(p.x, p.y - 10, "Disparo triple", C.violeta);
                        chispas(p.x, p.y, C.lila, 12, 180);
                    }
                }
            }

            // Cometas: no se rompen con disparos, hay que esquivarlos
            for (let i = alertas.length - 1; i >= 0; i--) {
                const al = alertas[i];
                al.t -= dt;
                if (al.t <= 0) {
                    alertas.splice(i, 1);
                    cometas.push({ x: al.x, y: -24, r: 12, vy: mezcla(430, 560, nivel) });
                }
            }
            for (let i = cometas.length - 1; i >= 0; i--) {
                const c = cometas[i];
                c.y += c.vy * dt;
                if (c.y > H + 60) { cometas.splice(i, 1); continue; }
                const dx = c.x - jx, dy = c.y - jy;
                if (invulnerable <= 0 && dx * dx + dy * dy < (c.r + 14) * (c.r + 14)) {
                    cometas.splice(i, 1);
                    chispas(c.x, c.y, C.rojo, 14, 240);
                    golpeAlJugador(null);
                    if (estado !== "jugando") return;
                }
            }

            if (puntaje >= META) ganar();
        }

        function actualizar(dt) {
            if (estado === "pausa") return;
            reloj += dt;
            espera = Math.max(0, espera - dt);
            sacudida = Math.max(0, sacudida - dt);

            // Fondo
            const prisa = estado === "victoria" ? 3 : 1;
            for (let i = 0; i < estrellas.length; i++) {
                const s = estrellas[i];
                s.y += (s.v * prisa * dt) / H;
                if (s.y > 1) { s.y -= 1; s.x = Math.random(); }
            }
            if (planeta) {
                planeta.y += planeta.v * prisa * dt;
                if (planeta.y > H + planeta.r * 2.5) nuevoPlaneta(false);
            }

            // Particulas y avisos
            for (let i = particulas.length - 1; i >= 0; i--) {
                const p = particulas[i];
                p.vida -= dt;
                if (p.vida <= 0) { particulas.splice(i, 1); continue; }
                p.x += p.vx * dt; p.y += p.vy * dt;
                p.vx *= 0.96; p.vy = p.vy * 0.96 + 60 * dt;
            }
            for (let i = avisos.length - 1; i >= 0; i--) {
                const a = avisos[i];
                a.vida -= dt;
                a.y -= 38 * dt;
                if (a.vida <= 0) avisos.splice(i, 1);
            }

            if (estado === "jugando") {
                jugar(dt);
            } else if (estado === "inicio") {
                jugador.x = W / 2 + Math.sin(reloj * 1.1) * Math.min(70, W * 0.18);
                jugador.inclinacion = Math.cos(reloj * 1.1) * 0.16;
            } else if (estado === "fin") {
                for (let i = asteroides.length - 1; i >= 0; i--) {
                    const a = asteroides[i];
                    a.x += a.vx * dt; a.y += a.vy * dt; a.giro += a.vGiro * dt;
                    if (a.y > H + a.r + 10) asteroides.splice(i, 1);
                }
            } else if (estado === "victoria") {
                jugador.inclinacion *= 0.9;
                jugador.x += (W / 2 - jugador.x) * Math.min(1, dt * 3);
                if (jugador.y > H * 0.3) jugador.y -= 150 * dt;
                else jugador.y = H * 0.3 + Math.sin(reloj * 2) * 5;
                tFuegos -= dt;
                if (tFuegos <= 0) {
                    tFuegos = menosMovimiento ? 1.1 : 0.4;
                    const colores = [C.amarillo, C.rosa, C.cian, C.verde, C.naranja];
                    chispas(azar(40, W - 40), azar(H * 0.12, H * 0.6), colores[Math.floor(azar(0, 5))], 26, 260);
                }
            }
        }

        /* ----- dibujo ----- */
        function cajaRedonda(x, y, w, h, r) {
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.arcTo(x + w, y, x + w, y + h, r);
            ctx.arcTo(x + w, y + h, x, y + h, r);
            ctx.arcTo(x, y + h, x, y, r);
            ctx.arcTo(x, y, x + w, y, r);
            ctx.closePath();
        }

        function dibujarFondo() {
            const g = ctx.createLinearGradient(0, 0, 0, H);
            g.addColorStop(0, C.fondo);
            g.addColorStop(0.65, C.espacio);
            g.addColorStop(1, "#2a1f6e");
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, W, H);

            if (planeta) {
                const p = planeta, px = p.x * W;
                ctx.save();
                ctx.globalAlpha = 0.55;
                if (p.anillo) {
                    ctx.strokeStyle = C.lila;
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.ellipse(px, p.y, p.r * 1.7, p.r * 0.42, -0.35, 0, Math.PI * 2);
                    ctx.stroke();
                }
                ctx.fillStyle = p.color;
                ctx.beginPath(); ctx.arc(px, p.y, p.r, 0, Math.PI * 2); ctx.fill();
                ctx.save();
                ctx.beginPath(); ctx.arc(px, p.y, p.r, 0, Math.PI * 2); ctx.clip();
                ctx.fillStyle = p.sombra;
                ctx.fillRect(px - p.r, p.y - p.r * 0.35, p.r * 2, p.r * 0.22);
                ctx.fillRect(px - p.r, p.y + p.r * 0.2, p.r * 2, p.r * 0.3);
                ctx.restore();
                ctx.restore();
            }

            for (let i = 0; i < estrellas.length; i++) {
                const s = estrellas[i];
                ctx.globalAlpha = s.brillo * (0.65 + 0.35 * Math.sin(reloj * 2 + s.fase));
                ctx.fillStyle = "#fff";
                ctx.fillRect(s.x * W, s.y * H, s.t, s.t);
            }
            ctx.globalAlpha = 1;
        }

        function dibujarCohete(x, y, escala, inclinacion, conLlama) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(inclinacion);
            ctx.scale(escala, escala);
            ctx.translate(-40, -70);
            ctx.lineJoin = "round";
            ctx.strokeStyle = C.tinta;
            ctx.lineWidth = Math.min(6, 2.2 / escala);

            if (conLlama) {
                ctx.save();
                ctx.translate(40, 116);
                ctx.scale(1, 0.7 + Math.random() * 0.55);
                ctx.translate(-40, -116);
                ctx.fillStyle = C.naranja; ctx.fill(FORMA.llama1);
                ctx.fillStyle = C.amarillo; ctx.fill(FORMA.llama2);
                ctx.restore();
            }
            ctx.fillStyle = C.naranja;
            ctx.fill(FORMA.aletaIzq); ctx.stroke(FORMA.aletaIzq);
            ctx.fill(FORMA.aletaDer); ctx.stroke(FORMA.aletaDer);
            ctx.fillStyle = "#fffdf8";
            ctx.fill(FORMA.cuerpo); ctx.stroke(FORMA.cuerpo);
            ctx.fillStyle = C.naranja;
            ctx.fill(FORMA.punta); ctx.stroke(FORMA.punta);
            ctx.fillStyle = C.azul;
            ctx.beginPath(); ctx.arc(40, 64, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.fillStyle = "rgba(255,255,255,.8)";
            ctx.beginPath(); ctx.arc(36, 60, 3.5, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = C.amarillo;
            ctx.fillRect(22, 92, 36, 7); ctx.strokeRect(22, 92, 36, 7);
            ctx.restore();
        }

        function dibujarAsteroide(a) {
            ctx.save();
            ctx.translate(a.x, a.y);
            ctx.rotate(a.giro);
            ctx.beginPath();
            const n = a.forma.length;
            for (let i = 0; i < n; i++) {
                const ang = (i / n) * Math.PI * 2;
                const r = a.r * a.forma[i];
                if (i === 0) ctx.moveTo(Math.cos(ang) * r, Math.sin(ang) * r);
                else ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
            }
            ctx.closePath();
            ctx.fillStyle = a.destello > 0 ? "#fff" : C.luna;
            ctx.strokeStyle = C.tinta;
            ctx.lineWidth = 2.5;
            ctx.lineJoin = "round";
            ctx.fill(); ctx.stroke();
            if (a.destello <= 0) {
                ctx.fillStyle = C.crater;
                for (let i = 0; i < a.crateres.length; i++) {
                    const c = a.crateres[i];
                    ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2); ctx.fill();
                }
            }
            ctx.restore();
        }

        function dibujarMateria(m) {
            const sube = Math.sin(reloj * 4 + m.fase) * 2.5;
            ctx.save();
            ctx.translate(m.x, m.y + sube);
            ctx.globalAlpha = 0.22;
            ctx.fillStyle = m.m.color;
            ctx.beginPath(); ctx.arc(0, 0, m.r + 7 + Math.sin(reloj * 6 + m.fase) * 2, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1;
            ctx.beginPath(); ctx.arc(0, 0, m.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = C.tinta; ctx.lineWidth = 2.5; ctx.stroke();
            ctx.fillStyle = C.tinta;
            ctx.font = "800 11px " + TEXTO;
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText(m.m.sigla, 0, 1);
            ctx.restore();
        }

        function dibujarPoder(p) {
            const esEscudo = p.tipo === "escudo";
            ctx.save();
            ctx.translate(p.x, p.y + Math.sin(reloj * 4 + p.fase) * 2.5);
            ctx.rotate(Math.sin(reloj * 2 + p.fase) * 0.2);
            cajaRedonda(-p.r, -p.r, p.r * 2, p.r * 2, 9);
            ctx.fillStyle = esEscudo ? C.cian : C.violeta;
            ctx.fill();
            ctx.strokeStyle = C.tinta; ctx.lineWidth = 2.5; ctx.stroke();
            ctx.strokeStyle = esEscudo ? C.tinta : "#fff";
            ctx.fillStyle = esEscudo ? C.tinta : "#fff";
            ctx.lineWidth = 2.5; ctx.lineCap = "round";
            if (esEscudo) {
                ctx.beginPath(); ctx.arc(0, 0, 7.5, 0, Math.PI * 2); ctx.stroke();
            } else {
                ctx.beginPath();
                ctx.moveTo(0, 7); ctx.lineTo(0, -7);
                ctx.moveTo(-3, 7); ctx.lineTo(-8, -4);
                ctx.moveTo(3, 7); ctx.lineTo(8, -4);
                ctx.stroke();
            }
            ctx.restore();
        }

        function dibujarMundo() {
            ctx.save();
            if (sacudida > 0 && !menosMovimiento) {
                ctx.translate(azar(-1, 1) * sacudida * 14, azar(-1, 1) * sacudida * 14);
            }

            for (let i = 0; i < materias.length; i++) dibujarMateria(materias[i]);
            for (let i = 0; i < poderes.length; i++) dibujarPoder(poderes[i]);

            for (let i = 0; i < balas.length; i++) {
                const b = balas[i];
                ctx.fillStyle = triple > 0 ? C.cian : C.amarillo;
                cajaRedonda(b.x - 2.5, b.y - 8, 5, 16, 2.5);
                ctx.fill();
            }

            for (let i = 0; i < asteroides.length; i++) dibujarAsteroide(asteroides[i]);

            // Cometas: cola de fuego hacia arriba y cabeza roja
            for (let i = 0; i < cometas.length; i++) {
                const c = cometas[i];
                const cola = ctx.createLinearGradient(0, c.y - 90, 0, c.y);
                cola.addColorStop(0, "rgba(255,122,61,0)");
                cola.addColorStop(1, "rgba(255,210,63,.85)");
                ctx.fillStyle = cola;
                ctx.beginPath();
                ctx.moveTo(c.x - c.r, c.y);
                ctx.lineTo(c.x + azar(-2, 2), c.y - 90);
                ctx.lineTo(c.x + c.r, c.y);
                ctx.closePath();
                ctx.fill();
                ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
                ctx.fillStyle = C.rojo; ctx.fill();
                ctx.strokeStyle = C.tinta; ctx.lineWidth = 2.5; ctx.stroke();
                ctx.beginPath(); ctx.arc(c.x - 3, c.y + 3, 4, 0, Math.PI * 2);
                ctx.fillStyle = C.amarillo; ctx.fill();
            }
            // Aviso de cometa: triangulo que parpadea arriba, donde va a caer
            for (let i = 0; i < alertas.length; i++) {
                const al = alertas[i];
                if (Math.floor(al.t * 10) % 2 === 0) continue;
                const ay = 122;
                ctx.beginPath();
                ctx.moveTo(al.x, ay - 15); ctx.lineTo(al.x + 15, ay + 11); ctx.lineTo(al.x - 15, ay + 11);
                ctx.closePath();
                ctx.fillStyle = C.rojo; ctx.fill();
                ctx.strokeStyle = C.tinta; ctx.lineWidth = 2.5; ctx.lineJoin = "round"; ctx.stroke();
                ctx.fillStyle = "#fff";
                ctx.font = "800 14px " + TEXTO;
                ctx.textAlign = "center"; ctx.textBaseline = "middle";
                ctx.fillText("!", al.x, ay + 3);
                // linea punteada de por donde cae
                ctx.setLineDash([4, 8]);
                ctx.strokeStyle = "rgba(255,77,94,.45)"; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(al.x, ay + 16); ctx.lineTo(al.x, H); ctx.stroke();
                ctx.setLineDash([]);
            }

            const visible = estado !== "fin" && !(invulnerable > 0 && estado === "jugando" && Math.floor(reloj * 14) % 2 === 0);
            if (visible) {
                dibujarCohete(jugador.x, jugador.y, 0.44, jugador.inclinacion, true);
                if (escudo) {
                    ctx.strokeStyle = C.cian;
                    ctx.lineWidth = 3;
                    ctx.globalAlpha = 0.6 + 0.3 * Math.sin(reloj * 6);
                    ctx.beginPath(); ctx.arc(jugador.x, jugador.y - 4, 40, 0, Math.PI * 2); ctx.stroke();
                    ctx.globalAlpha = 0.12;
                    ctx.fillStyle = C.cian; ctx.fill();
                    ctx.globalAlpha = 1;
                }
            }

            for (let i = 0; i < particulas.length; i++) {
                const p = particulas[i];
                ctx.globalAlpha = Math.max(0, p.vida / p.total);
                ctx.fillStyle = p.color;
                ctx.beginPath(); ctx.arc(p.x, p.y, p.t, 0, Math.PI * 2); ctx.fill();
            }
            ctx.globalAlpha = 1;

            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            for (let i = 0; i < avisos.length; i++) {
                const a = avisos[i];
                ctx.globalAlpha = Math.min(1, a.vida * 2.2);
                ctx.font = a.grande ? "800 " + Math.min(24, W / 15) + "px " + TITULO : "800 14px " + TEXTO;
                ctx.lineWidth = 4; ctx.strokeStyle = C.tinta; ctx.lineJoin = "round";
                ctx.strokeText(a.texto, a.x, a.y);
                ctx.fillStyle = a.color;
                ctx.fillText(a.texto, a.x, a.y);
            }
            ctx.globalAlpha = 1;
            ctx.restore();
        }

        function dibujarTablero() {
            const m = 16;
            ctx.textBaseline = "alphabetic";
            ctx.textAlign = "left";
            ctx.fillStyle = C.lila;
            ctx.font = "700 10px " + TEXTO;
            ctx.fillText("PUNTAJE GLOBAL", m, 24);
            ctx.fillStyle = "#fff";
            ctx.font = "800 30px " + TITULO;
            const txt = String(puntaje);
            ctx.fillText(txt, m, 52);
            const ancho = ctx.measureText(txt).width;
            ctx.fillStyle = C.lila;
            ctx.font = "700 13px " + TEXTO;
            ctx.fillText("/ " + META, m + ancho + 6, 52);

            // Barra de avance
            const by = 62, bh = 10, bw = W - m * 2;
            cajaRedonda(m, by, bw, bh, 5);
            ctx.fillStyle = "rgba(255,255,255,.14)"; ctx.fill();
            const lleno = Math.max(bh, bw * (puntaje / META));
            cajaRedonda(m, by, lleno, bh, 5);
            ctx.fillStyle = C.amarillo; ctx.fill();

            // Vidas
            for (let i = 0; i < 3; i++) {
                ctx.globalAlpha = i < vidas ? 1 : 0.22;
                dibujarCohete(m + 10 + i * 24, by + 36, 0.22, 0, false);
            }
            ctx.globalAlpha = 1;

            // Materias del simulacro
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.font = "800 9px " + TEXTO;
            for (let i = 0; i < MATERIAS.length; i++) {
                const mat = MATERIAS[MATERIAS.length - 1 - i];
                const cx = W - m - 10 - i * 24, cy = by + 30;
                const tiene = atrapadas.indexOf(mat.sigla) !== -1;
                ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2);
                ctx.fillStyle = tiene ? mat.color : "rgba(255,255,255,.1)";
                ctx.fill();
                ctx.strokeStyle = tiene ? C.tinta : "rgba(255,255,255,.35)";
                ctx.lineWidth = 1.5; ctx.stroke();
                ctx.fillStyle = tiene ? C.tinta : "rgba(255,255,255,.6)";
                ctx.fillText(mat.sigla.charAt(0), cx, cy + 0.5);
            }

            // Poder activo
            if (triple > 0 && estado === "jugando") {
                ctx.textAlign = "center";
                ctx.font = "700 11px " + TEXTO;
                ctx.fillStyle = C.cian;
                ctx.fillText("Disparo triple " + Math.ceil(triple) + " s", W / 2, by + 30);
            }
        }

        function partirTexto(texto, anchoMax) {
            const palabras = texto.split(" ");
            const lineas = [];
            let actual = "";
            for (let i = 0; i < palabras.length; i++) {
                const prueba = actual ? actual + " " + palabras[i] : palabras[i];
                if (actual && ctx.measureText(prueba).width > anchoMax) {
                    lineas.push(actual);
                    actual = palabras[i];
                } else {
                    actual = prueba;
                }
            }
            if (actual) lineas.push(actual);
            return lineas;
        }

        // Cartel central: etiqueta chica, titulo, parrafos y la accion que parpadea
        function dibujarCartel(etiqueta, titulo, colorTitulo, parrafos, accion) {
            const ancho = Math.min(W - 32, 400);
            const dentro = ancho - 44;
            const tamTitulo = Math.min(38, ancho / 8.2);
            const fuenteParrafo = "500 14.5px " + TEXTO;

            ctx.font = fuenteParrafo;
            const bloques = parrafos.map((p) => partirTexto(p, dentro));
            let alto = 26 + 14 + 10 + tamTitulo + 16;
            bloques.forEach((b) => { alto += b.length * 20 + 8; });
            alto += 10 + 40 + 24;

            const x = (W - ancho) / 2;
            const y = Math.max(108, (H - alto) / 2);

            cajaRedonda(x + 6, y + 6, ancho, alto, 22);
            ctx.fillStyle = C.amarillo; ctx.fill();
            cajaRedonda(x, y, ancho, alto, 22);
            ctx.fillStyle = C.crema; ctx.fill();
            ctx.strokeStyle = C.tinta; ctx.lineWidth = 3; ctx.stroke();

            ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
            let cy = y + 26 + 12;
            ctx.fillStyle = "#555175";
            ctx.font = "700 11px " + TEXTO;
            ctx.fillText(etiqueta.toUpperCase(), W / 2, cy);

            cy += 10 + tamTitulo;
            ctx.font = "800 " + tamTitulo + "px " + TITULO;
            ctx.fillStyle = colorTitulo;
            ctx.fillText(titulo, W / 2, cy);

            cy += 16;
            ctx.font = fuenteParrafo;
            ctx.fillStyle = C.tinta;
            bloques.forEach((b) => {
                b.forEach((linea) => { cy += 20; ctx.fillText(linea, W / 2, cy); });
                cy += 8;
            });

            // Boton
            cy += 10;
            const bw = Math.min(dentro, 290), bh = 40, bx = (W - bw) / 2;
            const late = espera > 0 ? 0.45 : 0.82 + 0.18 * Math.sin(reloj * 5);
            ctx.globalAlpha = late;
            cajaRedonda(bx + 3, cy + 3, bw, bh, 12);
            ctx.fillStyle = C.cian; ctx.fill();
            cajaRedonda(bx, cy, bw, bh, 12);
            ctx.fillStyle = C.tinta; ctx.fill();
            ctx.fillStyle = "#fff";
            ctx.font = "700 14px " + TEXTO;
            ctx.textBaseline = "middle";
            ctx.fillText(accion, W / 2, cy + bh / 2 + 1);
            ctx.globalAlpha = 1;
        }

        function comoTiempo(seg) {
            const s = Math.floor(seg);
            return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
        }

        function dibujar() {
            dibujarFondo();
            dibujarMundo();
            dibujarTablero();

            const tactil = window.matchMedia("(pointer: coarse)").matches;
            const sigue = tactil ? "Toca para " : "Clic o ESPACIO para ";

            if (estado === "inicio") {
                dibujarCartel("Juego secreto PRE-ICMA", "MISIÓN 500", C.azul, [
                    tactil ? "Arrastra el dedo para mover el cohete. Dispara solo."
                           : "Mueve el cohete con el mouse o las flechas. Dispara solo.",
                    "Rompe asteroides, esquiva los cometas rojos (esos no se rompen) y atrapa las 5 materias.",
                    "Llega a 500 puntos con tus 3 vidas." + (record ? " Tu récord: " + record + "." : "")
                ], sigue + "despegar");
            } else if (estado === "pausa") {
                dibujarCartel("En pausa", "Respira", C.azul, [
                    "El cohete te espera. Vas en " + puntaje + " de " + META + "."
                ], sigue + "seguir");
            } else if (estado === "fin") {
                let frase;
                if (puntaje < 150) frase = "Toca repasar. Hasta los mejores arrancan así.";
                else if (puntaje < 300) frase = "Vas bien. Con más práctica ese puntaje sube.";
                else if (puntaje < 450) frase = "¡Muy buen puntaje! Ya hueles la beca.";
                else frase = "¡A un pelo del 500! La próxima es la tuya.";
                dibujarCartel("Fin de la misión", puntaje + " / " + META, C.naranja, [
                    frase,
                    nuevoRecord ? "¡Nuevo récord!" : "Tu récord: " + record + "."
                ], sigue + "reintentar");
            } else if (estado === "victoria") {
                dibujarCartel("Puntaje perfecto", "¡500 / 500!", C.azul, [
                    "Misión cumplida en " + comoTiempo(tiempo) + " y con " + vidas + (vidas === 1 ? " vida" : " vidas") + " de sobra.",
                    "Ahora a sacarlo igual en el ICFES de verdad."
                ], sigue + "jugar otra vez");
            }
        }

        /* ----- ciclo ----- */
        function cuadro(t) {
            if (!abierto) return;
            const dt = Math.min(0.033, Math.max(0, (t - ultimo) / 1000));
            ultimo = t;
            actualizar(dt);
            dibujar();
            cuadroId = requestAnimationFrame(cuadro);
        }

        /* ----- acciones ----- */
        function accionPrincipal() {
            prenderAudio();
            if (estado === "inicio") nuevaPartida();
            else if (estado === "pausa") estado = antesDePausa;
            else if ((estado === "fin" || estado === "victoria") && espera <= 0) nuevaPartida();
        }
        function pausar() {
            if (estado === "jugando") { antesDePausa = estado; estado = "pausa"; dibujar(); }
            else if (estado === "pausa") estado = antesDePausa;
        }
        function cambiarSonido() {
            silencio = !silencio;
            btnSonido.classList.toggle("off", silencio);
            try { localStorage.setItem(CLAVE_SILENCIO, silencio ? "1" : "0"); } catch (e) { /* sin almacenamiento */ }
            if (!silencio) { prenderAudio(); sonido.materia(); }
        }
        function cerrar() {
            if (!abierto) return;
            abierto = false;
            cancelAnimationFrame(cuadroId);
            window.removeEventListener("keydown", alBajarTecla, true);
            window.removeEventListener("keyup", alSoltarTecla, true);
            window.removeEventListener("resize", medir);
            window.removeEventListener("blur", alPerderFoco);
            document.removeEventListener("visibilitychange", alPerderFoco);
            capa.remove();
            if (focoAnterior && focoAnterior.focus && document.contains(focoAnterior)) {
                try { focoAnterior.focus({ preventScroll: true }); } catch (e) { /* nada */ }
            }
        }

        /* ----- controles ----- */
        function alBajarTecla(e) {
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            const k = e.key;
            // Mientras el juego esta abierto, el login no recibe el teclado
            e.stopPropagation();
            if (k === "Tab") return;
            if (k === "Escape") { e.preventDefault(); cerrar(); return; }
            if (k === "ArrowLeft" || k === "a" || k === "A") { teclas.izq = true; e.preventDefault(); }
            else if (k === "ArrowRight" || k === "d" || k === "D") { teclas.der = true; e.preventDefault(); }
            else if (k === " " || k === "Enter") {
                if (e.target && e.target.classList && e.target.classList.contains("ji-btn")) return;
                e.preventDefault();
                if (!e.repeat) accionPrincipal();
            }
            else if (k === "p" || k === "P") { if (!e.repeat) pausar(); }
            else if (k === "m" || k === "M") { if (!e.repeat) cambiarSonido(); }
            else if (k === "ArrowUp" || k === "ArrowDown") e.preventDefault();
        }
        function alSoltarTecla(e) {
            const k = e.key;
            if (k === "ArrowLeft" || k === "a" || k === "A") teclas.izq = false;
            else if (k === "ArrowRight" || k === "d" || k === "D") teclas.der = false;
            e.stopPropagation();
        }
        function alPerderFoco() {
            teclas.izq = teclas.der = false;
            if (estado === "jugando") pausar();
        }
        function xDelPuntero(e) {
            return e.clientX - lienzo.getBoundingClientRect().left;
        }

        lienzo.addEventListener("pointerdown", (e) => {
            e.preventDefault();
            dedoAbajo = true;
            if (lienzo.setPointerCapture) { try { lienzo.setPointerCapture(e.pointerId); } catch (err) { /* nada */ } }
            if (estado === "jugando") objetivoX = xDelPuntero(e);
            else accionPrincipal();
        });
        lienzo.addEventListener("pointermove", (e) => {
            if (estado !== "jugando") return;
            if (e.pointerType === "mouse" || dedoAbajo) objetivoX = xDelPuntero(e);
        });
        const alSoltarDedo = () => { dedoAbajo = false; };
        lienzo.addEventListener("pointerup", alSoltarDedo);
        lienzo.addEventListener("pointercancel", alSoltarDedo);
        lienzo.addEventListener("contextmenu", (e) => e.preventDefault());

        capa.querySelector(".ji-botones").addEventListener("click", (e) => {
            const btn = e.target.closest(".ji-btn");
            if (!btn) return;
            const a = btn.dataset.a;
            if (a === "cerrar") { cerrar(); return; }
            if (a === "pausa") pausar();
            else if (a === "sonido") cambiarSonido();
            btn.blur();
            capa.focus({ preventScroll: true });
        });

        window.addEventListener("keydown", alBajarTecla, true);
        window.addEventListener("keyup", alSoltarTecla, true);
        window.addEventListener("resize", medir);
        window.addEventListener("blur", alPerderFoco);
        document.addEventListener("visibilitychange", alPerderFoco);

        medir();
        ultimo = performance.now();
        cuadroId = requestAnimationFrame(cuadro);
    }

    // Por si se quiere abrir desde otro lado (un boton, la consola)
    window.abrirJuegoIcfes = abrir;
})();
