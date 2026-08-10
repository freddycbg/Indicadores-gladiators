/* =========================================================================
   app.js — Lógica de la aplicación
   ========================================================================= */

const App = {
  agentes: [],          // catálogo completo
  registrosStats: [],     // filtro actual del panel Resumen
  registrosReportes: [],  // filtro actual del panel Reportes
  editando: null,       // registro cargado en el formulario, si lo hay
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

    // Campo vacío = 0. Es la única conversión implícita del formulario.
    for (const c of CAMPOS) {
      const raw = $('#f_' + c.key).value.trim();
      reg[c.key] = raw === '' ? 0 : (c.tipo === 'moneda' ? nDecimal(raw) : nEntero(raw));
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
  const regs = (await Store.listarRegistros()).slice(0, 10);
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
        class: 'num' + (Number(r[c.key]) ? '' : ' cero'),
        text: fmt(r[c.key], c.tipo),
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
  llenarSelectPreset($('#rs_preset'), '30');
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

  // El Resumen no ofrece fechas a mano: si no hay preset util, ultimos 30.
  const rango = rangoDePreset($('#rs_preset').value) || rangoDePreset('30');
  const alcance = alcanceDe($('#rs_linea').value);

  const regs = await Store.listarRegistros({ desde: rango.desde, hasta: rango.hasta });
  App.registrosStats = alcance ? regs.filter(r => alcance.has(r.agenteId)) : regs;

  await refrescarSalud($('#rs_linea').value);
  pintarKPIs();
  pintarGraficas();
  pintarTasas();
  await refrescarComparativa($('#rs_linea').value);
}

/* ---------- Panel Reportes --------------------------------------------- */

function iniciarReportes() {
  llenarSelectPreset($('#rp_preset'), '30');
  const inicial = rangoDePreset('30');
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

/** Muestra el aviso si el Apps Script publicado se quedó atrás. */
function revisarBackend() {
  $('#avisoBackend').hidden = !Store.backendDesactualizado ||
                              !Store.backendDesactualizado();
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
      .map(a => ({ label: a.nombre, valor: a.alp, detalle: `${a.pressSale} venta(s)` })),
    formato: 'moneda',
  });

  Charts.barrasH($('#graficaVentas'), {
    items: porAgente
      .filter(a => a.pressSale > 0)
      .sort((x, y) => y.pressSale - x.pressSale)
      .slice(0, 10)
      .map(a => ({ label: a.nombre, valor: a.pressSale, detalle: `${a.press} presentación(es)` })),
    formato: 'entero',
  });
}

/** Consolida los registros por agente sumando todas las métricas. */
function agruparPorAgente(regs) {
  const mapa = new Map();
  for (const r of regs) {
    if (!mapa.has(r.agenteId)) {
      const base = { agenteId: r.agenteId, nombre: r.agenteNombre, dias: new Set() };
      CAMPOS.forEach(c => { base[c.key] = 0; });
      mapa.set(r.agenteId, base);
    }
    const a = mapa.get(r.agenteId);
    a.dias.add(r.fecha);
    CAMPOS.forEach(c => { a[c.key] += Number(r[c.key]) || 0; });
  }
  return [...mapa.values()].map(a => ({ ...a, dias: a.dias.size }));
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

  const filas = [
    ['Llamadas → Appointment', porcentaje(app, caller),       `${fmt(app)} de ${fmt(caller)}`],
    ['Appointment → Presentación', porcentaje(press, app),    `${fmt(press)} de ${fmt(app)}`],
    ['Presentación → Venta', porcentaje(pressSale, press),    `${fmt(pressSale)} de ${fmt(press)}`],
    ['Tasa de NO SHOW', porcentaje(noShow, app),              `${fmt(noShow)} de ${fmt(app)}`],
    ['ALP por venta', pressSale ? fmt(alp / pressSale, 'moneda') : '—', `${fmt(alp, 'moneda')} total`],
    ['ALP por presentación', press ? fmt(alp / press, 'moneda') : '—',  `${fmt(press)} presentaciones`],
  ];

  const cont = $('#tasas');
  cont.innerHTML = '';
  if (!regs.length) {
    cont.appendChild(el('p', { class: 'vacio', text: 'Sin datos en el rango seleccionado.' }));
    return;
  }

  const tabla = el('table', { class: 'tabla' }, [
    el('tbody', {}, filas.map(([etq, val, sub]) =>
      el('tr', {}, [
        el('td', {}, [
          document.createTextNode(etq),
          el('div', { class: 'ayuda', text: sub }),
        ]),
        el('td', { class: 'num', style: 'font-size:1.05rem;font-weight:600', text: val }),
      ])
    )),
  ]);
  cont.appendChild(tabla);
}

/* --- Reporte consolidado por agente ------------------------------------ */
function pintarReporte() {
  const tabla = $('#tablaReporte');
  tabla.innerHTML = '';
  const filas = agruparPorAgente(App.registrosReportes).sort((a, b) => b.alp - a.alp);

  if (!filas.length) {
    tabla.appendChild(el('tbody', {}, [
      el('tr', {}, [el('td', { class: 'vacio', text: 'Sin registros en el rango seleccionado.' })]),
    ]));
    return;
  }

  tabla.appendChild(el('thead', {}, [
    el('tr', {}, [
      el('th', { text: 'Agente' }),
      el('th', { class: 'num', text: 'Días' }),
      ...CAMPOS.map(c => el('th', { class: 'num', text: c.corto })),
    ]),
  ]));

  tabla.appendChild(el('tbody', {}, filas.map(f =>
    el('tr', {}, [
      el('td', { text: f.nombre }),
      el('td', { class: 'num', text: f.dias }),
      ...CAMPOS.map(c => el('td', {
        class: 'num' + (f[c.key] ? '' : ' cero'),
        text: fmt(f[c.key], c.tipo),
      })),
    ])
  )));

  tabla.appendChild(el('tfoot', {}, [
    el('tr', {}, [
      el('td', { text: 'TOTAL' }),
      el('td', { class: 'num', text: new Set(App.registrosReportes.map(r => r.fecha)).size }),
      ...CAMPOS.map(c => el('td', {
        class: 'num',
        text: fmt(filas.reduce((t, f) => t + f[c.key], 0), c.tipo),
      })),
    ]),
  ]));
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
      el('td', { text: r.agenteNombre }),
      ...CAMPOS.map(c => el('td', {
        class: 'num' + (Number(r[c.key]) ? '' : ' cero'),
        text: fmt(r[c.key], c.tipo),
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

  const [metas, registros] = await Promise.all([
    Store.listarMetas({ semana }),
    Store.listarRegistros({ desde: semana, hasta: domingoDeLaSemana(semana) }),
  ]);
  revisarBackend();

  const metaPorAgente = new Map(metas.map(m => [m.agenteId, m]));

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

function iniciarMetas() {
  App.semanaMetas = semanaActual();
  App.metasEditadas = new Map();   // agenteId -> { alp, app, referidos }

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
  select.appendChild(el('option', { value: '', text: textoTodos }));

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

/** Agentes de campo dentro de la línea elegida (o todos si no hay línea). */
function agentesDeLaLinea(lineaId) {
  const base = lineaId
    ? Jerarquia.descendientes(App.agentes, lineaId)
    : App.agentes;
  return base
    .filter(a => a.rol === 'Agente' && a.activo !== false)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

async function refrescarMetas() {
  const esAdmin = Sesion.esAdmin();

  llenarSelectLinea($('#m_linea'));
  $('#etqSemana').textContent = etiquetaSemana(App.semanaMetas);
  const rel = relativoSemana(App.semanaMetas);
  $('#metasAyuda').textContent = rel
    ? `${rel} · ${fechaCorta(App.semanaMetas)} al ${fechaCorta(domingoDeLaSemana(App.semanaMetas))}`
    : `${fechaCorta(App.semanaMetas)} al ${fechaCorta(domingoDeLaSemana(App.semanaMetas))}`;

  $('#metasSoloLectura').hidden = esAdmin;
  $('#btnCopiarMetas').disabled = !esAdmin;

  const metas = await Store.listarMetas({ semana: App.semanaMetas });
  revisarBackend();
  App.metasSemana = new Map(metas.map(m => [m.agenteId, m]));

  // Lo realmente logrado en esa semana, para comparar contra la meta
  const registros = await Store.listarRegistros({
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

/** Meta efectiva de un agente: la editada si la hay, si no la guardada. */
function metaDe(agenteId) {
  if (App.metasEditadas.has(agenteId)) return App.metasEditadas.get(agenteId);
  const m = App.metasSemana.get(agenteId);
  if (!m) return null;
  return Object.fromEntries(METAS_CAMPOS.map(c => [c.key, Number(m[c.key]) || 0]));
}

function pintarTablaMetas(esAdmin) {
  const tabla = $('#tablaMetas');
  tabla.innerHTML = '';
  const agentes = agentesDeLaLinea($('#m_linea').value);

  if (!agentes.length) {
    tabla.appendChild(el('tbody', {}, [
      el('tr', {}, [el('td', { class: 'vacio', text: 'No hay agentes activos en esa línea.' })]),
    ]));
    return;
  }

  tabla.appendChild(el('thead', {}, [
    el('tr', {}, [
      el('th', { text: 'Agente' }),
      el('th', { text: 'Reporta a' }),
      ...METAS_CAMPOS.map(c => el('th', { class: 'num', text: 'Meta ' + c.corto })),
      ...METAS_CAMPOS.map(c => el('th', { class: 'num', text: 'Real ' + c.corto })),
      el('th', { text: 'Estado' }),
    ]),
  ]));

  const nombrePorId = Object.fromEntries(App.agentes.map(a => [a.id, a.nombre]));

  tabla.appendChild(el('tbody', {}, agentes.map(ag => {
    const meta = metaDe(ag.id);
    const real = App.realSemana.get(ag.id) || {};
    const editada = App.metasEditadas.has(ag.id);

    return el('tr', { class: editada ? 'fila-editada' : '' }, [
      el('td', { text: ag.nombre }),
      el('td', { class: 'tenue', text: nombrePorId[ag.reportaA] || '—' }),

      ...METAS_CAMPOS.map(c => el('td', { class: 'num' }, [
        el('input', {
          type: 'number', min: '0',
          step: c.tipo === 'moneda' ? '0.01' : '1',
          inputmode: c.tipo === 'moneda' ? 'decimal' : 'numeric',
          class: 'celda-num',
          placeholder: '—',
          value: meta && meta[c.key] ? meta[c.key] : '',
          disabled: !esAdmin,
          'data-agente': ag.id,
          'data-campo': c.key,
          oninput: alEditarMeta,
        }),
      ])),

      ...METAS_CAMPOS.map(c => el('td', {
        class: 'num' + (real[c.key] ? '' : ' cero'),
        text: fmt(real[c.key] || 0, c.tipo),
      })),

      el('td', {}, [estadoDeMeta(meta, real)]),
    ]);
  })));
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
    const suyos = Jerarquia.descendientes(App.agentes, agente.id)
      .filter(a => a.rol === 'Agente' && a.activo !== false);

    const conMeta = suyos.filter(a => metaDe(a.id));
    const sumaMeta = Object.fromEntries(METAS_CAMPOS.map(c => [c.key, 0]));
    const sumaReal = Object.fromEntries(METAS_CAMPOS.map(c => [c.key, 0]));

    suyos.forEach(a => {
      const m = metaDe(a.id);
      const r = App.realSemana.get(a.id) || {};
      METAS_CAMPOS.forEach(c => {
        if (m) sumaMeta[c.key] += Number(m[c.key]) || 0;
        sumaReal[c.key] += Number(r[c.key]) || 0;
      });
    });

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

  const nombrePorId = Object.fromEntries(App.agentes.map(a => [a.id, a.nombre]));
  const lista = [...App.metasEditadas.entries()].map(([agenteId, valores]) => ({
    semana: App.semanaMetas,
    agenteId,
    agenteNombre: nombrePorId[agenteId] || '',
    ...valores,
  }));

  try {
    const { guardadas, borradas } = await Store.guardarMetas(lista);
    App.metasEditadas.clear();
    await refrescarMetas();
    aviso(borradas
      ? `${guardadas} meta(s) guardada(s), ${borradas} eliminada(s).`
      : `${guardadas} meta(s) guardada(s).`);
  } catch (err) {
    aviso(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

/** Precarga la tabla con las metas de la semana anterior, sin guardar. */
async function copiarMetasSemanaAnterior() {
  const anterior = await Store.listarMetas({ semana: sumarDias(App.semanaMetas, -7) });
  if (!anterior.length) {
    return aviso('La semana anterior no tiene metas cargadas.', 'error');
  }

  const visibles = new Set(agentesDeLaLinea($('#m_linea').value).map(a => a.id));
  let copiadas = 0;

  anterior.forEach(m => {
    if (!visibles.has(m.agenteId)) return;
    App.metasEditadas.set(m.agenteId,
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

function iniciarContests() {
  $('#ct_estado').addEventListener('change', refrescarContests);
  $('#btnNuevoContest').addEventListener('click', () => abrirDlgContest(null));
  $('#btnAgregarRequisito').addEventListener('click', () => agregarFilaRequisito());

  $('#ct_alcanceTipo').addEventListener('change', e => {
    $('#ct_lineaZona').hidden     = e.target.value !== 'linea';
    $('#ct_seleccionZona').hidden = e.target.value !== 'seleccion';
  });

  $('#formContest').addEventListener('submit', guardarContestDesdeForm);
}

/** activo | proximo | finalizado | cancelado */
function estadoDeContest(c) {
  if (c.estatus === 'cancelado')  return 'cancelado';
  if (c.estatus === 'finalizado') return 'finalizado';
  const hoy = hoyISO();
  if (hoy < c.desde) return 'proximo';
  if (hoy > c.hasta) return 'finalizado';
  return 'activo';
}

const ETIQUETA_CONTEST = {
  activo: 'En curso', proximo: 'Por empezar',
  finalizado: 'Finalizado', cancelado: 'Cancelado',
};

/** Agentes que participan, según el alcance declarado. */
function participantesDe(c) {
  const activos = App.agentes.filter(a => a.activo !== false);

  if (c.alcanceTipo === 'seleccion') {
    const ids = new Set(c.alcanceIds || []);
    return App.agentes.filter(a => ids.has(a.id));
  }
  if (c.alcanceTipo === 'linea' && c.alcanceLinea) {
    const alcance = alcanceDe(c.alcanceLinea);
    return activos.filter(a => alcance.has(a.id) && a.rol === 'Agente');
  }
  return activos.filter(a => a.rol === 'Agente');
}

/**
 * Avance de un agente. Con "todos" el avance honesto es el requisito peor
 * parado, porque hasta que ese no se cumpla no hay premio; con "alguno",
 * el mejor.
 */
function progresoDe(c, agenteId, registros) {
  const suyos = registros.filter(
    r => r.agenteId === agenteId && r.fecha >= c.desde && r.fecha <= c.hasta);

  const detalles = (c.requisitos || []).map(req => {
    const campo = CAMPOS.find(x => x.key === req.campo);
    const real = suyos.reduce((t, r) => t + (Number(r[req.campo]) || 0), 0);
    const meta = Number(req.meta) || 0;
    return {
      campo, real, meta,
      ratio: meta > 0 ? real / meta : 1,
      cumplido: meta > 0 ? real >= meta : true,
    };
  });

  if (!detalles.length) return { ratio: 0, cumplido: false, detalles };

  const ratios = detalles.map(d => Math.min(d.ratio, 1));
  const ratio = c.combinacion === 'alguno' ? Math.max(...ratios) : Math.min(...ratios);
  const cumplido = c.combinacion === 'alguno'
    ? detalles.some(d => d.cumplido)
    : detalles.every(d => d.cumplido);

  return { ratio, cumplido, detalles };
}

/** "ALP ≥ 12,000.00 y Ventas ≥ 8" */
function textoRequisitos(c) {
  if (!c.requisitos || !c.requisitos.length) return 'Sin requisitos definidos';
  const union = c.combinacion === 'alguno' ? ' o ' : ' y ';
  return c.requisitos.map(r => {
    const campo = CAMPOS.find(x => x.key === r.campo);
    return `${campo ? campo.corto : r.campo} ≥ ${fmt(r.meta, campo ? campo.tipo : 'entero')}`;
  }).join(union);
}

async function refrescarContests() {
  const esAdmin = Sesion.esAdmin();
  $('#btnNuevoContest').hidden = !esAdmin;

  const todos = await Store.listarContests();
  revisarBackend();
  const filtro = $('#ct_estado').value;

  const visibles = todos.filter(c => {
    const e = estadoDeContest(c);
    if (filtro === 'activos')   return e === 'activo' || e === 'proximo';
    if (filtro === 'historico') return e === 'finalizado' || e === 'cancelado';
    return true;
  }).sort((a, b) => (b.desde < a.desde ? -1 : b.desde > a.desde ? 1 : 0));

  // Una sola consulta que cubra todos los rangos en pantalla
  let registros = [];
  if (visibles.length) {
    registros = await Store.listarRegistros({
      desde: visibles.reduce((m, c) => (c.desde < m ? c.desde : m), visibles[0].desde),
      hasta: visibles.reduce((m, c) => (c.hasta > m ? c.hasta : m), visibles[0].hasta),
    });
  }

  pintarContests(visibles, registros, esAdmin);
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

  const avances = participantes
    .map(a => ({ agente: a, ...progresoDe(c, a.id, registros) }))
    .sort((x, y) => (y.cumplido - x.cumplido) || (y.ratio - x.ratio));

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

  const listaAvance = el('div', { class: 'contest-lista' },
    avances.length
      ? avances.map(a => filaAvance(a, c))
      : [el('p', { class: 'vacio', text: 'Sin participantes en el alcance definido.' })]);

  const pie = el('div', { class: 'contest-pie' }, [
    el('span', {
      class: 'ayuda',
      text: `${cumplieron} de ${avances.length} cumplieron · ` +
            `Alcance: ${textoAlcance(c)}`,
    }),
    el('span', { class: 'contest-acc' }, [
      el('button', {
        class: 'btn-mini', type: 'button', text: 'Exportar CSV',
        onclick: () => exportarContestCSV(c, avances),
      }),
      esAdmin ? el('button', {
        class: 'btn-mini', type: 'button', text: 'Editar',
        onclick: () => abrirDlgContest(c),
      }) : null,
      esAdmin ? el('button', {
        class: 'btn-mini btn-mini--peligro', type: 'button', text: 'Eliminar',
        onclick: () => eliminarContest(c),
      }) : null,
    ].filter(Boolean)),
  ]);

  return el('article', { class: `tarjeta contest contest--${estado}` },
    [encabezado, meta, listaAvance, pie]);
}

function filaAvance({ agente, ratio, cumplido, detalles }, c) {
  const pct = Math.round(ratio * 100);

  return el('div', { class: 'avance' }, [
    el('span', { class: 'avance-nombre', text: agente.nombre }),
    el('span', { class: 'barra', role: 'img',
      'aria-label': `${pct}% de avance`,
    }, [
      el('span', {
        class: 'barra-relleno' + (cumplido ? ' barra-relleno--ok' : ''),
        style: `width:${Math.max(2, pct)}%`,
      }),
    ]),
    el('span', {
      class: 'avance-detalle',
      text: detalles.map(d =>
        `${d.campo ? d.campo.corto : '?'} ${fmt(d.real, d.campo ? d.campo.tipo : 'entero')}/${fmt(d.meta, d.campo ? d.campo.tipo : 'entero')}`
      ).join(' · '),
    }),
    el('span', {
      class: 'avance-estado ' + (cumplido ? 'avance-estado--ok' : ''),
      text: cumplido ? '✓ Cumplido' : `${pct}%`,
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

function exportarContestCSV(c, avances) {
  const cab = ['Contest', 'Desde', 'Hasta', 'Agente', 'Cumplió', 'Avance %'];
  (c.requisitos || []).forEach(r => {
    const campo = CAMPOS.find(x => x.key === r.campo);
    cab.push(`${campo ? campo.corto : r.campo} real`, `${campo ? campo.corto : r.campo} meta`);
  });

  const filas = avances.map(a => {
    const fila = [c.nombre, c.desde, c.hasta, a.agente.nombre,
                  a.cumplido ? 'Sí' : 'No', Math.round(a.ratio * 100)];
    a.detalles.forEach(d => fila.push(d.real, d.meta));
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

  const fila = el('div', { class: 'req-fila' }, [
    selCampo,
    el('input', {
      type: 'number', class: 'req-meta', min: '0', step: 'any',
      placeholder: 'Meta', inputmode: 'decimal',
      value: req ? req.meta : '',
    }),
    el('button', {
      class: 'btn-mini btn-mini--peligro', type: 'button', text: '✕',
      'aria-label': 'Quitar requisito',
      onclick: () => { fila.remove(); actualizarZonaCombinacion(); },
    }),
  ]);

  cont.appendChild(fila);
  actualizarZonaCombinacion();
}

/** La forma de combinar solo tiene sentido con más de un requisito. */
function actualizarZonaCombinacion() {
  $('#ct_combinacionZona').hidden = $$('#ct_requisitos .req-fila').length < 2;
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
  llenar('#ct_estatus', CONTEST_ESTATUS,     c ? (c.estatus || 'auto') : 'auto');

  $('#ct_combinacion').value = c ? (c.combinacion || 'todos') : 'todos';

  $('#ct_requisitos').innerHTML = '';
  (c && c.requisitos && c.requisitos.length ? c.requisitos : [null])
    .forEach(r => agregarFilaRequisito(r));

  llenarSelectLinea($('#ct_alcanceLinea'));
  $('#ct_alcanceLinea').value = c ? (c.alcanceLinea || '') : '';

  // Casillas de participantes para el alcance a mano
  const zona = $('#ct_alcanceIds');
  zona.innerHTML = '';
  const elegidos = new Set(c ? (c.alcanceIds || []) : []);
  App.agentes
    .filter(a => a.rol === 'Agente' && a.activo !== false)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    .forEach(a => {
      zona.appendChild(el('label', { class: 'check-item' }, [
        el('input', { type: 'checkbox', value: a.id, checked: elegidos.has(a.id) }),
        document.createTextNode(' ' + a.nombre),
      ]));
    });

  $('#ct_lineaZona').hidden     = $('#ct_alcanceTipo').value !== 'linea';
  $('#ct_seleccionZona').hidden = $('#ct_alcanceTipo').value !== 'seleccion';

  $('#dlgContest').showModal();
  $('#ct_nombre').focus();
}

async function guardarContestDesdeForm(e) {
  e.preventDefault();

  const requisitos = $$('#ct_requisitos .req-fila')
    .map(f => ({
      campo: f.querySelector('.req-campo').value,
      meta: nDecimal(f.querySelector('.req-meta').value),
    }))
    .filter(r => r.meta > 0);

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
    estatus: $('#ct_estatus').value,
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
  iniciarReportes();
  iniciarMetas();
  iniciarContests();
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
  } catch (err) {
    aviso('No se pudieron cargar los datos: ' + err.message, 'error');
  }
}

document.addEventListener('DOMContentLoaded', iniciar);
