# Pruebas de permisos

Estas pruebas se escriben **al revés**: intentan leer y escribir datos
ajenos, y **pasan cuando la base de datos las bloquea**.

El brief lo exige: «Prepara pruebas que intenten acceder a datos de otros
agentes y equipos para verificar que el sistema los bloquea.»

Cada caso se ejecuta con un cliente de Supabase autenticado como el usuario
de prueba correspondiente — nunca con la clave de servicio, que se saltaría
RLS y haría que todas las pruebas pasaran sin probar nada.

## Casos mínimos antes de dar la Fase 2 por cerrada

| # | Intento | Resultado esperado |
|---|---|---|
| 1 | Agente lee el reporte de otro agente de otro equipo | 0 filas |
| 2 | Agente lee el reporte de un compañero de su mismo equipo | 0 filas |
| 3 | SA lee los reportes de su línea | las filas de su línea |
| 4 | SA lee el reporte de una línea hermana | 0 filas |
| 5 | GA lee los reportes de las SA que cuelgan de él | sí los ve |
| 6 | Agente intenta aprobar su propio reporte | error |
| 7 | SA intenta aprobar un reporte fuera de su alcance | error |
| 8 | Agente edita un reporte ya aprobado | error |
| 9 | Agente se cambia el rol a RGA | el UPDATE no altera `role` |
| 10 | Agente se pone `is_admin = true` | el UPDATE no altera `is_admin` |
| 11 | Usuario inactivo lee cualquier tabla | 0 filas |
| 12 | Agente lee un candidato referido por otra línea | 0 filas |
| 13 | Cualquiera borra un candidato | error (no hay policy de DELETE) |
| 14 | Cualquiera, incluido un admin, hace UPDATE en `audit_logs` | error |
| 15 | Agente crea un reporte a nombre de otro | error |
| 16 | Dos reportes del mismo agente para la misma fecha | error de unicidad |
