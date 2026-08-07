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

/* Métricas destacadas en la fila de indicadores (KPI) de Estadísticas */
const KPIS = ['app', 'press', 'pressSale', 'pressNoSale', 'callerCalls', 'alp'];

/* Series de la gráfica de tendencia diaria (máximo 3 — regla de color) */
const SERIES_TENDENCIA = ['app', 'press', 'pressSale'];
