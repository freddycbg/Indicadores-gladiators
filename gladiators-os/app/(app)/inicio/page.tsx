import type { Metadata } from 'next'
import Link from 'next/link'
import { exigirCuentaActiva, dirigeLinea } from '@/lib/alcance/sesion'
import { totalesDe, metaDeLaSemana, reporteDelDia } from '@/features/reportes/consultas'
import { candidatosDe } from '@/features/reclutamiento/consultas'
import { Cifra, Variacion } from '@/components/ui/Cifra'
import { Barra } from '@/components/ui/Barra'
import { Pastilla } from '@/components/ui/Pastilla'
import { Icono } from '@/components/shell/Iconos'
import { progresoMeta } from '@/lib/metricas/metricas'
import { hoyISO, lunesDe, enPalabras } from '@/lib/metricas/semana'

export const metadata: Metadata = { title: 'Inicio · Gladiators OS' }

export default async function Inicio() {
  const perfil = await exigirCuentaActiva()
  const hoy = hoyISO()
  const lunes = lunesDe(hoy)
  const lunesPrevio = lunesDe(restarDias(lunes, 1))

  const [semana, previa, meta, deHoy, candidatos, lidera] = await Promise.all([
    totalesDe(perfil.id, lunes, hoy),
    totalesDe(perfil.id, lunesPrevio, restarDias(lunes, 1)),
    metaDeLaSemana(perfil.id, hoy),
    reporteDelDia(perfil.id, hoy),
    candidatosDe(perfil.id, 3),
    dirigeLinea(perfil.id),
  ])

  const t = semana.totales
  const p = previa.totales
  const avance = progresoMeta(t.alp, meta)
  const rango = `${lunes.slice(8)} al ${hoy.slice(8)} de este mes`

  return (
    <>
      <header className="mb-e6 flex flex-wrap items-start gap-e5">
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-t8 font-medium text-blanco">
            {saludo()}, <span className="text-oro">{perfil.full_name.split(' ')[0]}</span>
          </h1>
          <p className="mt-e2 text-gris">Concéntrate en las acciones que producen resultados.</p>
        </div>
        {lidera && (
          <Link href="/equipo"
            className="inline-flex h-md shrink-0 items-center rounded-control border border-filo px-e4 text-t3 font-bold text-gris transition-colors duration-150 hover:border-filo-oro hover:text-blanco">
            Ver mi equipo
          </Link>
        )}
        <div className="rounded-surface border border-filo bg-grafito px-e5 py-e3 text-right">
          <p className="text-t1 font-bold uppercase tracking-[0.14em] text-gris-2">Hoy</p>
          <p className="mt-e2 font-bold text-blanco">{enPalabras(hoy)}</p>
        </div>
      </header>

      {/* Cuatro y nada más en el primer nivel. Lo demás vive en Indicadores. */}
      <div className="mb-e5 grid gap-e4 sm:grid-cols-2 xl:grid-cols-4">
        <Cifra
          tono="oro" talla="lg"
          rotulo={`ALP · semana del ${rango}`}
          valor={t.alp.toLocaleString('es-MX')}
          pie={<Variacion delta={t.alp - p.alp} pct={p.alp ? ((t.alp - p.alp) / p.alp) * 100 : null} />}
        />
        <Cifra rotulo="PRESS SALE" valor={t.press_sale}
          pie={<Variacion delta={t.press_sale - p.press_sale} />} />
        <Cifra rotulo="APP · citas" valor={t.app}
          pie={<Variacion delta={t.app - p.app} />} />
        <Cifra rotulo="REF · referidos" valor={t.referidos}
          pie={<Variacion delta={t.referidos - p.referidos} />} />
      </div>

      {semana.pendientes > 0 && (
        <p className="mb-e5 rounded-control border border-filo-oro bg-[rgb(216_180_106_/_0.08)] px-e4 py-e3 text-t3 text-gris">
          <span className="font-bold text-blanco">
            {semana.pendientes} {semana.pendientes === 1 ? 'día tuyo está' : 'días tuyos están'} pendientes de revisión.
          </span>{' '}
          Esas cifras todavía no cuentan arriba: solo lo aprobado es oficial.
        </p>
      )}

      <div className="grid gap-e4 lg:grid-cols-[1.15fr_1.08fr_0.97fr]">
        <Tarjeta titulo="Mi progreso" enlace={{ href: '/metas', texto: 'Ver mis metas' }}>
          <div className="flex items-end gap-e4">
            <span className="text-t9 font-extrabold leading-none text-oro tabular-nums">
              {avance === null ? '—' : `${Math.round(avance)}%`}
            </span>
            <div className="pb-e2">
              <p className="text-t1 font-bold uppercase tracking-[0.14em] text-gris-2">ALP de la semana</p>
              <p className="mt-e1 text-t3 text-gris">
                {meta ? `${t.alp.toLocaleString('es-MX')} de ${meta.toLocaleString('es-MX')}` : 'Sin meta puesta'}
              </p>
            </div>
          </div>
          <div className="mt-e3"><Barra pct={avance} /></div>
          <dl className="mt-e5 flex gap-e6 border-t border-filo pt-e4">
            <Dato nombre="APP" valor={String(t.app)} />
            <Dato nombre="REF" valor={String(t.referidos)} />
            <Dato nombre="Constancia" valor={`${semana.diasConReporte} / 7`} />
          </dl>
        </Tarjeta>

        <Tarjeta titulo="Mis candidatos" enlace={{ href: '/reclutamiento', texto: 'Ver todos' }}>
          {candidatos.length === 0 ? (
            <p className="text-t3 text-gris-2">
              No tienes candidatos activos. Un referido es el combustible del negocio:
              sin ellos las citas se acaban.
            </p>
          ) : (
            <ul className="flex flex-col gap-e3">
              {candidatos.map((c) => (
                <li key={c.id} className="flex items-center gap-e3">
                  <span className="grid h-[32px] w-[32px] shrink-0 place-items-center rounded-full border border-filo bg-elevada text-t1 font-bold text-gris">
                    {c.first_name[0]}{c.last_name[0]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-t4 font-bold text-blanco">
                      {c.first_name} {c.last_name}
                    </span>
                    <span className="block text-t2 font-semibold text-gris-2">{c.stage}</span>
                  </span>
                  {c.urgency === 'Llamar de inmediato' && <Pastilla tono="mal">Llamar ya</Pastilla>}
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>

        <Tarjeta titulo="Próximas acciones">
          <div className="flex flex-col gap-e3">
            <Accion
              href="/mi-actividad" icono="hoja" destacada={!deHoy || deHoy.status === 'borrador'}
              titulo={deHoy?.status === 'pendiente' ? 'Tu día ya está enviado'
                : deHoy?.status === 'requiere_correccion' ? 'Corrige el día que te devolvieron'
                : 'Registrar el día de hoy'}
              detalle={enPalabras(hoy) + (deHoy ? ` · ${etiquetaEstado(deHoy.status)}` : ' · pendiente')}
            />
            {candidatos.filter((c) => c.urgency === 'Llamar de inmediato').slice(0, 1).map((c) => (
              <Accion key={c.id} href="/reclutamiento" icono="persona-mas"
                titulo={`Llamar a ${c.first_name} ${c.last_name}`}
                detalle="Pidió que la llamen de inmediato" />
            ))}
            <Accion href="/reclutamiento" icono="persona-mas"
              titulo="Registrar un referido" detalle={`Llevas ${t.referidos} esta semana`} />
          </div>
        </Tarjeta>
      </div>
    </>
  )
}

function Tarjeta({ titulo, enlace, children }: {
  titulo: string; enlace?: { href: string; texto: string }; children: React.ReactNode
}) {
  return (
    <section className="min-w-0 rounded-surface border border-filo bg-grafito p-e5">
      <div className="mb-e4 flex items-center gap-e3">
        <h2 className="text-t5 font-bold text-blanco">{titulo}</h2>
        {enlace && (
          <Link href={enlace.href}
            className="ml-auto flex items-center gap-e1 text-t2 font-bold text-oro hover:underline hover:underline-offset-4">
            {enlace.texto}
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor"
              strokeWidth="2" aria-hidden><path d="M4 2l4 4-4 4" /></svg>
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

function Dato({ nombre, valor }: { nombre: string; valor: string }) {
  return (
    <div>
      <dt className="text-t1 font-bold uppercase tracking-[0.14em] text-gris-2">{nombre}</dt>
      <dd className="mt-e2 text-t5 font-bold tabular-nums text-blanco">{valor}</dd>
    </div>
  )
}

function Accion({ href, icono, titulo, detalle, destacada }: {
  href: string; icono: 'hoja' | 'persona-mas'; titulo: string; detalle: string; destacada?: boolean
}) {
  return (
    <Link href={href}
      className={`flex items-center gap-e3 rounded-control border px-e4 py-e3 transition-colors duration-150
        ${destacada ? 'border-filo-oro bg-[rgb(216_180_106_/_0.07)]' : 'border-filo hover:border-filo-oro'}`}>
      <span className={`grid h-[32px] w-[32px] shrink-0 place-items-center rounded-control
        ${destacada ? 'bg-[rgb(216_180_106_/_0.16)] text-oro' : 'bg-elevada text-gris'}`}>
        <Icono nombre={icono} tam={15} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-t4 font-semibold text-blanco">{titulo}</span>
        <span className="block truncate text-t2 font-semibold text-gris-2">{detalle}</span>
      </span>
    </Link>
  )
}

function saludo(): string {
  const h = new Date().getHours()
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'
}

function etiquetaEstado(e: string): string {
  return e === 'borrador' ? 'borrador sin enviar'
    : e === 'pendiente' ? 'esperando a tu líder'
    : e === 'aprobado' ? 'aprobado' : 'te lo devolvieron'
}

function restarDias(fecha: string, n: number): string {
  const [a, m, d] = fecha.split('-').map(Number)
  const f = new Date(Date.UTC(a!, m! - 1, d!))
  f.setUTCDate(f.getUTCDate() - n)
  return f.toISOString().slice(0, 10)
}
