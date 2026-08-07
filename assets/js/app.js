/* =========================================================================
   app.js — Lógica de la aplicación
   ========================================================================= */

const App = {
  agentes: [],          // catálogo completo
  registrosStats: [],   // resultado del filtro actual en Estadísticas
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

      if (btn.dataset.panel === 'panel-estadisticas') refrescarStats();
      if (btn.dataset.panel === 'panel-agentes')      refrescarPanelAgentes();
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
    if ($('#panel-estadisticas').classList.contains('is-activa')) await refrescarStats();
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
   PANEL ESTADÍSTICAS Y REPORTES
   ========================================================================= */

function iniciarStats() {
  $('#s_hasta').value = hoyISO();
  $('#s_desde').value = sumarDias(hoyISO(), -29);

  $('#s_preset').addEventListener('change', e => {
    const v = e.target.value;
    if (v === 'custom') return;
    $('#s_hasta').value = hoyISO();
    $('#s_desde').value = v === 'mes'
      ? hoyISO().slice(0, 8) + '01'
      : sumarDias(hoyISO(), -(parseInt(v, 10) - 1));
    refrescarStats();
  });

  ['#s_desde', '#s_hasta'].forEach(sel => {
    $(sel).addEventListener('change', () => {
      $('#s_preset').value = 'custom';
      refrescarStats();
    });
  });

  $('#s_agente').addEventListener('change', refrescarStats);
  $('#btnImprimir').addEventListener('click', () => window.print());
  $('#btnCSV').addEventListener('click', exportarCSV);

  // Las gráficas se redibujan al cambiar de tema (los colores no son CSS).
  Charts.alCambiarTema(() => {
    if ($('#panel-estadisticas').classList.contains('is-activa')) pintarGraficas();
  });
}

async function refrescarStats() {
  const desde    = $('#s_desde').value;
  const hasta    = $('#s_hasta').value;
  const agenteId = $('#s_agente').value;

  if (desde && hasta && desde > hasta) {
    aviso('La fecha "Desde" no puede ser posterior a "Hasta".', 'error');
    return;
  }

  App.registrosStats = await Store.listarRegistros({ desde, hasta, agenteId });

  pintarKPIs();
  pintarGraficas();
  pintarTasas();
  pintarReporte();
  pintarDetalle();

  const nombreAg = agenteId
    ? (App.agentes.find(a => a.id === agenteId)?.nombre || 'agente')
    : 'todos los agentes';
  $('#reporteSub').textContent =
    `${fechaCorta(desde)} — ${fechaCorta(hasta)} · ${nombreAg} · ` +
    `${App.registrosStats.length} registro(s)`;
}

/** Suma una métrica sobre un conjunto de registros. */
const suma = (regs, key) => regs.reduce((t, r) => t + (Number(r[key]) || 0), 0);

function pintarKPIs() {
  const cont = $('#kpis');
  cont.innerHTML = '';
  const regs = App.registrosStats;
  const dias = new Set(regs.map(r => r.fecha)).size || 1;

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
  const filas = agruparPorAgente(App.registrosStats).sort((a, b) => b.alp - a.alp);

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
      el('td', { class: 'num', text: new Set(App.registrosStats.map(r => r.fecha)).size }),
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
  const regs = App.registrosStats;

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
  const regs = App.registrosStats;
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
    download: `seguimiento_${$('#s_desde').value}_a_${$('#s_hasta').value}.csv`,
  });
  document.body.appendChild(a);
  a.click();
  a.remove();
  aviso('CSV descargado.');
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
      // Con sesión abierta se puede corregir cualquier fecha: repintar tablas.
      await pintarRecientes();
      aviso('Sesión de administrador iniciada. Ya puedes corregir cualquier fecha.');
    } catch (err) {
      aviso(err.message, 'error');
    }
  });

  $('#btnSalirAdmin').addEventListener('click', async () => {
    Sesion.salir();
    await refrescarPanelAgentes();
    await pintarRecientes();
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
    const id     = $('#ag_id').value;
    const nombre = $('#ag_nombre').value.trim();
    const equipo = $('#ag_equipo').value.trim();
    const activo = $('#ag_activo').checked;

    if (!nombre) return aviso('El nombre del agente es obligatorio.', 'error');

    try {
      if (id) {
        await Store.actualizarAgente(id, { nombre, equipo, activo });
        aviso('Agente actualizado.');
      } else {
        await Store.crearAgente({ nombre, equipo, activo });
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
  $('#dlgAgente').showModal();
  $('#ag_nombre').focus();
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
      el('th', { text: 'Equipo' }),
      el('th', { text: 'Estado' }),
      el('th', { class: 'num', text: 'Registros' }),
      el('th', { class: 'acc', text: 'Acciones' }),
    ]),
  ]));

  const filas = [...App.agentes].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  tabla.appendChild(el('tbody', {}, filas.map(a =>
    el('tr', {}, [
      el('td', { text: a.nombre }),
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

async function eliminarAgente(agente, numRegistros) {
  const ok = await confirmar({
    titulo: `Eliminar a ${agente.nombre}`,
    texto: numRegistros
      ? `Este agente tiene ${numRegistros} registro(s) históricos. Si no marcas la casilla, los registros se conservan para las estadísticas y solo se elimina al agente del catálogo.`
      : 'El agente se eliminará del catálogo. No tiene registros históricos.',
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
  App.agentes = await Store.listarAgentes();
  llenarSelectAgentes($('#f_agente'), { soloActivos: true });
  llenarSelectAgentes($('#s_agente'), { soloActivos: false, incluirTodos: true });
}

async function iniciar() {
  iniciarTema();
  iniciarPestanas();
  iniciarFormRegistro();
  iniciarStats();
  iniciarAgentes();

  $('#marcaEquipo').textContent = CONFIG.EQUIPO;
  $('#pastillaModo').hidden = !Store.esDemo;
  $('#pieModo').textContent = Store.esDemo
    ? 'Modo de prueba — los datos se guardan solo en este navegador. Cambia CONFIG.MODO a "sheets" en assets/js/config.js para conectar Google Sheets.'
    : 'Conectado a Google Sheets.';

  try {
    await cargarAgentes();
    await pintarRecientes();
  } catch (err) {
    aviso('No se pudieron cargar los datos: ' + err.message, 'error');
  }
}

document.addEventListener('DOMContentLoaded', iniciar);
