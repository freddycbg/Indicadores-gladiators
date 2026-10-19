import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * Un solo botón con variantes explícitas.
 *
 * El modelo llegó a tener 18 firmas distintas de botón en 13 alturas,
 * porque cinco de los siete papeles que cumplía en pantalla no tenían
 * nombre y cada uno se volvía a especificar en su sitio. Estos son los
 * nombres.
 */
type Variante = 'principal' | 'neutro' | 'peligro'
type Talla = 'sm' | 'md' | 'lg'

export interface BotonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante
  talla?: Talla
  /** Cuadrado, para un solo icono. Nunca recibe un ancho suelto. */
  soloIcono?: boolean
  anchoCompleto?: boolean
  icono?: ReactNode
}

const TALLAS: Record<Talla, string> = {
  sm: 'h-sm px-e3 text-t2',
  md: 'h-md px-e4 text-t3',
  lg: 'h-lg px-e5 text-t4',
}

const CUADRADO: Record<Talla, string> = {
  sm: 'w-sm px-0', md: 'w-md px-0', lg: 'w-lg px-0',
}

const VARIANTES: Record<Variante, string> = {
  principal:
    'bg-linear-[158deg,var(--color-oro-cl),var(--color-oro)] border-oro text-[#120E06] font-extrabold ' +
    'hover:bg-oro-cl hover:border-oro-cl disabled:bg-elevada disabled:border-filo',
  neutro:
    'bg-transparent border-filo text-gris hover:border-filo-oro hover:text-blanco',
  peligro:
    'bg-transparent border-filo-mal text-alerta hover:border-alerta hover:bg-[rgb(227_107_104_/_0.08)]',
}

export const Boton = forwardRef<HTMLButtonElement, BotonProps>(function Boton(
  { variante = 'neutro', talla = 'md', soloIcono, anchoCompleto, icono, className, children, ...resto },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-e2 rounded-control border font-bold',
        'transition-[background-color,border-color,color] duration-150',
        'active:not-disabled:translate-y-px active:not-disabled:brightness-95',
        soloIcono ? CUADRADO[talla] : TALLAS[talla],
        soloIcono && 'aspect-square',
        VARIANTES[variante],
        anchoCompleto && 'w-full',
        className,
      )}
      {...resto}
    >
      {icono}
      {children}
    </button>
  )
})
