/* =========================================================================
   util.js — Utilidades compartidas
   ========================================================================= */

/* ---------- Fechas (siempre en formato YYYY-MM-DD, sin zona horaria) ---- */

function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Suma (o resta) días a una fecha ISO y devuelve otra fecha ISO. */
function sumarDias(iso, dias) {
  const [a, m, d] = iso.split('-').map(Number);
  const f = new Date(a, m - 1, d);
  f.setDate(f.getDate() + dias);
  return `${f.getFullYear()}-${pad2(f.getMonth() + 1)}-${pad2(f.getDate())}`;
}

/** "2026-08-07" → "07/08/2026" */
function fechaCorta(iso) {
  if (!iso) return '';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

/** "2026-08-07" → "vie 07 ago" */
function fechaEtiqueta(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  const f = new Date(a, m - 1, d);
  const dias = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${dias[f.getDay()]} ${pad2(d)} ${meses[m - 1]}`;
}

/* ---------- Semanas (siempre de lunes a domingo) ------------------------ */

/** Lunes de la semana a la que pertenece una fecha ISO. */
function lunesDeLaSemana(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  const f = new Date(a, m - 1, d);
  const diaLunes0 = (f.getDay() + 6) % 7;      // 0 = lunes … 6 = domingo
  f.setDate(f.getDate() - diaLunes0);
  return `${f.getFullYear()}-${pad2(f.getMonth() + 1)}-${pad2(f.getDate())}`;
}

/** Lunes de la semana en curso. */
function semanaActual() {
  return lunesDeLaSemana(hoyISO());
}

/** Domingo que cierra la semana que empieza en ese lunes. */
function domingoDeLaSemana(lunesISO) {
  return sumarDias(lunesISO, 6);
}

/** "2026-08-03" → "3 – 9 ago 2026"  ·  cruzando mes → "27 jul – 2 ago 2026" */
function etiquetaSemana(lunesISO) {
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun',
                 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const dom = domingoDeLaSemana(lunesISO);
  const [aL, mL, dL] = lunesISO.split('-').map(Number);
  const [aD, mD, dD] = dom.split('-').map(Number);

  if (mL === mD && aL === aD) return `${dL} – ${dD} ${meses[mD - 1]} ${aD}`;
  if (aL === aD)              return `${dL} ${meses[mL - 1]} – ${dD} ${meses[mD - 1]} ${aD}`;
  return `${dL} ${meses[mL - 1]} ${aL} – ${dD} ${meses[mD - 1]} ${aD}`;
}

/** Texto relativo: "Semana actual", "Semana pasada", o vacío. */
function relativoSemana(lunesISO) {
  const actual = semanaActual();
  if (lunesISO === actual)                  return 'Semana actual';
  if (lunesISO === sumarDias(actual, -7))   return 'Semana pasada';
  if (lunesISO === sumarDias(actual, 7))    return 'Próxima semana';
  return '';
}

/* ---------- Rangos de fecha --------------------------------------------- */

/** Primer día del mes de una fecha ISO. */
function inicioDeMes(iso) {
  return iso.slice(0, 8) + '01';
}

/** Último día del mes de una fecha ISO. */
function finDeMes(iso) {
  const [a, m] = iso.split('-').map(Number);
  return `${a}-${pad2(m)}-${pad2(new Date(a, m, 0).getDate())}`;
}

/**
 * Traduce un preset a { desde, hasta }. Devuelve null para 'custom', que
 * deja las dos fechas como estén.
 */
function rangoDePreset(key) {
  const hoy = hoyISO();

  switch (key) {
    case 'hoy':          return { desde: hoy, hasta: hoy };
    case 'ayer': {
      const a = sumarDias(hoy, -1);
      return { desde: a, hasta: a };
    }
    case 'semana': {
      const l = semanaActual();
      return { desde: l, hasta: hoy < domingoDeLaSemana(l) ? hoy : domingoDeLaSemana(l) };
    }
    case 'semanaPasada': {
      const l = sumarDias(semanaActual(), -7);
      return { desde: l, hasta: domingoDeLaSemana(l) };
    }
    case 'mes':          return { desde: inicioDeMes(hoy), hasta: hoy };
    case 'mesPasado': {
      const finAnterior = sumarDias(inicioDeMes(hoy), -1);
      return { desde: inicioDeMes(finAnterior), hasta: finAnterior };
    }
    case 'anio':         return { desde: hoy.slice(0, 4) + '-01-01', hasta: hoy };
    case 'custom':       return null;
    default: {
      const dias = parseInt(key, 10);
      if (!Number.isFinite(dias)) return null;
      return { desde: sumarDias(hoy, -(dias - 1)), hasta: hoy };
    }
  }
}

/** Día de la semana de una fecha ISO: 0 = domingo … 6 = sábado. */
function diaDeLaSemana(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d).getDay();
}

/** ¿Es jornada esperada según DIAS_HABILES? */
function esDiaHabil(iso) {
  return DIAS_HABILES.includes(diaDeLaSemana(iso));
}

/**
 * Cuántos días hábiles hay en un rango, inclusive. Es el denominador de
 * la constancia: días con reporte ÷ días hábiles del período.
 */
function diasHabilesDelRango(desde, hasta) {
  if (!desde || !hasta || desde > hasta) return 0;
  return rangoFechas(desde, hasta).filter(esDiaHabil).length;
}

/**
 * Último día hábil ya cerrado, según HORA_CORTE_REPORTE. Pasada esa hora
 * el día de hoy cuenta; antes, el hábil anterior.
 */
function ultimoDiaCerrado(ahora = new Date()) {
  const hoy = hoyISO();
  if (ahora.getHours() >= HORA_CORTE_REPORTE && esDiaHabil(hoy)) return hoy;

  let d = sumarDias(hoy, -1);
  let guarda = 0;
  while (!esDiaHabil(d) && guarda++ < 14) d = sumarDias(d, -1);
  return d;
}

/** ¿Ya pasó la hora de corte de hoy? */
function pasoElCorte(ahora = new Date()) {
  return ahora.getHours() >= HORA_CORTE_REPORTE;
}

/** "22:00" */
function horaCorteTexto() {
  return `${pad2(HORA_CORTE_REPORTE)}:00`;
}

/** Días que abarca un rango, inclusive. */
function diasDelRango(desde, hasta) {
  if (!desde || !hasta) return 0;
  return Math.max(0, diasDesde(desde) - diasDesde(hasta)) + 1;
}

/** Resta meses a una fecha ISO conservando el día, o el último del mes. */
function restarMeses(iso, meses) {
  const [a, m, d] = iso.split('-').map(Number);
  const destino = new Date(a, m - 1 - meses, 1);
  const ultimo = new Date(destino.getFullYear(), destino.getMonth() + 1, 0).getDate();
  return `${destino.getFullYear()}-${pad2(destino.getMonth() + 1)}-${pad2(Math.min(d, ultimo))}`;
}

/**
 * Periodo comparable inmediatamente anterior.
 *
 * No se resta la duración a secas: para una semana en curso de lunes a
 * jueves, lo justo es lunes a jueves de la semana pasada, no jueves a
 * domingo. Por eso las semanas se desplazan siete días y los meses un mes.
 */
function periodoAnterior(preset, rango) {
  switch (preset) {
    case 'hoy':
    case 'ayer':
      return { desde: sumarDias(rango.desde, -1), hasta: sumarDias(rango.hasta, -1) };

    case 'semana':
    case 'semanaPasada':
      return { desde: sumarDias(rango.desde, -7), hasta: sumarDias(rango.hasta, -7) };

    case 'mes':
    case 'mesPasado':
      return { desde: restarMeses(rango.desde, 1), hasta: restarMeses(rango.hasta, 1) };

    default: {
      // Cualquier otro rango: la misma cantidad de días, justo antes
      const largo = diasDelRango(rango.desde, rango.hasta);
      return { desde: sumarDias(rango.desde, -largo), hasta: sumarDias(rango.desde, -1) };
    }
  }
}

/** Días transcurridos entre una fecha ISO y hoy. Negativo si es futura. */
function diasDesde(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  const f = new Date(a, m - 1, d);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.round((hoy - f) / 86400000);
}

/** Lista de fechas ISO entre dos límites, inclusive. */
function rangoFechas(desde, hasta) {
  const out = [];
  let cur = desde;
  let guard = 0;
  while (cur <= hasta && guard++ < 800) {
    out.push(cur);
    cur = sumarDias(cur, 1);
  }
  return out;
}

/* ---------- Números ----------------------------------------------------- */

function nEntero(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

function nDecimal(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/** Formatea según el tipo declarado en CAMPOS. */
function fmt(valor, tipo) {
  const n = Number(valor) || 0;
  if (tipo === 'moneda') {
    return n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return n.toLocaleString('es-GT');
}

/** Promedios: un decimal para conteos, dos para moneda. */
function fmtPromedio(valor, tipo) {
  const n = Number(valor) || 0;
  if (tipo === 'moneda') return fmt(n, 'moneda');
  return n.toLocaleString('es-GT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** Compacta números grandes para ejes y KPIs: 12500 → "12.5k" */
function fmtCompacto(n) {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (Math.abs(v) >= 1e4) return (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
  return v.toLocaleString('es-GT', { maximumFractionDigits: 0 });
}

function porcentaje(parte, total) {
  if (!total) return '—';
  return ((parte / total) * 100).toFixed(1) + '%';
}

/* ---------- DOM --------------------------------------------------------- */

const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

function el(tag, attrs = {}, hijos = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const h of [].concat(hijos)) {
    if (h == null) continue;
    n.appendChild(typeof h === 'string' ? document.createTextNode(h) : h);
  }
  return n;
}

/** Escapa texto para insertar de forma segura en HTML. */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* ---------- Avisos ------------------------------------------------------ */

let _avisoTimer = null;

/** tipo: 'ok' | 'error' | 'info' */
function aviso(mensaje, tipo = 'ok') {
  const zona = $('#aviso');
  zona.className = `aviso aviso--${tipo} is-visible`;
  zona.textContent = mensaje;
  clearTimeout(_avisoTimer);
  _avisoTimer = setTimeout(() => zona.classList.remove('is-visible'), 4000);
}

/* ---------- Identificadores --------------------------------------------- */

function nuevoId() {
  return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
