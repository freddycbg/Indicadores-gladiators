import { clienteServidor } from '@/lib/supabase/servidor'
import { lunesDe } from '@/lib/metricas/semana'
import { sumar, type Totales } from '@/lib/metricas/metricas'
import type { ReporteDiario } from '@/lib/supabase/tipos'

/**
 * Las once columnas, escritas literales.
 *
 * Construirlas con un `.join()` sobre INDICADORES parecía más limpio, pero
 * deja la cadena como `string` y el cliente de Supabase pierde la
 * inferencia: todo vuelve como error genérico. Literal se puede buscar y
 * se puede tipar. Si cambian los once, cambia aquí y en metricas.ts, y el
 * compilador avisa porque los tipos dejan de cuadrar.
 */
const METRICAS_SQL =
  'app, press, press_sale, press_no_sale, caller_calls, no_show, ' +
  'no_califica, reschedule, cita_cedida, referidos, alp'

/** El reporte de un día. RLS decide si se puede ver; aquí solo se pide. */
export async function reporteDelDia(perfilId: string, fecha: string) {
  const sb = await clienteServidor()
  const { data } = await sb.from('daily_reports').select('*')
    .eq('profile_id', perfilId).eq('work_date', fecha).maybeSingle()
  return (data as ReporteDiario | null) ?? null
}

/**
 * ALP acumulado de la semana, SIN el día que se está capturando.
 *
 * Solo cuenta lo aprobado: el brief es explícito en que los registros
 * pendientes no se mezclan en silencio con los resultados oficiales.
 */
export async function alpDeLaSemana(perfilId: string, fecha: string, excluyendo: string) {
  const sb = await clienteServidor()
  const lunes = lunesDe(fecha)
  const { data } = await sb.from('daily_reports').select('alp, work_date')
    .eq('profile_id', perfilId).eq('status', 'aprobado')
    .gte('work_date', lunes).lte('work_date', fecha)
  return (data ?? [])
    .filter((r) => r.work_date !== excluyendo)
    .reduce((t, r) => t + Number(r.alp), 0)
}

/** Meta de ALP de la semana. Una fila con semana nula es la meta base. */
export async function metaDeLaSemana(perfilId: string, fecha: string): Promise<number | null> {
  const sb = await clienteServidor()
  const lunes = lunesDe(fecha)
  const { data } = await sb.from('goals').select('target, week_start')
    .eq('profile_id', perfilId).eq('metric', 'alp')
    .or(`week_start.eq.${lunes},week_start.is.null`)
  if (!data?.length) return null
  const exacta = data.find((g) => g.week_start === lunes)
  return Number((exacta ?? data[0])!.target)
}

/**
 * Los totales de un periodo para una persona.
 *
 * Solo cuenta lo APROBADO. El brief es explícito: los registros pendientes
 * no se mezclan en silencio con los resultados oficiales. Devuelve además
 * cuántos quedaron fuera por estar pendientes, para poder decirlo en
 * pantalla en vez de que el número salga más bajo sin explicación.
 */
export async function totalesDe(perfilId: string, desde: string, hasta: string) {
  const sb = await clienteServidor()
  const { data } = await sb
    .from('daily_reports')
    .select(`${METRICAS_SQL}, status, work_date`)
    .eq('profile_id', perfilId)
    .gte('work_date', desde)
    .lte('work_date', hasta)

  const filas = (data ?? []) as unknown as (Totales & { status: string })[]
  const aprobados = filas.filter((r) => r.status === 'aprobado')
  const pendientes = filas.filter((r) => r.status === 'pendiente').length

  return {
    totales: sumar(aprobados),
    diasConReporte: aprobados.length,
    pendientes,
  }
}

/**
 * Los reportes que esperan revisión dentro del alcance de quien pregunta.
 *
 * No filtra por alcance aquí: lo hace RLS. Si esta consulta se escribiera
 * mal, devolvería de menos, nunca de más.
 */
export async function pendientesDeRevisar(miId: string) {
  const sb = await clienteServidor()
  const { data } = await sb
    .from('daily_reports')
    .select(`${METRICAS_SQL}, id, work_date, status, comentario, profiles!inner(id, full_name, role)`)
    .eq('status', 'pendiente')
    .neq('profile_id', miId)          // nadie se revisa a sí mismo
    .order('work_date', { ascending: true })
    .limit(50)
  return data ?? []
}

/**
 * Quién no ha cerrado el último día YA CERRADO.
 *
 * La hora de corte importa: antes de ella no significa nada decir que
 * nadie reportó, porque a las nueve de la mañana faltan todos.
 */
export async function sinReportar(fechaCerrada: string) {
  const sb = await clienteServidor()
  const [{ data: gente }, { data: conReporte }] = await Promise.all([
    sb.from('profiles').select('id, full_name, role').eq('is_active', true),
    sb.from('daily_reports').select('profile_id').eq('work_date', fechaCerrada),
  ])
  const reportaron = new Set((conReporte ?? []).map((r) => r.profile_id))
  const todos = gente ?? []
  return {
    faltan: todos.filter((p) => !reportaron.has(p.id)),
    total: todos.length,
  }
}
