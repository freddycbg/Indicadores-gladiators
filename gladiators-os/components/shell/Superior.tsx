'use client'

import { useRouter } from 'next/navigation'
import { clienteNavegador } from '@/lib/supabase/cliente'
import { Icono } from './Iconos'
import type { Perfil } from '@/lib/supabase/tipos'

export function Superior({ perfil }: { perfil: Perfil }) {
  const router = useRouter()

  async function salir() {
    await clienteNavegador().auth.signOut()
    router.push('/entrar')
    router.refresh()
  }

  const iniciales = perfil.full_name.split(' ').slice(0, 2).map((p) => p[0]).join('')

  return (
    <header className="flex h-[64px] shrink-0 items-center gap-e4 border-b border-filo bg-azulado px-e6">
      {/* Un campo de verdad, no un div que lo aparenta: uno falso es la
          primera cosa que alguien pulsa y la primera que no responde. */}
      <div className="flex h-[38px] w-full max-w-[420px] items-center gap-e3 rounded-control border border-filo bg-negro px-e3">
        <Icono nombre="lupa" tam={14} className="shrink-0 text-gris-2" />
        <input
          type="search"
          aria-label="Buscar agentes o candidatos"
          placeholder="Buscar agentes o candidatos…"
          className="min-w-0 flex-1 bg-transparent text-t3 text-blanco outline-none placeholder:text-gris-2"
        />
      </div>

      <div className="flex-1" />

      <button
        aria-label="Notificaciones"
        className="relative grid h-[38px] w-[38px] place-items-center rounded-control border border-filo text-gris hover:border-filo-oro hover:text-blanco"
      >
        <Icono nombre="campana" />
      </button>

      <div className="flex items-center gap-e3">
        <span className="grid h-[36px] w-[36px] place-items-center rounded-full border border-filo-oro bg-elevada text-t2 font-bold text-oro">
          {iniciales}
        </span>
        <span className="hidden sm:block">
          <span className="block text-t3 font-bold leading-tight text-blanco">{perfil.full_name}</span>
          <span className="block text-t1 font-semibold text-gris-2">
            {perfil.role}{perfil.is_admin && ' · Administrador'}
          </span>
        </span>
        <button
          onClick={salir}
          aria-label="Cerrar sesión"
          className="grid h-[36px] w-[36px] place-items-center rounded-control text-gris-2 hover:text-blanco"
        >
          <Icono nombre="salir" />
        </button>
      </div>
    </header>
  )
}
