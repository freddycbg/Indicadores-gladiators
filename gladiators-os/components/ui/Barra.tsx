import { cn } from '@/lib/cn'

/**
 * Progreso hacia una meta. El verde es para lo cumplido y el oro para lo
 * que avanza: el oro marca progreso, que es uno de sus cuatro trabajos.
 *
 * Sin meta no hay barra que pintar: se dice, no se pinta un cero.
 */
export function Barra({ pct, etiqueta }: { pct: number | null; etiqueta?: string }) {
  if (pct === null) {
    return (
      <p className="text-t2 font-semibold text-gris-2">
        {etiqueta ?? 'Todavía no hay meta puesta para este periodo.'}
      </p>
    )
  }
  const lleno = Math.max(0, Math.min(100, pct))
  const cumplida = pct >= 100

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={etiqueta ?? 'Progreso hacia la meta'}
      className="h-[7px] overflow-hidden rounded-chip bg-elevada"
    >
      <div
        className={cn('h-full rounded-chip transition-[width] duration-500',
          cumplida
            ? 'bg-linear-[90deg,#2F7D59,var(--color-exito)]'
            : 'bg-linear-[90deg,var(--color-oro-os),var(--color-oro)]')}
        style={{ width: `${lleno}%` }}
      />
    </div>
  )
}
