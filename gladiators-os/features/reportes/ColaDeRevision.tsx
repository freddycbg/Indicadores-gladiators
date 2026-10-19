'use client'

import { useState, useTransition } from 'react'
import { revisarReporte } from './acciones'
import { Boton } from '@/components/ui/Boton'
import { Pastilla } from '@/components/ui/Pastilla'
import { tasaCierre } from '@/lib/metricas/metricas'
import { enPalabras } from '@/lib/metricas/semana'
import { cn } from '@/lib/cn'

interface Fila {
  id: string
  work_date: string
  comentario: string | null
  app: number; press: number; press_sale: number; press_no_sale: number
  caller_calls: number; no_show: number; no_califica: number
  reschedule: number; cita_cedida: number; referidos: number; alp: number
  profiles: { id: string; full_name: string; role: string } | null
}

/**
 * Aprobar o devolver.
 *
 * Devolver EXIGE decir qué corregir: un reporte que vuelve sin motivo
 * obliga al agente a adivinar, y la siguiente vez manda lo mismo. El
 * servidor también lo exige, así que esto no es la única defensa — es la
 * que da un mensaje decente.
 */
export function ColaDeRevision({ filas }: { filas: unknown[] }) {
  const lista = filas as Fila[]
  const [resueltos, setResueltos] = useState<Record<string, 'aprobado' | 'devuelto'>>({})
  const [abriendo, setAbriendo] = useState<string | null>(null)
  const [nota, setNota] = useState('')
  const [fallo, setFallo] = useState<string | null>(null)
  const [pendiente, arranca] = useTransition()

  function decidir(id: string, decision: 'aprobado' | 'requiere_correccion') {
    setFallo(null)
    arranca(async () => {
      const r = await revisarReporte(id, decision, decision === 'aprobado' ? null : nota)
      if (r.ok) {
        setResueltos((a) => ({ ...a, [id]: decision === 'aprobado' ? 'aprobado' : 'devuelto' }))
        setAbriendo(null)
        setNota('')
      } else {
        setFallo(r.mensaje)
      }
    })
  }

  return (
    <div className="overflow-x-auto">
      {fallo && (
        <p role="alert" className="mx-e5 mt-e4 rounded-control border border-filo-mal bg-[rgb(227_107_104_/_0.08)] px-e4 py-e3 text-t3 text-blanco">
          {fallo}
        </p>
      )}
      <table className="w-full min-w-[640px] border-collapse">
        <thead>
          <tr>
            {['Agente', 'Día', 'APP', 'PRESS', 'PRESS SALE', 'Cierre', 'ALP', ''].map((h, i) => (
              <th key={h || i}
                className={cn('border-b border-filo px-e4 pb-e3 text-t1 font-bold uppercase',
                  'tracking-[0.13em] whitespace-nowrap text-gris-2',
                  i >= 2 && i <= 6 ? 'text-right' : 'text-left')}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lista.map((f) => {
            const hecho = resueltos[f.id]
            const cierre = tasaCierre(f)
            return (
              <tr key={f.id} className={cn('border-b border-[rgb(169_178_189_/_0.09)]',
                hecho && 'opacity-55')}>
                <td className="px-e4 py-e3">
                  <span className="block font-bold text-blanco">{f.profiles?.full_name ?? '—'}</span>
                  <span className="block text-t1 font-bold uppercase tracking-[0.1em] text-gris-2">
                    {f.profiles?.role}
                  </span>
                  {f.comentario && (
                    <span className="mt-e1 block text-t2 text-gris-2">«{f.comentario}»</span>
                  )}
                </td>
                <td className="px-e4 py-e3 whitespace-nowrap text-t3 text-gris-2">
                  {enPalabras(f.work_date).replace(/ de \w+$/, '')}
                </td>
                <Num>{f.app}</Num>
                <Num>{f.press}</Num>
                <Num>{f.press_sale}</Num>
                <Num>{cierre === null ? '—' : `${cierre.toFixed(0)}%`}</Num>
                <Num>{f.alp.toLocaleString('es-MX')}</Num>
                <td className="px-e4 py-e3 text-right whitespace-nowrap">
                  {hecho ? (
                    <Pastilla tono={hecho === 'aprobado' ? 'bien' : 'mal'}>
                      {hecho === 'aprobado' ? 'Aprobado' : 'Devuelto'}
                    </Pastilla>
                  ) : abriendo === f.id ? (
                    <div className="flex flex-col items-end gap-e2">
                      <input
                        autoFocus value={nota} onChange={(e) => setNota(e.target.value)}
                        placeholder="¿Qué tiene que corregir?"
                        aria-label="Motivo de la devolución"
                        className="h-sm w-[220px] rounded-control border border-filo bg-negro px-e3 text-t3 text-blanco"
                      />
                      <div className="flex gap-e2">
                        <Boton talla="sm" onClick={() => { setAbriendo(null); setNota('') }}>
                          Cancelar
                        </Boton>
                        <Boton talla="sm" variante="peligro" disabled={!nota.trim() || pendiente}
                          onClick={() => decidir(f.id, 'requiere_correccion')}>
                          Devolver
                        </Boton>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-end gap-e2">
                      <Boton talla="sm" variante="peligro" disabled={pendiente}
                        onClick={() => setAbriendo(f.id)}>
                        Devolver
                      </Boton>
                      <Boton talla="sm" variante="principal" disabled={pendiente}
                        onClick={() => decidir(f.id, 'aprobado')}>
                        Aprobar
                      </Boton>
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Num({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-e4 py-e3 text-right font-bold tabular-nums whitespace-nowrap text-blanco">
      {children}
    </td>
  )
}
