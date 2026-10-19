import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * La tarjeta de métrica. Una.
 *
 * El modelo llegó a construir la misma cosa de cuatro maneras distintas,
 * treinta veces, porque no tenía nombre. Este es el nombre.
 */
type Tono = 'neutro' | 'oro' | 'bien' | 'mal'
type Talla = 'sm' | 'md' | 'lg'

const TAMANO: Record<Talla, string> = { sm: 'text-t6', md: 'text-t7', lg: 'text-t8' }

const TONO: Record<Tono, { caja: string; cifra: string; rotulo: string }> = {
  neutro: { caja: 'border-filo bg-grafito', cifra: 'text-blanco', rotulo: 'text-gris-2' },
  oro: {
    caja: 'border-filo-oro bg-linear-[158deg,rgb(216_180_106_/_0.16),rgb(216_180_106_/_0.03)]',
    cifra: 'text-oro-cl', rotulo: 'text-oro',
  },
  bien: { caja: 'border-filo-ok bg-grafito', cifra: 'text-exito', rotulo: 'text-gris-2' },
  mal: { caja: 'border-filo-mal bg-grafito', cifra: 'text-alerta', rotulo: 'text-gris-2' },
}

export function Cifra({
  rotulo, valor, pie, tono = 'neutro', talla = 'md', className,
}: {
  rotulo: string
  valor: ReactNode
  /** La variación, o cualquier cosa que acompañe. */
  pie?: ReactNode
  tono?: Tono
  talla?: Talla
  className?: string
}) {
  const t = TONO[tono]
  return (
    <div className={cn('min-w-0 rounded-surface border p-e5 transition-colors duration-150',
      t.caja, tono === 'neutro' && 'hover:border-filo-oro', className)}>
      <p className={cn('text-t1 font-bold uppercase tracking-[0.14em]', t.rotulo)}>{rotulo}</p>
      <p className={cn('mt-e3 font-extrabold leading-none tracking-tight tabular-nums',
        TAMANO[talla], t.cifra)}>{valor}</p>
      {pie && <div className="mt-e3 text-t2 font-bold">{pie}</div>}
    </div>
  )
}

/**
 * La variación contra el periodo anterior.
 *
 * El color sigue la DIRECCIÓN DE MEJORA, no el signo: en NO SHOW,
 * RESCHEDULE, PRESS NO SALE, No Califica y Cita cedida, subir es mala
 * noticia aunque el número crezca. Es la regla más fácil de romper del
 * producto, así que vive en un componente y no en cada pantalla.
 */
export function Variacion({
  delta, pct, mejor = 'alto', unidad,
}: {
  delta: number
  pct?: number | null
  mejor?: 'alto' | 'bajo'
  unidad?: string
}) {
  if (delta === 0) {
    return <span className="text-gris-2">igual que el periodo anterior</span>
  }
  const subio = delta > 0
  const esMejora = mejor === 'alto' ? subio : !subio

  return (
    <span className={cn('inline-flex items-center gap-e2', esMejora ? 'text-exito' : 'text-alerta')}>
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {subio ? <path d="M6 10V2M2.5 5.5 6 2l3.5 3.5" /> : <path d="M6 2v8M2.5 6.5 6 10l3.5-3.5" />}
      </svg>
      <span className="sr-only">{subio ? 'subió' : 'bajó'}</span>
      {Math.abs(delta).toLocaleString('es-MX')}{unidad ? ` ${unidad}` : ''}
      {pct != null && ` · ${Math.abs(Math.round(pct))}%`}
    </span>
  )
}
