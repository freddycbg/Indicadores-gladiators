import { forwardRef, useId } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface CampoProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  etiqueta: string
  /** Texto de apoyo bajo el campo. Se oculta cuando hay error. */
  ayuda?: ReactNode
  /** El mensaje va junto al campo, no en un resumen arriba. */
  error?: string
  /** Para la cifra que manda en su pantalla. No es "importante": es LA cifra. */
  destacado?: boolean
}

export const Campo = forwardRef<HTMLInputElement, CampoProps>(function Campo(
  { etiqueta, ayuda, error, destacado, className, id, ...resto },
  ref,
) {
  const generado = useId()
  const idCampo = id ?? generado
  const idAyuda = `${idCampo}-ayuda`

  return (
    <div className="min-w-0">
      <label htmlFor={idCampo} className="mb-e2 block text-t2 font-bold text-gris">
        {etiqueta}
      </label>
      <input
        ref={ref}
        id={idCampo}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || ayuda ? idAyuda : undefined}
        className={cn(
          'h-md w-full rounded-control border bg-negro px-e4 font-medium text-blanco',
          'transition-colors duration-150 placeholder:text-gris-2',
          // El foco NO usa oro: el oro ya marca énfasis permanente aquí.
          'focus-visible:border-gris-2 focus-visible:outline-info',
          error ? 'border-filo-mal' : destacado ? 'border-oro bg-[rgb(216_180_106_/_0.07)] text-oro-cl' : 'border-filo',
          className,
        )}
        {...resto}
      />
      {error ? (
        <p id={idAyuda} className="mt-e2 text-t2 font-semibold text-alerta">{error}</p>
      ) : ayuda ? (
        <p id={idAyuda} className="mt-e2 text-t2 font-semibold text-gris-2">{ayuda}</p>
      ) : null}
    </div>
  )
})
