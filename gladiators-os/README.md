# Gladiators OS

Plataforma de gestión comercial, rendimiento y reclutamiento del equipo
Gladiators — American Income Life. Reemplaza los dos sistemas anteriores
(Indicadores Gladiators y Pipeline Gladiators), que siguen en producción
sin tocar hasta que este entre.

- Especificación verificada: [`../docs/FASE-1-ESPECIFICACION.md`](../docs/FASE-1-ESPECIFICACION.md)
- Decisiones y su porqué: [`../docs/DECISIONES.md`](../docs/DECISIONES.md)
- Modelo visual aprobado: la pestaña DocuSign y las siete pantallas

## Estado

**Fase 2 — fundamentos.** Hay configuración, sistema visual en tokens,
clientes de Supabase, sesión, armazón de la aplicación, pantalla de entrada
y el esquema completo de base de datos. **Ninguna migración se ha
aplicado todavía.**

Lo que falta para cerrar la fase: aplicar migraciones, sembrar datos de
demostración, correr las pruebas de permisos y conectar las pantallas.

## Despliegue — lo que necesita Beru

### 1. Proyecto de Supabase

Hace falta **uno nuevo**. Los dos que existen en la cuenta (`nexora-prod`,
`rinde-prod`) son de otra cosa y no se tocan.

```bash
# en el proyecto nuevo, en orden:
supabase/migrations/001_identidad.sql
supabase/migrations/002_alcance.sql
supabase/migrations/003_reportes.sql
supabase/migrations/004_reclutamiento.sql
supabase/migrations/005_metas_contests.sql
supabase/migrations/006_auditoria.sql
supabase/migrations/007_rls.sql
```

Van numeradas y se aplican en ese orden: 002 define las funciones de
alcance de las que dependen todas las políticas de 007.

### 2. Variables de entorno

Copia `.env.example` a `.env.local` y llénalo. Tres reglas:

- `NEXT_PUBLIC_*` cruza al navegador. Ahí solo van la URL y la clave
  publicable, que bajo RLS no da acceso a nada que las políticas nieguen.
- **`SUPABASE_SERVICE_ROLE_KEY` nunca cruza al navegador ni entra al
  repositorio.** Se salta RLS por completo. Solo la usan las semillas.
- Lo de DocuSign queda vacío por ahora: ver abajo.

### 3. Correr

```bash
npm install
npm run verificar     # tipos + build + comprobación de que Tailwind corrió
npm run dev
```

**El build usa webpack a propósito, no Turbopack.** Con Turbopack el build
pasa —sin errores, con todas las rutas listadas— pero el plugin de PostCSS
de Tailwind no se ejecuta y el CSS sale **sin una sola utilidad**: la
aplicación arranca y se ve como un documento sin estilos. Por eso
`npm run verificar` termina comprobando el CSS compilado: un build verde no
prueba nada si no se mira lo que produjo.

### 4. Versiones

`next` y `@supabase/*` están fijadas a versiones **sin vulnerabilidades
conocidas** (`npm audit --omit=dev` da cero). Las primeras que elegí sí
tenían: Next 15.1.6 arrastraba CVE-2025-66478 y `auth-js` un fallo de
ruteo. Si actualizas, vuelve a correr la auditoría.

### 5. Antes de dar la fase por buena

```bash
npm run test:permisos
```

Estas pruebas **se escriben al revés**: intentan leer datos ajenos y pasan
cuando la base las bloquea. Exigen los usuarios de prueba sembrados, y cada
una se autentica como su usuario. Si alguna usara la clave de servicio se
saltaría RLS y pasarían todas sin probar nada — que es la forma más común
de tener la suite en verde y la aplicación abierta.

## Lo que está decidido y no se cambia sin hablarlo

- **Cinco rangos**, no tres roles: Agente · SA · GA · MGA · RGA. El alcance
  sale del organigrama, no de una lista de permisos. «Líder» no es un rol:
  es tener gente colgando. Administrar es un atributo aparte.
- **Los once indicadores conservan sus nombres.** No existe un campo
  «ventas»: el equivalente es `press_sale`.
- **Las siete etapas reales** del pipeline. «Examen reprobado» no es una
  etapa: es el otro desenlace del nivel 4, y por eso comparte nivel con
  «Agendado para el examen». Si eso se pierde, el embudo deja de cuadrar.
- **No hay agenda ni citas.** El campo APP del reporte diario es una
  métrica que se captura, no un calendario.
- **Las fórmulas viven solo en `lib/metricas/metricas.ts`.** Si aparece un
  `press_sale / press` dentro de un componente, es un error de revisión.
- **Una tasa sin base es `null`, no cero.** Cero presentaciones no es 0% de
  cierre: es que no hubo.

## DocuSign

La pestaña está diseñada y el flujo decidido, pero **la integración no
puede construirse todavía**: falta la lista de la sección 13 del documento
de Beru — cuenta de desarrollador, integration key, go-live, y autorizar
una vez por OAuth.

Dos reglas que no se negocian cuando llegue el momento:

1. **El token vive solo en el backend.** Jamás en el navegador, jamás en el
   repositorio. La página manda valores a un endpoint propio; ese endpoint
   habla con DocuSign.
2. **La plantilla no se renderiza nunca en la página.** La página captura
   datos; DocuSign arma y envía el sobre.

Hasta entonces la pestaña corre en modo demostración y no llama a ninguna
API. Cuando exista la key hay que leer las etiquetas reales de las trece
plantillas: **si alguna tiene campos con etiqueta genérica, hay que
detenerse y reportarlo**, no inventar el mapeo por posición.

## Pendientes de decidir

- **El corte de las 22:00** para «sin reportar». Heredado del sistema
  actual. Un agente que vende de noche sale en rojo por un día que sí
  trabajó.
- **El reloj de la aprobación.** Si el líder no revisa en X horas, ¿se
  aprueba solo, o deja de contar en contra?
- **Transiciones de etapa.** Hoy cualquier estatus salta a cualquier otro.
- **Quién mueve la etapa de un candidato.** Hoy es exclusivo del
  administrador.
- **Los puntos de quiebre.** El modelo está dibujado a 1180 px y las
  laptops del equipo son de 1280. Falta decidir qué hace el riel ahí.
