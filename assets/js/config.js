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
  SHEETS_URL: 'https://script.google.com/macros/s/AKfycbyGxRYz0zPpC1jU_swbRWTUtxO_SJnAwEEWPQWTYCIuN6Z3fu-4rG27Y9UTrZqTw0Hu/exec',

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

   "mejor" dice hacia dónde es bueno moverse. Lo usa la comparativa para
   pintar la variación: en NO SHOW o No Califica, subir es mala noticia
   aunque el número crezca. Si se omite, se asume 'alto'.
   ========================================================================= */
const CAMPOS = [
  { key: 'app',         label: 'Appointment (APP)',      corto: 'APP',           tipo: 'entero' },
  { key: 'press',       label: 'Presentaciones (PRESS)', corto: 'PRESS',         tipo: 'entero' },
  { key: 'pressSale',   label: 'PRESS SALE',             corto: 'PRESS SALE',    tipo: 'entero' },
  { key: 'pressNoSale', label: 'PRESS NO SALE',          corto: 'PRESS NO SALE', tipo: 'entero', mejor: 'bajo' },
  { key: 'callerCalls', label: 'Llamadas del Caller',    corto: 'CALLER',        tipo: 'entero' },
  { key: 'noShow',      label: 'NO SHOW',                corto: 'NO SHOW',       tipo: 'entero', mejor: 'bajo' },
  { key: 'noCalifica',  label: 'No Califica',            corto: 'NO CALIF.',     tipo: 'entero', mejor: 'bajo' },
  { key: 'reschedule',  label: 'Reschedule',             corto: 'RESCH.',        tipo: 'entero', mejor: 'bajo' },
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

/* =========================================================================
   RANGOS DE FECHA PREDEFINIDOS
   Cubren desde un dia suelto hasta el ano completo. 'custom' deja las dos
   fechas a mano.
   ========================================================================= */
const PRESETS_RANGO = [
  { key: 'hoy',          label: 'Hoy' },
  { key: 'ayer',         label: 'Ayer' },
  { key: 'semana',       label: 'Esta semana' },
  { key: 'semanaPasada', label: 'Semana pasada' },
  { key: '7',            label: 'Últimos 7 días' },
  { key: '15',           label: 'Últimos 15 días (quincena)' },
  { key: '30',           label: 'Últimos 30 días' },
  { key: 'mes',          label: 'Mes en curso' },
  { key: 'mesPasado',    label: 'Mes pasado' },
  { key: '90',           label: 'Últimos 3 meses' },
  { key: 'anio',         label: 'Este año' },
  { key: 'custom',       label: 'Personalizado' },
];

/* =========================================================================
   COMPARATIVA SEMANAL
   Se contrastan TODOS los indicadores del registro diario, mas dos tasas
   derivadas que no se capturan pero se leen mejor como porcentaje.
   Al agregar una metrica a CAMPOS aparece aqui sola.
   ========================================================================= */
const COMPARATIVA_CAMPOS = [
  ...CAMPOS.map(c => ({
    key: c.key, label: c.label, corto: c.corto,
    tipo: c.tipo, mejor: c.mejor || 'alto',
  })),
  { key: 'tasaNoShow', label: 'Tasa de NO SHOW', corto: '% NO SHOW',
    tipo: 'porcentaje', mejor: 'bajo', calculado: true },
  { key: 'tasaCierre', label: 'Tasa de cierre', corto: '% CIERRE',
    tipo: 'porcentaje', mejor: 'alto', calculado: true },
];

/* Umbrales del semaforo, sobre el % de cumplimiento promedio */
const SEMAFORO = {
  verde:    90,   // >= 90%
  amarillo: 60,   // 60% a 89%  (por debajo: rojo)
};

/* =========================================================================
   CONTESTS
   El progreso se lee de los registros diarios que ya existen: nadie
   captura avances a mano. Los requisitos usan las mismas metricas de
   CAMPOS, filtradas por el rango de fechas y el alcance del contest.
   ========================================================================= */
const PREMIO_TIPOS = [
  { key: 'efectivo',    label: 'Efectivo',    icono: '💵' },
  { key: 'viaje',       label: 'Viaje',       icono: '✈️' },
  { key: 'experiencia', label: 'Experiencia', icono: '🎁' },
  { key: 'otro',        label: 'Otro',        icono: '🏆' },
];

const ALCANCE_TIPOS = [
  { key: 'todos',     label: 'Todo el equipo' },
  { key: 'linea',     label: 'Solo la línea de…' },
  { key: 'seleccion', label: 'Personas seleccionadas' },
];

/* 'auto' deduce el estado por fecha; los otros dos se fuerzan a mano. */
const CONTEST_ESTATUS = [
  { key: 'auto',       label: 'Automático por fecha' },
  { key: 'finalizado', label: 'Finalizado' },
  { key: 'cancelado',  label: 'Cancelado' },
];

/* Métricas destacadas en la fila de indicadores (KPI) de Estadísticas */
const KPIS = ['app', 'press', 'pressSale', 'pressNoSale', 'callerCalls', 'alp'];

/* Series de la gráfica de tendencia diaria (máximo 3 — regla de color) */
const SERIES_TENDENCIA = ['app', 'press', 'pressSale'];
