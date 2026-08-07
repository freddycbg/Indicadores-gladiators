/**
 * =========================================================================
 * Codigo.gs — Backend en Google Apps Script
 * Seguimiento Diario · Gladiator's Team
 *
 * Este archivo se pega en el editor de Apps Script de tu Google Sheet.
 * Instrucciones completas en README.md.
 *
 * Las columnas se leen por NOMBRE del encabezado, no por posición: puedes
 * reordenarlas en la hoja sin romper nada, y agregar campos nuevos con la
 * función sincronizarColumnas().
 * =========================================================================
 */

/* ---- Nombres de las hojas y sus columnas ------------------------------- */

var HOJA_AGENTES   = 'Agentes';
var HOJA_REGISTROS = 'Registros';
var HOJA_CONFIG    = 'Config';

var COL_AGENTES = ['id', 'nombre', 'equipo', 'activo', 'creado'];

var COL_REGISTROS = [
  'id', 'fecha', 'agenteId', 'agenteNombre',
  'app', 'press', 'pressSale', 'pressNoSale', 'callerCalls',
  'noShow', 'noCalifica', 'reschedule', 'referidos', 'alp',
  'creado', 'actualizado'
];

/* Métricas numéricas. Debe coincidir con CAMPOS en assets/js/config.js. */
var METRICAS = ['app', 'press', 'pressSale', 'pressNoSale', 'callerCalls',
                'noShow', 'noCalifica', 'reschedule', 'referidos', 'alp'];

/**
 * Días hacia atrás en que un agente puede corregir su propio reporte sin PIN.
 * Debe coincidir con CONFIG.DIAS_EDICION_LIBRE en assets/js/config.js.
 * Esta es la validación real: la del navegador es solo comodidad.
 */
var DIAS_EDICION_LIBRE = 7;

/* Acciones que exigen PIN de administrador siempre */
var SOLO_ADMIN = ['crearAgente', 'actualizarAgente', 'eliminarAgente'];

/* =========================================================================
   PUNTOS DE ENTRADA HTTP
   ========================================================================= */

function doPost(e) {
  try {
    var peticion = JSON.parse(e.postData.contents);
    var datos = despachar(peticion.accion, peticion);
    return responder({ ok: true, data: datos });
  } catch (err) {
    return responder({ ok: false, error: String(err.message || err) });
  }
}

/** Permite verificar en el navegador que el Web App está publicado. */
function doGet() {
  return responder({ ok: true, data: 'Seguimiento Diario · API activa' });
}

function responder(objeto) {
  return ContentService
    .createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}

function despachar(accion, p) {
  if (SOLO_ADMIN.indexOf(accion) >= 0 && !esPinValido(p.pin)) {
    throw new Error('No autorizado: se requiere PIN de administrador.');
  }

  switch (accion) {
    case 'listarAgentes':    return listarAgentes();
    case 'crearAgente':      return crearAgente(p.agente);
    case 'actualizarAgente': return actualizarAgente(p.id, p.cambios);
    case 'eliminarAgente':   return eliminarAgente(p.id, p.borrarRegistros === true);
    case 'listarRegistros':  return listarRegistros(p);
    case 'obtenerRegistro':  return obtenerRegistro(p.fecha, p.agenteId);
    case 'guardarRegistro':  return guardarRegistro(p.registro, p.pin);
    case 'eliminarRegistro': return eliminarRegistro(p.id, p.pin);
    case 'validarAdmin':     return esPinValido(p.pinPrueba);
    default: throw new Error('Acción desconocida: ' + accion);
  }
}

/* =========================================================================
   ACCESO A LAS HOJAS
   ========================================================================= */

function libro() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

/** Devuelve la hoja, creándola con sus encabezados si no existe. */
function hoja(nombre, columnas) {
  var hj = libro().getSheetByName(nombre);
  if (!hj) {
    hj = libro().insertSheet(nombre);
    hj.appendRow(columnas);
    hj.setFrozenRows(1);
    hj.getRange(1, 1, 1, columnas.length).setFontWeight('bold');
  }
  return hj;
}

/** Encabezados reales de la hoja (fila 1), sin celdas vacías al final. */
function encabezados(hj) {
  var ancho = hj.getLastColumn();
  if (ancho < 1) return [];
  return hj.getRange(1, 1, 1, ancho).getValues()[0]
           .map(function (h) { return String(h).trim(); })
           .filter(function (h) { return h !== ''; });
}

/** Lee toda la hoja como objetos, mapeando por nombre de encabezado. */
function leerTodo(nombre, columnasPorDefecto) {
  var hj = hoja(nombre, columnasPorDefecto);
  var cols = encabezados(hj);
  var ultima = hj.getLastRow();
  if (ultima < 2 || !cols.length) return [];

  var valores = hj.getRange(2, 1, ultima - 1, cols.length).getValues();
  var salida = [];

  for (var i = 0; i < valores.length; i++) {
    if (valores[i][0] === '' || valores[i][0] === null) continue;  // fila vacía
    var obj = { _fila: i + 2 };
    for (var c = 0; c < cols.length; c++) obj[cols[c]] = valores[i][c];
    salida.push(obj);
  }
  return salida;
}

/** Convierte un objeto a una fila siguiendo el orden real de la hoja. */
function aFila(obj, cols) {
  return cols.map(function (c) {
    return obj[c] === undefined || obj[c] === null ? '' : obj[c];
  });
}

/* =========================================================================
   UTILIDADES
   ========================================================================= */

/** Normaliza fechas a texto 'YYYY-MM-DD' vengan como Date o como cadena. */
function aFechaISO(valor) {
  if (valor instanceof Date) {
    return Utilities.formatDate(valor, libro().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  }
  return String(valor || '').slice(0, 10);
}

function nuevoId() {
  return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function ahora() {
  return Utilities.formatDate(new Date(), libro().getSpreadsheetTimeZone(),
                              "yyyy-MM-dd'T'HH:mm:ss");
}

function esVerdadero(v) {
  return v === true || v === 'TRUE' || v === 'true' || v === 1 || v === 'SI' || v === 'SÍ';
}

/** Días transcurridos entre una fecha ISO y hoy, en la zona de la hoja. */
function diasDesde(iso) {
  var hoyISO = Utilities.formatDate(new Date(), libro().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  var a = new Date(iso + 'T00:00:00Z').getTime();
  var b = new Date(hoyISO + 'T00:00:00Z').getTime();
  return Math.round((b - a) / 86400000);
}

/**
 * Regla de corrección: dentro de la ventana cualquiera puede; fuera de ella
 * solo un administrador. Se valida aquí porque el navegador no es confiable.
 */
function exigirPermisoDeCorreccion(fecha, pin) {
  if (diasDesde(fecha) <= DIAS_EDICION_LIBRE) return;
  if (esPinValido(pin)) return;
  throw new Error('El reporte del ' + fecha + ' ya está cerrado (más de ' +
                  DIAS_EDICION_LIBRE + ' día(s)). Solo un administrador puede modificarlo.');
}

/** Bloqueo para que dos agentes que guardan a la vez no se pisen. */
function conBloqueo(fn) {
  var candado = LockService.getScriptLock();
  candado.waitLock(20000);
  try {
    return fn();
  } finally {
    candado.releaseLock();
  }
}

/* =========================================================================
   ADMINISTRADOR
   ========================================================================= */

/**
 * El PIN vive en la hoja "Config", fila con clave 'adminPin'.
 * Si la hoja no existe se crea con el PIN por defecto 1010 — cámbialo.
 */
function esPinValido(pin) {
  if (!pin) return false;
  var hj = hoja(HOJA_CONFIG, ['clave', 'valor']);
  if (hj.getLastRow() < 2) hj.appendRow(['adminPin', '1010']);

  var filas = hj.getRange(2, 1, hj.getLastRow() - 1, 2).getValues();
  for (var i = 0; i < filas.length; i++) {
    if (String(filas[i][0]).trim() === 'adminPin') {
      return String(filas[i][1]).trim() === String(pin).trim();
    }
  }
  return false;
}

/* =========================================================================
   AGENTES
   ========================================================================= */

function listarAgentes() {
  return leerTodo(HOJA_AGENTES, COL_AGENTES).map(function (a) {
    return {
      id:     String(a.id),
      nombre: String(a.nombre),
      equipo: String(a.equipo || ''),
      activo: esVerdadero(a.activo),
      creado: aFechaISO(a.creado),
    };
  });
}

function crearAgente(agente) {
  return conBloqueo(function () {
    var nombre = String(agente.nombre || '').trim();
    if (!nombre) throw new Error('El nombre del agente es obligatorio.');

    var existentes = listarAgentes();
    for (var i = 0; i < existentes.length; i++) {
      if (existentes[i].nombre.toLowerCase() === nombre.toLowerCase()) {
        throw new Error('Ya existe un agente con ese nombre.');
      }
    }

    var hj = hoja(HOJA_AGENTES, COL_AGENTES);
    var nuevo = {
      id: nuevoId(),
      nombre: nombre,
      equipo: String(agente.equipo || '').trim(),
      activo: agente.activo !== false,
      creado: aFechaISO(new Date()),
    };
    hj.appendRow(aFila(nuevo, encabezados(hj)));
    return nuevo;
  });
}

function actualizarAgente(id, cambios) {
  return conBloqueo(function () {
    var hj = hoja(HOJA_AGENTES, COL_AGENTES);
    var cols = encabezados(hj);
    var agentes = leerTodo(HOJA_AGENTES, COL_AGENTES);

    var objetivo = null;
    for (var i = 0; i < agentes.length; i++) {
      if (String(agentes[i].id) === String(id)) objetivo = agentes[i];
    }
    if (!objetivo) throw new Error('Agente no encontrado.');

    var nombreNuevo = cambios.nombre !== undefined
      ? String(cambios.nombre).trim()
      : String(objetivo.nombre);

    for (var j = 0; j < agentes.length; j++) {
      if (String(agentes[j].id) !== String(id) &&
          String(agentes[j].nombre).toLowerCase() === nombreNuevo.toLowerCase()) {
        throw new Error('Ya existe otro agente con ese nombre.');
      }
    }

    // Partir de la fila actual para no borrar columnas que no conocemos.
    var fila = {};
    for (var c = 0; c < cols.length; c++) fila[cols[c]] = objetivo[cols[c]];
    fila.nombre = nombreNuevo;
    if (cambios.equipo !== undefined) fila.equipo = String(cambios.equipo).trim();
    if (cambios.activo !== undefined) fila.activo = cambios.activo === true;

    hj.getRange(objetivo._fila, 1, 1, cols.length).setValues([aFila(fila, cols)]);

    // Mantener sincronizado el nombre desnormalizado en los registros
    if (cambios.nombre !== undefined) {
      var hr = hoja(HOJA_REGISTROS, COL_REGISTROS);
      var colsR = encabezados(hr);
      var colNombre = colsR.indexOf('agenteNombre') + 1;
      if (colNombre > 0) {
        var regs = leerTodo(HOJA_REGISTROS, COL_REGISTROS);
        for (var k = 0; k < regs.length; k++) {
          if (String(regs[k].agenteId) === String(id)) {
            hr.getRange(regs[k]._fila, colNombre).setValue(nombreNuevo);
          }
        }
      }
    }

    return {
      id: String(fila.id), nombre: fila.nombre,
      equipo: String(fila.equipo || ''), activo: esVerdadero(fila.activo),
      creado: aFechaISO(fila.creado),
    };
  });
}

function eliminarAgente(id, borrarRegistros) {
  return conBloqueo(function () {
    var hj = hoja(HOJA_AGENTES, COL_AGENTES);
    var agentes = leerTodo(HOJA_AGENTES, COL_AGENTES);

    for (var i = 0; i < agentes.length; i++) {
      if (String(agentes[i].id) === String(id)) {
        hj.deleteRow(agentes[i]._fila);
        break;
      }
    }

    if (borrarRegistros) {
      var hr = hoja(HOJA_REGISTROS, COL_REGISTROS);
      var regs = leerTodo(HOJA_REGISTROS, COL_REGISTROS);
      // De abajo hacia arriba: borrar filas no desplaza las que faltan.
      for (var j = regs.length - 1; j >= 0; j--) {
        if (String(regs[j].agenteId) === String(id)) hr.deleteRow(regs[j]._fila);
      }
    }
    return true;
  });
}

/* =========================================================================
   REGISTROS
   ========================================================================= */

/** Da forma al registro tal como lo espera el navegador. */
function normalizarRegistro(r) {
  var salida = {
    id:           String(r.id),
    fecha:        aFechaISO(r.fecha),
    agenteId:     String(r.agenteId),
    agenteNombre: String(r.agenteNombre || ''),
  };
  for (var i = 0; i < METRICAS.length; i++) {
    salida[METRICAS[i]] = Number(r[METRICAS[i]]) || 0;
  }
  return salida;
}

function listarRegistros(filtro) {
  var regs = leerTodo(HOJA_REGISTROS, COL_REGISTROS).map(normalizarRegistro);

  if (filtro && filtro.desde) {
    regs = regs.filter(function (r) { return r.fecha >= filtro.desde; });
  }
  if (filtro && filtro.hasta) {
    regs = regs.filter(function (r) { return r.fecha <= filtro.hasta; });
  }
  if (filtro && filtro.agenteId) {
    regs = regs.filter(function (r) { return r.agenteId === filtro.agenteId; });
  }

  regs.sort(function (a, b) { return a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0; });
  return regs;
}

/** Devuelve el registro de un agente en una fecha, o null. */
function obtenerRegistro(fecha, agenteId) {
  var f = aFechaISO(fecha);
  var regs = leerTodo(HOJA_REGISTROS, COL_REGISTROS);
  for (var i = 0; i < regs.length; i++) {
    if (aFechaISO(regs[i].fecha) === f && String(regs[i].agenteId) === String(agenteId)) {
      return normalizarRegistro(regs[i]);
    }
  }
  return null;
}

function guardarRegistro(registro, pin) {
  return conBloqueo(function () {
    var fecha    = aFechaISO(registro.fecha);
    var agenteId = String(registro.agenteId || '');
    if (!fecha)    throw new Error('La fecha es obligatoria.');
    if (!agenteId) throw new Error('El agente es obligatorio.');
    exigirPermisoDeCorreccion(fecha, pin);

    var hj = hoja(HOJA_REGISTROS, COL_REGISTROS);
    var cols = encabezados(hj);
    var existentes = leerTodo(HOJA_REGISTROS, COL_REGISTROS);

    // Un agente tiene un solo registro por día: si ya existe, se reemplaza.
    var previo = null;
    for (var i = 0; i < existentes.length; i++) {
      if (aFechaISO(existentes[i].fecha) === fecha &&
          String(existentes[i].agenteId) === agenteId) {
        previo = existentes[i];
        break;
      }
    }

    // Partir de la fila existente conserva columnas ajenas a la aplicación.
    var fila = {};
    if (previo) for (var c = 0; c < cols.length; c++) fila[cols[c]] = previo[cols[c]];

    fila.id           = previo ? previo.id : nuevoId();
    fila.fecha        = fecha;
    fila.agenteId     = agenteId;
    fila.agenteNombre = String(registro.agenteNombre || '');
    fila.creado       = previo ? previo.creado : ahora();
    fila.actualizado  = ahora();

    for (var m = 0; m < METRICAS.length; m++) {
      fila[METRICAS[m]] = Number(registro[METRICAS[m]]) || 0;
    }

    if (previo) {
      hj.getRange(previo._fila, 1, 1, cols.length).setValues([aFila(fila, cols)]);
    } else {
      hj.appendRow(aFila(fila, cols));
    }

    return { registro: normalizarRegistro(fila), reemplazado: !!previo };
  });
}

function eliminarRegistro(id, pin) {
  return conBloqueo(function () {
    var hj = hoja(HOJA_REGISTROS, COL_REGISTROS);
    var regs = leerTodo(HOJA_REGISTROS, COL_REGISTROS);

    for (var i = 0; i < regs.length; i++) {
      if (String(regs[i].id) === String(id)) {
        exigirPermisoDeCorreccion(aFechaISO(regs[i].fecha), pin);
        hj.deleteRow(regs[i]._fila);
        return true;
      }
    }
    throw new Error('El registro ya no existe.');
  });
}

/* =========================================================================
   MANTENIMIENTO
   ========================================================================= */

/**
 * Agrega a la hoja Registros las columnas de COL_REGISTROS que aún no existan.
 * Ejecútala cada vez que agregues una métrica nueva a CAMPOS en config.js.
 * No mueve ni borra columnas: solo añade al final las que falten.
 */
function sincronizarColumnas() {
  var hr = hoja(HOJA_REGISTROS, COL_REGISTROS);
  var actuales = encabezados(hr);
  var agregadas = [];

  for (var i = 0; i < COL_REGISTROS.length; i++) {
    if (actuales.indexOf(COL_REGISTROS[i]) < 0) {
      hr.getRange(1, actuales.length + agregadas.length + 1)
        .setValue(COL_REGISTROS[i])
        .setFontWeight('bold');
      agregadas.push(COL_REGISTROS[i]);
    }
  }

  var mensaje = agregadas.length
    ? 'Columnas agregadas a "Registros": ' + agregadas.join(', ') +
      '\n\nLas filas anteriores quedan vacías en esas columnas; la aplicación las lee como 0.'
    : 'La hoja "Registros" ya tiene todas las columnas. No hubo cambios.';

  SpreadsheetApp.getUi().alert(mensaje);
  return agregadas;
}

/**
 * Ejecuta esta función UNA VEZ para crear las tres hojas con sus encabezados
 * y el PIN por defecto.
 */
function instalar() {
  hoja(HOJA_AGENTES, COL_AGENTES);
  hoja(HOJA_REGISTROS, COL_REGISTROS);
  var cfg = hoja(HOJA_CONFIG, ['clave', 'valor']);
  if (cfg.getLastRow() < 2) cfg.appendRow(['adminPin', '1010']);

  // La columna de fecha como texto plano evita sorpresas de zona horaria.
  var hr = libro().getSheetByName(HOJA_REGISTROS);
  var colFecha = encabezados(hr).indexOf('fecha') + 1;
  if (colFecha > 0) hr.getRange(2, colFecha, hr.getMaxRows() - 1).setNumberFormat('@');

  SpreadsheetApp.getUi().alert(
    'Listo. Se crearon las hojas Agentes, Registros y Config.\n\n' +
    'El PIN de administrador está en la hoja Config — cámbialo.'
  );
}
