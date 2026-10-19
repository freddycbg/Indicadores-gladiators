import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
* Refresca la sesión en cada petición y manda a la entrada a quien no la
 * tenga. Es comodidad de navegación, no seguridad: la seguridad son las
 * políticas RLS. Si este archivo desapareciera, nadie vería un dato ajeno;
 * solo vería pantallas vacías en vez de la pantalla de entrada.
 */
export async function proxy(req: NextRequest) {
  let res = NextResponse.next({ request: req })

  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (nuevas) => {
          nuevas.forEach(({ name, value }) => req.cookies.set(name, value))
          res = NextResponse.next({ request: req })
          nuevas.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
        },
      },
    },
  )

  const { data: { user } } = await sb.auth.getUser()
  const ruta = req.nextUrl.pathname
  const esPublica = ruta.startsWith('/entrar') || ruta.startsWith('/registro') ||
                    ruta.startsWith('/recuperar')

  if (!user && !esPublica) {
    const destino = req.nextUrl.clone()
    destino.pathname = '/entrar'
    return NextResponse.redirect(destino)
  }

  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|webp)$).*)'],
}
