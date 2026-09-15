// Envia el export a Supabase por la funcion de importacion de un solo uso,
// y luego compara lo que devuelve carga_inicial contra el export original.
const fs = require('fs');
const path = require('path');

const BASE  = 'https://xbcgwqyjwcwzfxujbxjk.supabase.co/rest/v1/rpc/';
const CLAVE = 'sb_publishable_ts8ueXg23IUL5aEYrkvMIA_zP5OLXqp';
const TOKEN = process.argv[2];
const DIR   = path.join(__dirname, 'export');
const leer  = n => JSON.parse(fs.readFileSync(path.join(DIR, n + '.json'), 'utf8'));

async function rpc(fn, cuerpo) {
  const t0 = performance.now();
  const r = await fetch(BASE + fn, {
    method: 'POST',
    headers: { apikey: CLAVE, 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo || {}),
  });
  const texto = await r.text();
  return { status: r.status, ms: Math.round(performance.now() - t0), json: JSON.parse(texto) };
}

// Postgres reordena las claves de los objetos JSON: se comparan en orden fijo.
const norm = v => Array.isArray(v) ? v.map(norm)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, norm(v[k])])) : v;
const orden = (arr, k) => [...arr].sort((a, b) => String(a[k]).localeCompare(String(b[k])));
function igual(nombre, a, b, campos) {
  const x = orden(a, 'id'), y = orden(b, 'id');
  if (x.length !== y.length) return `${nombre}: ${x.length} en la hoja vs ${y.length} en Supabase`;
  for (let i = 0; i < x.length; i++) {
    for (const c of campos) {
      const va = JSON.stringify(norm(x[i][c] ?? null)), vb = JSON.stringify(norm(y[i][c] ?? null));
      const numA = Number(x[i][c]), numB = Number(y[i][c]);
      // La hoja guarda como numero lo que parece numero (un premio "400"); la base, como texto.
      const mismosNumeros = (typeof x[i][c] === 'number' || typeof y[i][c] === 'number') && numA === numB;
      if (va !== vb && !mismosNumeros && !(c === 'nombre' && String(x[i][c]).trim() === y[i][c])) {
        return `${nombre} ${x[i].id}.${c}: hoja ${va} vs Supabase ${vb}`;
      }
    }
  }
  return null;
}

(async () => {
  const datos = { agentes: leer('agentes'), registros: leer('registros'),
                  metas: leer('metas'), contests: leer('contests') };

  const imp = await rpc('importar_datos', { p_datos: datos, p_token: TOKEN });
  console.log(`Importacion: HTTP ${imp.status} en ${imp.ms} ms ->`, JSON.stringify(imp.json));
  if (!imp.json.ok) process.exit(1);

  const otra = await rpc('importar_datos', { p_datos: datos, p_token: TOKEN });
  console.log('Reusar la clave de un solo uso:', JSON.stringify(otra.json));

  const tiempos = [];
  let carga;
  for (let i = 0; i < 5; i++) { carga = await rpc('carga_inicial'); tiempos.push(carga.ms); }
  console.log(`\ncarga_inicial x5: ${tiempos.join(', ')} ms  (${(JSON.stringify(carga.json).length / 1024).toFixed(0)} KB)`);

  const s = carga.json.data;
  const campos = {
    agentes: ['id', 'nombre', 'equipo', 'rol', 'reportaA', 'activo', 'creado'],
    registros: ['id', 'fecha', 'agenteId', 'agenteNombre', 'app', 'press', 'pressSale', 'pressNoSale',
                'callerCalls', 'noShow', 'noCalifica', 'reschedule', 'citaCedida', 'referidos', 'alp',
                'sinActividad', 'motivoSinActividad'],
    metas: ['id', 'semana', 'agenteId', 'agenteNombre', 'alp', 'app', 'referidos'],
    contests: ['id', 'nombre', 'desde', 'hasta', 'premioTipo', 'premio', 'requisitos', 'combinacion',
               'alcanceTipo', 'alcanceLinea', 'alcanceIds', 'estatus', 'ganadores', 'multimedia'],
  };
  console.log('\nComparacion campo por campo contra la hoja:');
  for (const t of Object.keys(campos)) {
    console.log(`  ${t.padEnd(10)} ${igual(t, datos[t], s[t], campos[t]) || 'identico'}`);
  }

  // Orden: la pagina toma los 10 primeros como "ultimos registros".
  const hojaTop = datos.registros.slice(0, 10).map(r => r.id).join(',');
  const supaTop = s.registros.slice(0, 10).map(r => r.id).join(',');
  console.log(`  orden de los 10 mas recientes: ${hojaTop === supaTop ? 'identico' : 'DISTINTO'}`);
  const ordenCompleto = datos.registros.map(r => r.id).join() === s.registros.map(r => r.id).join();
  console.log(`  orden de los ${s.registros.length} registros: ${ordenCompleto ? 'identico' : 'DISTINTO'}`);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
