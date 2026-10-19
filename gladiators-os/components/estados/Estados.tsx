import type { ReactNode } from 'react'
import { Boton } from '@/components/ui/Boton'
import { Icono } from '@/components/shell/Iconos'

/**
 * Los estados que el brief exige y que casi siempre se dejan para el final
 * —es decir, no se hacen—: cargando, vacío, error, sin permiso y sesión
 * expirada.
 *
 * Regla de los mensajes: decir qué pasó y cómo se arregla. Nunca un código,
 * nunca "algo salió mal".
 */

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-e3 py-e7 text-gris-2">
      <span className="h-e4 w-e4 animate-spin rounded-full border-2 border-filo border-t-oro" />
      <span className="text-t3 font-semibold">{texto}</span>
    </div>
  )
}

/** Un esqueleto para lo que tarda: evita que la pantalla salte al llegar. */
export function Esqueleto({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-control bg-elevada ${className ?? 'h-e8 w-full'}`} />
}

export function Vacio({ titulo, descripcion, accion }: {
  titulo: string; descripcion: string; accion?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center rounded-surface border border-filo bg-grafito px-e6 py-e8 text-center">
      <span className="mb-e4 grid h-e8 w-e8 place-items-center rounded-full border border-filo bg-negro text-gris-2">
        <Icono nombre="archivo" tam={20} />
      </span>
      <h3 className="font-serif text-t6 text-blanco">{titulo}</h3>
      <p className="mt-e2 max-w-[42ch] text-t3 text-gris">{descripcion}</p>
      {accion && <div className="mt-e5">{accion}</div>}
    </div>
  )
}

export function Error({ titulo = 'No pudimos cargar esto', descripcion, reintentar }: {
  titulo?: string; descripcion: string; reintentar?: () => void
}) {
  return (
    <div role="alert" className="rounded-surface border border-filo-mal bg-[rgb(227_107_104_/_0.06)] p-e6">
      <div className="flex gap-e4">
        <span className="grid h-e8 w-e8 shrink-0 place-items-center rounded-full border border-filo-mal bg-[rgb(227_107_104_/_0.14)]">
          <svg width="22" height="22" viewBox="0 0 18 18" fill="none" stroke="#E36B68" strokeWidth="2" aria-hidden>
            <path d="M9 4.5v5.5M9 12.6v.6" />
          </svg>
        </span>
        <div className="min-w-0">
          <h3 className="font-serif text-t6 text-blanco">{titulo}</h3>
          <p className="mt-e2 text-t3 text-gris">{descripcion}</p>
          {reintentar && (
            <Boton className="mt-e4" onClick={reintentar}>Intentar otra vez</Boton>
          )}
        </div>
      </div>
    </div>
  )
}

export function SinPermiso({ queEs = 'esta sección' }: { queEs?: string }) {
  return (
    <Vacio
      titulo="Esto no es parte de tu alcance"
      descripcion={`Tu cuenta no tiene acceso a ${queEs}. Si crees que debería tenerlo, pídeselo a tu líder o a un administrador: lo que ves depende de tu lugar en el organigrama.`}
    />
  )
}

export function SesionExpirada() {
  return (
    <Vacio
      titulo="Se cerró tu sesión"
      descripcion="Pasó demasiado tiempo sin actividad. Vuelve a entrar; lo que habías guardado sigue ahí."
      accion={<Boton variante="principal" onClick={() => { window.location.href = '/entrar' }}>Entrar otra vez</Boton>}
    />
  )
}

/** Cuenta registrada pero todavía sin activar. D-06. */
export function CuentaPendiente({ nombre }: { nombre: string }) {
  return (
    <Vacio
      titulo={`Tu cuenta está lista, ${nombre.split(' ')[0]}`}
      descripcion="Falta que un administrador la active y te asigne tu rango. Normalmente es el mismo día. En cuanto pase, aquí vas a ver tu panel."
    />
  )
}
