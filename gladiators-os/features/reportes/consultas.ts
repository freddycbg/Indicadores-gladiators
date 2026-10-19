import { clienteServidor } from '@/lib/supabase/servidor'
import { lunesDe } from '@/lib/metricas/semana'
import type { ReporteDiario } from '@/lib/supabase/tipos'

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
