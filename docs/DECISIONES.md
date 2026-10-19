# Gladiators OS — Registro de decisiones

Cada entrada dice qué se decidió, quién lo decidió y por qué. Una decisión
tomada por mí y no por el cliente se marca como tal: no es un hecho verificado.

---

## D-01 · Etapas del pipeline
**Decide:** cliente · **Fecha:** 2026-10-19

Se conservan las **siete etapas reales** del sistema actual, no las provisionales
del brief:

| # | Estatus | Nivel | Terminal |
|---|---|---|---|
| 1 | Pendiente por llamar *(inicial)* | 0 | no |
| 2 | Agendado para Webinar | 1 | no |
| 3 | Agendado para entrevista | 2 | no |
| 4 | En proceso de estudio | 3 | no |
| 5 | Agendado para el examen | 4 | no |
| 6 | Examen aprobado | 5 | sí |
| 7 | Examen reprobado | **4** | sí |

**Examen reprobado no es una etapa del embudo**: es el otro desenlace del nivel 4.
Por eso comparte nivel con «Agendado para el examen» y el embudo dibuja seis
peldaños, no siete. El modelo de datos guarda `nivel` aparte del `estatus`
precisamente para que esto no se pierda.

## D-02 · Nombres de los indicadores
**Decide:** cliente · **Fecha:** 2026-10-19

Los once indicadores conservan sus nombres actuales. **No se crea un campo
«Ventas»**: lo que el brief llamaba así es `press_sale`.

`app` · `press` · `press_sale` · `press_no_sale` · `caller_calls` · `no_show` ·
`no_califica` · `reschedule` · `cita_cedida` · `referidos` · `alp`

Más `sin_actividad` y `motivo_sin_actividad`.

## D-03 · Jerarquía
**Decide:** cliente · **Fecha:** 2026-10-19

Cinco rangos: **Agente (0) · SA (1) · GA (2) · MGA (3) · RGA (4)**.

El alcance se deriva del organigrama, no de una lista de permisos. «Líder» no es
un rol: es la condición de tener gente colgando. Administrar la plataforma es un
atributo aparte (`is_admin`), porque administrar y dirigir una línea son cosas
distintas.

## D-04 · Tasas
**Decide:** Claude, con aprobación del cliente · **Fecha:** 2026-10-19

Se conserva la **tasa de NO SHOW** tal como está (`no_show / app`). **No se
inventa un show rate**: el brief lo definía como citas realizadas ÷ programadas,
y el sistema no tiene un concepto de «cita realizada» — una cita puede acabar en
Reschedule, No Califica o Cita cedida sin ser ni realizada ni no-show.

Si algún día se quiere un show rate, primero hay que definir qué desenlaces
cuentan como «realizada». Queda fuera de la V1.

## D-05 · Sin agenda ni citas
**Decide:** cliente · **Fecha:** 2026-10-19

**Gladiators OS no maneja agenda ni citas.** Se elimina del alcance la Pantalla 4
del brief, la entrada «Agenda y seguimiento» del menú, el apartado «Mis citas» de
la imagen de referencia, y las tablas `appointments` y `follow_up_tasks`.

El campo **APP (Appointment) del reporte diario se conserva**: es una métrica que
el agente captura, no un calendario. Esta decisión también elimina el riesgo de
doble fuente de verdad que estaba anotado en la Fase 1.

El menú queda en seis entradas: Inicio · Mi actividad · Indicadores ·
Reclutamiento · Metas y concursos · Reportes. Más las restringidas.

## D-06 · Autenticación
**Decide:** cliente · **Fecha:** 2026-10-19

Se eliminan los PIN compartidos. **Cuenta individual con correo y contraseña**
para cada agente, sobre Supabase Auth. **El administrador asigna los roles**: un
usuario no elige el suyo ni puede cambiarlo.

Consecuencias que esto impone al modelo:

- La contraseña vive en `auth.users` y nunca en una tabla propia.
- `profiles.role` e `is_admin` solo los puede escribir un administrador; la regla
  se aplica en la base de datos, no en el formulario.
- Un usuario nuevo nace **inactivo y sin rango útil** hasta que un administrador
  lo active y le asigne su lugar en el organigrama.
- El despliegue viejo de Apps Script y sus PIN se retiran el día que Gladiators OS
  entre en producción.

---

## Pendientes de decidir

- **Transiciones de etapa.** Hoy cualquier estatus puede pasar a cualquier otro.
  ¿Gladiators OS impone un orden o mantiene la libertad actual?
- **Quién cambia la etapa de un candidato.** Hoy es exclusivo del administrador
  («ni siquiera los supervisores pueden hacer esto», dice el código). ¿Se conserva,
  o un líder puede mover a los suyos?
- **Dónde vive la base de datos.** Ver nota al final de la Fase 2.
