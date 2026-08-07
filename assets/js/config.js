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
  SHEETS_URL: 'https://script.google.com/macros/s/AKfycby3kgXaELoK4lRkx9TdFX2IBD1_mvIzJJrTfEahAv5WTDwTQLkbSt0u63hqdidY8iO2/exec',

  // PIN de administrador para la pestaña "Agentes" (solo modo demo).
  // En modo 'sheets' el PIN vive en la hoja "Config" y se valida en el servidor.
  ADMIN_PIN_DEMO: '2468',

  // Nombre del equipo mostrado en el encabezado
  EQUIPO: "Gladiator's Team",
};

/* =========================================================================
   CAMPOS DEL REPORTE DIARIO — fuente única de verdad
   El formulario, la tabla, las estadísticas y el export se generan de aquí.
   Para agregar o quitar una métrica, edita solo este arreglo.
   ========================================================================= */
const CAMPOS = [
  { key: 'app',         label: 'Appointment (APP)',      corto: 'APP',        tipo: 'entero' },
  { key: 'press',       label: 'Presentaciones (PRESS)', corto: 'PRESS',      tipo: 'entero' },
  { key: 'pressSale',   label: 'PRESS SALE',             corto: 'PRESS SALE', tipo: 'entero' },
  { key: 'callerCalls', label: 'Llamadas del Caller',    corto: 'CALLER',     tipo: 'entero' },
  { key: 'noShow',      label: 'NO SHOW',                corto: 'NO SHOW',    tipo: 'entero' },
  { key: 'noCalifica',  label: 'No Califica',            corto: 'NO CALIF.',  tipo: 'entero' },
  { key: 'reschedule',  label: 'Reschedule',             corto: 'RESCH.',     tipo: 'entero' },
  { key: 'referidos',   label: 'Referidos (REF)',        corto: 'REF',        tipo: 'entero' },
  { key: 'alp',         label: 'ALP',                    corto: 'ALP',        tipo: 'moneda' },
];

/* Métricas destacadas en la fila de indicadores (KPI) de Estadísticas */
const KPIS = ['app', 'press', 'pressSale', 'callerCalls', 'alp'];

/* Series de la gráfica de tendencia diaria (máximo 3 — regla de color) */
const SERIES_TENDENCIA = ['app', 'press', 'pressSale'];
