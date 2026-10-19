import type { Metadata } from 'next'
import { exigirCuentaActiva, dirigeLinea } from '@/lib/alcance/sesion'
import { pendientesDeRevisar, sinReportar } from '@/features/reportes/consultas'
import { estancados } from '@/features/reclutamiento/consultas'
import { ColaDeRevision } from '@/features/reportes/ColaDeRevision'
import { Cifra } from '@/components/ui/Cifra'
import { SinPermiso, Vacio } from '@/components/estados/Estados'
import { ultimoDiaCerrado } from '@/lib/metricas/metricas'
import { enPalabras } from '@/lib/metricas/semana'

export const metadata: Metadata = { title: 'Mi equipo · Gladiators OS' }

export default async function Equipo() {
  const perfil = await exigirCuentaActiva()

  // "Líder" no es un rol: es tener gente colgando. Un SA sin nadie debajo
  // no tiene equipo que revisar, y eso no es un error — es su situación.
  if (!(await dirigeLinea(perfil.id)) && !perfil.is_admin) {
    return <SinPermiso queEs="la revisión de equipo" />
  }

  const diaCerrado = ultimoDiaCerrado().toISOString().slice(0, 10)
  const [cola, faltantes, atorados] = await Promise.all([
    pendientesDeRevisar(perfil.id),
    sinReportar(diaCerrado),
    estancados(null),
  ])

  const constancia = faltantes.total > 0
    ? Math.round(((faltantes.total - faltantes.faltan.length) / faltantes.total) * 100)
    : null

  return (
    <>
      <header className="mb-e6">
        <h1 className="font-serif text-t8 font-medium text-blanco">Mi equipo</h1>
        <p className="mt-e2 text-gris">
          {cola.length > 0
            ? `Hay ${cola.length} ${cola.length === 1 ? 'registro esperándote' : 'registros esperándote'}.`
            : 'No hay nada pendiente de revisar.'}
        </p>
      </header>

      <div className="mb-e5 grid gap-e4 sm:grid-cols-2 xl:grid-cols-4">
        <Cifra tono={cola.length > 0 ? 'oro' : 'neutro'} rotulo="Pendientes de revisar"
          valor={cola.length} pie={`de ${faltantes.total} personas`} />
        <Cifra tono={faltantes.faltan.length > 0 ? 'mal' : 'bien'} rotulo="Sin cerrar el día"
          valor={faltantes.faltan.length} pie={enPalabras(diaCerrado)} />
        <Cifra rotulo="Constancia de la línea"
          valor={constancia === null ? '—' : `${constancia}%`} />
        <Cifra tono={atorados.length > 0 ? 'mal' : 'neutro'} rotulo="Reclutas estancados"
          valor={atorados.length} pie="sin mover hace 10 días o más" />
      </div>

      <div className="grid gap-e4 xl:grid-cols-[1.5fr_1fr]">
        <section className="min-w-0 rounded-surface border border-filo bg-grafito">
          <h2 className="border-b border-filo px-e5 py-e4 text-t5 font-bold text-blanco">
            Registros pendientes de revisión
          </h2>
          {cola.length === 0 ? (
            <div className="p-e5">
              <Vacio titulo="Todo al día"
                descripcion="Nadie de tu línea tiene un registro esperando. Cuando alguien envíe el suyo, aparece aquí." />
            </div>
          ) : (
            <ColaDeRevision filas={cola} />
          )}
        </section>

        <section className="rounded-surface border border-filo bg-grafito p-e5">
          <h2 className="mb-e4 text-t5 font-bold text-blanco">Quién no ha cerrado el día</h2>
          <div className="mb-e4 flex items-baseline gap-e3">
            <span className="text-t9 font-extrabold leading-none text-alerta tabular-nums">
              {faltantes.faltan.length}
            </span>
            <span className="text-t3 text-gris">de {faltantes.total} · {enPalabras(diaCerrado)}</span>
          </div>
          <ul className="flex flex-col gap-e3">
            {faltantes.faltan.slice(0, 8).map((p) => (
              <li key={p.id} className="flex items-center gap-e3 text-t4">
                <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-alerta" aria-hidden />
                <span className="min-w-0 flex-1 truncate font-semibold text-blanco">{p.full_name}</span>
                <span className="text-t1 font-bold uppercase tracking-[0.1em] text-gris-2">{p.role}</span>
              </li>
            ))}
          </ul>
          <p className="mt-e4 text-t2 leading-relaxed text-gris-2">
            Se evalúa el último día ya cerrado. Antes de la hora de corte no significa nada
            decir que nadie reportó: por la mañana faltan todos.
          </p>
        </section>
      </div>
    </>
  )
}
