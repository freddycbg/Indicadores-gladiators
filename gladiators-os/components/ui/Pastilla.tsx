import { cn } from '@/lib/cn'

type Tono = 'neutro' | 'proceso' | 'bien' | 'mal' | 'espera'

const TONOS: Record<Tono, string> = {
  neutro:  'bg-elevada text-gris border-filo',
  proceso: 'bg-[rgb(105_169_245_/_0.13)] text-info border-filo-info',
  bien:    'bg-[rgb(75_197_138_/_0.14)] text-exito border-filo-ok',
  mal:     'bg-[rgb(227_107_104_/_0.14)] text-alerta border-filo-mal',
  espera:  'bg-[rgb(216_180_106_/_0.13)] text-oro border-filo-oro',
}

/**
 * El punto de color NO es el único portador del estado: siempre va con su
 * texto. El brief lo pide y es lo correcto — hay gente que no distingue
 * el verde del rojo.
 */
export function Pastilla({ children, tono = 'neutro' }: {
  children: React.ReactNode; tono?: Tono
}) {
  return (
    <span className={cn(
      'inline-flex h-[24px] shrink-0 items-center gap-e2 rounded-chip border px-e3',
      'text-t1 font-bold whitespace-nowrap', TONOS[tono],
    )}>
      <span className="h-[6px] w-[6px] rounded-full bg-current" aria-hidden />
      {children}
    </span>
  )
}
