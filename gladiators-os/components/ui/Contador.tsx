'use client'

import { Boton } from './Boton'
import { cn } from '@/lib/cn'

/**
 * El contador de los once indicadores.
 *
 * Aquí vivió el peor defecto del modelo: los botones declaraban 42px y
 * medían 23, porque fijaban ancho sin `shrink-0` y el campo de al lado
 * llevaba `width:100%` y ganaba la pelea del flex. El botón no encoge; el
 * campo es el que cede. No pongas un ancho suelto en los botones.
 */
export function Contador({
  etiqueta, valor, onChange, maximo = 999, talla = 'md', ayuda, id,
}: {
  etiqueta: string
  valor: number
  onChange: (n: number) => void
  maximo?: number
  /** 'lg' en el teléfono: esa pantalla se usa de pie, con una mano. */
  talla?: 'md' | 'lg'
  ayuda?: string
  id?: string
}) {
  const acota = (n: number) => Math.max(0, Math.min(maximo, n))
  const alto = talla === 'lg' ? 'h-lg' : 'h-md'

  return (
    <div className="flex min-w-0 items-center gap-e3">
      <label htmlFor={id} className="min-w-0 flex-1 text-t4 font-semibold text-gris">
        {etiqueta}
        {ayuda && <span className="mt-e1 block text-t2 text-gris-2">{ayuda}</span>}
      </label>
      <div className="flex shrink-0 gap-e2">
        <Boton talla={talla} soloIcono aria-label={`Restar ${etiqueta}`}
          onClick={() => onChange(acota(valor - 1))} disabled={valor <= 0}>
          <span className="text-t6 leading-none">−</span>
        </Boton>
        <input
          id={id}
          value={valor}
          inputMode="numeric"
          maxLength={String(maximo).length}
          onChange={(e) => {
            const limpio = e.target.value.replace(/\D/g, '')
            onChange(limpio === '' ? 0 : acota(Number(limpio)))
          }}
          className={cn(
            alto,
            'w-[64px] shrink-0 rounded-control border border-filo bg-negro text-center',
            'text-t6 font-bold text-blanco focus-visible:border-gris-2',
          )}
          aria-label={etiqueta}
        />
        <Boton talla={talla} soloIcono aria-label={`Sumar ${etiqueta}`}
          onClick={() => onChange(acota(valor + 1))} disabled={valor >= maximo}>
          <span className="text-t6 leading-none">+</span>
        </Boton>
      </div>
    </div>
  )
}
