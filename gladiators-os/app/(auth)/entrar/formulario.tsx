'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { clienteNavegador } from '@/lib/supabase/cliente'
import { Boton } from '@/components/ui/Boton'
import { Campo } from '@/components/ui/Campo'

/**
 * D-06: correo y contraseña, no PIN compartido.
 *
 * Los mensajes dicen qué pasó y cómo se arregla, que es lo que pide el
 * brief. Y nunca se muestra "guardado" o "entraste" antes de que el
 * servidor lo confirme: el estado de carga vive hasta la respuesta.
 */
export function FormularioEntrada() {
  const router = useRouter()
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [verClave, setVerClave] = useState(false)

  async function entrar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setEnviando(true)

    const datos = new FormData(e.currentTarget)
    const correo = String(datos.get('correo') ?? '').trim()
    const clave = String(datos.get('clave') ?? '')

    const sb = clienteNavegador()
    const { error: fallo } = await sb.auth.signInWithPassword({ email: correo, password: clave })

    if (fallo) {
      setEnviando(false)
      setError(
        fallo.message.includes('Invalid login')
          ? 'El correo o la contraseña no coinciden. Revísalos e intenta otra vez.'
          : fallo.message.includes('Email not confirmed')
            ? 'Todavía no confirmas tu correo. Busca el mensaje que te mandamos.'
            : 'No pudimos entrar ahora mismo. Intenta de nuevo en un momento.',
      )
      return
    }

    // Solo después de que el servidor confirmó.
    router.push('/inicio')
    router.refresh()
  }

  return (
    <form onSubmit={entrar} noValidate className="flex flex-col gap-e5">
      {error && (
        <div
          role="alert"
          className="flex items-start gap-e3 rounded-control border border-filo-mal bg-[rgb(227_107_104_/_0.08)] px-e4 py-e3"
        >
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="#E36B68"
            strokeWidth="2" className="mt-px shrink-0" aria-hidden>
            <path d="M9 4.5v5.5M9 12.6v.6" />
          </svg>
          <p className="text-t3 text-blanco">{error}</p>
        </div>
      )}

      <Campo
        etiqueta="Correo electrónico"
        name="correo"
        type="email"
        autoComplete="email"
        required
        placeholder="tu.nombre@gladiators.com"
      />

      <div className="relative">
        <Campo
          etiqueta="Contraseña"
          name="clave"
          type={verClave ? 'text' : 'password'}
          autoComplete="current-password"
          required
          className="pr-[46px]"
        />
        <button
          type="button"
          onClick={() => setVerClave((v) => !v)}
          aria-label={verClave ? 'Ocultar la contraseña' : 'Mostrar la contraseña'}
          className="absolute right-e3 top-[34px] rounded-chip p-e1 text-gris-2 hover:text-blanco"
        >
          <svg width="17" height="17" viewBox="0 0 18 18" fill="none" stroke="currentColor"
            strokeWidth="1.6" aria-hidden>
            <path d="M1.6 9S4.5 4 9 4s7.4 5 7.4 5-2.9 5-7.4 5S1.6 9 1.6 9Z" />
            <circle cx="9" cy="9" r="2.1" />
          </svg>
        </button>
      </div>

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-e3 text-t3 font-semibold text-gris">
          <input type="checkbox" name="recordarme" defaultChecked />
          Recordarme
        </label>
        <Link href="/recuperar" className="text-t3 font-bold text-oro hover:underline hover:underline-offset-4">
          ¿Olvidaste tu contraseña?
        </Link>
      </div>

      <Boton type="submit" variante="principal" talla="lg" anchoCompleto disabled={enviando}>
        {enviando ? 'Entrando…' : 'Iniciar sesión'}
      </Boton>

      <p className="border-t border-filo pt-e5 text-t3 text-gris-2">
        ¿Primera vez?{' '}
        <Link href="/registro" className="font-bold text-oro hover:underline hover:underline-offset-4">
          Crea tu cuenta
        </Link>
        {' '}— un administrador la activa y te asigna tu rango, normalmente el mismo día.
      </p>
    </form>
  )
}
