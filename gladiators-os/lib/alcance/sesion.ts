import { redirect } from 'next/navigation'
import { clienteServidor } from '@/lib/supabase/servidor'
import type { Perfil } from '@/lib/supabase/tipos'

/**
 * El perfil de quien tiene la sesión abierta.
 *
 * Esto NO es el control de acceso: el control vive en las políticas RLS de
 * la base de datos. Esto decide qué se dibuja. Esconder un botón no es un
 * permiso, y una consulta que se salte esta función igual choca contra RLS.
 */
export async function perfilActual(): Promise<Perfil | null> {
  const sb = await clienteServidor()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null

  const { data } = await sb.from('profiles').select('*').eq('id', user.id).single()
  return (data as Perfil | null) ?? null
}

/** Exige sesión. Sin ella, a la entrada. */
export async function exigirSesion(): Promise<Perfil> {
  const perfil = await perfilActual()
  if (!perfil) redirect('/entrar')
  return perfil
}

/**
 * Exige una cuenta activa. D-06: todo usuario nace inactivo y espera a que
 * un administrador lo active y le asigne su rango, así que esta es la
 * puerta por la que pasa todo el mundo el primer día.
 */
export async function exigirCuentaActiva(): Promise<Perfil> {
  const perfil = await exigirSesion()
  if (!perfil.is_active) redirect('/pendiente')
  return perfil
}

export async function exigirAdmin(): Promise<Perfil> {
  const perfil = await exigirCuentaActiva()
  if (!perfil.is_admin) redirect('/inicio')
  return perfil
}

/** Tiene gente colgando: por eso ve más, no por su rango. */
export async function dirigeLinea(perfilId: string): Promise<boolean> {
  const sb = await clienteServidor()
  const { count } = await sb
    .from('hierarchy')
    .select('id', { count: 'exact', head: true })
    .eq('reports_to', perfilId)
    .is('valid_to', null)
  return (count ?? 0) > 0
}
