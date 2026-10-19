import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/** El cliente del servidor. Lee y renueva la sesión desde las cookies. */
export async function clienteServidor() {
  const almacen = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => almacen.getAll(),
        setAll: (nuevas) => {
          try {
            nuevas.forEach(({ name, value, options }) => almacen.set(name, value, options))
          } catch {
            // Llamado desde un Server Component: el middleware ya refrescó
            // la sesión, así que esto se puede ignorar sin consecuencias.
          }
        },
      },
    },
  )
}
