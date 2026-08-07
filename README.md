# Seguimiento Diario · Gladiator's Team

Aplicación web para que los agentes suban su reporte diario, con panel de
administración de agentes y una sección de estadísticas y reportes.

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

Abre <http://localhost:5173>. Los datos se guardan solo en tu navegador
(`localStorage`), así que puedes probar todo sin miedo a romper nada.

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

## 7. Notas de funcionamiento

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
