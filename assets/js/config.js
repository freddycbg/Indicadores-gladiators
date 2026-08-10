/* =========================================================================
   config.js — Configuración central de la aplicación
   Seguimiento Diario · Gladiator's Team
   ========================================================================= */

const CONFIG = {
  /* -----------------------------------------------------------------------
     MODO DE DATOS
     'demo'   → datos de prueba guardados en el navegador (localStorage).
                No necesita servidor. Úsalo para revisar y aprobar el diseño.
     'sheets' → datos reales en Google Sheets vía Google Apps Script.
                Pega abajo la URL del Web App y cambia MODO a 'sheets'.
     ----------------------------------------------------------------------- */
  MODO: 'sheets',

  /* -----------------------------------------------------------------------
     MODO AL ABRIR DESDE LOCALHOST
     Cuando la pagina se sirve desde localhost (el servidor de pruebas), se
     usa este modo en lugar del de arriba. Asi la pagina de prueba trabaja
     con datos ficticios y nunca escribe en la hoja real.
     Ponlo en null para que localhost use tambien Google Sheets.
     ----------------------------------------------------------------------- */
  MODO_LOCALHOST: 'demo',

  // URL del Web App de Google Apps Script (termina en /exec)
  // Ejemplo: https://script.google.com/macros/s/AKfycb.../exec
  SHEETS_URL: 'https://script.google.com/macros/s/AKfycbxSzZnXbgZ5NKFqt4uRMIsmocK_BaeOJE79lQhzexpEjF1rWoyypHEZNFchRzu4De5S/exec',

  // PIN de administrador para la pestaña "Agentes" (solo modo demo).
  // En modo 'sheets' el PIN vive en la hoja "Config" y se valida en el servidor.
  ADMIN_PIN_DEMO: '1010',

  // Nombre del equipo mostrado en el encabezado
  EQUIPO: "Gladiator's Team",

  /* -----------------------------------------------------------------------
     VENTANA DE CORRECCIÓN
     Días hacia atrás durante los cuales un agente puede corregir o eliminar
     su propio reporte sin PIN. Pasado ese plazo el registro queda cerrado y
     solo un administrador puede tocarlo — así nadie altera por accidente el
     histórico ya reportado.
       0        → solo el día de hoy
       7        → la última semana (valor actual)
       Infinity → sin límite; cualquiera puede editar cualquier fecha
     ----------------------------------------------------------------------- */
  DIAS_EDICION_LIBRE: 7,
};

/* =========================================================================
   JERARQUIA DE EQUIPO
   El rango define quien puede ser superior de quien: el "reporta a" debe
   tener siempre un rango estrictamente mayor. El arbol se arma solo a
   partir de esas relaciones.
   ========================================================================= */
const ROLES = [
  { key: 'Agente', label: 'Agente', rango: 0 },
  { key: 'SA',     label: 'SA',     rango: 1 },
  { key: 'GA',     label: 'GA',     rango: 2 },
  { key: 'MGA',    label: 'MGA',    rango: 3 },
  { key: 'RGA',    label: 'RGA',    rango: 4 },
];

const ROL_POR_DEFECTO = 'Agente';

/** Rango numerico de un rol; -1 si el rol no existe. */
function rangoDeRol(rol) {
  const r = ROLES.find(x => x.key === rol);
  return r ? r.rango : -1;
}

/* =========================================================================
   CAMPOS DEL REPORTE DIARIO — fuente única de verdad
   El formulario, la tabla, las estadísticas y el export se generan de aquí.
   Para agregar o quitar una métrica, edita solo este arreglo.
   ========================================================================= */
const CAMPOS = [
  { key: 'app',         label: 'Appointment (APP)',      corto: 'APP',           tipo: 'entero' },
  { key: 'press',       label: 'Presentaciones (PRESS)', corto: 'PRESS',         tipo: 'entero' },
  { key: 'pressSale',   label: 'PRESS SALE',             corto: 'PRESS SALE',    tipo: 'entero' },
  { key: 'pressNoSale', label: 'PRESS NO SALE',          corto: 'PRESS NO SALE', tipo: 'entero' },
  { key: 'callerCalls', label: 'Llamadas del Caller',    corto: 'CALLER',        tipo: 'entero' },
  { key: 'noShow',      label: 'NO SHOW',                corto: 'NO SHOW',       tipo: 'entero' },
  { key: 'noCalifica',  label: 'No Califica',            corto: 'NO CALIF.',     tipo: 'entero' },
  { key: 'reschedule',  label: 'Reschedule',             corto: 'RESCH.',        tipo: 'entero' },
  { key: 'referidos',   label: 'Referidos (REF)',        corto: 'REF',           tipo: 'entero' },
  { key: 'alp',         label: 'ALP',                    corto: 'ALP',           tipo: 'moneda' },
];

/* =========================================================================
   METAS SEMANALES
   Cada clave apunta a un campo del reporte diario (ver CAMPOS): asi el
   cumplimiento se calcula sumando lo ya registrado, sin captura extra.
   La semana se identifica por su lunes, en formato YYYY-MM-DD.
   ========================================================================= */
const METAS_CAMPOS = [
  { key: 'alp',       label: 'ALP',             corto: 'ALP',   tipo: 'moneda' },
  { key: 'app',       label: 'Citas agendadas', corto: 'CITAS', tipo: 'entero' },
  { key: 'referidos', label: 'Referidos',       corto: 'REF',   tipo: 'entero' },
];

/* Umbrales del semaforo, sobre el % de cumplimiento promedio */
const SEMAFORO = {
  verde:    90,   // >= 90%
  amarillo: 60,   // 60% a 89%  (por debajo: rojo)
};

/* Métricas destacadas en la fila de indicadores (KPI) de Estadísticas */
const KPIS = ['app', 'press', 'pressSale', 'pressNoSale', 'callerCalls', 'alp'];

/* Series de la gráfica de tendencia diaria (máximo 3 — regla de color) */
const SERIES_TENDENCIA = ['app', 'press', 'pressSale'];
