# Preicma Estudiantes (app Android)

App para que los estudiantes vean su próxima clase, horario, asistencia,
estado de pagos y resultados de simulacros. Es una página web (`frontend/public/app/`)
empaquetada como APK con [Capacitor](https://capacitorjs.com).
Usa el mismo backend del panel: `https://preicma.onrender.com`.

## Antes de usarla (una sola vez)

1. **Base de datos:** correr `database/09_rol_estudiante.sql` en Neon,
   primero en la rama de pruebas y luego en producción.
   Para el reto diario (pregunta del día y racha) correr también
   `database/11_reto_diario.sql` y `database/12_preguntas_del_dia.sql`.
2. **Backend:** desplegar en Render **después** de la migración
   (`auth.py` ya lee la columna `usuarios.id_estudiante`).
3. **Cuentas:** el superadmin crea la cuenta con `POST /usuarios`:
   `{"correo": "...", "rol": "estudiante", "doc_identidad": "<documento>"}`.
   El estudiante ya debe estar registrado en `estudiantes`. La respuesta trae
   la contraseña temporal, que la app pide cambiar en el primer ingreso.

## Reto diario

Cada día hay una pregunta (la misma para todos) y una racha por días seguidos.

- **Las preguntas se crean solas** con la API de Gemini de Google
  (`backend/generador.py`): el servidor pide una, la revisa y la guarda.
  Para activarlo, crear una clave en <https://aistudio.google.com/apikey> y
  ponerla en Render como variable de entorno `GEMINI_API_KEY`
  (opcional: `GEMINI_MODEL` para cambiar de modelo).
- **Sin clave, o si Gemini falla ese día,** se usa el banco fijo de
  `backend/preguntas_diarias.py`. El reto nunca se queda sin pregunta.
- **Recordatorio:** el APK avisa a las 6:00 pm si falta la pregunta de hoy.
  Son avisos del propio celular (no hay servidor de notificaciones), así que
  solo funcionan en el APK, no en la versión web.

## Probar en el navegador

También se publica en la web junto al panel: `/app/index.html`.
Abre `frontend/public/app/index.html` con cualquier servidor local. Agrega `?demo` a la URL
para ver la app con datos de ejemplo, sin backend.

## Generar el APK

**Automático (recomendado):** GitHub lo compila solo cada vez que cambia
`frontend/public/app/` o `mobile/` (workflow `.github/workflows/apk-android.yml`).
También se puede lanzar a mano: pestaña **Actions → APK Android → Run workflow**.
El APK queda en la ejecución, sección **Artifacts → PRE-ICMA-apk** (hay que
iniciar sesión en GitHub para descargarlo; dura 30 días).

Es un APK de prueba (firmado con llave de depuración): sirve para instalarlo
directo en el celular activando "Instalar apps de origen desconocido".
Para Play Store hace falta firmarlo con una llave propia.

**En tu PC (opcional):** requiere Node.js 22, Java 21 y Android Studio.

```bash
cd mobile
npm install
npm run android:agregar   # solo la primera vez: crea la carpeta android/
npm run android:sync      # cada vez que cambies algo en frontend/public/app/
npm run android:abrir     # abre Android Studio -> Build -> Build APK(s)
```

## El propietario (CEO) en la app

La cuenta con rol `propietario` también entra a la app: elige un estudiante
y ve exactamente lo que ese estudiante ve (solo lectura). Desde el panel
admin, el menú tiene **Ver app de estudiantes** y **Ver panel docente**.
