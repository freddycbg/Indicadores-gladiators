'use client'

import { useMemo, useState, useTransition } from 'react'
import { Boton } from '@/components/ui/Boton'
import { Campo } from '@/components/ui/Campo'
import { Contador } from '@/components/ui/Contador'
import { guardarReporte } from './acciones'
import { MOTIVOS_SIN_ACTIVIDAD, type DatosReporte } from './esquema'
import { tasaCierre, tasaNoShow, progresoMeta } from '@/lib/metricas/metricas'
import type { EstadoReporte } from '@/lib/supabase/tipos'
import { cn } from '@/lib/cn'

type Cifras = {
  app: number; press: number; press_sale: number; press_no_sale: number
  caller_calls: number; no_show: number; no_califica: number
  reschedule: number; cita_cedida: number; referidos: number; alp: number
}

const VACIO: Cifras = {
  app: 0, press: 0, press_sale: 0, press_no_sale: 0, caller_calls: 0,
  no_show: 0, no_califica: 0, reschedule: 0, cita_cedida: 0, referidos: 0, alp: 0,
}

/**
 * Los once indicadores, agrupados en tres bloques con sentido: lo que se
 * agendó, lo que se presentó y lo que entró.
 *
 * Los once están aquí y en el teléfono. No seis: once. La versión reducida
 * costaba que el agente abriera una computadora para terminar su día, y
 * nadie captura dos veces.
 */
export function FormularioDiario({
  fecha, inicial, estado, metaSemanal, acumuladoSemana, movil = false,
}: {
  fecha: string
  inicial?: Partial<DatosReporte>
  estado: EstadoReporte
  metaSemanal: number | null
  acumuladoSemana: number
  movil?: boolean
}) {
  const [v, setV] = useState<Cifras>({ ...VACIO, ...recortarCifras(inicial) })
  const [sinActividad, setSinActividad] = useState(inicial?.sin_actividad ?? false)
  const [motivo, setMotivo] = useState(inicial?.motivo_sin_actividad ?? '')
  const [comentario, setComentario] = useState(inicial?.comentario ?? '')
  const [fallo, setFallo] = useState<{ mensaje: string; campo?: string } | null>(null)
  const [guardado, setGuardado] = useState<EstadoReporte | null>(null)
  const [pendiente, arranca] = useTransition()

  const bloqueado = estado === 'aprobado'
  const talla = movil ? 'lg' : 'md'

  const num = (k: keyof Cifras) => (n: number) => {
    setV((a: Cifras) => ({ ...a, [k]: n }))
    setFallo(null)
  }

  // La regla de PRESS, en vivo. No como aviso: como bloqueo.
  const pressCuadra = v.press_sale + v.press_no_sale <= v.press
  const puedeEnviar = pressCuadra && !pendiente && !bloqueado &&
    (!sinActividad || motivo.length > 0)

  const consecuencia = useMemo(() => {
    const total = acumuladoSemana + v.alp
    return { total, pct: progresoMeta(total, metaSemanal) }
  }, [acumuladoSemana, v.alp, metaSemanal])

  function enviar(mandar: boolean) {
    setFallo(null)
    arranca(async () => {
      const r = await guardarReporte(
        { work_date: fecha, ...v, sin_actividad: sinActividad,
          motivo_sin_actividad: sinActividad ? motivo : null,
          comentario: comentario || null },
        mandar,
      )
      // Nunca se dice "guardado" antes de que el servidor lo confirme.
      if (r.ok) setGuardado(r.estado)
      else setFallo({ mensaje: r.mensaje, ...(r.campo ? { campo: r.campo } : {}) })
    })
  }

  return (
    <div className={cn('flex flex-col gap-e4', movil ? '' : 'lg:grid lg:grid-cols-[1fr_316px] lg:items-start')}>
      <div className="flex min-w-0 flex-col gap-e4">
        <Bloque titulo="Lo que se agendó">
          <Contador id="app" etiqueta="Appointment (APP)" valor={v.app} onChange={num('app')} talla={talla} />
          <Contador id="reschedule" etiqueta="Reschedule" valor={v.reschedule} onChange={num('reschedule')} talla={talla} />
          <Contador id="caller" etiqueta="Llamadas del Caller" valor={v.caller_calls} onChange={num('caller_calls')} talla={talla} />
        </Bloque>

        <Bloque titulo="Lo que se presentó">
          <Contador id="press" etiqueta="Presentaciones (PRESS)" valor={v.press} onChange={num('press')} talla={talla} />
          <Contador id="press_sale" etiqueta="PRESS SALE" valor={v.press_sale} onChange={num('press_sale')} talla={talla} />
          <Contador id="press_no_sale" etiqueta="PRESS NO SALE" valor={v.press_no_sale} onChange={num('press_no_sale')} talla={talla} />
          <Contador id="no_show" etiqueta="NO SHOW" valor={v.no_show} onChange={num('no_show')} talla={talla} />
          <Contador id="no_califica" etiqueta="No Califica" valor={v.no_califica} onChange={num('no_califica')} talla={talla} />
          <Contador id="cita_cedida" etiqueta="Cita cedida" valor={v.cita_cedida} onChange={num('cita_cedida')} talla={talla} />

          <div
            role={pressCuadra ? undefined : 'alert'}
            className={cn(
              'flex items-center gap-e2 rounded-control border px-e3 py-e3 text-t2',
              pressCuadra
                ? 'border-filo-ok bg-[rgb(75_197_138_/_0.09)] text-gris'
                : 'border-filo-mal bg-[rgb(227_107_104_/_0.09)] text-blanco',
            )}
          >
            {pressCuadra ? (
              <>
                <Palomita />
                PRESS SALE + PRESS NO SALE = {v.press_sale + v.press_no_sale}, igual que PRESS. Cuadra.
              </>
            ) : (
              <>
                <Alerta />
                PRESS SALE más PRESS NO SALE suman {v.press_sale + v.press_no_sale} y PRESS es {v.press}.
                Corrígelo para poder enviar.
              </>
            )}
          </div>
        </Bloque>

        <Bloque titulo="Lo que entró">
          <Contador id="referidos" etiqueta="Referidos (REF)" valor={v.referidos} onChange={num('referidos')} talla={talla} />
          <Campo
            etiqueta="ALP"
            id="alp"
            destacado
            inputMode="decimal"
            value={v.alp === 0 ? '' : String(v.alp)}
            placeholder="0.00"
            onChange={(e) => num('alp')(Number(e.target.value.replace(/[^\d.]/g, '')) || 0)}
            className="h-[56px] text-t7 font-extrabold"
            {...(fallo?.campo === 'alp' ? { error: fallo.mensaje } : {})}
          />
          <Campo
            etiqueta="Comentarios (opcional)"
            id="comentario"
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            placeholder="Algo que tu líder deba saber…"
            maxLength={500}
          />
          <div className="flex items-center gap-e3">
            <input
              type="checkbox" id="sin-actividad" checked={sinActividad} disabled={bloqueado}
              onChange={(e) => { setSinActividad(e.target.checked); if (!e.target.checked) setMotivo('') }}
            />
            <label htmlFor="sin-actividad" className="font-semibold text-gris">Día sin actividad</label>
            <select
              aria-label="Motivo del día sin actividad"
              className="h-md min-w-0 flex-1 rounded-control border border-filo bg-negro px-e3 text-blanco"
              value={motivo} disabled={!sinActividad}
              onChange={(e) => setMotivo(e.target.value)}
            >
              <option value="">Motivo…</option>
              {MOTIVOS_SIN_ACTIVIDAD.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </Bloque>
      </div>

      <aside className="flex flex-col gap-e4">
        <Panel titulo="Si envías esto">
          <div className="flex items-end gap-e3">
            <span className="font-bold text-t8 leading-none text-oro tabular-nums">
              {consecuencia.pct === null ? '—' : `${Math.round(consecuencia.pct)}%`}
            </span>
            {consecuencia.pct !== null && consecuencia.pct >= 100 && (
              <span className="pb-e1 text-t2 font-bold text-exito">cierras la semana en meta</span>
            )}
          </div>
          <p className="mt-e3 text-t2 font-semibold text-gris-2">
            {metaSemanal
              ? `${consecuencia.total.toLocaleString('es-MX')} de ${metaSemanal.toLocaleString('es-MX')} ALP`
              : 'Todavía no tienes meta puesta para esta semana.'}
          </p>
          <dl className="mt-e4 flex flex-col gap-e3 border-t border-filo pt-e4 text-t3">
            <Tasa nombre="Tasa de cierre del día" valor={tasaCierre(v)} />
            <Tasa nombre="Tasa de NO SHOW" valor={tasaNoShow(v)} mejorBajo />
          </dl>
        </Panel>

        <LineaDeEstado estado={guardado ?? estado} />

        {fallo && !fallo.campo && (
          <div role="alert" className="rounded-control border border-filo-mal bg-[rgb(227_107_104_/_0.08)] px-e4 py-e3">
            <p className="text-t3 text-blanco">{fallo.mensaje}</p>
          </div>
        )}

        <div className="flex flex-col gap-e2">
          <Boton variante="principal" talla="lg" anchoCompleto
            disabled={!puedeEnviar} onClick={() => enviar(true)}>
            {pendiente ? 'Guardando…' : 'Guardar y enviar a revisión'}
          </Boton>
          <Boton anchoCompleto disabled={pendiente || bloqueado} onClick={() => enviar(false)}>
            Guardar borrador
          </Boton>
        </div>
      </aside>
    </div>
  )
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-surface border border-filo bg-grafito p-e5">
      <h2 className="mb-e4 text-t1 font-bold uppercase tracking-[0.14em] text-oro">{titulo}</h2>
      <div className="flex flex-col gap-e3">{children}</div>
    </section>
  )
}

function Panel({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-surface border border-filo bg-grafito p-e5">
      <h2 className="mb-e4 text-t1 font-bold uppercase tracking-[0.14em] text-oro">{titulo}</h2>
      {children}
    </section>
  )
}

/** Una tasa sin base es un guion, no un cero. Cero PRESS no es 0% de cierre. */
function Tasa({ nombre, valor, mejorBajo }: { nombre: string; valor: number | null; mejorBajo?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-gris">{nombre}</dt>
      <dd className={cn('font-bold tabular-nums text-t4', valor === null && 'text-gris-2',
        valor !== null && mejorBajo && valor > 20 && 'text-alerta')}>
        {valor === null ? '—' : `${valor.toFixed(1)}%`}
      </dd>
    </div>
  )
}

const PASOS: { clave: EstadoReporte; texto: string }[] = [
  { clave: 'borrador',  texto: 'Borrador' },
  { clave: 'pendiente', texto: 'Pendiente de revisión' },
  { clave: 'aprobado',  texto: 'Aprobado por tu líder' },
]

function LineaDeEstado({ estado }: { estado: EstadoReporte }) {
  const indice = PASOS.findIndex((p) => p.clave === estado)
  const devuelto = estado === 'requiere_correccion'

  return (
    <Panel titulo="Estado del registro">
      <ol className="flex flex-col gap-e3">
        {PASOS.map((p, i) => (
          <li key={p.clave} className={cn('flex items-center gap-e3', i > indice && 'opacity-45')}>
            <span className={cn('h-[9px] w-[9px] shrink-0 rounded-full',
              i <= indice && !devuelto ? 'bg-oro' : 'border-[1.5px] border-gris-2')} />
            <span className="text-t3">{p.texto}</span>
          </li>
        ))}
        {/* El cuarto estado existe: el líder tiene botón "Devolver", así que
            el agente tiene que poder ver que eso puede pasarle. */}
        <li className={cn('mt-e1 flex items-center gap-e3 border-t border-dashed border-filo pt-e3',
          !devuelto && 'opacity-45')}>
          <span className={cn('h-[9px] w-[9px] shrink-0 rounded-full',
            devuelto ? 'bg-alerta' : 'border-[1.5px] border-alerta')} />
          <span className={cn('text-t3', devuelto && 'font-bold text-blanco')}>
            Devuelto para corrección
          </span>
        </li>
      </ol>
      <p className="mt-e4 text-t2 text-gris-2">
        {devuelto
          ? 'Tu líder te lo devolvió. Corrige lo que te pidió y vuelve a enviarlo.'
          : estado === 'aprobado'
            ? 'Ya está aprobado. Si hay que corregirlo, pídele a tu líder que te lo devuelva.'
            : 'Puedes corregirlo mientras no esté aprobado. Si te lo devuelven, te avisamos y te decimos por qué.'}
      </p>
    </Panel>
  )
}

/** Del reporte guardado solo nos interesan las once cifras. */
function recortarCifras(d: Partial<DatosReporte> | undefined): Partial<Cifras> {
  if (!d) return {}
  const salida: Partial<Cifras> = {}
  for (const k of Object.keys(VACIO) as (keyof Cifras)[]) {
    const n = d[k]
    if (typeof n === 'number') salida[k] = n
  }
  return salida
}

const Palomita = () => (
  <svg width="15" height="15" viewBox="0 0 18 18" fill="none" stroke="#4BC58A" strokeWidth="2"
    className="shrink-0" aria-hidden><path d="M3.5 9.4 7 13l7.5-8" /></svg>
)
const Alerta = () => (
  <svg width="15" height="15" viewBox="0 0 18 18" fill="none" stroke="#E36B68" strokeWidth="2"
    className="shrink-0" aria-hidden><path d="M9 4.5v5.5M9 12.6v.6" /></svg>
)
