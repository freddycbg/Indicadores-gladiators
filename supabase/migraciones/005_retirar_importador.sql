-- =========================================================================
-- 005_retirar_importador.sql
--
-- Corte hecho el 15/09/2026. La importacion desde la hoja ya cumplio: su
-- trabajo es vaciar y recargar las tablas, y no tiene sentido dejarla viva.
-- Si algun dia hiciera falta otra vez, esta en 003_importador.sql.
-- =========================================================================

drop function if exists public.importar_datos(jsonb, text);
delete from privado.config where clave = 'tokenImportacion';
