# Gladiators OS — Fase 1 · Especificación funcional y técnica

Verificado contra el código fuente de los dos sistemas:

- **Sistema A — Indicadores Gladiators**: `/home/user/Indicadores-gladiators`
- **Sistema B — Pipeline Gladiators**: `github.com/freddycbg/pipeline-gladiators`

Documento completo con tablas y propuesta visual: ver el entregable publicado.
Este archivo es la copia en el repositorio, para que la especificación viva con el código.

---

## Seis decisiones que bloquean la Fase 2

1. **Etapas del pipeline.** Las siete del brief son provisionales e incorrectas. Las reales
   son: Pendiente por llamar · Agendado para Webinar · Agendado para entrevista ·
   En proceso de estudio · Agendado para el examen · Examen aprobado · Examen reprobado.
   «Examen reprobado» **no es una etapa**: es el otro desenlace del nivel 4.
2. **«Ventas» no existe** como campo. El equivalente es `pressSale` (PRESS SALE).
   Faltan en el brief: PRESS NO SALE, Llamadas del Caller, Cita cedida, sinActividad.
3. **Son cinco rangos**, no tres roles: Agente · SA · GA · MGA · RGA. El alcance sale del
   organigrama, no de una lista de permisos. Propuesta: conservar los cinco y añadir
   `is_admin` como atributo aparte.
4. **El «show rate» del brief no existe.** El sistema calcula tasa de NO SHOW = noShow/app.
5. **La agenda no existe hoy** en ninguno de los dos sistemas. Es módulo nuevo y crea una
   segunda fuente de verdad frente al campo APP.
6. **El endpoint de Apps Script es público** y los PINs son compartidos y no caducan.

## Fórmulas confirmadas (código, no interfaz)

| Indicador | Fórmula | Sin base |
|---|---|---|
| Tasa de NO SHOW | `noShow / app * 100` | `null` si `app = 0` |
| Tasa de cierre | `pressSale / press * 100` | `null` si `press = 0` |
| Semáforo | verde >= 90%, amarillo 60–89%, rojo < 60% | — |
| Constancia | días con reporte / días hábiles; **los 7 días cuentan** | — |
| Sin reportar | último día **ya cerrado**; corte a las **22:00** | — |

## Campos del reporte diario (11 métricas)

`app` · `press` · `pressSale` · `pressNoSale` (mejor: bajo) · `callerCalls` ·
`noShow` (bajo) · `noCalifica` (bajo) · `reschedule` (bajo) · `citaCedida` (bajo) ·
`referidos` · `alp` — más `sinActividad` / `motivoSinActividad`.

**No existe hoy un campo de estado del registro.** El flujo borrador → pendiente →
aprobado → requiere corrección es nuevo.

## Campos del candidato (15 columnas)

`id` `fecha` `nombre` `apellido` `telefono` `agenteId` `agenteNombre`
`estadoUbicacion` `urgencia` `comentario` `estatus` `estatusPor` `estatusFecha`
`creado` `actualizado`.

El brief pide email, responsable de seguimiento, próxima acción y su fecha: **no existen**.
El brief omite `estadoUbicacion` (estado de EE. UU.) y `urgencia`, que **sí existen**.

## Estado

Fase 1 entregada. La Fase 2 no empieza hasta resolver las seis decisiones: las seis
cambian el esquema de base de datos.

Ninguno de los dos sistemas actuales ha sido modificado.
