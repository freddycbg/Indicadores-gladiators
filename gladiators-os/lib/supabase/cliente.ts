'use client'

import { createBrowserClient } from '@supabase/ssr'

/**
 * El cliente del navegador. Solo lleva la URL y la clave publicable.
 *
 * Esa clave no es un secreto: no da acceso a nada que las políticas RLS no
 * permitan. La clave de servicio NUNCA aparece aquí — se salta RLS entera.
 */
export function clienteNavegador() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
