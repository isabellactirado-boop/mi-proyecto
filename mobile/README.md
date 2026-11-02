# Preicma Estudiantes (app Android)

App para que los estudiantes vean su próxima clase, horario, asistencia,
estado de pagos y resultados de simulacros. Es una página web (`www/`)
empaquetada como APK con [Capacitor](https://capacitorjs.com).
Usa el mismo backend del panel: `https://preicma.onrender.com`.

## Antes de usarla (una sola vez)

1. **Base de datos:** correr `database/09_rol_estudiante.sql` en Neon,
   primero en la rama de pruebas y luego en producción.
2. **Backend:** desplegar en Render **después** de la migración
   (`auth.py` ya lee la columna `usuarios.id_estudiante`).
3. **Cuentas:** el superadmin crea la cuenta con `POST /usuarios`:
   `{"correo": "...", "rol": "estudiante", "doc_identidad": "<documento>"}`.
   El estudiante ya debe estar registrado en `estudiantes`. La respuesta trae
   la contraseña temporal, que la app pide cambiar en el primer ingreso.

## Probar en el navegador

Abre `www/index.html` con cualquier servidor local. Agrega `?demo` a la URL
para ver la app con datos de ejemplo, sin backend.

## Generar el APK

Requisitos: [Node.js LTS](https://nodejs.org) y
[Android Studio](https://developer.android.com/studio).

```bash
cd mobile
npm install
npm run android:agregar   # solo la primera vez: crea la carpeta android/
npm run android:sync      # cada vez que cambies algo en www/
npm run android:abrir     # abre Android Studio
```

En Android Studio: **Build → Build App Bundle(s) / APK(s) → Build APK(s)**.
El APK queda en `android/app/build/outputs/apk/debug/app-debug.apk`.
