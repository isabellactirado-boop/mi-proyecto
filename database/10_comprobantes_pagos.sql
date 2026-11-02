-- =====================================================================
-- Base de datos: Pre-ICFES
-- Archivo: database/10_comprobantes_pagos.sql
-- Descripcion: numero de referencia en cada pago (para revisar
--              transferencias y detectar comprobantes repetidos) y tabla
--              con la foto o PDF del comprobante.
-- Orden de ejecucion: ... -> 09_rol_estudiante.sql -> 10_comprobantes_pagos.sql
-- Todo va dentro de una transaccion y se puede correr mas de una vez.
-- =====================================================================

BEGIN;

-- 1. Referencia de la transferencia / Nequi / Daviplata
ALTER TABLE pagos
    ADD COLUMN IF NOT EXISTS referencia VARCHAR(60);

-- Buscar por referencia sin importar mayusculas (y avisar si se repite)
CREATE INDEX IF NOT EXISTS idx_pagos_referencia
    ON pagos (LOWER(referencia))
    WHERE referencia IS NOT NULL;

-- 2. Comprobante (foto o PDF). Va en su propia tabla para que listar
--    pagos no cargue los archivos. Un comprobante por pago.
--    Las fotos llegan comprimidas desde el panel; el limite es 2 MB.
CREATE TABLE IF NOT EXISTS comprobantes_pago (
    id_comprobante  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_pago         INTEGER NOT NULL UNIQUE
                    REFERENCES pagos (id_pago) ON DELETE CASCADE,
    tipo_mime       VARCHAR(30) NOT NULL
                    CHECK (tipo_mime IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
    tamano_bytes    INTEGER NOT NULL CHECK (tamano_bytes BETWEEN 1 AND 2097152),
    contenido       BYTEA NOT NULL,
    fecha_subida    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMIT;
