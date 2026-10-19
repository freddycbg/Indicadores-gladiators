import { clienteServidor } from '@/lib/supabase/servidor'
import type { Recluta } from '@/lib/supabase/tipos'

/**
 * Los candidatos que una persona puede ver. RLS decide el alcance; aquí
 * solo se ordena por lo que importa: primero quien pidió que lo llamen ya,
 * y dentro de eso, el más viejo sin mover.
 */
export async function candidatosDe(perfilId: string, limite?: number) {
  const sb = await clienteServidor()
  let q = sb.from('recruits').select('*')
    .eq('is_active', true)
    .eq('referred_by', perfilId)
    .order('urgency', { ascending: true })   // 'Llamar de inmediato' primero
    .order('referred_on', { ascending: true })
  if (limite) q = q.limit(limite)
  const { data } = await q
  return (data ?? []) as Recluta[]
}

/** Todo el alcance, no solo lo propio. Para la pantalla de reclutamiento. */
export async function candidatosDelAlcance(limite = 200) {
  const sb = await clienteServidor()
  const { data } = await sb.from('recruits')
    .select('*, referente:profiles!recruits_referred_by_fkey(full_name)')
    .eq('is_active', true)
    .order('urgency', { ascending: true })
    .order('referred_on', { ascending: true })
    .limit(limite)
  return data ?? []
}

/**
 * Los candidatos estancados: sin cambio de etapa en N días y todavía en
 * juego. El agente los quiere de LOS SUYOS — ahí es donde se vuelve una
 * llamada y no un dato.
 */
export async function estancados(perfilId: string | null, dias = 10) {
  const sb = await clienteServidor()
  const corte = new Date(Date.now() - dias * 86_400_000).toISOString()
  let q = sb.from('recruits').select('id, first_name, last_name, stage, updated_at')
    .eq('is_active', true)
    .not('stage', 'in', '("Examen aprobado","Examen reprobado")')
    .lt('updated_at', corte)
  if (perfilId) q = q.eq('referred_by', perfilId)
  const { data } = await q
  return data ?? []
}
