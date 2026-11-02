/* =====================================================================
   informes.js - informes de pagos y de asistencias.
   - Pagos (#inf-pagos): quien esta en mora y quien esta al dia.
   - Asistencias (#inf-asis): asistencia por estudiante, por grupo y fechas.
   Cada informe se ve en pantalla, se imprime (o guarda como PDF) y se
   descarga para Excel. Solo se activa si su panel existe en la pagina.
   Se carga solo cuando el panel se hace visible (no gasta peticiones).
   Abre la pagina con ?demo para datos de ejemplo.
   ===================================================================== */

(function () {
  const API = "https://preicma.onrender.com";
  const DEMO = new URLSearchParams(location.search).has("demo");
  const $ = (id) => document.getElementById(id);

  /* ---------- peticiones ---------- */

  async function api(ruta) {
    if (DEMO) return demo(ruta);
    const token = sessionStorage.getItem("token");
    if (!token) { window.location.replace("index.html"); throw new Error("Sin sesion"); }
    const r = await fetch(API + ruta, { headers: { Authorization: "Bearer " + token } });
    if (r.status === 401) { sessionStorage.clear(); window.location.replace("index.html"); throw new Error("Sesion vencida"); }
    let datos = null;
    try { datos = await r.json(); } catch (e) { /* sin cuerpo */ }
    if (!r.ok) {
      let d = datos && datos.detail;
      if (typeof d !== "string") d = r.status === 403 ? "No tienes permiso para ver este informe" : "Error " + r.status;
      throw new Error(d);
    }
    return datos;
  }

  /* ---------- formatos ---------- */

  function el(tag, clase, texto) {
    const n = document.createElement(tag);
    if (clase) n.className = clase;
    if (texto !== undefined && texto !== null) n.textContent = texto;
    return n;
  }
  const dinero = (v) => "$ " + Math.round(Number(v) || 0).toLocaleString("es-CO");
  const num = (v) => Number(v) || 0;
  const pct = (v) => (v === null || v === undefined ? "—" : String(v).replace(".", ",") + " %");
  const hoyTexto = () => new Date().toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
  function fechaLarga(iso) {
    const p = String(iso).split("-");
    return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
  }
  function hoyISO(dias) {
    const f = new Date();
    f.setDate(f.getDate() + (dias || 0));
    return f.getFullYear() + "-" + String(f.getMonth() + 1).padStart(2, "0") + "-" + String(f.getDate()).padStart(2, "0");
  }

  function vacio(tbody, columnas, texto) {
    tbody.textContent = "";
    const tr = el("tr");
    const td = el("td", "ac-vacio", texto);
    td.colSpan = columnas;
    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  function whatsapp(telefono, texto) {
    const n = String(telefono || "").replace(/\D/g, "");
    if (n.length < 10) return null;
    const a = el("a", "ac-wa", "WhatsApp");
    a.href = "https://wa.me/" + (n.length === 10 ? "57" + n : n) + "?text=" + encodeURIComponent(texto);
    a.target = "_blank";
    a.rel = "noopener";
    return a;
  }

  function contacto(f, texto) {
    const td = el("td");
    td.appendChild(el("span", null, f.acudiente || "Sin acudiente"));
    const tel = f.telefono_acudiente || f.telefono_estudiante;
    if (tel) td.appendChild(el("small", "ac-sub", tel));
    const wa = whatsapp(tel, texto);
    if (wa) td.appendChild(wa);
    return td;
  }

  function resumen(caja, datos) {
    caja.textContent = "";
    datos.forEach(([etiqueta, valor, tono]) => {
      const d = el("div", "inf-dato" + (tono ? " " + tono : ""));
      d.appendChild(el("strong", null, valor));
      d.appendChild(el("span", null, etiqueta));
      caja.appendChild(d);
    });
  }

  /* ---------- salida: imprimir / PDF y Excel ---------- */

  function escapar(t) {
    return String(t === null || t === undefined ? "" : t)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // informe = { titulo, subtitulo, resumen: [[etiqueta, valor]], columnas: [], filas: [[]] }
  function imprimir(informe) {
    const v = window.open("", "_blank");
    if (!v) { alert("El navegador bloqueó la ventana. Permite las ventanas emergentes para esta página."); return; }
    const logo = new URL("logo.jpeg", location.href).href;
    v.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<title>${escapar(informe.titulo)} · PRE-ICMA</title>
<style>
  *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#1a1240;margin:28px}
  header{display:flex;align-items:center;gap:16px;border-bottom:3px solid #1a1240;padding-bottom:14px;margin-bottom:18px}
  header img{width:58px;height:58px;border-radius:12px;object-fit:cover;border:2px solid #1a1240}
  h1{margin:0;font-size:21px} header p{margin:3px 0 0;color:#5b5788;font-size:12.5px}
  .res{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:18px}
  .res div{border:2px solid #1a1240;border-radius:10px;padding:8px 14px;min-width:130px}
  .res strong{display:block;font-size:17px} .res span{font-size:11.5px;color:#5b5788}
  table{width:100%;border-collapse:collapse;font-size:11.5px}
  th{background:#1a1240;color:#fff;text-align:left;padding:7px 8px;font-size:10.5px;text-transform:uppercase;letter-spacing:.03em}
  td{padding:6px 8px;border-bottom:1px solid #d9d5ea;vertical-align:top}
  tr:nth-child(even) td{background:#f6f1e7}
  footer{margin-top:22px;font-size:10.5px;color:#5b5788;text-align:center}
  @media print{body{margin:12mm} th{-webkit-print-color-adjust:exact;print-color-adjust:exact} tr:nth-child(even) td{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>
<header><img src="${escapar(logo)}" alt=""><div><h1>${escapar(informe.titulo)}</h1>
<p>PRE-ICMA · ${escapar(informe.subtitulo)} · Generado el ${escapar(hoyTexto())}</p></div></header>
<div class="res">${informe.resumen.map(([e, val]) => `<div><strong>${escapar(val)}</strong><span>${escapar(e)}</span></div>`).join("")}</div>
<table><thead><tr>${informe.columnas.map((c) => `<th>${escapar(c)}</th>`).join("")}</tr></thead>
<tbody>${informe.filas.length
      ? informe.filas.map((f) => `<tr>${f.map((c) => `<td>${escapar(c)}</td>`).join("")}</tr>`).join("")
      : `<tr><td colspan="${informe.columnas.length}" style="text-align:center;padding:18px">Sin registros</td></tr>`}</tbody></table>
<footer>Informe generado desde el panel de PRE-ICMA</footer>
<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script>
</body></html>`);
    v.document.close();
  }

  // CSV con ";" y BOM: Excel en español lo abre en columnas y con tildes
  function descargarExcel(informe, nombre) {
    const celda = (t) => {
      const s = String(t === null || t === undefined ? "" : t);
      return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lineas = [informe.columnas, ...informe.filasExcel].map((f) => f.map(celda).join(";"));
    const blob = new Blob(["﻿" + lineas.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = nombre + "_" + hoyISO() + ".csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // Ejecuta `cargar` la primera vez que el panel se ve en pantalla
  function alVerse(panel, cargar) {
    if (!("IntersectionObserver" in window)) return cargar();
    const obs = new IntersectionObserver((entradas) => {
      if (entradas.some((e) => e.isIntersecting)) { obs.disconnect(); cargar(); }
    });
    obs.observe(panel);
  }

  function ocupado(botones, si) { botones.forEach((b) => { if (b) b.disabled = si; }); }

  /* =====================================================================
     INFORME DE PAGOS
     ===================================================================== */

  const ESTADO_PAGO = { todos: "Todos", en_mora: "En mora", al_dia: "Al día" };

  function iniciarPagos() {
    const panel = $("inf-pagos");
    if (!panel) return;
    const filtro = $("ip-estado"), tabla = $("ip-tabla"), caja = $("ip-resumen");
    const bImprimir = $("ip-imprimir"), bExcel = $("ip-excel");
    let ultimo = null;

    async function cargar() {
      vacio(tabla, 7, "Cargando…");
      ocupado([bImprimir, bExcel], true);
      try {
        ultimo = await api("/reportes/pagos?estado=" + filtro.value);
      } catch (e) {
        ultimo = null;
        caja.textContent = "";
        return vacio(tabla, 7, e.message);
      }
      const r = ultimo.resumen;
      resumen(caja, [
        ["En mora", num(r.en_mora), num(r.en_mora) ? "mal" : ""],
        ["Al día", num(r.al_dia), "bien"],
        ["Valor vencido", dinero(r.valor_en_mora), num(r.valor_en_mora) ? "mal" : ""],
        ["Saldo por cobrar", dinero(r.saldo_pendiente), ""],
      ]);
      ocupado([bImprimir, bExcel], false);
      const lista = ultimo.inscripciones;
      if (!lista.length) {
        return vacio(tabla, 7, filtro.value === "en_mora" ? "¡Nadie está en mora!" : "No hay inscripciones activas.");
      }
      tabla.textContent = "";
      lista.forEach((f) => {
        const tr = el("tr");
        const tdE = el("td");
        tdE.appendChild(el("strong", null, f.estudiante));
        tdE.appendChild(el("small", "ac-sub", f.doc_identidad));
        tr.appendChild(tdE);
        const tdC = el("td", null, f.curso);
        tdC.appendChild(el("small", "ac-sub", f.nombre_grupo || ""));
        tr.appendChild(tdC);
        tr.appendChild(el("td", null, dinero(f.total_pagado)));
        tr.appendChild(el("td", null, dinero(f.saldo_pendiente)));
        const tdM = el("td");
        if (f.estado_pago === "en_mora") {
          tdM.appendChild(el("strong", null, dinero(f.valor_en_mora)));
          tdM.appendChild(el("small", "ac-sub", num(f.cuotas_en_mora) + (num(f.cuotas_en_mora) === 1 ? " cuota" : " cuotas") +
            " · " + num(f.dias_mora_maximo) + (num(f.dias_mora_maximo) === 1 ? " día" : " días")));
        } else tdM.textContent = "—";
        tr.appendChild(tdM);
        const tdS = el("td");
        tdS.appendChild(f.estado_pago === "en_mora" ? el("span", "badge b-red", "En mora") : el("span", "badge b-ok", "Al día"));
        tr.appendChild(tdS);
        const saludo = "Hola" + (f.acudiente ? " " + f.acudiente.split(" ")[0] : "") + ", te escribimos de PRE ICMA. ";
        tr.appendChild(contacto(f, f.estado_pago === "en_mora"
          ? saludo + f.estudiante + " tiene " + dinero(f.valor_en_mora) + " en cuotas vencidas de " + f.curso + ". ¡Gracias!"
          : saludo + "Te recordamos que el saldo de " + f.estudiante + " en " + f.curso + " es " + dinero(f.saldo_pendiente) + "."));
        tabla.appendChild(tr);
      });
    }

    function armar() {
      const r = ultimo.resumen;
      const columnas = ["Estudiante", "Documento", "Curso", "Grupo", "Valor acordado", "Pagado", "Saldo",
        "Cuotas vencidas", "Valor vencido", "Días de mora", "Estado", "Acudiente", "Teléfono"];
      const base = ultimo.inscripciones.map((f) => [
        f.estudiante, f.doc_identidad, f.curso, f.nombre_grupo || "",
        f.valor_acordado, f.total_pagado, f.saldo_pendiente,
        num(f.cuotas_en_mora), f.valor_en_mora, num(f.dias_mora_maximo),
        f.estado_pago === "en_mora" ? "En mora" : "Al día",
        f.acudiente || "", f.telefono_acudiente || f.telefono_estudiante || "",
      ]);
      return {
        titulo: "Informe de pagos",
        subtitulo: "Inscripciones activas · " + ESTADO_PAGO[filtro.value],
        resumen: [["En mora", num(r.en_mora)], ["Al día", num(r.al_dia)],
          ["Valor vencido", dinero(r.valor_en_mora)], ["Saldo por cobrar", dinero(r.saldo_pendiente)]],
        columnas,
        filas: base.map((f) => f.map((c, i) => ([4, 5, 6, 8].includes(i) ? dinero(c) : c))),
        filasExcel: base.map((f) => f.map((c, i) => ([4, 5, 6, 8].includes(i) ? Math.round(num(c)) : c))),
      };
    }

    filtro.addEventListener("change", cargar);
    bImprimir.addEventListener("click", () => ultimo && imprimir(armar()));
    bExcel.addEventListener("click", () => ultimo && descargarExcel(armar(), "informe_pagos_" + filtro.value));
    alVerse(panel, cargar);
  }

  /* =====================================================================
     INFORME DE ASISTENCIAS
     ===================================================================== */

  function iniciarAsistencias() {
    const panel = $("inf-asis");
    if (!panel) return;
    const grupo = $("ia-grupo"), desde = $("ia-desde"), hasta = $("ia-hasta");
    const tabla = $("ia-tabla"), caja = $("ia-resumen"), msg = $("ia-msg");
    const bVer = $("ia-ver"), bImprimir = $("ia-imprimir"), bExcel = $("ia-excel");
    let ultimo = null, consulta = null;

    desde.value = hoyISO(-30);
    hasta.value = hoyISO();

    async function llenarGrupos() {
      try {
        const lista = await api("/grupos");
        lista.forEach((g) => {
          const o = el("option", null, g.nombre_curso + " · " + g.nombre_grupo);
          o.value = g.id_grupo;
          grupo.appendChild(o);
        });
      } catch (e) { /* el informe igual funciona con "Todos los grupos" */ }
    }

    async function cargar() {
      msg.textContent = "";
      if (desde.value && hasta.value && desde.value > hasta.value) {
        msg.textContent = "La fecha \"desde\" no puede ser después de \"hasta\".";
        return;
      }
      const q = new URLSearchParams();
      if (grupo.value) q.set("id_grupo", grupo.value);
      if (desde.value) q.set("desde", desde.value);
      if (hasta.value) q.set("hasta", hasta.value);
      vacio(tabla, 6, "Cargando…");
      ocupado([bVer, bImprimir, bExcel], true);
      try {
        ultimo = await api("/reportes/asistencias?" + q.toString());
        consulta = {
          grupo: grupo.value ? grupo.options[grupo.selectedIndex].textContent : "Todos los grupos",
          desde: desde.value, hasta: hasta.value,
        };
      } catch (e) {
        ultimo = null;
        caja.textContent = "";
        bVer.disabled = false;
        return vacio(tabla, 6, e.message);
      }
      ocupado([bVer, bImprimir, bExcel], false);
      const r = ultimo.resumen;
      const minimo = num(r.minimo_faltas_seguidas) || 3;
      resumen(caja, [
        ["Estudiantes", num(r.estudiantes), ""],
        ["Asistencia promedio", pct(r.porcentaje_asistencia), r.porcentaje_asistencia !== null && r.porcentaje_asistencia < 70 ? "mal" : "bien"],
        ["Con " + minimo + "+ faltas seguidas", num(r.con_inasistencias_seguidas), num(r.con_inasistencias_seguidas) ? "mal" : ""],
        ["Asistencias registradas", num(r.registros_de_asistencia), ""],
      ]);
      const lista = ultimo.estudiantes;
      if (!lista.length) return vacio(tabla, 6, "No hay estudiantes activos en ese grupo.");
      tabla.textContent = "";
      lista.forEach((f) => {
        const tr = el("tr");
        const tdE = el("td");
        tdE.appendChild(el("strong", null, f.estudiante));
        tdE.appendChild(el("small", "ac-sub", f.doc_identidad));
        tr.appendChild(tdE);
        const tdG = el("td", null, f.curso);
        tdG.appendChild(el("small", "ac-sub", f.nombre_grupo));
        tr.appendChild(tdG);
        const tdD = el("td");
        if (num(f.total_clases)) {
          tdD.appendChild(el("span", null, num(f.presentes) + " de " + num(f.total_clases) + " presente"));
          tdD.appendChild(el("small", "ac-sub", num(f.tardes) + " tarde · " + num(f.ausentes) + " ausente · " + num(f.excusas) + " excusa"));
        } else tdD.appendChild(el("span", "ac-sub", "Sin clases registradas"));
        tr.appendChild(tdD);
        const tdP = el("td");
        if (f.porcentaje_asistencia !== null) {
          const p = Number(f.porcentaje_asistencia);
          const m = el("div", "meter");
          const i = el("i", p < 60 ? "full" : p < 80 ? "warn" : "");
          i.style.setProperty("--p", Math.max(4, p) + "%");
          m.appendChild(i);
          tdP.appendChild(el("strong", null, pct(f.porcentaje_asistencia)));
          tdP.appendChild(m);
        } else tdP.textContent = "—";
        tr.appendChild(tdP);
        const tdF = el("td");
        const fs = num(f.faltas_seguidas);
        tdF.appendChild(fs >= minimo ? el("span", "badge b-red", fs + " seguidas")
          : fs > 0 ? el("span", "badge b-warn", fs + (fs === 1 ? " falta" : " seguidas")) : el("span", "badge b-ok", "Bien"));
        tr.appendChild(tdF);
        tr.appendChild(contacto(f, "Hola" + (f.acudiente ? " " + f.acudiente.split(" ")[0] : "") + ", te escribimos de PRE ICMA. " +
          (fs >= minimo ? f.estudiante + " ha faltado a sus últimas " + fs + " clases de " + f.curso + ". ¿Todo bien?"
            : "Te compartimos que la asistencia de " + f.estudiante + " en " + f.curso + " es de " + pct(f.porcentaje_asistencia) + ".")));
        tabla.appendChild(tr);
      });
    }

    function armar() {
      const r = ultimo.resumen;
      const rango = (consulta.desde ? fechaLarga(consulta.desde) : "el inicio") + " a " + (consulta.hasta ? fechaLarga(consulta.hasta) : "hoy");
      const columnas = ["Estudiante", "Documento", "Curso", "Grupo", "Clases", "Presente", "Tarde", "Ausente",
        "Excusa", "% asistencia", "Faltas seguidas", "Acudiente", "Teléfono"];
      const base = ultimo.estudiantes.map((f) => [
        f.estudiante, f.doc_identidad, f.curso, f.nombre_grupo, num(f.total_clases), num(f.presentes),
        num(f.tardes), num(f.ausentes), num(f.excusas), f.porcentaje_asistencia, num(f.faltas_seguidas),
        f.acudiente || "", f.telefono_acudiente || f.telefono_estudiante || "",
      ]);
      return {
        titulo: "Informe de asistencias",
        subtitulo: consulta.grupo + " · de " + rango,
        resumen: [["Estudiantes", num(r.estudiantes)], ["Asistencia promedio", pct(r.porcentaje_asistencia)],
          ["Con " + (num(r.minimo_faltas_seguidas) || 3) + "+ faltas seguidas", num(r.con_inasistencias_seguidas)]],
        columnas,
        filas: base.map((f) => f.map((c, i) => (i === 9 ? pct(c) : c))),
        filasExcel: base.map((f) => f.map((c, i) => (i === 9 ? (c === null ? "" : String(c).replace(".", ",")) : c))),
      };
    }

    bVer.addEventListener("click", cargar);
    grupo.addEventListener("change", cargar);
    bImprimir.addEventListener("click", () => ultimo && imprimir(armar()));
    bExcel.addEventListener("click", () => ultimo && descargarExcel(armar(), "informe_asistencias"));
    alVerse(panel, () => { llenarGrupos(); cargar(); });
  }

  /* ---------- datos de ejemplo (?demo) ---------- */

  function demo(ruta) {
    if (ruta.indexOf("/grupos") === 0) {
      return Promise.resolve([
        { id_grupo: 1, nombre_curso: "Pre-ICFES Cal. B", nombre_grupo: "Grupo 1" },
        { id_grupo: 2, nombre_curso: "Pre-ICFES Cal. B", nombre_grupo: "Grupo 2" },
      ]);
    }
    if (ruta.indexOf("/reportes/pagos") === 0) {
      const todos = [
        { id_inscripcion: 11, doc_identidad: "1002223334", estudiante: "Juan Pérez", curso: "Pre-ICFES Cal. B", nombre_grupo: "Grupo 2",
          valor_acordado: 900000, total_pagado: 300000, saldo_pendiente: 600000, cuotas_en_mora: 2, valor_en_mora: 400000,
          dias_mora_maximo: 38, estado_pago: "en_mora", acudiente: "María Gómez", telefono_acudiente: "3001112233" },
        { id_inscripcion: 14, doc_identidad: "1005556667", estudiante: "Laura Ríos", curso: "Taller de Inglés", nombre_grupo: "Grupo 1",
          valor_acordado: 250000, total_pagado: 0, saldo_pendiente: 250000, cuotas_en_mora: 1, valor_en_mora: 250000,
          dias_mora_maximo: 6, estado_pago: "en_mora", acudiente: null, telefono_estudiante: "3159998877" },
        { id_inscripcion: 12, doc_identidad: "1009998887", estudiante: "Ana Ruiz", curso: "Pre-ICFES Cal. B", nombre_grupo: "Grupo 1",
          valor_acordado: 900000, total_pagado: 600000, saldo_pendiente: 300000, cuotas_en_mora: 0, valor_en_mora: 0,
          dias_mora_maximo: 0, estado_pago: "al_dia", acudiente: "Pedro Ruiz", telefono_acudiente: "3104445566" },
      ];
      const estado = new URLSearchParams(ruta.split("?")[1]).get("estado");
      return Promise.resolve({
        resumen: { en_mora: 2, al_dia: 1, valor_en_mora: 650000, saldo_pendiente: 1150000 },
        inscripciones: todos.filter((f) => estado === "todos" || f.estado_pago === estado),
      });
    }
    if (ruta.indexOf("/reportes/asistencias") === 0) {
      return Promise.resolve({
        resumen: { estudiantes: 3, registros_de_asistencia: 24, porcentaje_asistencia: 70.8, con_inasistencias_seguidas: 1, minimo_faltas_seguidas: 3 },
        estudiantes: [
          { doc_identidad: "1009998887", estudiante: "Ana Ruiz", curso: "Pre-ICFES Cal. B", nombre_grupo: "Grupo 1", total_clases: 8,
            presentes: 8, tardes: 0, ausentes: 0, excusas: 0, porcentaje_asistencia: 100, faltas_seguidas: 0, acudiente: "Pedro Ruiz", telefono_acudiente: "3104445566" },
          { doc_identidad: "1002223334", estudiante: "Juan Pérez", curso: "Pre-ICFES Cal. B", nombre_grupo: "Grupo 2", total_clases: 8,
            presentes: 4, tardes: 1, ausentes: 3, excusas: 0, porcentaje_asistencia: 50, faltas_seguidas: 3, acudiente: "María Gómez", telefono_acudiente: "3001112233" },
          { doc_identidad: "1005556667", estudiante: "Laura Ríos", curso: "Pre-ICFES Cal. B", nombre_grupo: "Grupo 2", total_clases: 8,
            presentes: 5, tardes: 2, ausentes: 0, excusas: 1, porcentaje_asistencia: 62.5, faltas_seguidas: 0, acudiente: null, telefono_estudiante: "3159998877" },
        ],
      });
    }
    return Promise.resolve([]);
  }

  document.addEventListener("DOMContentLoaded", () => {
    iniciarPagos();
    iniciarAsistencias();
  });
})();
