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
