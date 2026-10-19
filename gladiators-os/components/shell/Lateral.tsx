'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icono, type NombreIcono } from './Iconos'
import type { Entrada } from './navegacion'
import { cn } from '@/lib/cn'

/**
 * El menú lateral. Recibe ya resueltas las entradas que le tocan a esta
 * persona: lo que no está en la lista no existe en el HTML, no está
 * escondido. El brief lo pide así y además es lo único honesto — un
 * `display:none` sigue estando ahí para quien abra el inspector.
 */
export function Lateral({ entradas }: { entradas: Entrada[] }) {
  const ruta = usePathname()

  return (
    <nav
      aria-label="Secciones"
      className="flex w-[236px] shrink-0 flex-col border-r border-filo bg-azulado py-e5"
    >
      <Link href="/inicio" className="mb-e4 flex items-center gap-e3 border-b border-filo px-e4 pb-e5">
        <Escudo />
        <span className="min-w-0">
          <span className="block text-t3 font-extrabold tracking-[0.12em] text-blanco">
            GLADIATORS OS
          </span>
          <span className="block whitespace-nowrap text-t1 font-bold uppercase tracking-[0.07em] text-gris-2">
            American Income Life
          </span>
        </span>
      </Link>

      {entradas.map((e) => (
        <div key={e.href}>
          {e.seccion && (
            <p className="px-e4 pt-e4 pb-e2 text-t1 font-bold uppercase tracking-[0.17em] text-gris-2">
              {e.seccion}
            </p>
          )}
          <Link
            href={e.href}
            aria-current={ruta.startsWith(e.href) ? 'page' : undefined}
            className={cn(
              'flex items-center gap-e3 border-l-[3px] px-e4 py-e3 text-t4 font-semibold',
              'transition-colors duration-150',
              ruta.startsWith(e.href)
                ? 'border-l-oro bg-[rgb(216_180_106_/_0.10)] text-blanco [&_svg]:text-oro'
                : 'border-l-transparent text-gris hover:bg-[rgb(216_180_106_/_0.06)] hover:text-blanco [&_svg]:text-gris-2',
            )}
          >
            <Icono nombre={e.icono as NombreIcono} />
            {e.texto}
          </Link>
        </div>
      ))}
    </nav>
  )
}

function Escudo() {
  return (
    <svg width="30" height="34" viewBox="0 0 34 38" fill="none" className="shrink-0" aria-hidden>
      <path d="M17 2 31 7v12c0 9-6 15.5-14 17C9 34.5 3 28 3 19V7L17 2Z"
        stroke="#D8B46A" strokeWidth="1.5" fill="rgb(216 180 106 / 0.08)" />
      <path d="M17 9v9M11 13v7M23 13v7" stroke="#D8B46A" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M11 24h12" stroke="#8E7338" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
