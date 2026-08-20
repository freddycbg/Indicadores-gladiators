# Seguimiento Diario · Gladiator's Team

Aplicación web para que los agentes suban su reporte diario, con jerarquía de
equipo, metas semanales, semáforo de salud, contests y reportes por rango de
fechas.

## Las seis pestañas

| Pestaña | Para qué |
|---|---|
| **Registro** | Captura del reporte diario. Corregir o borrar el propio. |
| **Resumen** | "¿Cómo vamos?" — sin reportar hoy, semáforo, indicadores, comparativa, gráficas. |
| **Reportes** | "Dame los números de tal fecha" — tablas ordenables, imprimir, CSV. |
| **Metas** | Meta base por agente y excepciones semanales. Los totales por línea se suman solos. |
| **Contests** | Concursos con premio y avance calculado desde los reportes. |
| **Agentes** | Catálogo, roles, "reporta a" y organigrama. Requiere PIN. |

Además, sin ser pestañas:

- **Ficha del agente** — se abre pulsando cualquier nombre. Tiene URL propia
  (`#agente=<id>`) para poder compartirla antes de un uno a uno.
- **Modo junta** — botón en Resumen. Pantalla completa para proyectar, sin
  controles. Se sale con `Esc`.

- **Frontend:** HTML, CSS y JavaScript sin dependencias externas. Se sube tal cual
  a cualquier hosting (incluido `astral-gt.com`).
- **Backend:** Google Sheets vía Google Apps Script. Sin servidor propio, sin costo.
- **Arranque:** viene en modo de prueba con datos de ejemplo; no requiere
  configuración para verlo funcionando.

---

## 1. Verlo funcionando ahora (modo de prueba)

```bash
node dev-server.js
```

Abre <http://localhost:5173>. **Al abrir desde localhost la página usa siempre
datos ficticios**, aunque `CONFIG.MODO` sea `'sheets'` — lo controla
`CONFIG.MODO_LOCALHOST`. Así se puede probar sin tocar la hoja de producción.

Los datos de prueba traen un organigrama de 21 personas, metas de seis semanas y
cuatro contests. Si cambias la forma de esos datos, sube `SEMILLA_VERSION` en
`store.js` o los navegadores que ya tengan la semilla vieja no verán la nueva.

- PIN de administrador de prueba: **2468**
- Para volver a los datos originales: pestaña **Agentes → Reiniciar datos de prueba**

---

## 2. Conectar Google Sheets (datos reales)

### 2.1 Crear la hoja y pegar el código

1. Crea una hoja nueva en <https://sheets.new> y ponle un nombre
   (por ejemplo *Seguimiento Diario — Gladiators*).
2. Menú **Extensiones → Apps Script**.
3. Borra el contenido de `Código.gs` y pega todo el archivo
   [`apps-script/Codigo.gs`](apps-script/Codigo.gs).
4. Guarda (💾) y ejecuta una vez la función **`instalar`** desde el selector de
   funciones. Google pedirá autorización la primera vez — acéptala.
   Esto crea las hojas `Agentes`, `Registros` y `Config`.

### 2.2 Publicar el Web App

1. Botón **Implementar → Nueva implementación**.
2. Tipo: **Aplicación web**.
3. *Ejecutar como:* **Yo**.
4. *Quién tiene acceso:* **Cualquier usuario**.
   (Necesario para que la página pueda escribir; la protección real es el PIN.)
5. Copia la **URL del Web App** — termina en `/exec`.

### 2.3 Apuntar la página a la hoja

En [`assets/js/config.js`](assets/js/config.js):

```js
MODO: 'sheets',
SHEETS_URL: 'https://script.google.com/macros/s/AKfycb...TU_ID.../exec',
```

Listo. Recarga la página y ya estará leyendo y escribiendo en tu Google Sheet.

> **Importante:** cada vez que edites `Codigo.gs`, crea una **nueva versión** de
> la implementación (Implementar → Administrar implementaciones → ✏️ → Versión:
> Nueva). Si no, Google sigue sirviendo el código anterior.

### 2.4 Cambiar el PIN de administrador

En la hoja `Config`, fila `adminPin`, cambia el valor. Tiene efecto inmediato.

---

## 3. Subir al hosting

Sube estos archivos y carpetas a la carpeta pública del sitio:

```
index.html
assets/
```

`dev-server.js`, `apps-script/`, `.claude/` y este README **no** hacen falta en
producción.

---

## 4. Estructura

| Archivo | Qué hace |
|---|---|
| `index.html` | Estructura de las tres pestañas |
| `assets/css/styles.css` | Estilos, modo claro y oscuro |
| `assets/js/config.js` | **Configuración y definición de los campos del reporte** |
| `assets/js/util.js` | Fechas, formatos de número, ayudas de DOM |
| `assets/js/store.js` | Capa de datos (localStorage o Google Sheets) |
| `assets/js/charts.js` | Gráficas en SVG, sin librerías |
| `assets/js/app.js` | Lógica de la interfaz |
| `apps-script/Codigo.gs` | Backend que vive dentro del Google Sheet |
| `dev-server.js` | Servidor local para desarrollo |

La hoja de Google tiene cinco pestañas: `Agentes`, `Registros`, `Metas`,
`Contests` y `Config`.

> **Al desplegar una versión con funciones nuevas**, actualiza primero el Apps
> Script. Si no lo haces, la página lo detecta y muestra un aviso: las pestañas
> que dependen del backend nuevo se ven vacías, pero el registro diario y los
> reportes siguen funcionando.

---

## 5. Agregar o quitar métricas del formulario

Todo el formulario, las tablas, el CSV y las estadísticas se generan desde un
solo arreglo en `assets/js/config.js`:

```js
const CAMPOS = [
  { key: 'app',       label: 'Appointment (APP)', corto: 'APP',   tipo: 'entero' },
  { key: 'pressSale', label: 'PRESS SALE',        corto: 'PRESS SALE', tipo: 'entero' },
  // …
];
```

Agrega o quita una línea y el cambio aparece en toda la aplicación.

**Si usas Google Sheets, son tres pasos, en este orden:**

1. Agrega la clave nueva a `COL_REGISTROS` y a `METRICAS` en
   `apps-script/Codigo.gs`.
2. Guarda y ejecuta la función **`sincronizarColumnas`** desde el editor. Añade
   a la hoja `Registros` las columnas que falten, sin mover ni borrar las que ya
   están. Las filas viejas quedan vacías en la columna nueva y se leen como `0`.
3. **Implementar → Administrar implementaciones → ✏️ → Versión: Nueva.** Sin
   esto Google sigue sirviendo el código anterior.

Las columnas se leen por **nombre de encabezado**, no por posición: puedes
reordenarlas en la hoja y nada se rompe.

---

## 6. Corregir un reporte equivocado

En la pestaña **Registro**, al elegir la fecha y el agente la aplicación busca si
ese día ya fue reportado:

- Si existe, **carga los valores en el formulario** y avisa que estás
  corrigiéndolo. El botón cambia a *Actualizar registro* y aparece *Eliminar este
  registro*.
- La tabla **Mis últimos registros** y el **Detalle de registros** de
  Estadísticas traen botones *Editar* y *Eliminar* en cada fila.

### Ventana de corrección

Un agente puede corregir o borrar libremente los reportes de los últimos
`CONFIG.DIAS_EDICION_LIBRE` días (por defecto **7**). Pasado ese plazo la fila
aparece como 🔒 *Cerrado* y solo se puede modificar con sesión de administrador
abierta en la pestaña **Agentes**.

Para cambiar el plazo hay que ajustarlo en **los dos lados**:

| Dónde | Qué |
|---|---|
| `assets/js/config.js` | `DIAS_EDICION_LIBRE` |
| `apps-script/Codigo.gs` | `var DIAS_EDICION_LIBRE` |

El del navegador es solo comodidad: **el que manda es el del Apps Script**, que
rechaza cualquier corrección fuera de plazo sin PIN aunque alguien manipule la
página.

---

## 7. Jerarquía, metas, semáforo y contests

### Jerarquía

Cada persona tiene un **rol** (Agente, SA, GA, MGA, RGA) y un **"reporta a"**.
El organigrama se arma solo con eso. El superior debe tener siempre un nivel más
alto, pero **no hace falta que existan niveles intermedios**: un agente puede
colgar directo de un GA, y un SA directo de un MGA.

Se valida que nadie se reporte a sí mismo, que el superior exista y tenga rango
mayor, y que no se formen ciclos — en el navegador y también en el Apps Script.
Al eliminar a alguien, sus subordinados pasan a su superior.

### Metas semanales

Semana de lunes a domingo, identificada por su lunes. Se capturan en una tabla
editable y se guardan todas de una vez; hay un botón para copiar la semana
anterior. Los totales de SA, GA y MGA se **suman solos** desde sus agentes.

Un agente sin meta **no cuenta como 0%**: aparece como "Sin meta" y queda fuera
de todo promedio.

### Semáforo

Verde desde `SEMAFORO.verde` (90%), amarillo desde `SEMAFORO.amarillo` (60%).
El color de una línea es el **promedio de los cumplimientos individuales** de los
suyos, no el peor: un solo agente flojo no tiñe a todo el equipo. Aun así, el
texto dice cuántos están por debajo, para que el problema no se esconda.

No hay regla de inactividad: quien no reporta acumula poco y su % cae solo.

### Constancia y "sin reportar"

`DIAS_HABILES` dice qué días cuentan como jornada. **Por defecto son los siete**,
porque eso es lo que dicen los datos: hay registros en sábados y domingos. Con
lunes a viernes, quien trabaja el fin de semana daría más del 100%.

La tarjeta "Sin reportar" evalúa el **último día ya cerrado**, según
`HORA_CORTE_REPORTE` (22:00). Antes de esa hora el día de hoy sigue abierto y
decir que nadie ha reportado no informa nada: a las nueve de la mañana faltan
todos. Así que por la mañana muestra quién falló ayer.

### Contests

El avance **no se captura**: se calcula leyendo los reportes diarios dentro del
rango y el alcance del contest. Con varios requisitos se elige si hay que
cumplirlos todos o basta con uno; con "todos", el avance mostrado es el del
requisito peor parado, porque hasta que ese no se cumpla no hay premio.

Hay tres ámbitos de requisito: **por agente**, **suma del equipo** y **cuántos
certifican** (cuántas personas alcanzan un umbral cada una). Los dos últimos son
puertas: si no se cumplen, nadie califica.

**Calificar no es ganar.** Calificar mete al sorteo; el ganador se marca a mano
al resolver, y se guarda en la columna `ganadores`. Un contest terminado no se
archiva solo: queda "por resolver" hasta que un administrador diga si se pagó, no
se cumplió o se canceló.

### Pólizas: el campo opcional

`polizas` es el único campo opcional del registro. Vacío significa **"no se
anotó"**, que no es lo mismo que cero: los registros anteriores a la columna no
lo traen, y guardarlos como cero haría que el ALP por póliza saliera infinito.

Las métricas derivadas (ALP por póliza, pólizas por presentación) se calculan
**solo sobre los registros que traen el dato**, numerador y denominador, y dicen
sobre cuántos se calcularon. Donde no hay dato muestran `—`, nunca 0.

Si la hoja todavía no tiene la columna, la página lo detecta y avisa que lo
escrito ahí no se guardará.

---

## 8. Notas de funcionamiento

- **Un registro por agente y por día.** Si un agente vuelve a guardar la misma
  fecha, el registro anterior se reemplaza en lugar de duplicarse.
- **Campos vacíos = 0.** Los campos numéricos nacen vacíos con un `0` gris de
  guía; lo que el agente no llene se guarda como cero.
- **Eliminar un agente no borra su historial** salvo que se marque la casilla al
  confirmar. Así las estadísticas de meses anteriores no cambian.
- **Agente inactivo** desaparece del formulario de registro pero sigue apareciendo
  en el filtro de estadísticas. Si tiene registros viejos, al editarlos se agrega
  temporalmente al desplegable.
- **El indicador "Agentes"** cuenta agentes *distintos que reportaron* en el
  periodo, no el catálogo. Es el contexto que da sentido al resto: 18 APP con 3
  agentes reportando no significa lo mismo que 18 con 30. El subtítulo compara
  contra los activos y da el promedio diario; al pasar el cursor dice cuántos
  activos no reportaron ni un solo día. Si filtras por un agente, marca 1.
- **No hay login por agente.** Cualquiera que abra la página puede elegir
  cualquier nombre del desplegable, y por lo tanto también corregir el reporte de
  otro dentro de la ventana. Ver la nota al final de la sección 2.
