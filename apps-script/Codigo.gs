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
var HOJA_METAS     = 'Metas';
var HOJA_CONFIG    = 'Config';

/* Metas semanales. La semana se identifica por su lunes (YYYY-MM-DD).
   Las claves apuntan a campos del reporte diario, para poder comparar
   meta contra real sin captura adicional. */
var COL_METAS = ['id', 'semana', 'agenteId', 'agenteNombre',
                 'alp', 'app', 'referidos', 'actualizado'];

var METAS_CAMPOS = ['alp', 'app', 'referidos'];

var HOJA_CONTESTS = 'Contests';

/* requisitos, alcanceIds y ganadores son listas: se guardan como JSON.
   "ganadores" son los ids de quienes realmente recibieron el premio: el
   sorteo se hace entre quienes calificaron, asi que calificar no es ganar
   y no se puede deducir de los reportes. */
var COL_CONTESTS = ['id', 'nombre', 'desde', 'hasta', 'premioTipo', 'premio',
                    'requisitos', 'combinacion', 'alcanceTipo', 'alcanceLinea',
                    'alcanceIds', 'estatus', 'ganadores', 'creado', 'actualizado'];

var CONTESTS_JSON = ['requisitos', 'alcanceIds', 'ganadores'];

var COL_AGENTES = ['id', 'nombre', 'equipo', 'rol', 'reportaA', 'activo', 'creado'];

/* Jerarquia: el "reporta a" debe tener siempre un rango mayor.
   Debe coincidir con ROLES en assets/js/config.js. */
var RANGOS = { 'Agente': 0, 'SA': 1, 'GA': 2, 'MGA': 3, 'RGA': 4 };
var ROL_POR_DEFECTO = 'Agente';

function rangoDeRol(rol) {
  var r = RANGOS[String(rol || ROL_POR_DEFECTO)];
  return r === undefined ? -1 : r;
}

var COL_REGISTROS = [
  'id', 'fecha', 'agenteId', 'agenteNombre',
  'app', 'press', 'pressSale', 'polizas', 'pressNoSale', 'callerCalls',
  'noShow', 'noCalifica', 'reschedule', 'referidos', 'alp',
  'creado', 'actualizado'
];

/* Métricas numéricas. Debe coincidir con CAMPOS en assets/js/config.js. */
var METRICAS = ['app', 'press', 'pressSale', 'polizas', 'pressNoSale', 'callerCalls',
                'noShow', 'noCalifica', 'reschedule', 'referidos', 'alp'];

/**
 * Métricas OPCIONALES: una celda vacía significa "no se anoto", que no es
 * lo mismo que cero. Se guardan y se devuelven como cadena vacía en vez de
 * convertirse a 0, para que los registros historicos que no las traen no
 * parezcan decir que ese dia se vendieron cero polizas.
 */
var METRICAS_OPCIONALES = ['polizas'];

function esOpcional(clave) {
  return METRICAS_OPCIONALES.indexOf(clave) >= 0;
}

/**
 * Días hacia atrás en que un agente puede corregir su propio reporte sin PIN.
 * Debe coincidir con CONFIG.DIAS_EDICION_LIBRE en assets/js/config.js.
 * Esta es la validación real: la del navegador es solo comodidad.
 */
var DIAS_EDICION_LIBRE = 7;

/* Acciones que exigen PIN de administrador siempre */
var SOLO_ADMIN = ['crearAgente', 'actualizarAgente', 'eliminarAgente', 'guardarMetas',
                  'guardarContest', 'eliminarContest'];

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
    case 'listarMetas':      return listarMetas(p);
    case 'guardarMetas':     return guardarMetas(p.metas);
    case 'listarContests':   return listarContests();
    case 'guardarContest':   return guardarContest(p.contest);
    case 'eliminarContest':  return eliminarContest(p.id);
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
      id:       String(a.id),
      nombre:   String(a.nombre),
      equipo:   String(a.equipo || ''),
      rol:      String(a.rol || ROL_POR_DEFECTO),
      reportaA: String(a.reportaA || ''),
      activo:   esVerdadero(a.activo),
      creado:   aFechaISO(a.creado),
    };
  });
}

/**
 * Valida una relacion "reporta a". Devuelve null si es valida o el mensaje
 * de error si no. Se valida aqui y no solo en el navegador porque el
 * navegador no es confiable.
 */
function validarJerarquia(agentes, id, superiorId, rol) {
  if (!superiorId) return null;
  if (String(superiorId) === String(id)) {
    return 'Un agente no puede reportarse a si mismo.';
  }

  var superior = null;
  for (var i = 0; i < agentes.length; i++) {
    if (String(agentes[i].id) === String(superiorId)) superior = agentes[i];
  }
  if (!superior) return 'El superior seleccionado no existe.';

  if (rangoDeRol(superior.rol) <= rangoDeRol(rol)) {
    return superior.nombre + ' es ' + (superior.rol || ROL_POR_DEFECTO) +
           ' y no puede ser superior de un ' + rol + '.';
  }

  // Recorrer hacia arriba buscando un ciclo
  var vistos = {};
  vistos[String(id)] = true;
  var actual = superior;
  var guarda = 0;
  while (actual && guarda++ < 50) {
    if (vistos[String(actual.id)]) return 'Esa asignacion crea un ciclo en la jerarquia.';
    vistos[String(actual.id)] = true;
    var siguiente = null;
    for (var j = 0; j < agentes.length; j++) {
      if (String(agentes[j].id) === String(actual.reportaA)) siguiente = agentes[j];
    }
    actual = siguiente;
  }
  return null;
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
      rol: String(agente.rol || ROL_POR_DEFECTO),
      reportaA: String(agente.reportaA || ''),
      activo: agente.activo !== false,
      creado: aFechaISO(new Date()),
    };

    var error = validarJerarquia(existentes.concat([nuevo]), nuevo.id, nuevo.reportaA, nuevo.rol);
    if (error) throw new Error(error);

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
    if (cambios.equipo   !== undefined) fila.equipo   = String(cambios.equipo).trim();
    if (cambios.activo   !== undefined) fila.activo   = cambios.activo === true;
    if (cambios.rol      !== undefined) fila.rol      = String(cambios.rol || ROL_POR_DEFECTO);
    if (cambios.reportaA !== undefined) fila.reportaA = String(cambios.reportaA || '');

    // Validar contra el catalogo con el cambio ya aplicado
    var propuestos = agentes.map(function (a) {
      return String(a.id) === String(id)
        ? { id: a.id, nombre: fila.nombre, rol: fila.rol, reportaA: fila.reportaA }
        : a;
    });
    var errJ = validarJerarquia(propuestos, id, fila.reportaA, fila.rol);
    if (errJ) throw new Error(errJ);

    // Al bajar de rango, quienes le reportan quedarian mal colgados
    var malColgados = [];
    for (var m = 0; m < propuestos.length; m++) {
      if (String(propuestos[m].reportaA) === String(id) &&
          String(propuestos[m].id) !== String(id) &&
          rangoDeRol(propuestos[m].rol) >= rangoDeRol(fila.rol)) {
        malColgados.push(propuestos[m].nombre);
      }
    }
    if (malColgados.length) {
      throw new Error('No se puede cambiar el rol a ' + fila.rol + ': ' +
        malColgados.join(', ') + ' le reporta(n) con nivel igual o mayor. Reasignalos primero.');
    }

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
      equipo: String(fila.equipo || ''),
      rol: String(fila.rol || ROL_POR_DEFECTO),
      reportaA: String(fila.reportaA || ''),
      activo: esVerdadero(fila.activo),
      creado: aFechaISO(fila.creado),
    };
  });
}

function eliminarAgente(id, borrarRegistros) {
  return conBloqueo(function () {
    var hj = hoja(HOJA_AGENTES, COL_AGENTES);
    var cols = encabezados(hj);
    var agentes = leerTodo(HOJA_AGENTES, COL_AGENTES);

    // Quienes le reportaban pasan a su superior, para no quedar sueltos
    var saliente = null;
    for (var s = 0; s < agentes.length; s++) {
      if (String(agentes[s].id) === String(id)) saliente = agentes[s];
    }
    if (saliente) {
      var colReporta = cols.indexOf('reportaA') + 1;
      if (colReporta > 0) {
        for (var h = 0; h < agentes.length; h++) {
          if (String(agentes[h].reportaA) === String(id)) {
            hj.getRange(agentes[h]._fila, colReporta)
              .setValue(String(saliente.reportaA || ''));
          }
        }
      }
    }

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
    var clave = METRICAS[i];
    var bruto = r[clave];

    if (esOpcional(clave)) {
      // Vacio se queda vacio: convertirlo a 0 seria inventar un dato
      salida[clave] = (bruto === '' || bruto === null || bruto === undefined)
        ? '' : (Number(bruto) || 0);
    } else {
      salida[clave] = Number(bruto) || 0;
    }
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
      var k = METRICAS[m];
      var v = registro[k];
      fila[k] = (esOpcional(k) && (v === '' || v === null || v === undefined))
        ? '' : (Number(v) || 0);
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
   METAS SEMANALES
   ========================================================================= */

function normalizarMeta(m) {
  var salida = {
    id:           String(m.id),
    semana:       aFechaISO(m.semana),
    agenteId:     String(m.agenteId),
    agenteNombre: String(m.agenteNombre || ''),
  };
  for (var i = 0; i < METAS_CAMPOS.length; i++) {
    salida[METAS_CAMPOS[i]] = Number(m[METAS_CAMPOS[i]]) || 0;
  }
  return salida;
}

function listarMetas(filtro) {
  var metas = leerTodo(HOJA_METAS, COL_METAS).map(normalizarMeta);

  if (filtro && filtro.semana) {
    metas = metas.filter(function (m) { return m.semana === filtro.semana; });
  }
  if (filtro && filtro.desde) {
    metas = metas.filter(function (m) { return m.semana >= filtro.desde; });
  }
  if (filtro && filtro.hasta) {
    metas = metas.filter(function (m) { return m.semana <= filtro.hasta; });
  }
  return metas;
}

/**
 * Guarda varias metas de una vez: la tabla se edita completa y se manda
 * junta, asi una semana de 30 agentes es una sola llamada y no treinta.
 * Una meta con los tres valores en cero se elimina.
 */
function guardarMetas(lista) {
  return conBloqueo(function () {
    if (!lista || !lista.length) return { guardadas: 0, borradas: 0 };

    var hj = hoja(HOJA_METAS, COL_METAS);
    var cols = encabezados(hj);
    var existentes = leerTodo(HOJA_METAS, COL_METAS);

    var guardadas = 0;
    var aBorrar = [];

    for (var i = 0; i < lista.length; i++) {
      var entrada = lista[i];
      var semana = aFechaISO(entrada.semana);
      var agenteId = String(entrada.agenteId || '');
      if (!semana || !agenteId) continue;

      var previo = null;
      for (var j = 0; j < existentes.length; j++) {
        if (aFechaISO(existentes[j].semana) === semana &&
            String(existentes[j].agenteId) === agenteId) {
          previo = existentes[j];
          break;
        }
      }

      var vacia = true;
      for (var k = 0; k < METAS_CAMPOS.length; k++) {
        if (Number(entrada[METAS_CAMPOS[k]]) > 0) { vacia = false; break; }
      }

      if (vacia) {
        if (previo) aBorrar.push(previo._fila);
        continue;
      }

      var fila = {};
      if (previo) for (var c = 0; c < cols.length; c++) fila[cols[c]] = previo[cols[c]];

      fila.id           = previo ? previo.id : nuevoId();
      fila.semana       = semana;
      fila.agenteId     = agenteId;
      fila.agenteNombre = String(entrada.agenteNombre || '');
      fila.actualizado  = ahora();
      for (var n = 0; n < METAS_CAMPOS.length; n++) {
        fila[METAS_CAMPOS[n]] = Number(entrada[METAS_CAMPOS[n]]) || 0;
      }

      if (previo) {
        hj.getRange(previo._fila, 1, 1, cols.length).setValues([aFila(fila, cols)]);
      } else {
        hj.appendRow(aFila(fila, cols));
      }
      guardadas++;
    }

    // De abajo hacia arriba: borrar filas no desplaza las que faltan
    aBorrar.sort(function (a, b) { return b - a; });
    for (var d = 0; d < aBorrar.length; d++) hj.deleteRow(aBorrar[d]);

    return { guardadas: guardadas, borradas: aBorrar.length };
  });
}

/* =========================================================================
   CONTESTS
   El progreso no se guarda: se calcula en el navegador leyendo los
   registros diarios dentro del rango y el alcance del contest.
   ========================================================================= */

function listarContests() {
  return leerTodo(HOJA_CONTESTS, COL_CONTESTS).map(function (c) {
    var salida = {};
    for (var i = 0; i < COL_CONTESTS.length; i++) {
      var col = COL_CONTESTS[i];
      salida[col] = c[col] === undefined || c[col] === null ? '' : c[col];
    }
    salida.desde = aFechaISO(c.desde);
    salida.hasta = aFechaISO(c.hasta);

    // Las listas viajan como JSON; una celda vacia es una lista vacia.
    for (var j = 0; j < CONTESTS_JSON.length; j++) {
      var campo = CONTESTS_JSON[j];
      try {
        salida[campo] = c[campo] ? JSON.parse(String(c[campo])) : [];
      } catch (e) {
        salida[campo] = [];
      }
    }
    return salida;
  });
}

function guardarContest(contest) {
  return conBloqueo(function () {
    if (!contest || !String(contest.nombre || '').trim()) {
      throw new Error('El nombre del contest es obligatorio.');
    }

    var hj = hoja(HOJA_CONTESTS, COL_CONTESTS);
    var cols = encabezados(hj);
    var existentes = leerTodo(HOJA_CONTESTS, COL_CONTESTS);

    var previo = null;
    if (contest.id) {
      for (var i = 0; i < existentes.length; i++) {
        if (String(existentes[i].id) === String(contest.id)) previo = existentes[i];
      }
    }

    var fila = {};
    if (previo) for (var c = 0; c < cols.length; c++) fila[cols[c]] = previo[cols[c]];

    fila.id           = previo ? previo.id : nuevoId();
    fila.nombre       = String(contest.nombre).trim();
    fila.desde        = aFechaISO(contest.desde);
    fila.hasta        = aFechaISO(contest.hasta);
    fila.premioTipo   = String(contest.premioTipo || 'otro');
    fila.premio       = String(contest.premio || '');
    fila.requisitos   = JSON.stringify(contest.requisitos || []);
    fila.combinacion  = String(contest.combinacion || 'todos');
    fila.alcanceTipo  = String(contest.alcanceTipo || 'todos');
    fila.alcanceLinea = String(contest.alcanceLinea || '');
    fila.alcanceIds   = JSON.stringify(contest.alcanceIds || []);
    fila.estatus      = String(contest.estatus || 'auto');
    fila.ganadores    = JSON.stringify(contest.ganadores || []);
    fila.creado       = previo ? previo.creado : ahora();
    fila.actualizado  = ahora();

    if (fila.desde && fila.hasta && fila.desde > fila.hasta) {
      throw new Error('La fecha de inicio no puede ser posterior a la de fin.');
    }

    if (previo) {
      hj.getRange(previo._fila, 1, 1, cols.length).setValues([aFila(fila, cols)]);
    } else {
      hj.appendRow(aFila(fila, cols));
    }
    return true;
  });
}

function eliminarContest(id) {
  return conBloqueo(function () {
    var hj = hoja(HOJA_CONTESTS, COL_CONTESTS);
    var lista = leerTodo(HOJA_CONTESTS, COL_CONTESTS);
    for (var i = 0; i < lista.length; i++) {
      if (String(lista[i].id) === String(id)) {
        hj.deleteRow(lista[i]._fila);
        return true;
      }
    }
    throw new Error('El contest ya no existe.');
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
  var informe = [];

  [[HOJA_REGISTROS, COL_REGISTROS],
   [HOJA_AGENTES, COL_AGENTES],
   [HOJA_METAS, COL_METAS],
   [HOJA_CONTESTS, COL_CONTESTS]].forEach(function (par) {
    var hj = hoja(par[0], par[1]);
    var actuales = encabezados(hj);
    var agregadas = [];

    for (var i = 0; i < par[1].length; i++) {
      if (actuales.indexOf(par[1][i]) < 0) {
        hj.getRange(1, actuales.length + agregadas.length + 1)
          .setValue(par[1][i])
          .setFontWeight('bold');
        agregadas.push(par[1][i]);
      }
    }
    informe.push(agregadas.length
      ? '"' + par[0] + '": se agrego ' + agregadas.join(', ')
      : '"' + par[0] + '": sin cambios');
  });

  // Los agentes que ya existian no tienen rol: se les pone el de por defecto
  var ha = hoja(HOJA_AGENTES, COL_AGENTES);
  var colsA = encabezados(ha);
  var colRol = colsA.indexOf('rol') + 1;
  var puestos = 0;
  if (colRol > 0 && ha.getLastRow() > 1) {
    var rango = ha.getRange(2, colRol, ha.getLastRow() - 1, 1);
    var vals = rango.getValues();
    for (var r = 0; r < vals.length; r++) {
      if (String(vals[r][0]).trim() === '') { vals[r][0] = ROL_POR_DEFECTO; puestos++; }
    }
    if (puestos) rango.setValues(vals);
  }
  if (puestos) informe.push('Se asigno el rol "' + ROL_POR_DEFECTO + '" a ' + puestos + ' agente(s) sin rol.');

  // Se informa por el registro y no con getUi().alert(): un alert abre una
  // ventana EN LA HOJA, y si la hoja no esta abierta el script se queda
  // esperandola hasta agotar los 6 minutos de ejecucion.
  informe.forEach(function (linea) { Logger.log(linea); });
  return informe.join('\n');
}

/**
 * Ejecuta esta función UNA VEZ para crear las tres hojas con sus encabezados
 * y el PIN por defecto.
 */
function instalar() {
  hoja(HOJA_AGENTES, COL_AGENTES);
  hoja(HOJA_REGISTROS, COL_REGISTROS);
  hoja(HOJA_METAS, COL_METAS);
  hoja(HOJA_CONTESTS, COL_CONTESTS);
  var cfg = hoja(HOJA_CONFIG, ['clave', 'valor']);
  if (cfg.getLastRow() < 2) cfg.appendRow(['adminPin', '1010']);

  // Las columnas de fecha como texto plano evitan sorpresas de zona horaria.
  [[HOJA_REGISTROS, 'fecha'], [HOJA_METAS, 'semana'],
   [HOJA_CONTESTS, 'desde'], [HOJA_CONTESTS, 'hasta']].forEach(function (par) {
    var hj = libro().getSheetByName(par[0]);
    var col = encabezados(hj).indexOf(par[1]) + 1;
    if (col > 0) hj.getRange(2, col, hj.getMaxRows() - 1).setNumberFormat('@');
  });

  var mensaje = 'Listo. Se crearon las hojas Agentes, Registros, Metas, Contests y Config. ' +
                'El PIN de administrador esta en la hoja Config: cambialo.';
  Logger.log(mensaje);
  return mensaje;
}

/**
 * Agrega un menu propio a la hoja para no tener que entrar al editor cada
 * vez. Aparece al abrir el archivo, junto a Archivo, Editar y Ver.
 * Desde el menu si se pueden usar dialogos: la hoja esta a la vista.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Gladiators')
    .addItem('Sincronizar columnas', 'sincronizarColumnasConAviso')
    .addItem('Instalar hojas', 'instalarConAviso')
    .addToUi();
}

function sincronizarColumnasConAviso() {
  SpreadsheetApp.getUi().alert(sincronizarColumnas());
}

function instalarConAviso() {
  SpreadsheetApp.getUi().alert(instalar());
}
