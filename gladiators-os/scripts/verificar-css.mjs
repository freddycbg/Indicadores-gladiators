import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Comprueba que Tailwind corrió de verdad.
 *
 * Existe por un fallo que costó encontrar: con Turbopack el build PASA,
 * sin errores y con todas las rutas listadas, pero el plugin de PostCSS no
 * se ejecuta y el CSS sale sin una sola utilidad. La aplicación arranca y
 * se ve como un documento sin estilos. Un build verde no es prueba de
 * nada si no se mira lo que produjo.
 */
const DIR = '.next/static/css'
const SENTINELAS = ['--color-oro', '--text-t7', '--height-lg', '.bg-grafito', '.rounded-surface']

let css = ''
try {
  for (const f of readdirSync(DIR)) if (f.endsWith('.css')) css += readFileSync(join(DIR, f), 'utf8')
} catch {
  console.error('✗ No hay CSS compilado en ' + DIR + '. ¿Corriste el build?')
  process.exit(1)
}

const faltan = SENTINELAS.filter((s) => !css.includes(s))
if (faltan.length) {
  console.error('✗ Tailwind no generó el sistema de diseño. Falta: ' + faltan.join(', '))
  console.error('  Revisa que el build use --webpack: con Turbopack el plugin no corre.')
  process.exit(1)
}
console.log(`✓ Tailwind generó el sistema (${(css.length / 1024).toFixed(1)} kB, ${SENTINELAS.length} sentinelas presentes)`)
