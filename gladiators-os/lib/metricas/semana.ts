/**
 * La semana del negocio empieza el lunes, y una meta se identifica por el
 * lunes de su semana en formato YYYY-MM-DD. Es como funciona hoy y la
 * migración 005 lo impone con una restricción.
 */
export function lunesDe(fecha: string): string {
  const [a, m, d] = fecha.split('-').map(Number)
  const dia = new Date(Date.UTC(a!, m! - 1, d!))
  const dow = dia.getUTCDay()              // 0 = domingo
  const atras = dow === 0 ? 6 : dow - 1
  dia.setUTCDate(dia.getUTCDate() - atras)
  return dia.toISOString().slice(0, 10)
}

export function hoyISO(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
               'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export function enPalabras(fecha: string): string {
  const [a, m, d] = fecha.split('-').map(Number)
  const f = new Date(Date.UTC(a!, m! - 1, d!))
  const dia = DIAS[f.getUTCDay()]!
  return `${dia[0]!.toUpperCase()}${dia.slice(1)} ${d} de ${MESES[m! - 1]}`
}
