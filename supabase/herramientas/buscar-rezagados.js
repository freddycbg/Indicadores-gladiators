// Despues del corte: busca en la hoja lo que se guardo DESPUES de la copia
// final (agentes que aun tenian abierta la pagina vieja, que GitHub Pages
// sirve desde cache hasta 10 minutos). Solo lee y reporta; no escribe nada.
//
// Uso: node buscar-rezagados.js
// Compara la hoja actual contra export/*.json, que es lo que se importo.
const fs = require('fs');
const path = require('path');
const URL = 'https://script.google.com/macros/s/AKfycbyGxRYz0zPpC1jU_swbRWTUtxO_SJnAwEEWPQWTYCIuN6Z3fu-4rG27Y9UTrZqTw0Hu/exec';
const DIR = path.join(__dirname, 'export');

async function leer(accion) {
  for (let i = 1; i <= 10; i++) {
    try {
      const ctl = new AbortController();
      const reloj = setTimeout(() => ctl.abort(), 30000);
      const r = await fetch(URL, { method: 'POST', signal: ctl.signal,
        headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ accion }) });
      const j = JSON.parse(await r.text());
      clearTimeout(reloj);
      if (j.ok && Array.isArray(j.data)) return j.data;
      throw new Error(j.error || 'respuesta inesperada');
    } catch (e) {
      await new Promise(r => setTimeout(r, 2000 * i));
    }
  }
  throw new Error('No se pudo leer ' + accion);
}

const norm = v => Array.isArray(v) ? v.map(norm)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, norm(v[k])])) : v;
const huella = o => JSON.stringify(norm(o));

(async () => {
  const informe = {};
  for (const [tabla, accion] of [['agentes', 'listarAgentes'], ['registros', 'listarRegistros'],
                                 ['metas', 'listarMetas'], ['contests', 'listarContests']]) {
    const antes = JSON.parse(fs.readFileSync(path.join(DIR, tabla + '.json'), 'utf8'));
    const ahora = await leer(accion);
    const porId = new Map(antes.map(x => [x.id, huella(x)]));
    const idsAhora = new Set(ahora.map(x => x.id));
    informe[tabla] = {
      nuevos:      ahora.filter(x => !porId.has(x.id)),
      cambiados:   ahora.filter(x => porId.has(x.id) && porId.get(x.id) !== huella(x)),
      eliminados:  antes.filter(x => !idsAhora.has(x.id)).map(x => x.id),
    };
  }

  const salida = path.join(DIR, 'rezagados.json');
  fs.writeFileSync(salida, JSON.stringify(informe, null, 1));

  let total = 0;
  console.log('Cambios en la hoja despues de la copia final:');
  for (const [t, r] of Object.entries(informe)) {
    const n = r.nuevos.length + r.cambiados.length + r.eliminados.length;
    total += n;
    console.log(`  ${t.padEnd(10)} nuevos ${r.nuevos.length} · cambiados ${r.cambiados.length} · eliminados ${r.eliminados.length}`);
    for (const x of [...r.nuevos, ...r.cambiados]) {
      if (t === 'registros') console.log(`     - ${x.fecha} ${x.agenteNombre}: APP ${x.app}, ALP ${x.alp}`);
    }
  }
  console.log(total ? `\nHAY ${total} CAMBIO(S) POR RESCATAR. Detalle en ${salida}` : '\nNada que rescatar: la hoja no cambio despues de la copia.');
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
