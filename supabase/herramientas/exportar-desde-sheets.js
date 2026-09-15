// Baja todos los datos del Apps Script en produccion (solo lecturas) y
// revisa que cumplan las reglas de la base nueva antes de importarlos.
const fs = require('fs');
const path = require('path');
const URL = 'https://script.google.com/macros/s/AKfycbyGxRYz0zPpC1jU_swbRWTUtxO_SJnAwEEWPQWTYCIuN6Z3fu-4rG27Y9UTrZqTw0Hu/exec';
const SALIDA = path.join(__dirname, 'export');

async function leer(accion) {
  for (let i = 1; i <= 8; i++) {
    try {
      const ctl = new AbortController();
      const reloj = setTimeout(() => ctl.abort(), 30000);
      const r = await fetch(URL, { method: 'POST', signal: ctl.signal,
        headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ accion }) });
      const texto = await r.text();
      clearTimeout(reloj);
      const j = JSON.parse(texto);
      if (!j.ok) throw new Error('app: ' + j.error);
      if (!Array.isArray(j.data)) throw new Error('respuesta sin lista: ' + String(j.data).slice(0, 60));
      console.log(`  ${accion}: ${j.data.length} filas (intento ${i})`);
      return j.data;
    } catch (e) {
      console.log(`  ${accion}: intento ${i} fallo — ${e.message.slice(0, 80)}`);
      await new Promise(r => setTimeout(r, 1500 * i));
    }
  }
  throw new Error('No se pudo leer ' + accion);
}

const ROLES = ['Agente', 'SA', 'GA', 'MGA', 'RGA'];
const problemas = [];

(async () => {
  console.log('Bajando datos...');
  const agentes   = await leer('listarAgentes');
  const registros = await leer('listarRegistros');
  const metas     = await leer('listarMetas');
  const contests  = await leer('listarContests');

  // ---- Agentes
  const nombres = new Map();
  for (const a of agentes) {
    const k = String(a.nombre).trim().toLowerCase();
    if (nombres.has(k)) problemas.push(`Agente con nombre repetido: "${a.nombre}" (${nombres.get(k)} y ${a.id})`);
    nombres.set(k, a.id);
    if (!ROLES.includes(a.rol || 'Agente')) problemas.push(`Agente ${a.nombre}: rol desconocido "${a.rol}"`);
    if (!String(a.id).trim()) problemas.push(`Agente sin id: ${a.nombre}`);
  }
  const idsAgentes = new Set(agentes.map(a => a.id));
  for (const a of agentes) {
    if (a.reportaA && !idsAgentes.has(a.reportaA)) problemas.push(`Agente ${a.nombre} reporta a un id que no existe (${a.reportaA})`);
  }

  // ---- Registros
  const dias = new Map();
  const ids = new Set();
  let sinAgente = 0, decimales = 0;
  const CAMPOS = ['app','press','pressSale','pressNoSale','callerCalls','noShow','noCalifica','reschedule','citaCedida','referidos'];
  registros.forEach((r, i) => {
    const k = r.fecha + '|' + r.agenteId;
    if (dias.has(k)) problemas.push(`Registro duplicado: ${r.agenteNombre} el ${r.fecha} (ids ${dias.get(k)} y ${r.id})`);
    dias.set(k, r.id);
    if (ids.has(r.id)) problemas.push(`Id de registro repetido: ${r.id}`);
    ids.add(r.id);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.fecha)) problemas.push(`Registro ${r.id} con fecha invalida "${r.fecha}"`);
    if (!idsAgentes.has(r.agenteId)) sinAgente++;
    for (const c of CAMPOS) if (!Number.isInteger(Number(r[c]))) decimales++;
  });

  // ---- Metas
  const semanas = new Set();
  for (const m of metas) {
    const k = m.semana + '|' + m.agenteId;
    if (semanas.has(k)) problemas.push(`Meta duplicada: ${m.agenteNombre} semana ${m.semana}`);
    semanas.add(k);
  }

  // ---- Contests
  for (const c of contests) {
    if (c.desde && c.hasta && c.desde > c.hasta) problemas.push(`Contest "${c.nombre}" con fechas al reves`);
    if (!String(c.nombre).trim()) problemas.push(`Contest sin nombre: ${c.id}`);
  }

  fs.mkdirSync(SALIDA, { recursive: true });
  for (const [n, d] of Object.entries({ agentes, registros, metas, contests })) {
    fs.writeFileSync(path.join(SALIDA, n + '.json'), JSON.stringify(d));
  }

  const fechas = registros.map(r => r.fecha).sort();
  console.log('\nResumen:');
  console.log(`  agentes ${agentes.length} · registros ${registros.length} (${fechas[0]} a ${fechas[fechas.length-1]}) · metas ${metas.length} · contests ${contests.length}`);
  console.log(`  registros de agentes ya eliminados del catalogo: ${sinAgente}`);
  console.log(`  valores con decimales en campos de conteo: ${decimales}`);
  console.log(problemas.length ? `\nPROBLEMAS (${problemas.length}):\n  - ` + problemas.join('\n  - ') : '\nSin problemas: todo cumple las reglas de la base nueva.');
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
