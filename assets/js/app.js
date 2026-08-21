/* =========================================================================
   app.js — Lógica de la aplicación
   ========================================================================= */

const App = {
  agentes: [],          // catálogo completo
  registrosStats: [],     // filtro actual del panel Resumen
  registrosReportes: [],  // filtro actual del panel Reportes
  editando: null,       // registro cargado en el formulario, si lo hay
  columnasFaltantes: [],// campos opcionales que la hoja aún no tiene
  ordenReporte: { campo: 'alp', dir: 'desc' },  // orden del reporte consolidado
};

/* Un registro solo se puede corregir dentro de la ventana configurada,
   salvo que haya sesión de administrador abierta. */
function puedeModificar(fecha) {
  if (Sesion.esAdmin()) return true;
  const dias = diasDesde(fecha);
  return dias <= CONFIG.DIAS_EDICION_LIBRE;
}

/* =========================================================================
   TEMA
   ========================================================================= */

function iniciarTema() {
  const guardado = localStorage.getItem('gt_tema');
  if (guardado) document.documentElement.setAttribute('data-theme', guardado);

  $('#btnTema').addEventListener('click', () => {
    const oscuroAhora = Charts.paleta().oscuro;
    const nuevo = oscuroAhora ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', nuevo);
    localStorage.setItem('gt_tema', nuevo);
    Charts.notificarTema();
  });

  window.matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', () => {
      if (!document.documentElement.hasAttribute('data-theme')) Charts.notificarTema();
    });
}

/* =========================================================================
   PESTAÑAS
   ========================================================================= */

function iniciarPestanas() {
  $$('.pestana').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.pestana').forEach(b => {
        b.classList.remove('is-activa');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('is-activa');
      btn.setAttribute('aria-selected', 'true');

      // Cambiar de pestaña cierra la ficha y limpia su URL
      if (App.fichaAgente) {
        App.fichaAgente = null;
        if (location.hash) history.pushState(null, '', location.pathname);
      }

      $$('.panel').forEach(p => p.classList.remove('is-activa'));
      $('#' + btn.dataset.panel).classList.add('is-activa');

      if (btn.dataset.panel === 'panel-resumen')  refrescarResumen();
      if (btn.dataset.panel === 'panel-reportes') refrescarReportes();
      if (btn.dataset.panel === 'panel-metas')    refrescarMetas();
      if (btn.dataset.panel === 'panel-contests') refrescarContests();
      if (btn.dataset.panel === 'panel-agentes')  refrescarPanelAgentes();
    });
  });
}

/* =========================================================================
   PANEL REGISTRO
   ========================================================================= */

/* Construye los campos numéricos desde CAMPOS.
   Sin atributo `value`: el campo nace vacío y el "0" es solo placeholder. */
function construirCamposMetricas() {
  const rejilla = $('#rejillaMetricas');
  rejilla.innerHTML = '';

  for (const c of CAMPOS) {
    const esMoneda = c.tipo === 'moneda';
    rejilla.appendChild(el('div', { class: 'campo' }, [
      el('label', { for: 'f_' + c.key, text: c.label }),
      el('input', {
        type: 'number',
        id: 'f_' + c.key,
        name: c.key,
        min: '0',
        step: esMoneda ? '0.01' : '1',
        inputmode: esMoneda ? 'decimal' : 'numeric',
        placeholder: esMoneda ? '0.00' : '0',
        autocomplete: 'off',
      }),
    ]));
  }
}

function llenarSelectAgentes(select, { soloActivos = true, incluirTodos = false } = {}) {
  const valorPrevio = select.value;
  select.innerHTML = '';

  select.appendChild(el('option', {
    value: '',
    text: incluirTodos ? 'Todos los agentes' : 'Selecciona un agente…',
  }));

  App.agentes
    .filter(a => (soloActivos ? a.activo !== false : true))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    .forEach(a => {
      select.appendChild(el('option', {
        value: a.id,
        text: a.equipo ? `${a.nombre} · ${a.equipo}` : a.nombre,
      }));
    });

  if ([...select.options].some(o => o.value === valorPrevio)) select.value = valorPrevio;
}

function iniciarFormRegistro() {
  construirCamposMetricas();
  $('#f_fecha').value = hoyISO();
  $('#f_fecha').max = hoyISO();

  // Al cambiar fecha o agente se revisa si ese día ya fue reportado.
  $('#f_fecha').addEventListener('change', buscarRegistroExistente);
  $('#f_agente').addEventListener('change', buscarRegistroExistente);

  $('#formRegistro').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('#btnGuardar');

    const fecha    = $('#f_fecha').value;
    const agenteId = $('#f_agente').value;

    if (!fecha)    return aviso('Selecciona la fecha del reporte.', 'error');
    if (!agenteId) return aviso('Selecciona el agente.', 'error');
    if (!puedeModificar(fecha)) return aviso(mensajeCerrado(fecha), 'error');

    const agente = App.agentes.find(a => a.id === agenteId);
    const reg = { fecha, agenteId, agenteNombre: agente ? agente.nombre : '' };

    // Campo vacío = 0, salvo en los opcionales: ahí vacío significa "no se
    // anotó" y guardarlo como cero seria inventarse un dato.
    for (const c of CAMPOS) {
      const raw = $('#f_' + c.key).value.trim();
      if (raw === '') {
        reg[c.key] = c.opcional ? '' : 0;
      } else {
        reg[c.key] = c.tipo === 'moneda' ? nDecimal(raw) : nEntero(raw);
      }
    }

    btn.disabled = true;
    try {
      const { reemplazado } = await Store.guardarRegistro(reg);
      aviso(reemplazado
        ? `Registro de ${reg.agenteNombre} del ${fechaCorta(fecha)} corregido.`
        : `Registro de ${reg.agenteNombre} guardado.`);
      limpiarFormulario({ conservarFecha: true });
      await pintarRecientes();
    } catch (err) {
      aviso(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  $('#btnLimpiar').addEventListener('click', () => limpiarFormulario());
  $('#btnCancelarEdicion').addEventListener('click', () => limpiarFormulario());
  $('#btnEliminarRegistro').addEventListener('click', () => {
    if (App.editando) eliminarRegistro(App.editando);
  });
}

function mensajeCerrado(fecha) {
  return `El registro del ${fechaCorta(fecha)} ya está cerrado ` +
         `(más de ${CONFIG.DIAS_EDICION_LIBRE} día(s)). Pide a un administrador que lo corrija.`;
}

/** Carga en el formulario el registro existente para la fecha y agente elegidos. */
async function buscarRegistroExistente() {
  const fecha    = $('#f_fecha').value;
  const agenteId = $('#f_agente').value;

  if (!fecha || !agenteId) return modoEdicion(null);

  try {
    const previo = await Store.obtenerRegistro({ fecha, agenteId });
    modoEdicion(previo);
  } catch (err) {
    aviso('No se pudo consultar el registro: ' + err.message, 'error');
  }
}

/** Cambia el formulario entre "nuevo registro" y "corrigiendo uno existente". */
function modoEdicion(registro) {
  App.editando = registro;

  const nota      = $('#notaEdicion');
  const btnBorrar = $('#btnEliminarRegistro');
  const btnGuardar= $('#btnGuardar');

  if (!registro) {
    nota.hidden = true;
    btnBorrar.hidden = true;
    btnGuardar.textContent = 'Guardar registro';
    btnGuardar.disabled = false;
    return;
  }

  // Rellenar con lo ya reportado para que se corrija sobre eso.
  CAMPOS.forEach(c => {
    if (c.opcional && !tieneDato(registro, c.key)) { $('#f_' + c.key).value = ''; return; }
    const v = Number(registro[c.key]) || 0;
    $('#f_' + c.key).value = v === 0 ? '' : v;
  });

  const abierto = puedeModificar(registro.fecha);
  nota.hidden = false;
  nota.classList.toggle('nota--bloqueada', !abierto);
  $('#notaEdicionTexto').textContent = abierto
    ? `Ya existe un reporte de ${registro.agenteNombre} para el ${fechaCorta(registro.fecha)}. ` +
      `Estás corrigiéndolo: al guardar se reemplazan los valores anteriores.`
    : mensajeCerrado(registro.fecha);

  btnBorrar.hidden    = !abierto;
  btnGuardar.disabled = !abierto;
  btnGuardar.textContent = 'Actualizar registro';
}

function limpiarFormulario({ conservarFecha = false } = {}) {
  CAMPOS.forEach(c => { $('#f_' + c.key).value = ''; });
  $('#f_agente').value = '';
  if (!conservarFecha) $('#f_fecha').value = hoyISO();
  modoEdicion(null);
}

/** Carga un registro en el formulario desde cualquier tabla. */
async function editarRegistro(reg) {
  $('.pestana[data-panel="panel-registro"]').click();
  $('#f_fecha').value  = reg.fecha;
  $('#f_agente').value = reg.agenteId;

  // Un agente inactivo no está en el desplegable: se añade temporalmente
  // para poder corregir su histórico.
  if ($('#f_agente').value !== reg.agenteId) {
    $('#f_agente').appendChild(el('option', {
      value: reg.agenteId, text: reg.agenteNombre + ' (inactivo)',
    }));
    $('#f_agente').value = reg.agenteId;
  }

  modoEdicion(reg);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/** Elimina un registro, previa confirmación. */
async function eliminarRegistro(reg) {
  if (!puedeModificar(reg.fecha)) return aviso(mensajeCerrado(reg.fecha), 'error');

  const ok = await confirmar({
    titulo: 'Eliminar reporte',
    texto: `Se eliminará el reporte de ${reg.agenteNombre} del ${fechaCorta(reg.fecha)}. ` +
           `Esta acción no se puede deshacer.`,
    etiquetaOk: 'Eliminar',
  });
  if (!ok) return;

  try {
    await Store.eliminarRegistro(reg.id);
    aviso('Reporte eliminado.');
    limpiarFormulario({ conservarFecha: true });
    await pintarRecientes();
    if ($('#panel-resumen').classList.contains('is-activa'))  await refrescarResumen();
    if ($('#panel-reportes').classList.contains('is-activa')) await refrescarReportes();
  } catch (err) {
    aviso(err.message, 'error');
  }
}

async function pintarRecientes() {
  const todos = await Store.listarRegistros();
  revisarColumnasNuevas(todos);
  const regs = todos.slice(0, 10);
  const tabla = $('#tablaRecientes');
  tabla.innerHTML = '';

  if (!regs.length) {
    tabla.appendChild(el('tbody', {}, [
      el('tr', {}, [el('td', { class: 'vacio', text: 'Todavía no hay registros guardados.' })]),
    ]));
    return;
  }

  tabla.appendChild(el('thead', {}, [
    el('tr', {}, [
      el('th', { text: 'Fecha' }),
      el('th', { text: 'Agente' }),
      ...CAMPOS.map(c => el('th', { class: 'num', text: c.corto })),
      el('th', { class: 'acc', text: 'Corregir' }),
    ]),
  ]));

  tabla.appendChild(el('tbody', {}, regs.map(r =>
    el('tr', {}, [
      el('td', { text: fechaCorta(r.fecha) }),
      el('td', { text: r.agenteNombre }),
      ...CAMPOS.map(c => el('td', {
        class: 'num' + (tieneDato(r, c.key) && Number(r[c.key]) ? '' : ' cero'),
        text: c.opcional ? fmtOpcional(r, c) : fmt(r[c.key], c.tipo),
      })),
      el('td', { class: 'acc' }, celdaAcciones(r)),
    ])
  )));
}

/** Botones Editar / Eliminar, o el candado si el día ya está cerrado. */
function celdaAcciones(reg) {
  if (!puedeModificar(reg.fecha)) {
    return [el('span', { class: 'cerrado', title: mensajeCerrado(reg.fecha), text: '🔒 Cerrado' })];
  }
  return [
    el('button', {
      class: 'btn-mini', type: 'button', text: 'Editar',
      onclick: () => editarRegistro(reg),
    }),
    el('button', {
      class: 'btn-mini btn-mini--peligro', type: 'button', text: 'Eliminar',
      onclick: () => eliminarRegistro(reg),
    }),
  ];
}

/* =========================================================================
   RESUMEN Y REPORTES
   Dos paneles con intenciones distintas: Resumen responde "¿como vamos?"
   y se mira de reojo; Reportes responde "dame los numeros de tal fecha".
   Cada uno tiene sus propios filtros para que ninguno cargue con los del
   otro.
   ========================================================================= */

/** Llena un desplegable de periodo con los presets de config.js. */
function llenarSelectPreset(select, porDefecto) {
  select.innerHTML = '';
  PRESETS_RANGO.forEach(p => select.appendChild(el('option', { value: p.key, text: p.label })));
  select.value = porDefecto;
}

/** Etiqueta legible del rango, para subtitulos. */
function textoRango(desde, hasta) {
  if (desde === hasta) return fechaEtiqueta(desde);
  return `${fechaCorta(desde)} — ${fechaCorta(hasta)} (${diasDelRango(desde, hasta)} días)`;
}

/* ---------- Panel Resumen ---------------------------------------------- */

function iniciarResumen() {
  llenarSelectPreset($('#rs_preset'), PRESET_POR_DEFECTO);
  $('#rs_preset').addEventListener('change', refrescarResumen);
  $('#rs_linea').addEventListener('change', e => {
    localStorage.setItem(LS_LINEA_VISTA, e.target.value);
    refrescarResumen();
  });

  // Las gráficas se redibujan al cambiar de tema (los colores no son CSS).
  Charts.alCambiarTema(() => {
    if ($('#panel-resumen').classList.contains('is-activa')) pintarGraficas();
  });
}

async function refrescarResumen() {
  llenarSelectJerarquia($('#rs_linea'));
  restaurarLineaVista($('#rs_linea'));

  // El Resumen no ofrece fechas a mano: si el preset no da rango, el de
  // por defecto.
  const rango = rangoDePreset($('#rs_preset').value) || rangoDePreset(PRESET_POR_DEFECTO);
  const alcance = alcanceDe($('#rs_linea').value);

  const regs = await Store.listarRegistros({ desde: rango.desde, hasta: rango.hasta });
  App.registrosStats = alcance ? regs.filter(r => alcance.has(r.agenteId)) : regs;

  await refrescarSinReportar($('#rs_linea').value);
  await refrescarSalud($('#rs_linea').value);
  pintarKPIs();
  pintarGraficas();
  pintarTasas();
  await refrescarComparativa($('#rs_linea').value);
}

/* ---------- Panel Reportes --------------------------------------------- */

function iniciarReportes() {
  llenarSelectPreset($('#rp_preset'), PRESET_POR_DEFECTO);
  const inicial = rangoDePreset(PRESET_POR_DEFECTO);
  $('#rp_desde').value = inicial.desde;
  $('#rp_hasta').value = inicial.hasta;

  $('#rp_preset').addEventListener('change', e => {
    const rango = rangoDePreset(e.target.value);
    if (!rango) return;                       // 'custom': se respetan las fechas
    $('#rp_desde').value = rango.desde;
    $('#rp_hasta').value = rango.hasta;
    refrescarReportes();
  });

  ['#rp_desde', '#rp_hasta'].forEach(sel => {
    $(sel).addEventListener('change', () => {
      $('#rp_preset').value = 'custom';
      refrescarReportes();
    });
  });

  $('#rp_linea').addEventListener('change', refrescarReportes);
  $('#btnImprimir').addEventListener('click', () => window.print());
  $('#btnCSV').addEventListener('click', exportarCSV);
}

async function refrescarReportes() {
  llenarSelectJerarquia($('#rp_linea'));

  const desde = $('#rp_desde').value;
  const hasta = $('#rp_hasta').value;

  if (desde && hasta && desde > hasta) {
    aviso('La fecha "Desde" no puede ser posterior a "Hasta".', 'error');
    return;
  }

  const alcance = alcanceDe($('#rp_linea').value);
  const regs = await Store.listarRegistros({ desde, hasta });
  App.registrosReportes = alcance ? regs.filter(r => alcance.has(r.agenteId)) : regs;

  const persona = App.agentes.find(a => a.id === $('#rp_linea').value);
  $('#reporteSub').textContent =
    `${textoRango(desde, hasta)} · ` +
    `${persona ? (persona.rol === 'Agente' ? persona.nombre : `línea de ${persona.nombre}`) : 'toda la organización'} · ` +
    `${App.registrosReportes.length} registro(s)`;

  pintarReporte();
  pintarDetalle();
}

/**
 * ¿El Apps Script publicado conoce los campos opcionales nuevos?
 *
 * El script devuelve solo las claves que él conoce, así que si NINGÚN
 * registro trae la clave es que el backend se quedó atrás. Importa
 * detectarlo: un script viejo ignora en silencio las columnas que no
 * conoce, y el agente vería "guardado" mientras el dato se pierde.
 */
function revisarColumnasNuevas(registros) {
  if (Store.esDemo || !registros.length) return;

  const faltan = CAMPOS
    .filter(c => c.opcional)
    .filter(c => !registros.some(r => c.key in r))
    .map(c => c.corto);

  App.columnasFaltantes = faltan;
  revisarBackend();
}

/** Muestra el aviso si el Apps Script publicado se quedó atrás. */
function revisarBackend() {
  const viejo = Store.backendDesactualizado && Store.backendDesactualizado();
  const faltan = App.columnasFaltantes || [];
  const aviso = $('#avisoBackend');

  aviso.hidden = !viejo && !faltan.length;
  if (aviso.hidden) return;

  aviso.innerHTML = '';
  if (viejo) {
    aviso.appendChild(el('span', { text:
      'La hoja de Google todavía no tiene las funciones de Metas y Contests. ' +
      'Esas pestañas se verán vacías hasta que se actualice el Apps Script. ' }));
  }
  if (faltan.length) {
    aviso.appendChild(el('strong', { text:
      `La hoja no tiene todavía la columna ${faltan.join(', ')}: ` +
      'lo que se escriba en ese campo NO se guardará. ' }));
  }
  aviso.appendChild(el('span', { text:
    'Para arreglarlo: copiar apps-script/Codigo.gs, ejecutar sincronizarColumnas ' +
    'y volver a implementar con versión nueva. El resto funciona con normalidad.' }));
}

/** Recupera la última línea elegida en este dispositivo. */
function restaurarLineaVista(select) {
  const guardada = localStorage.getItem(LS_LINEA_VISTA);
  if (!select.value && guardada && [...select.options].some(o => o.value === guardada)) {
    select.value = guardada;
  }
}

/** Suma una métrica sobre un conjunto de registros. */
const suma = (regs, key) => regs.reduce((t, r) => t + (Number(r[key]) || 0), 0);

function pintarKPIs() {
  const cont = $('#kpis');
  cont.innerHTML = '';
  const regs = App.registrosStats;
  const dias = new Set(regs.map(r => r.fecha)).size || 1;

  cont.appendChild(kpiAgentes(regs));

  for (const key of KPIS) {
    const campo = CAMPOS.find(c => c.key === key);
    const total = suma(regs, key);
    cont.appendChild(el('div', { class: 'kpi' }, [
      el('div', { class: 'kpi-etq',  text: campo.corto }),
      el('div', { class: 'kpi-val',  text: fmt(total, campo.tipo) }),
      el('div', { class: 'kpi-sub',  text: `${fmtPromedio(total / dias, campo.tipo)} por día` }),
    ]));
  }
}

/**
 * Indicador de participación: cuántos agentes distintos alimentan realmente
 * las cifras del periodo. Va primero porque es el contexto que les da sentido
 * — 18 APP con 3 agentes reportando no significa lo mismo que 18 con 30.
 */
function kpiAgentes(regs) {
  const contribuyentes = new Set(regs.map(r => r.agenteId)).size;
  const activos = App.agentes.filter(a => a.activo !== false).length;

  // Promedio de agentes que reportan en un día cualquiera del periodo.
  const porDia = new Map();
  regs.forEach(r => {
    if (!porDia.has(r.fecha)) porDia.set(r.fecha, new Set());
    porDia.get(r.fecha).add(r.agenteId);
  });
  const promedio = porDia.size
    ? [...porDia.values()].reduce((t, s) => t + s.size, 0) / porDia.size
    : 0;

  const partes = [];
  if (activos) partes.push(`de ${activos} activo(s)`);
  if (porDia.size) partes.push(`${fmtPromedio(promedio, 'entero')} por día`);

  const faltantes = Math.max(0, activos - contribuyentes);

  return el('div', {
    class: 'kpi kpi--contexto',
    title: faltantes
      ? `${faltantes} agente(s) activos no reportaron ni un solo día en este periodo.`
      : 'Todos los agentes activos reportaron al menos un día en este periodo.',
  }, [
    el('div', { class: 'kpi-etq', text: 'Agentes' }),
    el('div', { class: 'kpi-val', text: fmt(contribuyentes, 'entero') }),
    el('div', { class: 'kpi-sub', text: partes.join(' · ') || 'sin reportes' }),
  ]);
}

function pintarGraficas() {
  const regs = App.registrosStats;

  /* --- Tendencia diaria: 3 series sobre las fechas del rango ------------- */
  const fechas = [...new Set(regs.map(r => r.fecha))].sort();
  const series = SERIES_TENDENCIA.map(key => {
    const campo = CAMPOS.find(c => c.key === key);
    return {
      nombre: campo.corto,
      formato: campo.tipo,
      valores: fechas.map(f => suma(regs.filter(r => r.fecha === f), key)),
    };
  });
  Charts.lineas($('#graficaTendencia'), { fechas, series });

  /* --- Rankings por agente ---------------------------------------------- */
  const porAgente = agruparPorAgente(regs);

  Charts.barrasH($('#graficaAlp'), {
    items: porAgente
      .filter(a => a.alp > 0)
      .sort((x, y) => y.alp - x.alp)
      .slice(0, 10)
      .map(a => ({ id: a.agenteId, label: a.nombre, valor: a.alp,
                   detalle: `${a.pressSale} venta(s)` })),
    formato: 'moneda',
    alPulsar: abrirFicha,
  });

  Charts.barrasH($('#graficaVentas'), {
    items: porAgente
      .filter(a => a.pressSale > 0)
      .sort((x, y) => y.pressSale - x.pressSale)
      .slice(0, 10)
      .map(a => ({ id: a.agenteId, label: a.nombre, valor: a.pressSale,
                   detalle: `${a.press} presentación(es)` })),
    formato: 'entero',
    alPulsar: abrirFicha,
  });
}

/** Consolida los registros por agente sumando todas las métricas. */
function agruparPorAgente(regs) {
  const mapa = new Map();
  for (const r of regs) {
    if (!mapa.has(r.agenteId)) {
      const base = { agenteId: r.agenteId, nombre: r.agenteNombre, dias: new Set(), _regs: [] };
      CAMPOS.forEach(c => { base[c.key] = 0; });
      mapa.set(r.agenteId, base);
    }
    const a = mapa.get(r.agenteId);
    a.dias.add(r.fecha);
    a._regs.push(r);
    // Un campo opcional sin dato no suma cero: sencillamente no participa
    CAMPOS.forEach(c => {
      if (c.opcional && !tieneDato(r, c.key)) return;
      a[c.key] += Number(r[c.key]) || 0;
    });
  }
  return [...mapa.values()].map(a => ({
    ...a,
    dias: a.dias.size,
    pol: metricasPolizas(a._regs),
  }));
}

/**
 * Métricas de pólizas sobre un conjunto de registros.
 *
 * Se calculan SOLO con los registros que traen el dato: si se sumara el
 * ALP de todos contra las pólizas de unos pocos, el tamaño promedio de
 * venta saldría inflado. Devuelve además la cobertura, para poder decir
 * sobre cuántos registros se está hablando.
 */
function metricasPolizas(registros) {
  const con = registros.filter(r => tieneDato(r, 'polizas'));

  const polizas = con.reduce((t, r) => t + (Number(r.polizas) || 0), 0);
  const alp     = con.reduce((t, r) => t + (Number(r.alp) || 0), 0);
  const press   = con.reduce((t, r) => t + (Number(r.press) || 0), 0);

  return {
    polizas, alp, press,
    conDato: con.length,
    total: registros.length,
    hayDato: con.length > 0,
    alpPorPoliza:    polizas ? alp / polizas : null,
    polizasPorPress: press ? polizas / press : null,
  };
}

/** Texto de cobertura, solo cuando el dato está incompleto. */
function coberturaPolizas(m) {
  if (!m.hayDato) return 'Ningún registro del período tiene pólizas anotadas';
  if (m.conDato === m.total) return `${fmt(m.polizas)} póliza(s) en ${m.total} registro(s)`;
  return `${fmt(m.polizas)} póliza(s) · solo ${m.conDato} de ${m.total} registros lo tienen anotado`;
}

/* --- Tasas de conversión: son razones, no series — van en tabla -------- */
function pintarTasas() {
  const regs = App.registrosStats;
  const app       = suma(regs, 'app');
  const press     = suma(regs, 'press');
  const pressSale = suma(regs, 'pressSale');
  const caller    = suma(regs, 'callerCalls');
  const noShow    = suma(regs, 'noShow');
  const alp       = suma(regs, 'alp');

  const referidos = suma(regs, 'referidos');
  const pol = metricasPolizas(regs);

  const filas = [
    ['Llamadas → Appointment', porcentaje(app, caller),       `${fmt(app)} de ${fmt(caller)}`],
    ['Appointment → Presentación', porcentaje(press, app),    `${fmt(press)} de ${fmt(app)}`],
    ['Presentación → Venta', porcentaje(pressSale, press),    `${fmt(pressSale)} de ${fmt(press)}`],
    ['Tasa de NO SHOW', porcentaje(noShow, app),              `${fmt(noShow)} de ${fmt(app)}`],
    ['Referidos por presentación', ratioRefPress(referidos, press),
      `${fmt(referidos)} referidos de ${fmt(press)} presentaciones`, 'semaforo'],
    ['ALP por venta', pressSale ? fmt(alp / pressSale, 'moneda') : '—', `${fmt(alp, 'moneda')} total`],
    ['ALP por presentación', press ? fmt(alp / press, 'moneda') : '—',  `${fmt(press)} presentaciones`],
    ['ALP por póliza',
      pol.alpPorPoliza === null ? '—' : fmt(pol.alpPorPoliza, 'moneda'),
      `Tamaño promedio de venta · ${coberturaPolizas(pol)}`],
    ['Pólizas por presentación',
      pol.polizasPorPress === null ? '—' : pol.polizasPorPress.toFixed(2),
      `Cuántas cierra por oportunidad · ${coberturaPolizas(pol)}`],
  ];

  const cont = $('#tasas');
  cont.innerHTML = '';
  if (!regs.length) {
    cont.appendChild(el('p', { class: 'vacio', text: 'Sin datos en el rango seleccionado.' }));
    return;
  }

  const tabla = el('table', { class: 'tabla' }, [
    el('tbody', {}, filas.map(([etq, val, sub, marca]) =>
      el('tr', {}, [
        el('td', {}, [
          document.createTextNode(etq),
          el('div', { class: 'ayuda', text: sub }),
        ]),
        marca === 'semaforo'
          ? el('td', { class: 'num' }, [pastillaRefPress(referidos, press)])
          : el('td', { class: 'num', style: 'font-size:1.05rem;font-weight:600', text: val }),
      ])
    )),
  ]);
  cont.appendChild(tabla);
}

/**
 * Referidos por presentación, con un decimal. Sin presentaciones no hay
 * ratio que calcular: se informa con raya, no con un cero que parecería
 * un mal resultado.
 */
function ratioRefPress(referidos, press) {
  if (!press) return '—';
  return (referidos / press).toFixed(1);
}

function colorRefPress(valor) {
  if (valor === null) return null;
  return valor >= RATIO_REF_PRESS.verde ? 'verde'
       : valor >= RATIO_REF_PRESS.amarillo ? 'amarillo' : 'rojo';
}

/** Pastilla con el ratio y su semáforo, reutilizable en tabla y reporte. */
function pastillaRefPress(referidos, press) {
  if (!press) {
    return el('span', { class: 'pastilla-pct pastilla-pct--nulo',
      title: 'Sin presentaciones en el período', text: '—' });
  }
  const valor = referidos / press;
  return el('span', {
    class: `pastilla-pct pastilla-pct--${colorRefPress(valor)}`,
    title: `${fmt(referidos)} referidos ÷ ${fmt(press)} presentaciones · ` +
           `verde ≥ ${RATIO_REF_PRESS.verde}, amarillo ≥ ${RATIO_REF_PRESS.amarillo}`,
    text: valor.toFixed(1),
  });
}

/* --- Reporte consolidado por agente ------------------------------------ */
function pintarReporte() {
  const tabla = $('#tablaReporte');
  tabla.innerHTML = '';
  const filas = agruparPorAgente(App.registrosReportes);

  if (!filas.length) {
    tabla.appendChild(el('tbody', {}, [
      el('tr', {}, [el('td', { class: 'vacio', text: 'Sin registros en el rango seleccionado.' })]),
    ]));
    return;
  }

  // Denominador de la constancia: jornadas esperadas en el rango elegido.
  const habiles = diasHabilesDelRango($('#rp_desde').value, $('#rp_hasta').value);

  // Valor por el que se ordena cada columna. El ratio sin presentaciones
  // se manda al final: "sin dato" no es lo mismo que "el peor".
  const valorDe = {
    nombre:      f => f.nombre.toLowerCase(),
    dias:        f => f.dias,
    constancia:  f => (habiles ? f.dias / habiles : 0),
    refPress:    f => (f.press ? f.referidos / f.press : -1),
    // Sin dato al final: "no se anotó" no es lo mismo que "el peor"
    alpPoliza:   f => (f.pol.alpPorPoliza === null ? -1 : f.pol.alpPorPoliza),
    polizaPress: f => (f.pol.polizasPorPress === null ? -1 : f.pol.polizasPorPress),
  };
  CAMPOS.forEach(c => { valorDe[c.key] = f => f[c.key]; });

  const { campo, dir } = App.ordenReporte;
  const signo = dir === 'asc' ? 1 : -1;
  filas.sort((a, b) => {
    const x = valorDe[campo](a), y = valorDe[campo](b);
    if (x === y) return a.nombre.localeCompare(b.nombre, 'es');
    return (x > y ? 1 : -1) * signo;
  });

  /** Cabecera que ordena al pulsarla. */
  const th = (clave, texto, extra = {}) => el('th', {
    ...extra,
    class: (extra.class || '') + ' ordenable' + (campo === clave ? ' ordenable--activa' : ''),
    role: 'button',
    tabindex: '0',
    'aria-sort': campo === clave ? (dir === 'asc' ? 'ascending' : 'descending') : 'none',
    onclick: () => ordenarReportePor(clave),
    onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ordenarReportePor(clave); } },
  }, [
    document.createTextNode(texto),
    campo === clave ? el('span', { class: 'flecha-orden', 'aria-hidden': 'true',
      text: dir === 'asc' ? ' ▲' : ' ▼' }) : null,
  ].filter(Boolean));

  tabla.appendChild(el('thead', {}, [
    el('tr', {}, [
      th('nombre', 'Agente'),
      th('dias', 'Días', { class: 'num' }),
      th('constancia', 'Constancia', { class: 'num',
        title: `Días con reporte ÷ ${habiles} día(s) hábil(es) del período` }),
      th('refPress', 'REF/PRESS', { class: 'num',
        title: 'Referidos por presentación · ' +
               `verde ≥ ${RATIO_REF_PRESS.verde}, amarillo ≥ ${RATIO_REF_PRESS.amarillo}` }),
      th('alpPoliza', 'ALP/PÓLIZA', { class: 'num',
        title: 'Tamaño promedio de venta. Solo cuenta los registros con pólizas anotadas.' }),
      th('polizaPress', 'PÓL/PRESS', { class: 'num',
        title: 'Pólizas por presentación: cuántas cierra por oportunidad.' }),
      ...CAMPOS.map(c => th(c.key, c.corto, { class: 'num' })),
    ]),
  ]));

  tabla.appendChild(el('tbody', {}, filas.map(f =>
    el('tr', {}, [
      el('td', {}, [enlaceAgente(f.agenteId, f.nombre)]),
      el('td', { class: 'num', text: f.dias }),
      celdaConstancia(f.dias, habiles),
      el('td', { class: 'num' }, [pastillaRefPress(f.referidos, f.press)]),
      celdaPolizas(f.pol.alpPorPoliza, 'moneda', f.pol),
      celdaPolizas(f.pol.polizasPorPress, 'decimal', f.pol),
      ...CAMPOS.map(c => el('td', {
        class: 'num' + (celdaVacia(f, c) ? ' cero' : ''),
        text: celdaVacia(f, c) ? '—' : fmt(f[c.key], c.tipo),
      })),
    ])
  )));

  // El total de días es cuántas fechas distintas tuvieron actividad, no la
  // suma de las filas: varias personas comparten la misma fecha.
  const diasConActividad = new Set(App.registrosReportes.map(r => r.fecha)).size;
  const totalRef   = filas.reduce((t, f) => t + f.referidos, 0);
  const totalPress = filas.reduce((t, f) => t + f.press, 0);
  const polTotal   = metricasPolizas(App.registrosReportes);

  tabla.appendChild(el('tfoot', {}, [
    el('tr', {}, [
      el('td', { text: 'TOTAL' }),
      el('td', { class: 'num', text: diasConActividad }),
      celdaConstancia(diasConActividad, habiles, 'El equipo tuvo actividad en estos días del período'),
      el('td', { class: 'num' }, [pastillaRefPress(totalRef, totalPress)]),
      celdaPolizas(polTotal.alpPorPoliza, 'moneda', polTotal),
      celdaPolizas(polTotal.polizasPorPress, 'decimal', polTotal),
      ...CAMPOS.map(c => el('td', {
        class: 'num',
        text: c.opcional && !polTotal.hayDato ? '—'
          : fmt(filas.reduce((t, f) => t + f[c.key], 0), c.tipo),
      })),
    ]),
  ]));
}

/** Cambia el orden del reporte. Pulsar la columna activa invierte el sentido. */
function ordenarReportePor(campo) {
  const actual = App.ordenReporte;
  App.ordenReporte = campo === actual.campo
    ? { campo, dir: actual.dir === 'asc' ? 'desc' : 'asc' }
    // Los nombres se leen de A a Z; los números interesan de mayor a menor.
    : { campo, dir: campo === 'nombre' ? 'asc' : 'desc' };
  pintarReporte();
}

/** Un campo opcional sin ningún registro que lo traiga se muestra vacío. */
function celdaVacia(fila, campo) {
  return campo.opcional && fila.pol && !fila.pol.hayDato;
}

/** Métrica derivada de pólizas: raya cuando no hay dato con qué calcularla. */
function celdaPolizas(valor, tipo, pol) {
  if (valor === null) {
    return el('td', { class: 'num cero',
      title: pol.hayDato ? 'Sin base para calcularlo en este período'
                         : 'Ningún registro del período tiene pólizas anotadas',
      text: '—' });
  }
  return el('td', {
    class: 'num',
    title: coberturaPolizas(pol),
    text: tipo === 'decimal' ? valor.toFixed(2) : fmt(valor, tipo),
  });
}

/** Celda de constancia con su semáforo. Sin días hábiles no hay ratio. */
function celdaConstancia(dias, habiles, titulo) {
  if (!habiles) {
    return el('td', { class: 'num cero', text: '—' });
  }
  const pct = (dias / habiles) * 100;
  const color = pct >= CONSTANCIA.verde ? 'verde'
              : pct >= CONSTANCIA.amarillo ? 'amarillo' : 'rojo';

  return el('td', { class: 'num' }, [
    el('span', {
      class: `pastilla-pct pastilla-pct--${color}`,
      title: titulo || `${dias} de ${habiles} día(s) hábil(es)`,
      text: `${pct.toFixed(0)}%`,
    }),
  ]);
}

/* --- Detalle registro por registro ------------------------------------- */
function pintarDetalle() {
  const tabla = $('#tablaDetalle');
  tabla.innerHTML = '';
  const regs = App.registrosReportes;

  if (!regs.length) {
    tabla.appendChild(el('tbody', {}, [
      el('tr', {}, [el('td', { class: 'vacio', text: 'Sin registros en el rango seleccionado.' })]),
    ]));
    return;
  }

  tabla.appendChild(el('thead', {}, [
    el('tr', {}, [
      el('th', { text: 'Fecha' }),
      el('th', { text: 'Agente' }),
      ...CAMPOS.map(c => el('th', { class: 'num', text: c.corto })),
      el('th', { class: 'acc no-imprimir', text: 'Corregir' }),
    ]),
  ]));

  tabla.appendChild(el('tbody', {}, regs.map(r =>
    el('tr', {}, [
      el('td', { text: fechaCorta(r.fecha) }),
      el('td', {}, [enlaceAgente(r.agenteId, r.agenteNombre)]),
      ...CAMPOS.map(c => el('td', {
        class: 'num' + (tieneDato(r, c.key) && Number(r[c.key]) ? '' : ' cero'),
        text: c.opcional ? fmtOpcional(r, c) : fmt(r[c.key], c.tipo),
      })),
      el('td', { class: 'acc no-imprimir' }, celdaAcciones(r)),
    ])
  )));
}

function exportarCSV() {
  const regs = App.registrosReportes;
  if (!regs.length) return aviso('No hay datos para exportar.', 'error');

  const cab = ['Fecha', 'Agente', ...CAMPOS.map(c => c.corto)];
  const cuerpo = regs.map(r => [
    r.fecha,
    r.agenteNombre,
    ...CAMPOS.map(c => Number(r[c.key]) || 0),
  ]);

  const csv = [cab, ...cuerpo]
    .map(fila => fila.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');

  // BOM para que Excel reconozca los acentos.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = el('a', {
    href: URL.createObjectURL(blob),
    download: `seguimiento_${$('#rp_desde').value}_a_${$('#rp_hasta').value}.csv`,
  });
  document.body.appendChild(a);
  a.click();
  a.remove();
  aviso('CSV descargado.');
}

/* =========================================================================
   COMPARATIVA SEMANAL
   Siempre semana en curso (lunes a domingo) contra la inmediata anterior,
   al margen del rango elegido arriba: comparar "los ultimos 30 dias contra
   la semana pasada" no querria decir nada.
   ========================================================================= */

/* =========================================================================
   SIN REPORTAR HOY
   Lo primero del Resumen porque es lo unico que se puede corregir hoy
   mismo: el resto de la pantalla ya ocurrio.
   ========================================================================= */

/**
 * De quién se espera reporte dentro de una línea.
 *
 * Los agentes de campo siempre: reportar a diario es su trabajo. De los
 * líderes, solo quienes efectivamente producen — un MGA que solo dirige
 * no es un hueco que llenar, y listarlo cada día seria ruido que acaba
 * haciendo que nadie mire la tarjeta.
 */
function seEsperaReporteDe(lineaId, registrosDelPeriodo) {
  const alcance = alcanceDe(lineaId);
  const producen = new Set(registrosDelPeriodo.map(r => r.agenteId));

  return App.agentes
    .filter(a => a.activo !== false)
    .filter(a => !alcance || alcance.has(a.id))
    .filter(a => a.rol === 'Agente' || producen.has(a.id));
}

function iniciarSinReportar() {
  $('#sinReportarToggle').addEventListener('click', () => {
    const abierto = $('#sinReportarToggle').getAttribute('aria-expanded') === 'true';
    desplegarSinReportar(!abierto);
  });
}

function desplegarSinReportar(abrir) {
  $('#sinReportarToggle').setAttribute('aria-expanded', String(abrir));
  $('#sinReportarToggle').classList.toggle('plegable--abierto', abrir);
  $('#sinReportar').hidden = !abrir;
}

async function refrescarSinReportar(lineaId) {
  // El día que se evalúa es el último ya cerrado: antes de la hora de
  // corte, decir que nadie reportó hoy no informa nada.
  const dia = ultimoDiaCerrado();
  const esHoy = dia === hoyISO();

  const historial = await Store.listarRegistros({ desde: sumarDias(dia, -120), hasta: dia });
  const alcance = alcanceDe(lineaId);
  const enLinea = alcance ? historial.filter(r => alcance.has(r.agenteId)) : historial;

  const esperados = seEsperaReporteDe(lineaId, enLinea);

  // Última fecha reportada por persona, hasta el día evaluado
  const ultimo = new Map();
  for (const r of enLinea) {
    if (!ultimo.has(r.agenteId) || r.fecha > ultimo.get(r.agenteId)) {
      ultimo.set(r.agenteId, r.fecha);
    }
  }

  const faltan = esperados
    .filter(a => ultimo.get(a.id) !== dia)
    .map(a => ({ agente: a, ultimo: ultimo.get(a.id) || null }))
    .sort((x, y) => {
      // Primero quien lleva más tiempo sin aparecer
      if (!x.ultimo) return -1;
      if (!y.ultimo) return 1;
      return x.ultimo < y.ultimo ? -1 : x.ultimo > y.ultimo ? 1 : 0;
    });

  const persona = App.agentes.find(a => a.id === lineaId);
  const deQuien = persona
    ? (persona.rol === 'Agente' ? persona.nombre : `línea de ${persona.nombre}`)
    : 'toda la organización';

  $('#sinReportarTitulo').textContent = esHoy
    ? 'Sin reportar hoy'
    : `Sin reportar el ${fechaEtiqueta(dia)}`;

  $('#sinReportarAyuda').textContent =
    `${deQuien} · ${esperados.length} persona(s) de quienes se espera reporte` +
    (esHoy
      ? ` · el día se cierra a las ${horaCorteTexto()}`
      : ` · hoy se evalúa a partir de las ${horaCorteTexto()}`);

  pintarSinReportar(faltan, esperados.length, dia);
}

function pintarSinReportar(faltan, totalEsperado, dia) {
  const cont = $('#sinReportar');
  const marca = $('#sinReportarMarca');
  cont.innerHTML = '';

  if (!totalEsperado) {
    marca.className = 'plegable-marca plegable-marca--neutro';
    marca.textContent = 'Sin personas';
    cont.appendChild(el('p', { class: 'vacio', text: 'No hay nadie de quien esperar reporte en esta vista.' }));
    return;
  }

  // El resumen vive en el encabezado, siempre visible aunque esté plegado:
  // es el dato que se consulta a diario, la lista es el detalle.
  if (!faltan.length) {
    marca.className = 'plegable-marca plegable-marca--bien';
    marca.textContent = `✓ Reportaron ${totalEsperado} de ${totalEsperado}`;
    cont.appendChild(el('div', { class: 'todo-bien' }, [
      el('span', { class: 'todo-bien-icono', 'aria-hidden': 'true', text: '✓' }),
      el('div', {}, [
        el('strong', { text: 'Todos reportaron' }),
        el('p', { class: 'ayuda',
          text: `Las ${totalEsperado} personas de esta vista tienen su registro del ${fechaCorta(dia)}.` }),
      ]),
    ]));
    return;
  }

  const proporcion = faltan.length / totalEsperado;
  marca.className = 'plegable-marca plegable-marca--' +
                    (proporcion >= 0.5 ? 'mal' : proporcion >= 0.2 ? 'medio' : 'leve');
  marca.textContent = `${faltan.length} de ${totalEsperado} sin reportar`;

  const lista = el('div', { class: 'sin-reportar' });

  faltan.forEach(({ agente, ultimo }) => {
    const dias = ultimo ? diasDesde(ultimo) : null;
    const gravedad = dias === null ? 'nunca' : dias >= 7 ? 'alto' : dias >= 3 ? 'medio' : 'bajo';

    // Texto corto: el nombre es lo que hay que poder leer, no la etiqueta.
    const texto = dias === null ? 'nunca'
      : dias === 1 ? 'ayer'
      : `hace ${dias} d`;

    lista.appendChild(el('button', {
      class: `sin-reportar-fila sin-reportar-fila--${gravedad}`,
      type: 'button',
      title: `${agente.rol || 'Agente'} · ${agente.nombre} — ` +
             (dias === null ? 'nunca ha reportado' : `último reporte hace ${dias} día(s)`),
      onclick: () => bajarALinea(agente.id),
    }, [
      el('span', { class: 'sin-reportar-nombre', text: agente.nombre }),
      el('span', { class: 'sin-reportar-dias', text: texto }),
    ]));
  });

  cont.appendChild(lista);
}

/* =========================================================================
   SALUD DEL EQUIPO (SEMÁFORO)
   Se calcula sobre el cumplimiento de la meta de la semana en curso.
   Un equipo NO se pinta con el peor de sus agentes: se promedian los % de
   quienes tienen meta, para que un solo agente flojo no tina a los demas.
   Quien no tiene meta no cuenta como 0%; queda fuera y se lista aparte.
   ========================================================================= */

/** verde | amarillo | rojo | sin  (null = sin base para evaluar) */
function colorSemaforo(pct) {
  if (pct === null || pct === undefined) return 'sin';
  if (pct >= SEMAFORO.verde)    return 'verde';
  if (pct >= SEMAFORO.amarillo) return 'amarillo';
  return 'rojo';
}

const ETIQUETA_SEMAFORO = {
  verde:    'En meta',
  amarillo: 'Cerca',
  rojo:     'Bajo',
  sin:      'Sin meta',
};

/**
 * Salud de una persona. Para un agente es su propio cumplimiento; para
 * quien encabeza una linea, el promedio de los cumplimientos individuales
 * de los suyos.
 */
function saludDe(persona, metaPorAgente, realPorAgente) {
  const enAlcance = [persona, ...Jerarquia.descendientes(App.agentes, persona.id)]
    .filter(a => a.activo !== false);

  const evaluables = [];
  const sinMeta = [];

  enAlcance.forEach(a => {
    const meta = metaPorAgente.get(a.id);
    const pct = cumplimientoPromedio(meta, realPorAgente.get(a.id));
    if (pct === null) {
      // Solo se reclama meta a quien produce: un GA sin meta propia no es
      // un hueco que llenar.
      if (a.rol === 'Agente') sinMeta.push(a);
    } else {
      evaluables.push({ agente: a, pct });
    }
  });

  const pct = evaluables.length
    ? evaluables.reduce((t, e) => t + e.pct, 0) / evaluables.length
    : null;

  return {
    pct,
    color: colorSemaforo(pct),
    conMeta: evaluables.length,
    enMeta: evaluables.filter(e => e.pct >= SEMAFORO.verde).length,
    bajos: evaluables.filter(e => e.pct < SEMAFORO.amarillo).length,
    sinMeta,
    esAgente: persona.rol === 'Agente',
  };
}

/** Filas a mostrar según lo que esté seleccionado en "Ver". */
function filasDeSalud(lineaId) {
  if (!lineaId) {
    // Vista general: todas las lineas del organigrama, sangradas.
    return Jerarquia.aplanar(App.agentes)
      .filter(({ agente }) => agente.rol !== 'Agente' && agente.activo !== false);
  }

  const persona = App.agentes.find(a => a.id === lineaId);
  if (!persona) return [];
  if (persona.rol === 'Agente') return [{ agente: persona, nivel: 0 }];

  // Una linea concreta: quienes le reportan directo, lideres y agentes.
  return Jerarquia.hijos(App.agentes, lineaId)
    .filter(a => a.activo !== false)
    .sort((a, b) => (rangoDeRol(b.rol) - rangoDeRol(a.rol)) ||
                    a.nombre.localeCompare(b.nombre, 'es'))
    .map(agente => ({ agente, nivel: 0 }));
}

async function refrescarSalud(lineaId) {
  const semana = semanaActual();

  // Resueltas contra la base: quien tiene meta base cuenta en el semáforo
  // aunque no se le haya fijado nada específico para esta semana.
  const [{ resueltas }, registros] = await Promise.all([
    cargarMetasResueltas(semana),
    Store.listarRegistros({ desde: semana, hasta: domingoDeLaSemana(semana) }),
  ]);
  revisarBackend();

  const metaPorAgente = resueltas;

  const realPorAgente = new Map();
  for (const r of registros) {
    if (!realPorAgente.has(r.agenteId)) {
      realPorAgente.set(r.agenteId, Object.fromEntries(METAS_CAMPOS.map(c => [c.key, 0])));
    }
    const acc = realPorAgente.get(r.agenteId);
    METAS_CAMPOS.forEach(c => { acc[c.key] += Number(r[c.key]) || 0; });
  }

  const persona = App.agentes.find(a => a.id === lineaId);
  $('#saludAyuda').textContent =
    `Semana del ${etiquetaSemana(semana)} · ` +
    (persona
      ? (persona.rol === 'Agente' ? persona.nombre : `quienes reportan a ${persona.nombre}`)
      : 'todas las líneas') +
    `. Verde ≥ ${SEMAFORO.verde}%, amarillo desde ${SEMAFORO.amarillo}%.`;

  pintarSalud(filasDeSalud(lineaId), metaPorAgente, realPorAgente);
}

function pintarSalud(filas, metaPorAgente, realPorAgente) {
  const cont = $('#salud');
  cont.innerHTML = '';

  if (!filas.length) {
    // Sin jerarquía no hay equipos que evaluar: conviene decir por qué en
    // vez de dejar un panel vacío sin explicación.
    const hayLideres = App.agentes.some(a => a.rol && a.rol !== 'Agente');
    cont.appendChild(el('p', { class: 'vacio', text: hayLideres
      ? 'No hay equipos bajo esta vista.'
      : 'Todavía no hay jerarquía definida. Asigna roles y "reporta a" en la pestaña Agentes para ver la salud por equipo.' }));
    $('#saludSinMeta').textContent = '';
    return;
  }

  const todosSinMeta = new Set();

  filas.forEach(({ agente, nivel }) => {
    const s = saludDe(agente, metaPorAgente, realPorAgente);
    s.sinMeta.forEach(a => todosSinMeta.add(a.nombre));

    const detalle = s.esAgente
      ? (s.pct === null ? 'Sin meta asignada esta semana'
                        : `Cumplimiento de su meta semanal`)
      : (s.conMeta
          ? `${s.enMeta} de ${s.conMeta} agente(s) en meta` +
            (s.bajos ? ` · ${s.bajos} por debajo del ${SEMAFORO.amarillo}%` : '')
          : 'Nadie en su línea tiene meta esta semana');

    // Toda la fila es un botón: al pulsarla se baja a esa línea.
    const fila = el('button', {
      class: `salud-fila salud-fila--${s.color}`,
      type: 'button',
      style: `--nivel:${nivel}`,
      onclick: () => bajarALinea(agente.id),
      title: `Ver el detalle de ${agente.nombre}`,
    }, [
      el('span', { class: `punto punto--${s.color}`, 'aria-hidden': 'true' }),
      el('span', { class: 'salud-nombre' }, [
        el('span', { class: 'marca-rol', text: agente.rol || 'Agente' }),
        document.createTextNode(' ' + agente.nombre),
      ]),
      el('span', { class: 'salud-detalle', text: detalle }),
      el('span', { class: `salud-estado salud-estado--${s.color}` },
        [document.createTextNode(
          s.pct === null ? ETIQUETA_SEMAFORO.sin
                         : `${ETIQUETA_SEMAFORO[s.color]} · ${s.pct.toFixed(0)}%`)]),
    ]);

    cont.appendChild(fila);
  });

  $('#saludSinMeta').textContent = todosSinMeta.size
    ? `Sin meta esta semana (no cuentan para el semáforo): ${[...todosSinMeta].join(', ')}.`
    : '';
}

/** Baja el foco a una línea desde el semáforo. */
function bajarALinea(id) {
  const sel = $('#rs_linea');
  sel.value = id;
  localStorage.setItem(LS_LINEA_VISTA, id);
  refrescarResumen();
  $('#panel-resumen').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const LS_LINEA_VISTA = 'gt_linea_vista';

/** Suma todos los indicadores del registro, mas las tasas derivadas. */
function totalesComparativa(registros) {
  const t = {};
  CAMPOS.forEach(c => { t[c.key] = 0; });

  for (const r of registros) {
    CAMPOS.forEach(c => { t[c.key] += Number(r[c.key]) || 0; });
  }

  // Sin base no hay tasa que reportar: null, no cero.
  t.tasaNoShow = t.app   ? (t.noShow / t.app) * 100      : null;
  t.tasaCierre = t.press ? (t.pressSale / t.press) * 100 : null;
  return t;
}

async function refrescarComparativa(lineaId) {
  const estaSemana = semanaActual();
  const anterior   = sumarDias(estaSemana, -7);
  const alcance    = alcanceDe(lineaId);

  const filtrar = regs => alcance ? regs.filter(r => alcance.has(r.agenteId)) : regs;

  const [regsAhora, regsAntes] = await Promise.all([
    Store.listarRegistros({ desde: estaSemana, hasta: domingoDeLaSemana(estaSemana) }),
    Store.listarRegistros({ desde: anterior,   hasta: domingoDeLaSemana(anterior) }),
  ]);

  const ahora = totalesComparativa(filtrar(regsAhora));
  const antes = totalesComparativa(filtrar(regsAntes));

  $('#comparativaAyuda').textContent =
    `${etiquetaSemana(estaSemana)} contra ${etiquetaSemana(anterior)}. ` +
    `Siempre semanal, al margen del periodo elegido arriba.`;

  // Cuanta gente hay realmente detras de estos numeros
  const persona = App.agentes.find(a => a.id === lineaId);
  const enAlcance = App.agentes.filter(
    a => (!alcance || alcance.has(a.id)) && a.rol === 'Agente' && a.activo !== false).length;
  const reportaron = new Set(filtrar(regsAhora).map(r => r.agenteId)).size;

  $('#comparativaAlcance').textContent = persona && persona.rol === 'Agente'
    ? `Datos individuales de ${persona.nombre}.`
    : `${persona ? `Línea de ${persona.nombre} (${persona.rol})` : 'Toda la organización'}: ` +
      `${enAlcance} agente(s) de campo, ${reportaron} con reporte esta semana.`;

  pintarComparativa(ahora, antes);
}

/**
 * Tabla en vez de tarjetas: con doce indicadores, doce tarjetas pesan
 * demasiado y la gracia de la comparativa es recorrer la columna de
 * variaciones de un vistazo.
 */
function pintarComparativa(ahora, antes) {
  const tabla = $('#tablaComparativa');
  tabla.innerHTML = '';

  const valor = (v, tipo) => v === null || v === undefined ? '—'
    : tipo === 'porcentaje' ? v.toFixed(1) + '%'
    : fmt(v, tipo);

  tabla.appendChild(el('thead', {}, [
    el('tr', {}, [
      el('th', { text: 'Indicador' }),
      el('th', { class: 'num', text: 'Esta semana' }),
      el('th', { class: 'num', text: 'Semana pasada' }),
      el('th', { text: 'Variación' }),
    ]),
  ]));

  tabla.appendChild(el('tbody', {}, COMPARATIVA_CAMPOS.map(c => {
    const act = ahora[c.key];
    const ant = antes[c.key];
    const hayAct = act !== null && act !== undefined;
    const hayAnt = ant !== null && ant !== undefined;

    return el('tr', { class: c.calculado ? 'fila-derivada' : '' }, [
      el('td', { text: c.label }),
      el('td', { class: 'num' + (hayAct && act ? '' : ' cero'), text: valor(act, c.tipo) }),
      el('td', { class: 'num' + (hayAnt && ant ? '' : ' cero'), text: valor(ant, c.tipo) }),
      el('td', {}, [delta(c, act, ant, hayAct, hayAnt)]),
    ]);
  })));
}

/**
 * Variacion contra la semana pasada. El color nunca va solo: siempre lo
 * acompana una flecha y el signo, para que se entienda sin distinguir
 * colores y al imprimir en blanco y negro.
 */
function delta(campo, actual, anterior, hayActual, hayAnterior) {
  if (!hayActual || !hayAnterior) {
    return el('div', { class: 'comp-delta comp-delta--neutro', text: 'Sin base de comparación' });
  }

  const dif = actual - anterior;

  if (Math.abs(dif) < 1e-9) {
    return el('div', { class: 'comp-delta comp-delta--neutro', text: '→ Sin cambio' });
  }

  const subio = dif > 0;
  const bueno = campo.mejor === 'bajo' ? !subio : subio;
  const flecha = subio ? '↑' : '↓';

  const absTexto = campo.tipo === 'porcentaje'
    ? Math.abs(dif).toFixed(1) + ' pts'
    : fmt(Math.abs(dif), campo.tipo);

  // Desde cero no hay porcentaje que calcular: se informa el absoluto.
  const pctTexto = anterior === 0
    ? ''
    : ` · ${Math.abs((dif / anterior) * 100).toFixed(0)}%`;

  return el('div', {
    class: 'comp-delta ' + (bueno ? 'comp-delta--bien' : 'comp-delta--mal'),
    title: campo.mejor === 'bajo'
      ? 'En este indicador, bajar es mejor.'
      : 'En este indicador, subir es mejor.',
    text: `${flecha} ${subio ? '+' : '−'}${absTexto}${pctTexto}`,
  });
}

/* =========================================================================
   PANEL METAS
   La captura es una tabla editable: fijar 30+ metas de una en una en un
   dialogo seria impracticable. Los cambios quedan en memoria hasta que se
   pulsa Guardar.
   ========================================================================= */

/**
 * Carga las metas de una semana resueltas contra la meta base.
 *
 * La regla es: si hay meta fijada para esa semana se usa; si no, se hereda
 * la base del agente. La meta semanal es la excepcion, no la regla — asi
 * nadie tiene que capturar lo mismo cada lunes.
 */
async function cargarMetasResueltas(semana) {
  const [deSemana, base] = await Promise.all([
    Store.listarMetas({ semana }),
    Store.listarMetas({ semana: META_BASE }),
  ]);

  const porSemana = new Map(deSemana.map(m => [m.agenteId, m]));
  const porBase   = new Map(base.map(m => [m.agenteId, m]));

  const resueltas = new Map();
  new Set([...porBase.keys(), ...porSemana.keys()]).forEach(id => {
    resueltas.set(id, porSemana.get(id) || porBase.get(id));
  });

  return { resueltas, porSemana, porBase };
}

function iniciarMetas() {
  App.semanaMetas = semanaActual();
  App.vistaMetas = 'semana';       // 'semana' | 'base'
  App.metasEditadas = new Map();   // agenteId -> { alp, app, referidos }

  $$('.metas-modo').forEach(b => b.addEventListener('click', () => {
    if (!confirmarDescarte()) return;
    App.vistaMetas = b.dataset.modo;
    $$('.metas-modo').forEach(x => x.classList.toggle('is-activa', x === b));
    refrescarMetas();
  }));

  $('#btnSemanaAnt').addEventListener('click', () => moverSemana(-7));
  $('#btnSemanaSig').addEventListener('click', () => moverSemana(+7));
  $('#btnSemanaHoy').addEventListener('click', () => {
    if (!confirmarDescarte()) return;
    App.semanaMetas = semanaActual();
    refrescarMetas();
  });

  $('#m_linea').addEventListener('change', refrescarMetas);
  $('#btnGuardarMetas').addEventListener('click', guardarMetas);
  $('#btnDescartarMetas').addEventListener('click', () => {
    App.metasEditadas.clear();
    refrescarMetas();
  });
  $('#btnCopiarMetas').addEventListener('click', copiarMetasSemanaAnterior);
}

function moverSemana(dias) {
  if (!confirmarDescarte()) return;
  App.semanaMetas = sumarDias(App.semanaMetas, dias);
  refrescarMetas();
}

/** Evita perder ediciones sin guardar al cambiar de semana. */
function confirmarDescarte() {
  if (!App.metasEditadas.size) return true;
  const ok = window.confirm(
    `Tienes ${App.metasEditadas.size} meta(s) sin guardar. ¿Descartar los cambios?`);
  if (ok) App.metasEditadas.clear();
  return ok;
}

/**
 * Llena un desplegable con el organigrama sangrado. Con soloLideres solo
 * aparecen quienes encabezan una linea; si no, tambien los agentes, que
 * es lo que permite ver la comparativa a nivel individual.
 */
function llenarSelectJerarquia(select, { soloLideres = false, textoTodos = 'Toda la organización' } = {}) {
  const previo = select.value;
  select.innerHTML = '';
  if (textoTodos !== null) select.appendChild(el('option', { value: '', text: textoTodos }));

  Jerarquia.aplanar(App.agentes)
    .filter(({ agente }) => (soloLideres ? agente.rol !== 'Agente' : true))
    .forEach(({ agente, nivel }) => {
      select.appendChild(el('option', {
        value: agente.id,
        text: `${'　'.repeat(nivel)}${agente.nombre} · ${agente.rol || 'Agente'}`,
      }));
    });

  if ([...select.options].some(o => o.value === previo)) select.value = previo;
}

/** Personas que pueden encabezar una línea (todo lo que no sea Agente). */
function llenarSelectLinea(select) {
  llenarSelectJerarquia(select, { soloLideres: true });
}

/**
 * Ids que entran en el alcance de una persona: ella misma mas todo lo que
 * cuelga de su linea, sin importar cuantos niveles intermedios haya. Se
 * incluye a la propia persona porque un SA tambien puede producir.
 */
function alcanceDe(id) {
  if (!id) return null;                       // null = toda la organizacion
  return new Set([id, ...Jerarquia.descendientes(App.agentes, id).map(a => a.id)]);
}

/**
 * Personas de la línea elegida, en orden de organigrama y con su nivel
 * relativo para poder sangrarlas.
 *
 * Incluye a los líderes, no solo a los agentes de campo: un SA, un GA o un
 * MGA también produce y puede tener meta propia de ALP, citas y referidos.
 */
function personasDeLaLinea(lineaId) {
  const alcance = alcanceDe(lineaId);

  const dentro = Jerarquia.aplanar(App.agentes)
    .filter(({ agente }) => agente.activo !== false)
    .filter(({ agente }) => !alcance || alcance.has(agente.id));

  if (!dentro.length) return [];

  // El nivel viene del árbol completo; se normaliza para que la primera
  // persona de la vista quede sin sangría.
  const base = Math.min(...dentro.map(d => d.nivel));
  return dentro.map(d => ({ agente: d.agente, nivel: d.nivel - base }));
}

async function refrescarMetas() {
  const esAdmin = Sesion.esAdmin();
  const enBase = App.vistaMetas === 'base';

  llenarSelectLinea($('#m_linea'));
  $('#zonaSemana').hidden = enBase;

  if (enBase) {
    $('#metasAyuda').textContent =
      'Se aplica a todas las semanas mientras no se fije una excepción. ' +
      'Se captura una vez y no hay que repetirla cada lunes.';
  } else {
    $('#etqSemana').textContent = etiquetaSemana(App.semanaMetas);
    const rel = relativoSemana(App.semanaMetas);
    const rango = `${fechaCorta(App.semanaMetas)} al ${fechaCorta(domingoDeLaSemana(App.semanaMetas))}`;
    $('#metasAyuda').textContent = rel ? `${rel} · ${rango}` : rango;
  }

  $('#metasSoloLectura').hidden = esAdmin;
  $('#btnCopiarMetas').disabled = !esAdmin;
  $('#btnCopiarMetas').hidden = enBase;   // no hay semana anterior que copiar

  const { resueltas, porSemana, porBase } = await cargarMetasResueltas(App.semanaMetas);
  revisarBackend();
  App.metasSemana = porSemana;
  App.metasBase   = porBase;
  App.metasResueltas = resueltas;

  // Lo realmente logrado en esa semana, para comparar contra la meta
  const registros = enBase ? [] : await Store.listarRegistros({
    desde: App.semanaMetas,
    hasta: domingoDeLaSemana(App.semanaMetas),
  });
  App.realSemana = new Map();
  for (const r of registros) {
    if (!App.realSemana.has(r.agenteId)) {
      App.realSemana.set(r.agenteId, Object.fromEntries(METAS_CAMPOS.map(c => [c.key, 0])));
    }
    const acc = App.realSemana.get(r.agenteId);
    METAS_CAMPOS.forEach(c => { acc[c.key] += Number(r[c.key]) || 0; });
  }

  pintarTablaMetas(esAdmin);
  pintarResumenMetas();
  actualizarBotonesMetas();
}

/** Convierte una fila guardada al objeto de valores que usa la tabla. */
function valoresDeMeta(m) {
  if (!m) return null;
  return Object.fromEntries(METAS_CAMPOS.map(c => [c.key, Number(m[c.key]) || 0]));
}

/**
 * Meta efectiva. En vista de semana resuelve edición > semana > base; en
 * vista base solo mira la base.
 */
function metaDe(agenteId) {
  if (App.metasEditadas.has(agenteId)) return App.metasEditadas.get(agenteId);
  if (App.vistaMetas === 'base') return valoresDeMeta(App.metasBase.get(agenteId));
  return valoresDeMeta(App.metasResueltas.get(agenteId));
}

/** De dónde sale la meta que se está viendo: 'editada' | 'semana' | 'base' | null */
function origenMeta(agenteId) {
  if (App.metasEditadas.has(agenteId)) return 'editada';
  if (App.vistaMetas === 'base') return App.metasBase.has(agenteId) ? 'base' : null;
  if (App.metasSemana.has(agenteId)) return 'semana';
  if (App.metasBase.has(agenteId))   return 'base';
  return null;
}

function pintarTablaMetas(esAdmin) {
  const tabla = $('#tablaMetas');
  tabla.innerHTML = '';
  const personas = personasDeLaLinea($('#m_linea').value);

  if (!personas.length) {
    tabla.appendChild(el('tbody', {}, [
      el('tr', {}, [el('td', { class: 'vacio', text: 'No hay personas activas en esa línea.' })]),
    ]));
    return;
  }

  const enBase = App.vistaMetas === 'base';

  tabla.appendChild(el('thead', {}, [
    el('tr', {}, [
      el('th', { text: 'Persona' }),
      el('th', { text: enBase ? 'Reporta a' : 'Origen' }),
      ...METAS_CAMPOS.map(c => el('th', { class: 'num', text: 'Meta ' + c.corto })),
      ...(enBase ? [] : METAS_CAMPOS.map(c => el('th', { class: 'num', text: 'Real ' + c.corto }))),
      ...(enBase ? [] : [el('th', { text: 'Estado' })]),
    ]),
  ]));

  const nombrePorId = Object.fromEntries(App.agentes.map(a => [a.id, a.nombre]));

  tabla.appendChild(el('tbody', {}, personas.map(({ agente: ag, nivel }) => {
    const meta = metaDe(ag.id);
    const real = App.realSemana.get(ag.id) || {};
    const editada = App.metasEditadas.has(ag.id);
    const origen = origenMeta(ag.id);
    const base = valoresDeMeta(App.metasBase.get(ag.id));

    // En vista de semana el campo solo lleva valor si hay excepción propia.
    // Vacío significa "hereda la base", y la base se ve como texto guía —
    // así escribir es crear la excepción y borrar es volver a la base.
    const propia = editada ? App.metasEditadas.get(ag.id)
                 : enBase ? base
                 : valoresDeMeta(App.metasSemana.get(ag.id));

    return el('tr', { class: editada ? 'fila-editada' : '' }, [
      el('td', { style: `padding-left:${11 + nivel * 18}px` }, [
        el('span', { class: 'marca-rol', text: ag.rol || 'Agente' }),
        document.createTextNode(' '),
        enlaceAgente(ag.id, ag.nombre),
      ]),

      enBase
        ? el('td', { class: 'tenue', text: nombrePorId[ag.reportaA] || '—' })
        : el('td', {}, [marcaOrigen(origen, ag, esAdmin)]),

      ...METAS_CAMPOS.map(c => el('td', { class: 'num' }, [
        el('input', {
          type: 'number', min: '0',
          step: c.tipo === 'moneda' ? '0.01' : '1',
          inputmode: c.tipo === 'moneda' ? 'decimal' : 'numeric',
          class: 'celda-num' + (!enBase && origen === 'base' ? ' celda-num--heredada' : ''),
          placeholder: !enBase && base && base[c.key] ? fmt(base[c.key], c.tipo) : '—',
          title: !enBase && base && base[c.key]
            ? `Base: ${fmt(base[c.key], c.tipo)}. Escribe para fijar una excepción esta semana.`
            : '',
          value: propia && propia[c.key] ? propia[c.key] : '',
          disabled: !esAdmin,
          'data-agente': ag.id,
          'data-campo': c.key,
          oninput: alEditarMeta,
        }),
      ])),

      ...(enBase ? [] : METAS_CAMPOS.map(c => el('td', {
        class: 'num' + (real[c.key] ? '' : ' cero'),
        text: fmt(real[c.key] || 0, c.tipo),
      }))),

      ...(enBase ? [] : [el('td', {}, [estadoDeMeta(meta, real)])]),
    ]);
  })));
}

/** De dónde viene la meta de esta fila, y cómo devolverla a la base. */
function marcaOrigen(origen, agente, esAdmin) {
  if (origen === 'editada') {
    return el('span', { class: 'marca-estado marca-estado--on', text: 'Sin guardar' });
  }
  if (origen === 'semana') {
    const marca = el('span', { class: 'origen' }, [
      el('span', { class: 'marca-estado marca-estado--on', text: 'Esta semana' }),
    ]);
    // Volver a la base es simplemente quitar la excepción de esta semana.
    if (esAdmin && App.metasBase.has(agente.id)) {
      marca.appendChild(el('button', {
        class: 'btn-mini', type: 'button', text: 'Volver a la base',
        title: 'Quita la excepción y hereda otra vez la meta base',
        onclick: () => volverALaBase(agente.id),
      }));
    }
    return marca;
  }
  if (origen === 'base') {
    return el('span', { class: 'marca-estado marca-estado--off', text: 'Base' });
  }
  return el('span', { class: 'marca-estado marca-estado--off', text: 'Sin meta' });
}

/** Encola quitar la excepción semanal: al guardar, la fila hereda la base. */
function volverALaBase(agenteId) {
  App.metasEditadas.set(agenteId,
    Object.fromEntries(METAS_CAMPOS.map(c => [c.key, 0])));
  pintarTablaMetas(true);
  pintarResumenMetas();
  actualizarBotonesMetas();
  aviso('Se quitará la excepción al guardar.', 'info');
}

/**
 * Estado de un agente frente a su meta. Sin meta no es 0%: es "sin meta",
 * y queda fuera de todo promedio.
 */
function estadoDeMeta(meta, real) {
  if (!meta) return el('span', { class: 'marca-estado marca-estado--off', text: 'Sin meta' });
  const pct = cumplimientoPromedio(meta, real);
  if (pct === null) return el('span', { class: 'marca-estado marca-estado--off', text: 'Sin meta' });
  return el('span', { class: 'pct', text: pct.toFixed(0) + '%' });
}

/**
 * Promedio del % de cumplimiento entre los indicadores que tienen meta.
 * Devuelve null si el agente no tiene ninguna meta distinta de cero.
 */
function cumplimientoPromedio(meta, real) {
  if (!meta) return null;
  const pcts = METAS_CAMPOS
    .filter(c => Number(meta[c.key]) > 0)
    .map(c => ((Number(real && real[c.key]) || 0) / Number(meta[c.key])) * 100);
  if (!pcts.length) return null;
  return pcts.reduce((t, p) => t + p, 0) / pcts.length;
}

function alEditarMeta(e) {
  const agenteId = e.target.dataset.agente;
  const campo    = e.target.dataset.campo;

  const actual = App.metasEditadas.get(agenteId)
    || metaDe(agenteId)
    || Object.fromEntries(METAS_CAMPOS.map(c => [c.key, 0]));

  const copia = { ...actual };
  const raw = e.target.value.trim();
  copia[campo] = raw === '' ? 0 : nDecimal(raw);

  App.metasEditadas.set(agenteId, copia);
  e.target.closest('tr').classList.add('fila-editada');
  actualizarBotonesMetas();
  pintarResumenMetas();
}

function actualizarBotonesMetas() {
  const n = App.metasEditadas.size;
  $('#metasAcciones').hidden = !Sesion.esAdmin() || n === 0;
  $('#btnGuardarMetas').textContent = n
    ? `Guardar ${n} cambio(s)` : 'Guardar cambios';
}

/** Suma de metas y de real por cada línea, en orden de organigrama. */
function pintarResumenMetas() {
  const tabla = $('#tablaResumenMetas');
  tabla.innerHTML = '';

  const lineas = Jerarquia.aplanar(App.agentes)
    .filter(({ agente }) => agente.rol !== 'Agente');

  if (!lineas.length) {
    tabla.appendChild(el('tbody', {}, [
      el('tr', {}, [el('td', { class: 'vacio', text: 'No hay líneas definidas en el organigrama.' })]),
    ]));
    return;
  }

  tabla.appendChild(el('thead', {}, [
    el('tr', {}, [
      el('th', { text: 'Línea' }),
      el('th', { class: 'num', text: 'Agentes' }),
      el('th', { class: 'num', text: 'Con meta' }),
      ...METAS_CAMPOS.map(c => el('th', { class: 'num', text: 'Meta ' + c.corto })),
      ...METAS_CAMPOS.map(c => el('th', { class: 'num', text: 'Real ' + c.corto })),
    ]),
  ]));

  tabla.appendChild(el('tbody', {}, lineas.map(({ agente, nivel }) => {
    // La suma incluye a la propia persona: si un SA tiene meta propia,
    // cuenta dentro de su línea. Cada quien se suma una sola vez.
    const enLinea = [agente, ...Jerarquia.descendientes(App.agentes, agente.id)]
      .filter(a => a.activo !== false);

    const deCampo = enLinea.filter(a => a.rol === 'Agente');
    const conMeta = deCampo.filter(a => metaDe(a.id));

    const sumaMeta = Object.fromEntries(METAS_CAMPOS.map(c => [c.key, 0]));
    const sumaReal = Object.fromEntries(METAS_CAMPOS.map(c => [c.key, 0]));

    enLinea.forEach(a => {
      const m = metaDe(a.id);
      const r = App.realSemana.get(a.id) || {};
      METAS_CAMPOS.forEach(c => {
        if (m) sumaMeta[c.key] += Number(m[c.key]) || 0;
        sumaReal[c.key] += Number(r[c.key]) || 0;
      });
    });

    const suyos = deCampo;
    const faltan = suyos.length - conMeta.length;

    return el('tr', {}, [
      el('td', { style: `padding-left:${11 + nivel * 18}px` }, [
        el('span', { class: 'marca-rol', text: agente.rol }),
        document.createTextNode(' ' + agente.nombre),
      ]),
      el('td', { class: 'num', text: suyos.length }),
      el('td', {
        class: 'num' + (faltan ? ' aviso-celda' : ''),
        title: faltan ? `${faltan} agente(s) sin meta esta semana` : '',
        text: `${conMeta.length}/${suyos.length}`,
      }),
      ...METAS_CAMPOS.map(c => el('td', {
        class: 'num' + (sumaMeta[c.key] ? '' : ' cero'),
        text: fmt(sumaMeta[c.key], c.tipo),
      })),
      ...METAS_CAMPOS.map(c => el('td', {
        class: 'num' + (sumaReal[c.key] ? '' : ' cero'),
        text: fmt(sumaReal[c.key], c.tipo),
      })),
    ]);
  })));
}

async function guardarMetas() {
  if (!App.metasEditadas.size) return;
  const btn = $('#btnGuardarMetas');
  btn.disabled = true;

  const enBase = App.vistaMetas === 'base';
  const nombrePorId = Object.fromEntries(App.agentes.map(a => [a.id, a.nombre]));
  const lista = [...App.metasEditadas.entries()].map(([agenteId, valores]) => ({
    // La vista decide si se escribe la meta base o la excepción semanal.
    semana: enBase ? META_BASE : App.semanaMetas,
    agenteId,
    agenteNombre: nombrePorId[agenteId] || '',
    ...valores,
  }));

  try {
    const { guardadas, borradas } = await Store.guardarMetas(lista);
    App.metasEditadas.clear();
    await refrescarMetas();
    // Fuera de Metas también cambia el semáforo: hay que repintarlo.
    if ($('#panel-resumen').classList.contains('is-activa')) await refrescarResumen();

    const que = enBase ? 'meta(s) base' : 'meta(s) de la semana';
    aviso(borradas
      ? `${guardadas} ${que} guardada(s), ${borradas} ${enBase ? 'eliminada(s)' : 'devuelta(s) a su base'}.`
      : `${guardadas} ${que} guardada(s).`);
  } catch (err) {
    aviso(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

/**
 * Precarga la tabla con lo que aplicaba la semana anterior, sin guardar.
 *
 * Copia la meta RESUELTA, no solo las excepciones: antes fallaba con un
 * "la semana anterior no tiene metas" cuando esa semana heredaba su base,
 * que es justo el caso normal.
 */
async function copiarMetasSemanaAnterior() {
  const { resueltas } = await cargarMetasResueltas(sumarDias(App.semanaMetas, -7));
  if (!resueltas.size) {
    return aviso('La semana anterior no tiene metas, ni propias ni heredadas.', 'error');
  }

  const visibles = new Set(personasDeLaLinea($('#m_linea').value).map(p => p.agente.id));
  let copiadas = 0;

  resueltas.forEach((m, agenteId) => {
    if (!visibles.has(agenteId)) return;
    App.metasEditadas.set(agenteId,
      Object.fromEntries(METAS_CAMPOS.map(c => [c.key, Number(m[c.key]) || 0])));
    copiadas++;
  });

  pintarTablaMetas(true);
  pintarResumenMetas();
  actualizarBotonesMetas();
  aviso(copiadas
    ? `${copiadas} meta(s) copiadas. Revísalas y pulsa Guardar.`
    : 'No hay metas de la semana anterior para esta línea.', copiadas ? 'ok' : 'error');
}

/* =========================================================================
   PANEL CONTESTS
   El avance se lee de los registros diarios ya existentes, acotados por el
   rango de fechas y el alcance del contest. Nadie captura progreso.
   ========================================================================= */

/**
 * Cuenta los contests que ya terminaron y siguen sin resolverse, y lo
 * muestra en la pestaña. Se actualiza al arrancar, no solo al entrar a
 * Contests: un premio a deber tiene que verse desde cualquier pantalla.
 */
async function actualizarBadgeContests() {
  const badge = $('#badgeContests');
  try {
    const pendientes = (await Store.listarContests())
      .filter(c => estadoDeContest(c) === 'porResolver').length;

    badge.hidden = !pendientes;
    badge.textContent = pendientes;
    badge.title = `${pendientes} contest(s) terminado(s) sin resolver`;
  } catch {
    badge.hidden = true;   // sin backend nuevo no hay nada que contar
  }
}

/**
 * Quiénes CALIFICARON: cumplieron los requisitos y entran al sorteo.
 * Calificar no es ganar — el premio se rifa entre estos.
 */
function calificadosDe(c, registros) {
  const equipo = progresoColectivo(c, registros);
  return participantesDe(c)
    .map(a => ({ agente: a, ...progresoDe(c, a.id, registros, equipo) }))
    .filter(a => a.cumplido)
    .map(a => a.agente);
}

/**
 * Quiénes GANARON de verdad. Se marca a mano al resolver, porque el premio
 * se sortea entre los calificados: si califican diez, no ganan diez.
 * Solo hay ganadores si se resolvió como pagado.
 */
function ganadoresDe(c) {
  if (c.estatus !== 'pagado') return [];
  const ids = new Set(c.ganadores || []);
  return App.agentes.filter(a => ids.has(a.id));
}

/**
 * Resolución sugerida para un contest que ya cerró. Las reglas se calculan
 * solas desde los reportes, así que el sistema puede proponer y dejar que
 * el administrador solo confirme.
 */
function sugerenciaResolucion(c, registros) {
  const equipo = progresoColectivo(c, registros);
  const califican = participantesDe(c)
    .map(a => progresoDe(c, a.id, registros, equipo))
    .filter(a => a.cumplido).length;

  if (equipo.hay && !equipo.cumplido) {
    return { estatus: 'anulado', motivo: 'el equipo no alcanzó su meta' };
  }
  if (!califican) {
    return { estatus: 'anulado', motivo: 'nadie cumplió los requisitos' };
  }
  return { estatus: 'pagado', motivo: `${califican} persona(s) cumplieron` };
}

function iniciarContests() {
  $('#ct_estado').addEventListener('change', refrescarContests);
  $('#btnNuevoContest').addEventListener('click', () => abrirDlgContest(null));
  $('#btnAgregarRequisito').addEventListener('click', () => agregarFilaRequisito());

  $('#ct_alcanceTipo').addEventListener('change', e => {
    $('#ct_lineaZona').hidden     = e.target.value !== 'linea';
    $('#ct_seleccionZona').hidden = e.target.value !== 'seleccion';
    actualizarVistaPrevia();
  });
  $('#ct_alcanceLinea').addEventListener('change', actualizarVistaPrevia);
  $('#ct_alcanceIds').addEventListener('change', actualizarVistaPrevia);

  $('#formContest').addEventListener('submit', guardarContestDesdeForm);
}

/**
 * activo | proximo | porResolver | pagado | anulado | cancelado
 *
 * Pasada la fecha de fin el contest queda "por resolver" y sigue a la
 * vista: solo sale del listado cuando un administrador marca si se pagó o
 * se anuló. Así no se archiva solo un premio que quedó a deber.
 */
function estadoDeContest(c) {
  if (c.estatus === 'cancelado') return 'cancelado';
  if (c.estatus === 'pagado')    return 'pagado';
  if (c.estatus === 'anulado')   return 'anulado';

  const hoy = hoyISO();
  if (hoy < c.desde) return 'proximo';
  // 'finalizado' es el valor antiguo: también pide resolución.
  if (hoy > c.hasta || c.estatus === 'finalizado') return 'porResolver';
  return 'activo';
}

/** Estados que siguen pidiendo atención y no se archivan. */
const ESTADOS_VIGENTES = ['activo', 'proximo', 'porResolver'];

const ETIQUETA_CONTEST = {
  activo: 'En curso',      proximo: 'Por empezar',
  porResolver: 'Por resolver',
  pagado: 'Pagado',        anulado: 'Anulado',
  cancelado: 'Cancelado',
};

/**
 * Quienes participan, según el alcance declarado. Incluye a los líderes:
 * un SA o un GA también produce, así que su ALP cuenta para la meta de
 * equipo y puede calificar para el premio como cualquiera.
 *
 * Para dejar a alguien fuera está el alcance "Personas seleccionadas".
 */
function participantesDe(c) {
  const activos = App.agentes.filter(a => a.activo !== false);

  if (c.alcanceTipo === 'seleccion') {
    const ids = new Set(c.alcanceIds || []);
    return App.agentes.filter(a => ids.has(a.id));
  }
  if (c.alcanceTipo === 'linea' && c.alcanceLinea) {
    const alcance = alcanceDe(c.alcanceLinea);
    return activos.filter(a => alcance.has(a.id));
  }
  return activos;
}

const ambitoDe = req => req.ambito || 'individual';
const esColectivo = req => AMBITOS_COLECTIVOS.includes(ambitoDe(req));

/** Suma un campo sobre un conjunto de registros ya acotado. */
function sumaEnRango(registros, campo) {
  return registros.reduce((t, r) => t + (Number(r[campo]) || 0), 0);
}

function detalleRequisito(req, real) {
  const meta = Number(req.meta) || 0;
  return {
    campo: CAMPOS.find(x => x.key === req.campo),
    real, meta,
    ratio: meta > 0 ? real / meta : 1,
    cumplido: meta > 0 ? real >= meta : true,
  };
}

/**
 * Requisitos colectivos: se miden sobre el grupo y funcionan como puerta.
 * Si no se cumplen, nadie califica por bueno que sea su número individual.
 *
 *   equipo → la suma del alcance debe llegar a la meta
 *   conteo → al menos N personas deben llegar cada una al umbral. Es la
 *            regla de certificación: no importa la suma, importa cuántos
 *            llegaron por su cuenta.
 */
function progresoColectivo(c, registros) {
  const participantes = participantesDe(c);
  const ids = new Set(participantes.map(a => a.id));
  const enRango = registros.filter(
    r => ids.has(r.agenteId) && r.fecha >= c.desde && r.fecha <= c.hasta);

  const detalles = (c.requisitos || []).filter(esColectivo).map(req => {
    const campo = CAMPOS.find(x => x.key === req.campo);

    if (ambitoDe(req) === 'conteo') {
      const umbral = Number(req.umbral) || 0;
      const minimo = Number(req.meta) || 0;

      const certificados = participantes.filter(a =>
        sumaEnRango(enRango.filter(r => r.agenteId === a.id), req.campo) >= umbral);

      return {
        tipo: 'conteo', campo, umbral,
        real: certificados.length,
        meta: minimo,
        quienes: certificados.map(a => a.nombre),
        ratio: minimo > 0 ? certificados.length / minimo : 1,
        cumplido: minimo > 0 ? certificados.length >= minimo : true,
      };
    }

    return { tipo: 'equipo', ...detalleRequisito(req, sumaEnRango(enRango, req.campo)) };
  });

  return {
    detalles,
    hay: detalles.length > 0,
    cumplido: detalles.every(d => d.cumplido),   // vacío ⇒ true
  };
}

/**
 * Avance de un agente en los requisitos individuales. Con "todos" el
 * avance honesto es el requisito peor parado, porque hasta que ese no se
 * cumpla no hay premio; con "alguno", el mejor.
 *
 * `equipo` es el resultado de las puertas colectivas: se exige siempre,
 * al margen de la forma de combinar los individuales.
 */
function progresoDe(c, agenteId, registros, equipo = { hay: false, cumplido: true }) {
  const suyos = registros.filter(
    r => r.agenteId === agenteId && r.fecha >= c.desde && r.fecha <= c.hasta);

  const detalles = (c.requisitos || [])
    .filter(req => !esColectivo(req))
    .map(req => detalleRequisito(req, sumaEnRango(suyos, req.campo)));

  // Lo que esta persona puso en cada requisito colectivo. Sin esto, un
  // contest que solo tiene meta de equipo mostraba a todos en 0% aunque
  // hubieran producido, lo que parece un error de datos.
  const aportes = (c.requisitos || []).filter(esColectivo).map(req => {
    const umbral = ambitoDe(req) === 'conteo' ? (Number(req.umbral) || 0) : null;
    const valor = sumaEnRango(suyos, req.campo);
    return {
      campo: CAMPOS.find(x => x.key === req.campo),
      valor, umbral,
      certifica: umbral !== null ? valor >= umbral : null,
    };
  });

  if (!detalles.length) {
    // Solo hay requisitos colectivos: quien califica lo hace por la puerta,
    // pero igual se muestra su aporte para que se vea que sí produjo.
    const conUmbral = aportes.find(a => a.umbral > 0);
    return {
      ratio: conUmbral ? Math.min(conUmbral.valor / conUmbral.umbral, 1) : null,
      cumplido: equipo.hay && equipo.cumplido,
      detalles, aportes,
      frenadoPorEquipo: false,
      soloColectivo: true,
    };
  }

  const ratios = detalles.map(d => Math.min(d.ratio, 1));
  const ratio = c.combinacion === 'alguno' ? Math.max(...ratios) : Math.min(...ratios);
  const propio = c.combinacion === 'alguno'
    ? detalles.some(d => d.cumplido)
    : detalles.every(d => d.cumplido);

  return {
    ratio,
    cumplido: propio && equipo.cumplido,
    detalles, aportes,
    // Hizo su parte pero el equipo no llegó: conviene decirlo, no marcarlo
    // como si hubiera fallado él.
    frenadoPorEquipo: propio && !equipo.cumplido,
    soloColectivo: false,
  };
}

/** "Equipo: 4 certifican con ALP ≥ 4,000.00 · Cada uno: REF ≥ 5" */
function textoRequisitos(c) {
  if (!c.requisitos || !c.requisitos.length) return 'Sin requisitos definidos';

  const texto = r => {
    const campo = CAMPOS.find(x => x.key === r.campo);
    const corto = campo ? campo.corto : r.campo;
    const tipo  = campo ? campo.tipo : 'entero';

    if (ambitoDe(r) === 'conteo') {
      return `${fmt(r.meta, 'entero')} certifican con ${corto} ≥ ${fmt(r.umbral, tipo)}`;
    }
    return `${corto} ≥ ${fmt(r.meta, tipo)}`;
  };

  const colectivos = c.requisitos.filter(esColectivo);
  const propios    = c.requisitos.filter(r => !esColectivo(r));
  const union = c.combinacion === 'alguno' ? ' o ' : ' y ';

  const partes = [];
  if (colectivos.length) partes.push(`Equipo: ${colectivos.map(texto).join(' y ')}`);
  if (propios.length)    partes.push(`Cada uno: ${propios.map(texto).join(union)}`);
  return partes.join(' · ');
}

async function refrescarContests() {
  const esAdmin = Sesion.esAdmin();
  $('#btnNuevoContest').hidden = !esAdmin;

  const todos = await Store.listarContests();
  revisarBackend();
  const filtro = $('#ct_estado').value;

  const visibles = todos.filter(c => {
    const e = estadoDeContest(c);
    if (filtro === 'activos')   return ESTADOS_VIGENTES.includes(e);
    if (filtro === 'historico') return !ESTADOS_VIGENTES.includes(e);
    return true;
  }).sort((a, b) => {
    // Lo que espera decisión va primero: es lo único accionable.
    const pesoA = estadoDeContest(a) === 'porResolver' ? 0 : 1;
    const pesoB = estadoDeContest(b) === 'porResolver' ? 0 : 1;
    if (pesoA !== pesoB) return pesoA - pesoB;
    // Dentro de cada grupo, del cierre más reciente al más antiguo.
    return b.hasta < a.hasta ? -1 : b.hasta > a.hasta ? 1 : 0;
  });

  // Una sola consulta que cubra todos los rangos en pantalla
  let registros = [];
  if (visibles.length) {
    registros = await Store.listarRegistros({
      desde: visibles.reduce((m, c) => (c.desde < m ? c.desde : m), visibles[0].desde),
      hasta: visibles.reduce((m, c) => (c.hasta > m ? c.hasta : m), visibles[0].hasta),
    });
  }

  pintarContests(visibles, registros, esAdmin);
  await actualizarBadgeContests();
}

/**
 * Contests que una persona ha ganado. Lee todo lo necesario por su cuenta
 * para poder usarse desde cualquier vista — la ficha del agente la usará.
 */
async function contestsGanadosPor(agenteId) {
  return (await Store.listarContests())
    .filter(c => c.estatus === 'pagado' && (c.ganadores || []).includes(agenteId))
    .sort((a, b) => (b.hasta < a.hasta ? -1 : b.hasta > a.hasta ? 1 : 0));
}

function pintarContests(lista, registros, esAdmin) {
  const cont = $('#contests');
  cont.innerHTML = '';

  if (!lista.length) {
    cont.appendChild(el('p', { class: 'vacio', text: 'No hay contests que mostrar.' }));
    return;
  }
  lista.forEach(c => cont.appendChild(tarjetaContest(c, registros, esAdmin)));
}

function tarjetaContest(c, registros, esAdmin) {
  const estado = estadoDeContest(c);
  const tipo = PREMIO_TIPOS.find(p => p.key === c.premioTipo) || PREMIO_TIPOS[3];
  const participantes = participantesDe(c);
  const equipo = progresoColectivo(c, registros);

  const avances = participantes
    .map(a => ({ agente: a, ...progresoDe(c, a.id, registros, equipo) }));

  // Sin requisito individual y sin umbral no hay contra qué medir a cada
  // uno: la barra pasa a leerse contra quien más aportó, para que la lista
  // ordene por contribución en vez de dejar a todos planos.
  const sinReferencia = avances.length && avances.every(a => a.soloColectivo && a.ratio === null);
  if (sinReferencia) {
    const tope = Math.max(1, ...avances.map(a => (a.aportes[0] ? a.aportes[0].valor : 0)));
    avances.forEach(a => {
      a.ratio = (a.aportes[0] ? a.aportes[0].valor : 0) / tope;
      a.relativo = true;
    });
  }

  avances.sort((x, y) =>
    (y.cumplido - x.cumplido) || ((y.ratio || 0) - (x.ratio || 0)));

  const cumplieron = avances.filter(a => a.cumplido).length;
  const dias = diasDesde(c.hasta) * -1;   // positivo = faltan dias

  const encabezado = el('div', { class: 'contest-cab' }, [
    el('span', { class: 'contest-icono', 'aria-hidden': 'true', text: tipo.icono }),
    el('div', { class: 'contest-titulo' }, [
      el('h3', { text: c.nombre }),
      el('p', { class: 'contest-premio', text: c.premio }),
    ]),
    el('span', { class: `contest-estado contest-estado--${estado}`, text: ETIQUETA_CONTEST[estado] }),
  ]);

  const meta = el('div', { class: 'contest-meta' }, [
    el('span', { class: 'contest-req', text: textoRequisitos(c) }),
    el('span', {
      class: 'contest-dias',
      text: estado === 'activo'
        ? (dias === 0 ? 'Último día' : `Faltan ${dias} día(s)`)
        : estado === 'proximo'
          ? `Empieza el ${fechaCorta(c.desde)}`
          : `${fechaCorta(c.desde)} — ${fechaCorta(c.hasta)}`,
    }),
  ]);

  const bloqueEquipo = equipo.hay ? el('div', {
    class: 'meta-equipo' + (equipo.cumplido ? ' meta-equipo--ok' : ''),
  }, [
    el('div', { class: 'meta-equipo-cab' }, [
      el('span', { class: 'meta-equipo-etq', text: 'Meta de equipo' }),
      el('span', {
        class: 'meta-equipo-estado' + (equipo.cumplido ? ' meta-equipo-estado--ok' : ''),
        text: equipo.cumplido ? '✓ Alcanzada' : 'Pendiente',
      }),
    ]),
    ...equipo.detalles.map(d => {
      const corto = d.campo ? d.campo.corto : '?';
      const tipo  = d.campo ? d.campo.tipo : 'entero';

      // El conteo se lee en personas, no en la unidad del indicador.
      const cifra = d.tipo === 'conteo'
        ? `${d.real} de ${d.meta} certificados`
        : `${corto} ${fmt(d.real, tipo)} / ${fmt(d.meta, tipo)}`;

      const nota = d.tipo === 'conteo'
        ? `Certifica quien llegue a ${corto} ≥ ${fmt(d.umbral, tipo)}` +
          (d.quienes.length ? `: ${d.quienes.slice(0, 5).join(', ')}` +
            (d.quienes.length > 5 ? ` y ${d.quienes.length - 5} más` : '') : '')
        : null;

      return el('div', { class: 'meta-equipo-req' }, [
        el('span', { class: 'barra' }, [
          el('span', {
            class: 'barra-relleno' + (d.cumplido ? ' barra-relleno--ok' : ''),
            style: `width:${Math.max(2, Math.round(Math.min(d.ratio, 1) * 100))}%`,
          }),
        ]),
        el('span', { class: 'meta-equipo-cifra', text: cifra }),
        nota ? el('span', { class: 'meta-equipo-nota', text: nota }) : null,
      ].filter(Boolean));
    }),
    el('p', {
      class: 'ayuda',
      text: equipo.cumplido
        ? 'Alcanzada: ahora califica quien cumpla su parte.'
        : 'Mientras el equipo no llegue, nadie califica aunque cumpla lo suyo.',
    }),
  ]) : null;

  const listaAvance = el('div', { class: 'contest-lista' },
    avances.length
      ? avances.map(a => filaAvance(a, c))
      : [el('p', { class: 'vacio', text: 'Sin participantes en el alcance definido.' })]);

  // Terminó por fecha pero nadie ha dicho si se pagó: es lo único que
  // pide una decisión, así que va destacado y no en la fila de acciones.
  // Las reglas se calculan solas, así que el sistema propone y el
  // administrador solo confirma. El botón sugerido va destacado.
  const sug = estado === 'porResolver' ? sugerenciaResolucion(c, registros) : null;

  const resolucion = estado === 'porResolver'
    ? cajaResolver(c, registros, esAdmin, sug)
    : null;

  // En lo ya resuelto, quién se llevó el premio es el dato que se consulta
  // después: se pone arriba, no enterrado en la lista.
  const ganadores = ganadoresDe(c);
  const bloqueGanadores = estado === 'pagado' ? el('div', { class: 'ganadores' }, [
    el('span', { class: 'ganadores-etq',
      text: ganadores.length === 1 ? '🏆 Ganó' : '🏆 Ganaron' }),
    el('span', { class: 'ganadores-lista', text: ganadores.length
      ? `${ganadores.map(a => a.nombre).join(', ')} · de ${cumplieron} que calificaron`
      : 'Marcado como pagado sin registrar quién ganó. Usa Reabrir para corregirlo.' }),
  ]) : estado === 'anulado' ? el('div', { class: 'ganadores ganadores--anulado' }, [
    el('span', { class: 'ganadores-etq', text: 'Anulado' }),
    el('span', { class: 'ganadores-lista', text: 'Terminó sin cumplirse los requisitos.' }),
  ]) : null;

  const pie = el('div', { class: 'contest-pie' }, [
    el('span', {
      class: 'ayuda',
      text: `${cumplieron} de ${avances.length} calificaron · ` +
            `Alcance: ${textoAlcance(c)}`,
    }),
    el('span', { class: 'contest-acc' }, [
      el('button', {
        class: 'btn-mini', type: 'button', text: 'Exportar CSV',
        onclick: () => exportarContestCSV(c, avances, equipo),
      }),
      esAdmin ? el('button', {
        class: 'btn-mini', type: 'button', text: 'Editar',
        onclick: () => abrirDlgContest(c),
      }) : null,
      // Cortar un contest que sigue corriendo
      esAdmin && (estado === 'activo' || estado === 'proximo') ? el('button', {
        class: 'btn-mini', type: 'button', text: 'Cancelar contest',
        onclick: () => resolverContest(c, 'cancelado'),
      }) : null,
      // Reabrir lo ya resuelto, por si la decisión fue un error
      esAdmin && !ESTADOS_VIGENTES.includes(estado) ? el('button', {
        class: 'btn-mini', type: 'button', text: 'Reabrir',
        onclick: () => resolverContest(c, 'auto'),
      }) : null,
      esAdmin ? el('button', {
        class: 'btn-mini btn-mini--peligro', type: 'button', text: 'Eliminar',
        onclick: () => eliminarContest(c),
      }) : null,
    ].filter(Boolean)),
  ]);

  return el('article', { class: `tarjeta contest contest--${estado}` },
    [encabezado, meta, resolucion, bloqueGanadores, bloqueEquipo, listaAvance, pie]
      .filter(Boolean));
}

/** Marca el desenlace de un contest terminado, o lo vuelve a abrir. */
async function resolverContest(c, estatus, ganadores = null) {
  const etiquetas = {
    pagado:    'marcado como pagado',
    anulado:   'marcado como no cumplido',
    cancelado: 'cancelado',
    auto:      'reabierto',
  };
  try {
    const cambios = { ...c, estatus };
    // Al anular o reabrir se limpia la lista: dejar ganadores de una
    // resolución anterior mentiría sobre premios no entregados.
    cambios.ganadores = estatus === 'pagado' ? (ganadores || []) : [];

    await Store.guardarContest(cambios);
    await refrescarContests();
    await actualizarBadgeContests();

    const detalle = estatus === 'pagado' && cambios.ganadores.length
      ? ` — ganó ${cambios.ganadores.length === 1 ? 'una persona' : cambios.ganadores.length + ' personas'}`
      : '';
    aviso(`"${c.nombre}" ${etiquetas[estatus]}${detalle}.`);
  } catch (err) {
    aviso(err.message, 'error');
  }
}

/**
 * Recuadro de resolución: tres salidas posibles y nada más.
 *
 * El ganador se elige aquí mismo, en un desplegable, en vez de un diálogo
 * aparte: son dos gestos en la misma caja y no hay forma de marcar pagado
 * sin decir a quién se le entregó.
 */
function cajaResolver(c, registros, esAdmin, sug) {
  const califican = calificadosDe(c, registros);

  const texto = el('span', { class: 'resolver-texto' }, [
    el('strong', { text: `Terminó el ${fechaCorta(c.hasta)}. ` }),
    document.createTextNode(
      `${califican.length} calificaron. ` +
      (esAdmin
        ? `Sugerencia: ${sug.estatus === 'pagado' ? 'pagar' : 'anular'} — ${sug.motivo}.`
        : 'Pendiente de resolución por un administrador.')),
  ]);

  if (!esAdmin) return el('div', { class: 'resolver' }, [texto]);

  // Quién ganó: el premio se sortea entre los calificados, así que no se
  // puede deducir. Sin elegir, el botón de pagar queda bloqueado.
  const selGanador = el('select', { class: 'resolver-ganador' });
  selGanador.appendChild(el('option', { value: '', text: '— ¿Quién ganó? —' }));
  califican.forEach(a => selGanador.appendChild(
    el('option', { value: a.id, text: `${a.nombre} · ${a.rol || 'Agente'}` })));

  const btnPago = el('button', {
    class: 'btn btn--mini ' + (sug.estatus === 'pagado' ? 'btn-primario' : 'btn-suave'),
    type: 'button', text: 'Se pagó a…', disabled: true,
    onclick: () => resolverContest(c, 'pagado', [selGanador.value]),
  });

  const refrescarBoton = () => {
    const a = App.agentes.find(x => x.id === selGanador.value);
    btnPago.disabled = !a;
    btnPago.textContent = a ? `Se pagó a ${a.nombre.split(' ')[0]}` : 'Se pagó a…';
  };
  selGanador.addEventListener('change', refrescarBoton);

  const btnSorteo = el('button', {
    class: 'btn-mini', type: 'button', text: '🎲',
    title: 'Sortear entre quienes calificaron',
    disabled: !califican.length,
    onclick: () => {
      const elegido = califican[Math.floor(Math.random() * califican.length)];
      selGanador.value = elegido.id;
      refrescarBoton();
      aviso(`Sorteo: ${elegido.nombre}. Puedes cambiarlo antes de confirmar.`, 'info');
    },
  });

  return el('div', { class: 'resolver' }, [
    texto,
    califican.length
      ? el('span', { class: 'resolver-quien' }, [selGanador, btnSorteo])
      : null,
    el('span', { class: 'resolver-acc' }, [
      califican.length ? btnPago : null,
      el('button', {
        class: 'btn btn--mini ' + (sug.estatus === 'anulado' ? 'btn-primario' : 'btn-suave'),
        type: 'button', text: 'No se cumplió',
        onclick: () => resolverContest(c, 'anulado'),
      }),
      el('button', {
        class: 'btn btn--mini btn-peligro-suave', type: 'button', text: 'Cancelar contest',
        onclick: () => resolverContest(c, 'cancelado'),
      }),
    ].filter(Boolean)),
  ].filter(Boolean));
}

function filaAvance(av, c) {
  const { agente, cumplido, detalles, aportes, frenadoPorEquipo, soloColectivo, relativo } = av;
  const pct = Math.round((av.ratio || 0) * 100);

  const unidad = d => d.campo ? d.campo.tipo : 'entero';
  const corto  = d => d.campo ? d.campo.corto : '?';

  // Con requisito propio se muestra real/meta. Sin él, lo que aportó al
  // equipo: es su producción real, no un cero.
  const detalle = detalles.length
    ? detalles.map(d => `${corto(d)} ${fmt(d.real, unidad(d))}/${fmt(d.meta, unidad(d))}`).join(' · ')
    : (aportes || []).map(a => a.umbral > 0
        ? `${corto(a)} ${fmt(a.valor, unidad(a))} de ${fmt(a.umbral, unidad(a))} para certificar`
        : `Aportó ${corto(a)} ${fmt(a.valor, unidad(a))}`
      ).join(' · ') || 'Sin requisito individual';

  // Quien certifica ya hizo lo suyo aunque el grupo no complete el mínimo
  const certifica = (aportes || []).some(a => a.certifica);

  const estado = cumplido ? '✓ Cumplido'
    : frenadoPorEquipo ? 'Falta el equipo'
    : certifica ? '✓ Certifica'
    : soloColectivo && relativo ? fmt((aportes[0] || {}).valor || 0,
        aportes[0] && aportes[0].campo ? aportes[0].campo.tipo : 'entero')
    : `${pct}%`;

  return el('div', { class: 'avance' }, [
    el('span', { class: 'avance-nombre' }, [enlaceAgente(agente.id, agente.nombre)]),
    el('span', { class: 'barra', role: 'img',
      'aria-label': relativo ? 'Aporte relativo al mayor' : `${pct}% de avance`,
    }, [
      el('span', {
        class: 'barra-relleno' + (cumplido || certifica ? ' barra-relleno--ok' : ''),
        style: `width:${Math.max(2, pct)}%`,
      }),
    ]),
    el('span', { class: 'avance-detalle', text: detalle }),
    el('span', {
      class: 'avance-estado' + (cumplido || certifica ? ' avance-estado--ok' : '') +
             (frenadoPorEquipo ? ' avance-estado--espera' : ''),
      title: frenadoPorEquipo
        ? 'Cumplió su parte, pero el equipo no ha llegado a su meta.'
        : relativo ? 'Barra proporcional a quien más aportó.' : '',
      text: estado,
    }),
  ]);
}

function textoAlcance(c) {
  if (c.alcanceTipo === 'seleccion') return `${(c.alcanceIds || []).length} persona(s) elegidas`;
  if (c.alcanceTipo === 'linea') {
    const p = App.agentes.find(a => a.id === c.alcanceLinea);
    return p ? `línea de ${p.nombre}` : 'línea eliminada';
  }
  return 'todo el equipo';
}

function exportarContestCSV(c, avances, equipo) {
  // "Calificó" y "Ganó" son columnas distintas a propósito: el premio se
  // sortea entre quienes calificaron, no lo cobran todos.
  const gano = new Set(c.ganadores || []);
  const cab = ['Contest', 'Desde', 'Hasta', 'Agente', 'Calificó', 'Ganó', 'Avance %'];
  (c.requisitos || []).filter(r => !esColectivo(r)).forEach(r => {
    const campo = CAMPOS.find(x => x.key === r.campo);
    cab.push(`${campo ? campo.corto : r.campo} real`, `${campo ? campo.corto : r.campo} meta`);
  });
  // Las cifras colectivas son las mismas en todas las filas, pero repetirlas
  // permite leer el archivo sin volver a la aplicación.
  (equipo && equipo.detalles || []).forEach(d => {
    const corto = d.campo ? d.campo.corto : '?';
    if (d.tipo === 'conteo') {
      cab.push(`Certificados ${corto} (>=${d.umbral})`, `Certificados ${corto} mínimo`);
    } else {
      cab.push(`Equipo ${corto} real`, `Equipo ${corto} meta`);
    }
  });

  const filas = avances.map(a => {
    const fila = [c.nombre, c.desde, c.hasta, a.agente.nombre,
                  a.cumplido ? 'Sí' : 'No',
                  gano.has(a.agente.id) ? 'Sí' : 'No',
                  Math.round((a.ratio || 0) * 100)];
    a.detalles.forEach(d => fila.push(d.real, d.meta));
    (equipo && equipo.detalles || []).forEach(d => fila.push(d.real, d.meta));
    return fila;
  });

  const csv = [cab, ...filas]
    .map(f => f.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');

  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = el('a', {
    href: URL.createObjectURL(blob),
    download: `contest_${c.nombre.replace(/[^\w]+/g, '_').toLowerCase()}.csv`,
  });
  document.body.appendChild(a);
  a.click();
  a.remove();
  aviso('Resultados exportados.');
}

/* ---------- Alta y edición ---------------------------------------------- */

function agregarFilaRequisito(req = null) {
  const cont = $('#ct_requisitos');

  const selCampo = el('select', { class: 'req-campo' });
  CAMPOS.forEach(c => selCampo.appendChild(el('option', { value: c.key, text: c.label })));
  if (req) selCampo.value = req.campo;

  const selAmbito = el('select', { class: 'req-ambito' });
  AMBITO_REQUISITO.forEach(a =>
    selAmbito.appendChild(el('option', { value: a.key, text: a.label })));
  selAmbito.value = req ? (req.ambito || 'individual') : 'individual';

  // Solo el conteo necesita dos números: el umbral por persona y cuántas.
  const inpUmbral = el('input', {
    type: 'number', class: 'req-umbral', min: '0', step: 'any',
    inputmode: 'decimal', placeholder: 'Certifica con',
    title: 'Cuánto debe hacer una persona para certificar',
    value: req && req.umbral ? req.umbral : '',
  });

  const inpMeta = el('input', {
    type: 'number', class: 'req-meta', min: '0', step: 'any',
    placeholder: 'Meta', inputmode: 'decimal',
    value: req ? req.meta : '',
  });

  const fila = el('div', { class: 'req-fila' }, [
    selAmbito,
    selCampo,
    inpUmbral,
    inpMeta,
    el('button', {
      class: 'btn-mini btn-mini--peligro', type: 'button', text: '✕',
      'aria-label': 'Quitar requisito',
      onclick: () => { fila.remove(); actualizarZonaCombinacion(); },
    }),
  ]);

  const ajustarPorAmbito = () => {
    const esConteo = selAmbito.value === 'conteo';
    inpUmbral.hidden = !esConteo;
    inpMeta.placeholder = esConteo ? 'Mín. personas' : 'Meta';
    inpMeta.title = esConteo
      ? 'Cuántas personas deben certificar'
      : 'Valor a alcanzar';
    inpMeta.step = esConteo ? '1' : 'any';
    actualizarZonaCombinacion();
  };

  selAmbito.addEventListener('change', ajustarPorAmbito);
  cont.appendChild(fila);
  ajustarPorAmbito();
}

/**
 * La forma de combinar solo aplica a los requisitos individuales, y solo
 * tiene sentido cuando hay más de uno: las puertas de equipo se exigen
 * siempre.
 */
function actualizarZonaCombinacion() {
  const individuales = $$('#ct_requisitos .req-fila')
    .filter(f => f.querySelector('.req-ambito').value !== 'equipo').length;
  $('#ct_combinacionZona').hidden = individuales < 2;
}

/**
 * Dice quién queda dentro con el alcance elegido, antes de guardar. Sin
 * esto no hay forma de saber a quién cubre un contest hasta crearlo.
 */
function actualizarVistaPrevia() {
  const zona = $('#ct_vistaPrevia');
  const tipo = $('#ct_alcanceTipo').value;

  const dentro = participantesDe({
    alcanceTipo: tipo,
    alcanceLinea: $('#ct_alcanceLinea').value,
    alcanceIds: $$('#ct_alcanceIds input:checked').map(i => i.value),
  });

  if (tipo === 'linea' && !$('#ct_alcanceLinea').value) {
    zona.textContent = 'Elige de quién es el equipo.';
    return;
  }
  if (!dentro.length) {
    zona.textContent = 'Nadie queda dentro con este alcance.';
    return;
  }

  const nombres = dentro.map(a => a.nombre);
  const muestra = nombres.slice(0, 6).join(', ');
  zona.textContent = `Participan ${dentro.length}: ${muestra}` +
                     (nombres.length > 6 ? ` y ${nombres.length - 6} más.` : '.');
}

function abrirDlgContest(c) {
  $('#dlgContestTitulo').textContent = c ? 'Editar contest' : 'Nuevo contest';
  $('#ct_id').value     = c ? c.id : '';
  $('#ct_nombre').value = c ? c.nombre : '';
  $('#ct_desde').value  = c ? c.desde : hoyISO();
  $('#ct_hasta').value  = c ? c.hasta : sumarDias(hoyISO(), 14);
  $('#ct_premio').value = c ? c.premio : '';

  const llenar = (sel, lista, valor) => {
    const s = $(sel);
    s.innerHTML = '';
    lista.forEach(x => s.appendChild(el('option', { value: x.key, text: x.label })));
    s.value = valor;
  };
  llenar('#ct_premioTipo', PREMIO_TIPOS,     c ? c.premioTipo : 'efectivo');
  llenar('#ct_alcanceTipo', ALCANCE_TIPOS,   c ? c.alcanceTipo : 'todos');

  // El estado NO se edita aquí: se resuelve con los botones de la tarjeta,
  // que son los que piden decir quién ganó. Tenerlo en dos sitios permitía
  // marcar "pagado" sin registrar al ganador.
  App.contestEditando = c || null;

  $('#ct_combinacion').value = c ? (c.combinacion || 'todos') : 'todos';

  $('#ct_requisitos').innerHTML = '';
  (c && c.requisitos && c.requisitos.length ? c.requisitos : [null])
    .forEach(r => agregarFilaRequisito(r));

  // Sin la opción "toda la organización": para eso está el otro alcance,
  // y dejarla aquí solo permitía guardar un contest sin equipo elegido.
  llenarSelectJerarquia($('#ct_alcanceLinea'), { soloLideres: true, textoTodos: null });
  $('#ct_alcanceLinea').insertBefore(
    el('option', { value: '', text: '— Elige un equipo —' }),
    $('#ct_alcanceLinea').firstChild);
  $('#ct_alcanceLinea').value = c ? (c.alcanceLinea || '') : '';

  // Casillas de participantes para el alcance a mano
  const zona = $('#ct_alcanceIds');
  zona.innerHTML = '';
  const elegidos = new Set(c ? (c.alcanceIds || []) : []);
  Jerarquia.aplanar(App.agentes)
    .filter(({ agente }) => agente.activo !== false)
    .forEach(({ agente }) => {
      zona.appendChild(el('label', { class: 'check-item' }, [
        el('input', { type: 'checkbox', value: agente.id, checked: elegidos.has(agente.id) }),
        el('span', { class: 'marca-rol', text: agente.rol || 'Agente' }),
        document.createTextNode(' ' + agente.nombre),
      ]));
    });

  $('#ct_lineaZona').hidden     = $('#ct_alcanceTipo').value !== 'linea';
  $('#ct_seleccionZona').hidden = $('#ct_alcanceTipo').value !== 'seleccion';
  actualizarVistaPrevia();

  $('#dlgContest').showModal();
  $('#ct_nombre').focus();
}

async function guardarContestDesdeForm(e) {
  e.preventDefault();

  const requisitos = $$('#ct_requisitos .req-fila')
    .map(f => {
      const ambito = f.querySelector('.req-ambito').value;
      const base = {
        campo: f.querySelector('.req-campo').value,
        meta: nDecimal(f.querySelector('.req-meta').value),
        ambito,
      };
      if (ambito === 'conteo') base.umbral = nDecimal(f.querySelector('.req-umbral').value);
      return base;
    })
    .filter(r => r.meta > 0);

  const conteoSinUmbral = requisitos.find(r => r.ambito === 'conteo' && !(r.umbral > 0));
  if (conteoSinUmbral) {
    const campo = CAMPOS.find(x => x.key === conteoSinUmbral.campo);
    return aviso(`Falta decir con cuánto certifica una persona en ` +
                 `${campo ? campo.corto : conteoSinUmbral.campo}.`, 'error');
  }

  const contest = {
    id: $('#ct_id').value || undefined,
    nombre: $('#ct_nombre').value.trim(),
    desde: $('#ct_desde').value,
    hasta: $('#ct_hasta').value,
    premioTipo: $('#ct_premioTipo').value,
    premio: $('#ct_premio').value.trim(),
    requisitos,
    combinacion: $('#ct_combinacion').value,
    alcanceTipo: $('#ct_alcanceTipo').value,
    alcanceLinea: $('#ct_alcanceLinea').value,
    alcanceIds: $$('#ct_alcanceIds input:checked').map(i => i.value),
    // Editar los datos de un contest no cambia su desenlace
    estatus: App.contestEditando ? (App.contestEditando.estatus || 'auto') : 'auto',
    ganadores: App.contestEditando ? (App.contestEditando.ganadores || []) : [],
  };

  if (!contest.nombre)   return aviso('El nombre del contest es obligatorio.', 'error');
  if (!contest.premio)   return aviso('Describe el premio.', 'error');
  if (!contest.desde || !contest.hasta) return aviso('Faltan las fechas del contest.', 'error');
  if (contest.desde > contest.hasta) {
    return aviso('La fecha de inicio no puede ser posterior a la de fin.', 'error');
  }
  if (!requisitos.length) {
    return aviso('Define al menos un requisito con una meta mayor que cero.', 'error');
  }
  if (contest.alcanceTipo === 'linea' && !contest.alcanceLinea) {
    return aviso('Elige la línea a la que aplica el contest.', 'error');
  }
  if (contest.alcanceTipo === 'seleccion' && !contest.alcanceIds.length) {
    return aviso('Marca al menos un participante.', 'error');
  }

  try {
    await Store.guardarContest(contest);
    $('#dlgContest').close();
    await refrescarContests();
    aviso(contest.id ? 'Contest actualizado.' : 'Contest creado.');
  } catch (err) {
    aviso(err.message, 'error');
  }
}

async function eliminarContest(c) {
  const ok = await confirmar({
    titulo: `Eliminar ${c.nombre}`,
    texto: 'El contest se borrará del sistema. Los reportes diarios no se tocan; ' +
           'solo desaparece el contest y su seguimiento.',
    etiquetaOk: 'Eliminar',
  });
  if (!ok) return;

  try {
    await Store.eliminarContest(c.id);
    await refrescarContests();
    aviso('Contest eliminado.');
  } catch (err) {
    aviso(err.message, 'error');
  }
}

/* =========================================================================
   MODO JUNTA
   Pantalla completa para proyectar en la reunión del lunes. Sin filtros ni
   botones de exportar: lo que se ve es lo que se comenta.
   ========================================================================= */

function iniciarModoJunta() {
  // Solo periodos cortos: en una junta se revisa lo reciente
  const sel = $('#juntaPeriodo');
  PRESETS_JUNTA.forEach(k => {
    const p = PRESETS_RANGO.find(x => x.key === k);
    if (p) sel.appendChild(el('option', { value: p.key, text: p.label }));
  });
  sel.value = 'semana';

  const repintar = async () => {
    await pintarModoJunta($('#juntaLinea').value);
    irASeccion(App.juntaSeccion || 0);
  };
  sel.addEventListener('change', repintar);
  $('#juntaLinea').addEventListener('change', repintar);

  $('#btnModoJunta').addEventListener('click', abrirModoJunta);
  $('#btnSalirJunta').addEventListener('click', cerrarModoJunta);

  $$('.junta-punto').forEach(b => b.addEventListener('click', () => irASeccion(+b.dataset.ir)));

  document.addEventListener('keydown', e => {
    if ($('#modoJunta').hidden) return;
    if (e.key === 'Escape')     { e.preventDefault(); cerrarModoJunta(); }
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); irASeccion(App.juntaSeccion + 1); }
    if (e.key === 'ArrowLeft'  || e.key === 'PageUp')   { e.preventDefault(); irASeccion(App.juntaSeccion - 1); }
  });

  // Salir del pantalla completa del navegador cierra también el modo
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && !$('#modoJunta').hidden) cerrarModoJunta();
  });
}

function irASeccion(i) {
  const secciones = $$('.junta-seccion');
  if (!secciones.length) return;
  const n = Math.max(0, Math.min(secciones.length - 1, i));
  App.juntaSeccion = n;
  secciones[n].scrollIntoView({ behavior: 'smooth', block: 'start' });
  $$('.junta-punto').forEach((b, j) => b.classList.toggle('is-activa', j === n));
}

async function abrirModoJunta() {
  // Se entra con la línea ya elegida en Resumen, pero se puede cambiar sin
  // salir: en una junta de equipo no se quiere ver al resto de la agencia.
  llenarSelectJerarquia($('#juntaLinea'), { soloLideres: true });
  $('#juntaLinea').value = $('#rs_linea').value;

  $('#modoJunta').hidden = false;
  document.body.classList.add('con-junta');
  App.juntaSeccion = 0;

  // Pantalla completa de verdad si el navegador deja; si no, la capa basta
  try { await document.documentElement.requestFullscreen(); } catch { /* opcional */ }

  await pintarModoJunta($('#juntaLinea').value);
  irASeccion(0);
}

function cerrarModoJunta() {
  $('#modoJunta').hidden = true;
  document.body.classList.remove('con-junta');
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

/**
 * Posiciones de un periodo por ALP. Se usa dos veces —el periodo elegido y
 * el anterior comparable— para poder decir quién subió y quién bajó, que
 * es lo que hace útil un leaderboard frente a una lista suelta.
 */
function posicionesDelPeriodo(registros, rango, alcance) {
  const dentro = registros.filter(r =>
    r.fecha >= rango.desde && r.fecha <= rango.hasta &&
    (!alcance || alcance.has(r.agenteId)));

  const porAgente = new Map();
  dentro.forEach(r => {
    porAgente.set(r.agenteId, (porAgente.get(r.agenteId) || 0) + (Number(r.alp) || 0));
  });

  return [...porAgente.entries()]
    .filter(([, alp]) => alp > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([id, alp], i) => ({ id, alp, pos: i + 1 }));
}

async function pintarModoJunta(lineaId) {
  const cuerpo = $('#juntaCuerpo');
  cuerpo.innerHTML = '';

  const preset = $('#juntaPeriodo').value;
  const rango = rangoDePreset(preset) || rangoDePreset('semana');
  const previo = periodoAnterior(preset, rango);
  const alcance = alcanceDe(lineaId);

  const persona = App.agentes.find(a => a.id === lineaId);
  $('#juntaTitulo').textContent = persona
    ? (persona.rol === 'Agente' ? persona.nombre : `Línea de ${persona.nombre}`)
    : CONFIG.EQUIPO;

  const etiquetaPeriodo = (PRESETS_RANGO.find(p => p.key === preset) || {}).label || '';
  const cuantos = App.agentes.filter(a =>
    (!alcance || alcance.has(a.id)) && a.rol === 'Agente' && a.activo !== false).length;
  $('#juntaSub').textContent =
    `${etiquetaPeriodo} · ${textoRango(rango.desde, rango.hasta)} · ${cuantos} agente(s) de campo`;

  // Una sola consulta cubriendo el periodo y su comparable anterior
  const registros = await Store.listarRegistros({ desde: previo.desde, hasta: rango.hasta });

  // Orden de la junta: primero las cifras en bruto, luego qué tan bien se
  // convierten, después las personas —quién destaca y quién necesita
  // ayuda—, la tendencia contra el periodo anterior y al final los contests.
  cuerpo.appendChild(seccionResumenJunta(registros, rango, alcance, etiquetaPeriodo));
  cuerpo.appendChild(seccionEfectividadJunta(registros, rango, alcance, etiquetaPeriodo));
  cuerpo.appendChild(seccionLeaderboard(registros, rango, previo, alcance, etiquetaPeriodo));
  cuerpo.appendChild(seccionAtencionJunta(registros, rango, alcance, etiquetaPeriodo));
  cuerpo.appendChild(seccionComparativaJunta(registros, rango, previo, alcance, etiquetaPeriodo));
  cuerpo.appendChild(await seccionContestsJunta(lineaId));
}

function seccionJunta(titulo, contenido) {
  return el('section', { class: 'junta-seccion' }, [
    el('h2', { class: 'junta-titulo', text: titulo }),
    contenido,
  ]);
}

function seccionLeaderboard(registros, rango, previo, alcance, etiquetaPeriodo) {
  const ahora = posicionesDelPeriodo(registros, rango, alcance);
  const antes = posicionesDelPeriodo(registros, previo, alcance);
  const posAntes = new Map(antes.map(x => [x.id, x.pos]));
  const nombre = id => (App.agentes.find(a => a.id === id) || {}).nombre || '—';

  if (!ahora.length) {
    return seccionJunta(`Leaderboard · ${etiquetaPeriodo}`,
      el('p', { class: 'junta-vacio', text: 'Todavía no hay ALP registrado en este periodo.' }));
  }

  const lista = el('ol', { class: 'tabla-junta' });

  ahora.slice(0, 10).forEach(x => {
    const prev = posAntes.get(x.id);
    const dif = prev ? prev - x.pos : null;

    // El movimiento es lo que distingue un leaderboard de una lista
    const mov = dif === null
      ? el('span', { class: 'mov mov--nuevo', text: 'NUEVO' })
      : dif === 0
        ? el('span', { class: 'mov mov--igual', text: '=' })
        : el('span', {
            class: 'mov ' + (dif > 0 ? 'mov--sube' : 'mov--baja'),
            text: `${dif > 0 ? '▲' : '▼'} ${Math.abs(dif)}`,
          });

    lista.appendChild(el('li', { class: 'fila-junta' + (x.pos <= 3 ? ' fila-junta--podio' : '') }, [
      el('span', { class: 'pos', text: x.pos }),
      el('span', { class: 'quien', text: nombre(x.id) }),
      mov,
      el('span', { class: 'cifra', text: fmt(x.alp, 'moneda') }),
    ]));
  });

  return seccionJunta(`Leaderboard · ${etiquetaPeriodo} · ALP`, lista);
}

/**
 * Quiénes necesitan atención: los que SÍ están reportando pero van por
 * debajo del resto en los indicadores de actividad.
 *
 * Se comparan contra el promedio del equipo y no entre sí en bruto, porque
 * cuatro indicadores de escalas distintas no se pueden sumar: las llamadas
 * aplastarían a los referidos.
 *
 * Solo agentes de campo: un SA produce a tiempo parcial y aparecería
 * siempre al fondo sin que eso signifique nada.
 */
function agentesEnAtencion(registros, rango, alcance, limite = 5) {
  const dentro = registros.filter(r =>
    r.fecha >= rango.desde && r.fecha <= rango.hasta &&
    (!alcance || alcance.has(r.agenteId)));

  const porAgente = new Map();
  dentro.forEach(r => {
    const ag = App.agentes.find(a => a.id === r.agenteId);
    if (!ag || ag.rol !== 'Agente' || ag.activo === false) return;

    if (!porAgente.has(ag.id)) {
      const base = { agente: ag, dias: new Set() };
      KPIS_ATENCION.forEach(k => { base[k] = 0; });
      porAgente.set(ag.id, base);
    }
    const a = porAgente.get(ag.id);
    a.dias.add(r.fecha);
    KPIS_ATENCION.forEach(k => { a[k] += Number(r[k]) || 0; });
  });

  const lista = [...porAgente.values()];
  if (lista.length < 2) return { lista: [], promedios: {} };

  const promedios = {};
  KPIS_ATENCION.forEach(k => {
    promedios[k] = lista.reduce((t, a) => t + a[k], 0) / lista.length;
  });

  lista.forEach(a => {
    // Un indicador en el que todo el equipo está a cero no distingue nada
    const utiles = KPIS_ATENCION.filter(k => promedios[k] > 0);
    a.porKpi = {};
    utiles.forEach(k => { a.porKpi[k] = (a[k] / promedios[k]) * 100; });
    a.indice = utiles.length
      ? utiles.reduce((t, k) => t + a.porKpi[k], 0) / utiles.length
      : 100;
    a.dias = a.dias.size;
  });

  return {
    lista: lista.sort((x, y) => x.indice - y.indice).slice(0, limite),
    promedios,
    total: lista.length,
  };
}

function seccionAtencionJunta(registros, rango, alcance, etiquetaPeriodo) {
  const { lista, promedios, total } = agentesEnAtencion(registros, rango, alcance);

  if (!lista.length) {
    return seccionJunta('Necesitan atención',
      el('p', { class: 'junta-vacio',
        text: 'Hacen falta al menos dos agentes reportando para poder comparar.' }));
  }

  const cont = el('div', { class: 'junta-atencion' });

  cont.appendChild(el('p', { class: 'junta-atencion-nota',
    text: `Comparados contra el promedio de ${total} agente(s) que reportaron en ${etiquetaPeriodo.toLowerCase()}. ` +
          `100% es ir en la media del equipo.` }));

  lista.forEach((a, i) => {
    const nivel = a.indice < ATENCION.critico ? 'critico'
                : a.indice < ATENCION.bajo ? 'bajo' : 'normal';

    cont.appendChild(el('div', { class: `junta-atencion-fila junta-atencion-fila--${nivel}` }, [
      el('span', { class: 'pos', text: i + 1 }),
      el('div', { class: 'junta-atencion-quien' }, [
        el('span', { class: 'quien', text: a.agente.nombre }),
        el('span', { class: 'junta-atencion-dias', text: `${a.dias} día(s) con reporte` }),
      ]),

      // El detalle por indicador dice DÓNDE está el problema
      el('div', { class: 'junta-atencion-kpis' },
        KPIS_ATENCION.filter(k => promedios[k] > 0).map(k => {
          const campo = CAMPOS.find(c => c.key === k);
          const p = a.porKpi[k];
          return el('span', {
            class: 'junta-kpi' + (p < ATENCION.critico ? ' junta-kpi--critico' : ''),
            title: `Promedio del equipo: ${fmtPromedio(promedios[k], campo.tipo)}`,
          }, [
            el('b', { text: campo.corto }),
            document.createTextNode(` ${fmt(a[k], campo.tipo)} `),
            el('i', { text: `${p.toFixed(0)}%` }),
          ]);
        })),

      el('span', { class: `junta-indice junta-indice--${nivel}`,
                   text: `${a.indice.toFixed(0)}%` }),
    ]));
  });

  return seccionJunta(`Necesitan atención · ${etiquetaPeriodo}`, cont);
}

async function seccionContestsJunta(lineaId) {
  const todos = await Store.listarContests();
  const alcance = alcanceDe(lineaId);

  const vigentes = todos
    .filter(c => ['activo', 'porResolver'].includes(estadoDeContest(c)))
    // Solo los que tocan a esta gente: en una junta de equipo, un contest
    // de otra línea es ruido que además desvía la conversación.
    .filter(c => !alcance || participantesDe(c).some(a => alcance.has(a.id)));

  if (!vigentes.length) {
    return seccionJunta('Contests vigentes',
      el('p', { class: 'junta-vacio',
        text: alcance ? 'No hay contests en curso que incluyan a este equipo.'
                      : 'No hay contests en curso.' }));
  }

  const registros = await Store.listarRegistros({
    desde: vigentes.reduce((m, c) => (c.desde < m ? c.desde : m), vigentes[0].desde),
    hasta: vigentes.reduce((m, c) => (c.hasta > m ? c.hasta : m), vigentes[0].hasta),
  });

  const cont = el('div', { class: 'junta-contests' });

  vigentes.slice(0, 4).forEach(c => {
    // La meta de equipo se mide sobre TODO el contest: es su regla, y
    // recortarla a la línea daría un número que no existe. Lo que sí se
    // recorta es la lista de personas que se proyecta.
    const equipo = progresoColectivo(c, registros);

    const avances = participantesDe(c)
      .filter(a => !alcance || alcance.has(a.id))
      .map(a => ({ agente: a, ...progresoDe(c, a.id, registros, equipo) }))
      .sort((x, y) => (y.cumplido - x.cumplido) || ((y.ratio || 0) - (x.ratio || 0)));

    const califican = avances.filter(a => a.cumplido).length;
    const dias = diasDesde(c.hasta) * -1;

    cont.appendChild(el('div', { class: 'junta-contest' }, [
      el('div', { class: 'junta-contest-cab' }, [
        el('strong', { text: c.nombre }),
        el('span', { class: 'junta-contest-dias',
          text: dias > 0 ? `${dias} día(s)` : 'último día' }),
      ]),
      el('p', { class: 'junta-contest-premio', text: c.premio }),

      // Si hay puerta de equipo, es lo primero que hay que ver
      ...(equipo.hay ? equipo.detalles.map(d => el('div', { class: 'junta-barra' }, [
        el('span', { class: 'junta-barra-etq', text: d.tipo === 'conteo'
          ? `Equipo: ${d.real} de ${d.meta} certificados`
          : `Equipo: ${fmt(d.real, d.campo ? d.campo.tipo : 'entero')} de ${fmt(d.meta, d.campo ? d.campo.tipo : 'entero')}` }),
        el('span', { class: 'barra' }, [
          el('span', {
            class: 'barra-relleno' + (d.cumplido ? ' barra-relleno--ok' : ''),
            style: `width:${Math.max(2, Math.round(Math.min(d.ratio, 1) * 100))}%`,
          }),
        ]),
      ])) : []),

      el('p', { class: 'junta-contest-cuenta',
        text: alcance
          ? `De este equipo: ${califican} de ${avances.length} califican`
          : `${califican} de ${avances.length} califican` }),

      ...avances.slice(0, 3).map(a => el('div', { class: 'junta-barra' }, [
        el('span', { class: 'junta-barra-etq', text: a.agente.nombre }),
        el('span', { class: 'barra' }, [
          el('span', {
            class: 'barra-relleno' + (a.cumplido ? ' barra-relleno--ok' : ''),
            style: `width:${Math.max(2, Math.round((a.ratio || 0) * 100))}%`,
          }),
        ]),
      ])),
    ]));
  });

  return seccionJunta('Contests vigentes', cont);
}

function seccionComparativaJunta(registros, rango, previo, alcance, etiquetaPeriodo) {
  const filtrar = r0 => registros.filter(r =>
    r.fecha >= r0.desde && r.fecha <= r0.hasta && (!alcance || alcance.has(r.agenteId)));

  const ahora = totalesComparativa(filtrar(rango));
  const antes = totalesComparativa(filtrar(previo));

  const tabla = el('table', { class: 'tabla-junta' }, [
    el('tbody', {}, COMPARATIVA_CAMPOS.map(c => {
      const act = ahora[c.key], ant = antes[c.key];
      const hayAct = act !== null && act !== undefined;
      const hayAnt = ant !== null && ant !== undefined;
      const valor = v => v === null || v === undefined ? '—'
        : c.tipo === 'porcentaje' ? v.toFixed(1) + '%' : fmt(v, c.tipo);

      return el('tr', {}, [
        el('td', { class: 'quien', text: c.label }),
        el('td', { class: 'cifra', text: valor(act) }),
        el('td', { class: 'antes', text: valor(ant) }),
        el('td', {}, [delta(c, act, ant, hayAct, hayAnt)]),
      ]);
    })),
  ]);

  return seccionJunta(
    `${etiquetaPeriodo} contra el periodo anterior · ${textoRango(previo.desde, previo.hasta)}`,
    tabla);
}

/**
 * Ajusta el tamaño de una cifra a su longitud. Un ALP como "1,213,786.00"
 * ocupa el triple que un "58" y se salía de la tarjeta; en vez de encoger
 * todas las cifras por igual, solo se encogen las largas.
 */
function claseCifra(texto) {
  const n = String(texto).length;
  return 'junta-cifra-val' +
    (n > 10 ? ' junta-cifra-val--xl' : n > 6 ? ' junta-cifra-val--l' : '');
}

/**
 * Los números en bruto del periodo: lo primero que se proyecta, para que
 * todos tengan el mismo punto de partida antes de entrar en ratios.
 */
function seccionResumenJunta(registros, rango, alcance, etiquetaPeriodo) {
  const dentro = registros.filter(r =>
    r.fecha >= rango.desde && r.fecha <= rango.hasta &&
    (!alcance || alcance.has(r.agenteId)));

  const t = totalesDe(dentro);
  const dias = new Set(dentro.map(r => r.fecha)).size || 1;

  const cont = el('div', { class: 'junta-resumen' });

  // Cuánta gente hay detrás de las cifras: sin esto, 343 citas no dice si
  // son de veinte personas o de tres.
  //
  // Los dos números cuentan lo mismo —toda persona activa del alcance—
  // porque los líderes también producen. Contar contribuyentes con líderes
  // y activos sin ellos daba cosas como "20 de 13".
  const contribuyentes = new Set(dentro.map(r => r.agenteId)).size;
  const activos = App.agentes.filter(a =>
    (!alcance || alcance.has(a.id)) && a.activo !== false).length;

  cont.appendChild(el('div', { class: 'junta-cifra junta-cifra--contexto' }, [
    el('span', { class: 'junta-cifra-etq', text: 'Agentes' }),
    el('span', { class: claseCifra(fmt(contribuyentes, 'entero')),
                 text: fmt(contribuyentes, 'entero') }),
    el('span', { class: 'junta-cifra-sub', text: `de ${activos} activo(s) · ${dias} día(s)` }),
  ]));

  KPIS.forEach(key => {
    const campo = CAMPOS.find(c => c.key === key);
    const sinDato = campo.opcional && !t._pol.hayDato;
    const texto = sinDato ? '—' : fmt(t[key], campo.tipo);

    cont.appendChild(el('div', { class: 'junta-cifra' }, [
      el('span', { class: 'junta-cifra-etq', text: campo.corto }),
      el('span', { class: claseCifra(texto), text: texto }),
      el('span', { class: 'junta-cifra-sub',
        text: sinDato ? 'sin anotar' : `${fmtPromedio(t[key] / dias, campo.tipo)} por día` }),
    ]));
  });

  return seccionJunta(`Resumen · ${etiquetaPeriodo}`, cont);
}

function seccionEfectividadJunta(registros, rango, alcance, etiquetaPeriodo) {
  const dentro = registros.filter(r =>
    r.fecha >= rango.desde && r.fecha <= rango.hasta &&
    (!alcance || alcance.has(r.agenteId)));
  const t = totalesDe(dentro);

  const cont = el('div', { class: 'junta-ratios' });

  RATIOS_FICHA.forEach(r => {
    const v = r.calc(t);
    cont.appendChild(el('div', { class: 'junta-ratio' }, [
      el('span', { class: 'junta-ratio-etq', text: r.label }),
      el('span', { class: 'junta-ratio-val', text: valorRatio(v, r.tipo) }),
    ]));
  });

  return seccionJunta(`Efectividad · ${etiquetaPeriodo}`, cont);
}

/* =========================================================================
   FICHA DEL AGENTE
   No es una pestaña: se abre desde cualquier nombre, tiene URL propia para
   poder mandarla antes de una junta, y devuelve a donde estabas.
   ========================================================================= */

/** Ratios personales. Todos derivados, ninguno se captura. */
const RATIOS_FICHA = [
  { key: 'llamadaCita',  label: 'Llamadas → cita',        tipo: 'porcentaje',
    calc: t => t.callerCalls ? (t.app / t.callerCalls) * 100 : null },
  { key: 'citaPress',    label: 'Cita → presentación',    tipo: 'porcentaje',
    calc: t => t.app ? (t.press / t.app) * 100 : null },
  { key: 'pressVenta',   label: 'Presentación → venta',   tipo: 'porcentaje',
    calc: t => t.press ? (t.pressSale / t.press) * 100 : null },
  { key: 'noShow',       label: 'Tasa de NO SHOW',        tipo: 'porcentaje', mejor: 'bajo',
    calc: t => t.app ? (t.noShow / t.app) * 100 : null },
  { key: 'refPress',     label: 'REF por presentación',   tipo: 'decimal',
    calc: t => t.press ? t.referidos / t.press : null },
  { key: 'alpVenta',     label: 'ALP por venta',          tipo: 'moneda',
    calc: t => t.pressSale ? t.alp / t.pressSale : null },
  // Estos dos solo existen si el día trae pólizas anotadas
  { key: 'alpPoliza',    label: 'ALP por póliza',         tipo: 'moneda',
    calc: t => (t._pol && t._pol.alpPorPoliza !== undefined) ? t._pol.alpPorPoliza : null },
  { key: 'polizaPress',  label: 'Pólizas por presentación', tipo: 'decimal',
    calc: t => (t._pol && t._pol.polizasPorPress !== undefined) ? t._pol.polizasPorPress : null },
];

/** Suma los campos del registro sobre un conjunto. */
function totalesDe(registros) {
  const t = {};
  CAMPOS.forEach(c => { t[c.key] = 0; });
  registros.forEach(r => CAMPOS.forEach(c => {
    if (c.opcional && !tieneDato(r, c.key)) return;
    t[c.key] += Number(r[c.key]) || 0;
  }));
  // Las métricas de pólizas viajan aparte porque necesitan saber sobre
  // cuántos registros se calcularon
  t._pol = metricasPolizas(registros);
  return t;
}

function valorRatio(v, tipo, sufijo = true) {
  if (v === null || v === undefined) return '—';
  if (tipo === 'porcentaje') return v.toFixed(1) + (sufijo ? '%' : '');
  if (tipo === 'decimal')    return v.toFixed(2);
  return fmt(v, tipo);
}

function iniciarFicha() {
  llenarSelectPreset($('#fi_preset'), PRESET_FICHA);
  $('#fi_preset').addEventListener('change', () => {
    if (App.fichaAgente) abrirFicha(App.fichaAgente, { conservarVuelta: true });
  });

  $('#btnVolverFicha').addEventListener('click', cerrarFicha);

  // La URL manda: permite compartir la ficha y que el botón atrás funcione
  window.addEventListener('hashchange', aplicarHash);
}

/** Lee el hash y abre o cierra la ficha en consecuencia. */
function aplicarHash() {
  const m = location.hash.match(/agente=([^&]+)/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    if (App.agentes.some(a => a.id === id)) return abrirFicha(id, { desdeHash: true });
  }
  if (App.fichaAgente) cerrarFicha({ desdeHash: true });
}

async function abrirFicha(agenteId, { desdeHash = false, conservarVuelta = false } = {}) {
  const agente = App.agentes.find(a => a.id === agenteId);
  if (!agente) return aviso('No se encontró a esa persona.', 'error');

  // A dónde volver: la pestaña en la que estaba antes de entrar. Si la
  // ficha se abrió desde un enlace compartido no hay tal pestaña, y volver
  // al formulario de captura no tiene sentido: se va al Resumen.
  if (!conservarVuelta && !App.fichaAgente) {
    const activa = $('.panel.is-activa');
    App.fichaVuelta = (!desdeHash && activa && activa.id !== 'panel-ficha')
      ? activa.id : 'panel-resumen';
  }
  App.fichaAgente = agenteId;

  $$('.panel').forEach(p => p.classList.remove('is-activa'));
  $('#panel-ficha').classList.add('is-activa');
  $$('.pestana').forEach(b => { b.classList.remove('is-activa'); b.setAttribute('aria-selected', 'false'); });

  if (!desdeHash) {
    const nuevo = `#agente=${encodeURIComponent(agenteId)}`;
    if (location.hash !== nuevo) history.pushState(null, '', nuevo);
  }

  await pintarFicha(agente);
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function cerrarFicha({ desdeHash = false } = {}) {
  App.fichaAgente = null;
  const volverA = App.fichaVuelta || 'panel-resumen';

  $$('.panel').forEach(p => p.classList.remove('is-activa'));
  $('#' + volverA).classList.add('is-activa');
  const boton = $(`.pestana[data-panel="${volverA}"]`);
  if (boton) { boton.classList.add('is-activa'); boton.setAttribute('aria-selected', 'true'); }

  if (!desdeHash && location.hash) history.pushState(null, '', location.pathname);
}

async function pintarFicha(agente) {
  const rango = rangoDePreset($('#fi_preset').value) || rangoDePreset(PRESET_FICHA);
  const registros = (await Store.listarRegistros({ desde: rango.desde, hasta: rango.hasta }))
    .filter(r => r.agenteId === agente.id);

  const jefe = App.agentes.find(a => a.id === agente.reportaA);

  $('#fichaNombre').textContent = agente.nombre;
  $('#fichaSub').textContent =
    `${agente.rol || 'Agente'}` +
    (agente.equipo ? ` · equipo ${agente.equipo}` : '') +
    (jefe ? ` · reporta a ${jefe.nombre}` : ' · no reporta a nadie') +
    (agente.activo === false ? ' · INACTIVO' : '') +
    ` · ${textoRango(rango.desde, rango.hasta)}`;

  const totales = totalesDe(registros);

  pintarFichaKpis(totales, registros, rango, agente);
  pintarFichaRatios(totales, rango);
  pintarFichaEvolucion(registros, rango);
  await pintarFichaMeta(agente);
  await pintarFichaContests(agente);
  pintarFichaRegistros(registros);
}

function pintarFichaKpis(totales, registros, rango, agente) {
  const cont = $('#fichaKpis');
  cont.innerHTML = '';

  const habiles = diasHabilesDelRango(rango.desde, rango.hasta);
  const diasConReporte = new Set(registros.map(r => r.fecha)).size;
  const ultimo = registros.reduce((m, r) => (r.fecha > m ? r.fecha : m), '');
  const sinReportar = ultimo ? diasDesde(ultimo) : null;

  const tarjeta = (etq, val, sub, extra = {}) => el('div', { class: 'kpi', ...extra }, [
    el('div', { class: 'kpi-etq', text: etq }),
    el('div', { class: 'kpi-val', text: val }),
    el('div', { class: 'kpi-sub', text: sub }),
  ]);

  const pct = habiles ? (diasConReporte / habiles) * 100 : null;
  const color = pct === null ? 'sin'
    : pct >= CONSTANCIA.verde ? 'verde'
    : pct >= CONSTANCIA.amarillo ? 'amarillo' : 'rojo';

  cont.appendChild(el('div', { class: `kpi kpi--${color}` }, [
    el('div', { class: 'kpi-etq', text: 'Constancia' }),
    el('div', { class: 'kpi-val', text: pct === null ? '—' : pct.toFixed(0) + '%' }),
    el('div', { class: 'kpi-sub', text: `${diasConReporte} de ${habiles} día(s) hábil(es)` }),
  ]));

  cont.appendChild(tarjeta('Sin reportar',
    sinReportar === null ? '—' : sinReportar === 0 ? 'Hoy' : `${sinReportar} d`,
    sinReportar === null ? 'Nunca ha reportado en el período'
      : sinReportar === 0 ? 'Reportó hoy' : `Último reporte: ${fechaCorta(ultimo)}`));

  KPIS.forEach(key => {
    const campo = CAMPOS.find(c => c.key === key);
    cont.appendChild(tarjeta(campo.corto, fmt(totales[key], campo.tipo),
      `${fmtPromedio(totales[key] / (diasConReporte || 1), campo.tipo)} por día reportado`));
  });
}

function pintarFichaRatios(totales, rango) {
  $('#fichaRatiosSub').textContent =
    `Calculados sobre ${textoRango(rango.desde, rango.hasta)}. Cuadran con su fila del reporte consolidado.`;

  const cont = $('#fichaRatios');
  cont.innerHTML = '';

  cont.appendChild(el('table', { class: 'tabla' }, [
    el('tbody', {}, RATIOS_FICHA.map(r => {
      const v = r.calc(totales);
      return el('tr', {}, [
        el('td', { text: r.label }),
        el('td', { class: 'num', style: 'font-size:1.02rem;font-weight:600',
                   text: valorRatio(v, r.tipo) }),
      ]);
    })),
  ]));
}

/**
 * Evolución semanal de cada ratio. Semanas y no días porque un día suelto
 * con una presentación da ratios de 0% o 100% que no dicen nada.
 */
function pintarFichaEvolucion(registros, rango) {
  const cont = $('#fichaEvolucion');
  cont.innerHTML = '';

  // Agrupar por semana
  const porSemana = new Map();
  registros.forEach(r => {
    const s = lunesDeLaSemana(r.fecha);
    if (!porSemana.has(s)) porSemana.set(s, []);
    porSemana.get(s).push(r);
  });

  const semanas = [...porSemana.keys()].sort();
  if (semanas.length < 2) {
    cont.appendChild(el('p', { class: 'vacio',
      text: 'Hacen falta al menos dos semanas con registros para ver evolución. Amplía el período.' }));
    return;
  }

  const totalesPorSemana = semanas.map(s => totalesDe(porSemana.get(s)));
  const etiquetas = semanas.map(s => etiquetaSemana(s));

  RATIOS_FICHA.forEach(r => {
    const valores = totalesPorSemana.map(t => r.calc(t));
    const utiles = valores.filter(v => v !== null);

    // Tendencia: promedio de la segunda mitad contra la primera
    const mitad = Math.floor(utiles.length / 2);
    const prom = a => a.length ? a.reduce((t, v) => t + v, 0) / a.length : null;
    const antes = prom(utiles.slice(0, mitad));
    const ahora = prom(utiles.slice(mitad));

    let marca = null;
    if (antes !== null && ahora !== null && antes !== 0) {
      const dif = ahora - antes;
      const sube = dif > 0;
      const bueno = r.mejor === 'bajo' ? !sube : sube;
      if (Math.abs(dif / antes) >= 0.05) {
        marca = el('span', {
          class: 'mini-tendencia ' + (bueno ? 'mini-tendencia--bien' : 'mini-tendencia--mal'),
          title: bueno ? 'Va mejorando' : 'Va cayendo',
          text: `${sube ? '↑' : '↓'} ${Math.abs((dif / antes) * 100).toFixed(0)}%`,
        });
      }
    }

    const caja = el('div', { class: 'mini-caja' }, [
      el('div', { class: 'mini-cab' }, [
        el('span', { class: 'mini-etq', text: r.label }),
        marca,
      ].filter(Boolean)),
      el('div', { class: 'mini-valor', text: valorRatio(valores[valores.length - 1], r.tipo) }),
      el('div', { class: 'mini-lienzo' }),
    ]);
    cont.appendChild(caja);

    Charts.miniLinea(caja.querySelector('.mini-lienzo'), {
      etiquetas, valores,
      formato: r.tipo === 'moneda' ? 'moneda' : r.tipo === 'decimal' ? 'moneda' : 'entero',
      sufijo: r.tipo === 'porcentaje' ? '%' : '',
    });
  });
}

async function pintarFichaMeta(agente) {
  const semana = semanaActual();
  const cont = $('#fichaMeta');
  cont.innerHTML = '';
  $('#fichaMetaSub').textContent = `Semana del ${etiquetaSemana(semana)}.`;

  const { resueltas } = await cargarMetasResueltas(semana);
  const meta = resueltas.get(agente.id);

  const registros = (await Store.listarRegistros({
    desde: semana, hasta: domingoDeLaSemana(semana),
  })).filter(r => r.agenteId === agente.id);
  const real = totalesDe(registros);

  if (!meta) {
    cont.appendChild(el('p', { class: 'vacio',
      text: 'Sin meta esta semana. Fíjale una meta base en la pestaña Metas.' }));
    return;
  }

  cont.appendChild(el('table', { class: 'tabla' }, [
    el('tbody', {}, METAS_CAMPOS.map(c => {
      const objetivo = Number(meta[c.key]) || 0;
      const logrado = Number(real[c.key]) || 0;
      const pct = objetivo ? Math.min((logrado / objetivo) * 100, 100) : null;

      return el('tr', {}, [
        el('td', { text: c.label }),
        el('td', { class: 'num', text: `${fmt(logrado, c.tipo)} / ${fmt(objetivo, c.tipo)}` }),
        el('td', { style: 'width:40%' }, [
          el('span', { class: 'barra' }, [
            el('span', {
              class: 'barra-relleno' + (pct !== null && pct >= 100 ? ' barra-relleno--ok' : ''),
              style: `width:${Math.max(2, pct || 0)}%`,
            }),
          ]),
        ]),
      ]);
    })),
  ]));

  const cumpl = cumplimientoPromedio(
    Object.fromEntries(METAS_CAMPOS.map(c => [c.key, Number(meta[c.key]) || 0])), real);
  if (cumpl !== null) {
    cont.appendChild(el('p', { class: 'ayuda',
      text: `Cumplimiento promedio: ${cumpl.toFixed(0)}%.` }));
  }
}

async function pintarFichaContests(agente) {
  const cont = $('#fichaContests');
  cont.innerHTML = '';

  const ganados = await contestsGanadosPor(agente.id);
  if (!ganados.length) {
    cont.appendChild(el('p', { class: 'vacio', text: 'Todavía no ha ganado ningún contest.' }));
    return;
  }

  const lista = el('div', { class: 'muro' });
  ganados.forEach(c => {
    const tipo = PREMIO_TIPOS.find(p => p.key === c.premioTipo) || PREMIO_TIPOS[3];
    lista.appendChild(el('div', { class: 'muro-item' }, [
      el('span', { class: 'muro-icono', 'aria-hidden': 'true', text: tipo.icono }),
      el('div', {}, [
        el('strong', { text: c.nombre }),
        el('p', { class: 'ayuda', text: `${c.premio} · ${fechaCorta(c.hasta)}` }),
      ]),
    ]));
  });
  cont.appendChild(lista);
}

function pintarFichaRegistros(registros) {
  const tabla = $('#fichaTabla');
  tabla.innerHTML = '';
  $('#fichaRegistrosSub').textContent = `${registros.length} registro(s) en el período.`;

  if (!registros.length) {
    tabla.appendChild(el('tbody', {}, [
      el('tr', {}, [el('td', { class: 'vacio', text: 'Sin registros en este período.' })]),
    ]));
    return;
  }

  tabla.appendChild(el('thead', {}, [
    el('tr', {}, [
      el('th', { text: 'Fecha' }),
      ...CAMPOS.map(c => el('th', { class: 'num', text: c.corto })),
    ]),
  ]));

  tabla.appendChild(el('tbody', {}, registros.map(r =>
    el('tr', {}, [
      el('td', { text: fechaCorta(r.fecha) }),
      ...CAMPOS.map(c => el('td', {
        class: 'num' + (tieneDato(r, c.key) && Number(r[c.key]) ? '' : ' cero'),
        text: c.opcional ? fmtOpcional(r, c) : fmt(r[c.key], c.tipo),
      })),
    ])
  )));
}

/** Nombre clicable que lleva a la ficha. Se usa en todas las tablas. */
function enlaceAgente(agenteId, texto) {
  return el('button', {
    class: 'enlace-agente', type: 'button', text: texto,
    title: `Ver la ficha de ${texto}`,
    onclick: () => abrirFicha(agenteId),
  });
}

/* =========================================================================
   PANEL AGENTES (ADMINISTRADOR)
   ========================================================================= */

function iniciarAgentes() {
  $('#formAdmin').addEventListener('submit', async e => {
    e.preventDefault();
    const pin = $('#a_pin').value.trim();
    try {
      const ok = await Store.validarAdmin(pin);
      if (!ok) return aviso('PIN incorrecto.', 'error');
      Sesion.entrar(pin);
      $('#a_pin').value = '';
      await refrescarPanelAgentes();
      // Con sesión abierta cambian los permisos: repintar lo afectado.
      await pintarRecientes();
      await refrescarMetas();
      await refrescarContests();
      aviso('Sesión de administrador iniciada. Ya puedes corregir cualquier fecha, fijar metas y crear contests.');
    } catch (err) {
      aviso(err.message, 'error');
    }
  });

  $('#btnSalirAdmin').addEventListener('click', async () => {
    Sesion.salir();
    App.metasEditadas.clear();
    await refrescarPanelAgentes();
    await pintarRecientes();
    await refrescarMetas();
    await refrescarContests();
    limpiarFormulario();
  });

  $('#btnNuevoAgente').addEventListener('click', () => abrirDlgAgente(null));

  $('#btnReiniciar').addEventListener('click', async () => {
    const ok = await confirmar({
      titulo: 'Reiniciar datos de prueba',
      texto: 'Se borrarán todos los agentes y registros actuales y se recrearán los de ejemplo. Esta acción no se puede deshacer.',
      etiquetaOk: 'Reiniciar',
    });
    if (!ok) return;
    await Store.reiniciarDemo();
    await cargarAgentes();
    await pintarRecientes();
    await refrescarPanelAgentes();
    aviso('Datos de prueba restablecidos.');
  });

  $$('[data-cerrar]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));

  $('#formAgente').addEventListener('submit', async e => {
    e.preventDefault();
    const id       = $('#ag_id').value;
    const nombre   = $('#ag_nombre').value.trim();
    const equipo   = $('#ag_equipo').value.trim();
    const activo   = $('#ag_activo').checked;
    const rol      = $('#ag_rol').value;
    const reportaA = $('#ag_reportaA').value;

    if (!nombre) return aviso('El nombre del agente es obligatorio.', 'error');

    try {
      if (id) {
        await Store.actualizarAgente(id, { nombre, equipo, activo, rol, reportaA });
        aviso('Agente actualizado.');
      } else {
        await Store.crearAgente({ nombre, equipo, activo, rol, reportaA });
        aviso('Agente creado.');
      }
      $('#dlgAgente').close();
      await cargarAgentes();
      await refrescarPanelAgentes();
    } catch (err) {
      aviso(err.message, 'error');
    }
  });
}

function abrirDlgAgente(agente) {
  $('#dlgAgenteTitulo').textContent = agente ? 'Editar agente' : 'Nuevo agente';
  $('#ag_id').value     = agente ? agente.id : '';
  $('#ag_nombre').value = agente ? agente.nombre : '';
  $('#ag_equipo').value = agente ? (agente.equipo || '') : '';
  $('#ag_activo').checked = agente ? agente.activo !== false : true;

  // Rol
  const selRol = $('#ag_rol');
  selRol.innerHTML = '';
  ROLES.forEach(r => selRol.appendChild(el('option', { value: r.key, text: r.label })));
  selRol.value = (agente && agente.rol) || ROL_POR_DEFECTO;

  llenarSelectSuperior(agente);
  selRol.onchange = () => llenarSelectSuperior(agente, true);

  $('#dlgAgente').showModal();
  $('#ag_nombre').focus();
}

/**
 * Llena "Reporta a" solo con candidatos validos: nivel estrictamente mayor,
 * y que no generen un ciclo. Asi el error se evita antes de guardar en vez
 * de rechazarlo despues.
 */
function llenarSelectSuperior(agente, conservar = false) {
  const sel = $('#ag_reportaA');
  const previo = conservar ? sel.value : (agente ? (agente.reportaA || '') : '');
  const rol = $('#ag_rol').value;
  const id  = agente ? agente.id : '__nuevo__';

  // Para validar un agente aun no creado, lo agregamos temporalmente.
  const universo = agente
    ? App.agentes
    : [...App.agentes, { id, nombre: '', rol, reportaA: '' }];

  const candidatos = App.agentes
    .filter(a => a.id !== id)
    .filter(a => !Jerarquia.validar(universo, id, a.id, rol))
    .sort((x, y) => (rangoDeRol(y.rol) - rangoDeRol(x.rol)) ||
                    x.nombre.localeCompare(y.nombre, 'es'));

  sel.innerHTML = '';
  sel.appendChild(el('option', { value: '', text: '— Nadie (nivel más alto) —' }));
  candidatos.forEach(a => sel.appendChild(el('option', {
    value: a.id,
    text: `${a.nombre} · ${a.rol || 'Agente'}`,
  })));

  sel.value = candidatos.some(a => a.id === previo) ? previo : '';

  const ayuda = $('#ag_reportaAyuda');
  if (!candidatos.length) {
    ayuda.textContent = `No hay nadie con nivel superior a ${rol}. ` +
                        `Este agente quedará en la cima del organigrama.`;
  } else {
    ayuda.textContent = 'Solo puede reportar a alguien de un nivel más alto. ' +
                        'Déjalo vacío si es el nivel más alto de la organización.';
  }
}

async function refrescarPanelAgentes() {
  const esAdmin = Sesion.esAdmin();
  $('#puertaAdmin').hidden = esAdmin;
  $('#zonaAdmin').hidden   = !esAdmin;
  $('#zonaPeligro').hidden = !Store.esDemo;

  if (Store.esDemo) {
    const pista = $('#pistaPin');
    pista.hidden = false;
    pista.textContent = `Modo de prueba — el PIN es ${CONFIG.ADMIN_PIN_DEMO}. Cámbialo en assets/js/config.js.`;
  }

  if (!esAdmin) return;

  await cargarAgentes();
  const regs = await Store.listarRegistros();
  const conteoPorAgente = regs.reduce((m, r) => (m[r.agenteId] = (m[r.agenteId] || 0) + 1, m), {});

  const activos = App.agentes.filter(a => a.activo !== false).length;
  $('#conteoAgentes').textContent =
    `${App.agentes.length} agente(s) · ${activos} activo(s) · ${App.agentes.length - activos} inactivo(s)`;

  pintarOrganigrama(conteoPorAgente);

  const tabla = $('#tablaAgentes');
  tabla.innerHTML = '';

  if (!App.agentes.length) {
    tabla.appendChild(el('tbody', {}, [
      el('tr', {}, [el('td', { class: 'vacio', text: 'No hay agentes. Crea el primero.' })]),
    ]));
    return;
  }

  tabla.appendChild(el('thead', {}, [
    el('tr', {}, [
      el('th', { text: 'Agente' }),
      el('th', { text: 'Rol' }),
      el('th', { text: 'Reporta a' }),
      el('th', { text: 'Equipo' }),
      el('th', { text: 'Estado' }),
      el('th', { class: 'num', text: 'Registros' }),
      el('th', { class: 'acc', text: 'Acciones' }),
    ]),
  ]));

  const nombrePorId = Object.fromEntries(App.agentes.map(a => [a.id, a.nombre]));
  const filas = [...App.agentes].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  tabla.appendChild(el('tbody', {}, filas.map(a =>
    el('tr', {}, [
      el('td', { text: a.nombre }),
      el('td', {}, [el('span', { class: 'marca-rol', text: a.rol || 'Agente' })]),
      el('td', {
        class: a.reportaA ? '' : 'cero',
        text: a.reportaA ? (nombrePorId[a.reportaA] || 'Superior eliminado') : '—',
      }),
      el('td', { text: a.equipo || '—' }),
      el('td', {}, [
        el('span', {
          class: 'marca-estado marca-estado--' + (a.activo !== false ? 'on' : 'off'),
          text: a.activo !== false ? 'Activo' : 'Inactivo',
        }),
      ]),
      el('td', { class: 'num', text: conteoPorAgente[a.id] || 0 }),
      el('td', { class: 'acc' }, [
        el('button', {
          class: 'btn-mini', type: 'button', text: 'Editar',
          onclick: () => abrirDlgAgente(a),
        }),
        el('button', {
          class: 'btn-mini', type: 'button',
          text: a.activo !== false ? 'Desactivar' : 'Activar',
          onclick: async () => {
            await Store.actualizarAgente(a.id, { activo: a.activo === false });
            await cargarAgentes();
            await refrescarPanelAgentes();
            aviso(`Agente ${a.activo !== false ? 'desactivado' : 'activado'}.`);
          },
        }),
        el('button', {
          class: 'btn-mini btn-mini--peligro', type: 'button', text: 'Eliminar',
          onclick: () => eliminarAgente(a, conteoPorAgente[a.id] || 0),
        }),
      ]),
    ])
  )));
}

/** Dibuja el arbol completo a partir de las relaciones "reporta a". */
function pintarOrganigrama(conteoPorAgente = {}) {
  const cont = $('#organigrama');
  cont.innerHTML = '';

  if (!App.agentes.length) {
    cont.appendChild(el('p', { class: 'vacio', text: 'No hay agentes cargados.' }));
    return;
  }

  const lista = el('ul', { class: 'arbol' });

  Jerarquia.aplanar(App.agentes).forEach(({ agente, nivel }) => {
    const bajoSuLinea = Jerarquia.descendientes(App.agentes, agente.id);
    const deCampo = bajoSuLinea.filter(a => a.rol === 'Agente').length;

    lista.appendChild(el('li', {
      class: 'arbol-fila' + (agente.activo === false ? ' arbol-fila--inactivo' : ''),
      style: `--nivel:${nivel}`,
    }, [
      el('span', { class: 'arbol-guia', 'aria-hidden': 'true' }),
      el('span', { class: 'marca-rol', text: agente.rol || 'Agente' }),
      el('span', { class: 'arbol-nombre', text: agente.nombre }),
      agente.equipo ? el('span', { class: 'arbol-equipo', text: agente.equipo }) : null,
      deCampo
        ? el('span', { class: 'arbol-conteo', text: `${deCampo} agente(s)` })
        : el('span', {
            class: 'arbol-conteo',
            text: `${conteoPorAgente[agente.id] || 0} registro(s)`,
          }),
      agente.activo === false ? el('span', { class: 'arbol-inactivo', text: 'inactivo' }) : null,
    ]));
  });

  cont.appendChild(lista);

  const huerfanos = App.agentes.filter(
    a => a.reportaA && !App.agentes.some(b => b.id === a.reportaA));
  if (huerfanos.length) {
    cont.appendChild(el('p', {
      class: 'ayuda',
      text: `${huerfanos.length} persona(s) apuntan a un superior que ya no existe ` +
            `y aparecen en la raíz: ${huerfanos.map(a => a.nombre).join(', ')}.`,
    }));
  }
}

async function eliminarAgente(agente, numRegistros) {
  const aCargo = Jerarquia.hijos(App.agentes, agente.id);
  const superior = App.agentes.find(a => a.id === agente.reportaA);

  let texto = numRegistros
    ? `Este agente tiene ${numRegistros} registro(s) históricos. Si no marcas la casilla, los registros se conservan para las estadísticas y solo se elimina al agente del catálogo.`
    : 'El agente se eliminará del catálogo. No tiene registros históricos.';

  if (aCargo.length) {
    texto += ` Además, ${aCargo.length} persona(s) le reportan y pasarán a ` +
             (superior ? `${superior.nombre}.` : 'la raíz del organigrama.');
  }

  const ok = await confirmar({
    titulo: `Eliminar a ${agente.nombre}`,
    texto,
    etiquetaOk: 'Eliminar',
    conExtra: numRegistros > 0,
  });
  if (!ok) return;

  await Store.eliminarAgente(agente.id, { borrarRegistros: ok.borrarRegistros });
  await cargarAgentes();
  await refrescarPanelAgentes();
  await pintarRecientes();
  aviso(`${agente.nombre} fue eliminado.`);
}

/* Confirmación como promesa. Resuelve `false` o `{ borrarRegistros }`. */
function confirmar({ titulo, texto, etiquetaOk = 'Eliminar', conExtra = false }) {
  return new Promise(resolve => {
    const dlg = $('#dlgConfirmar');
    $('#confTitulo').textContent = titulo;
    $('#confTexto').textContent  = texto;
    $('#confOk').textContent     = etiquetaOk;
    $('#confExtraZona').hidden   = !conExtra;
    $('#conf_borrarRegs').checked = false;

    const alOk = () => {
      limpiar();
      dlg.close();
      resolve({ borrarRegistros: conExtra && $('#conf_borrarRegs').checked });
    };
    const alCerrar = () => { limpiar(); resolve(false); };
    const limpiar = () => {
      $('#confOk').removeEventListener('click', alOk);
      dlg.removeEventListener('close', alCerrar);
    };

    $('#confOk').addEventListener('click', alOk);
    dlg.addEventListener('close', alCerrar);
    dlg.showModal();
  });
}

/* =========================================================================
   ARRANQUE
   ========================================================================= */

async function cargarAgentes() {
  // El rol puede faltar si la hoja aun no tiene la columna: sin este valor
  // por defecto, rangoDeRol daria -1 y el organigrama quedaria incoherente.
  App.agentes = (await Store.listarAgentes()).map(a => ({
    ...a,
    rol: a.rol || ROL_POR_DEFECTO,
    reportaA: a.reportaA || '',
  }));
  llenarSelectAgentes($('#f_agente'), { soloActivos: true });
  llenarSelectJerarquia($('#rs_linea'));
  llenarSelectJerarquia($('#rp_linea'));
  revisarBackend();
}

async function iniciar() {
  iniciarTema();
  iniciarPestanas();
  iniciarFormRegistro();
  iniciarResumen();
  iniciarSinReportar();
  iniciarReportes();
  iniciarMetas();
  iniciarContests();
  iniciarFicha();
  iniciarModoJunta();
  iniciarAgentes();

  $('#marcaEquipo').textContent = CONFIG.EQUIPO;
  $('#pastillaModo').hidden = !Store.esDemo;
  $('#pastillaModo').textContent = Store.esPaginaDePrueba ? 'Página de prueba' : 'Datos de prueba';
  $('#pieModo').textContent = Store.esPaginaDePrueba
    ? 'Página de prueba en localhost — datos ficticios guardados solo en este navegador. La página publicada sigue conectada a Google Sheets y no se ve afectada.'
    : Store.esDemo
      ? 'Modo de prueba — los datos se guardan solo en este navegador.'
      : 'Conectado a Google Sheets.';

  try {
    await cargarAgentes();
    await pintarRecientes();
    await actualizarBadgeContests();
    // Si la URL trae una ficha, se abre esa en vez de la pestaña por defecto
    aplicarHash();
  } catch (err) {
    aviso('No se pudieron cargar los datos: ' + err.message, 'error');
  }
}

document.addEventListener('DOMContentLoaded', iniciar);
