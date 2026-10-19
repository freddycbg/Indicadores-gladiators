import type { Metadata } from 'next'
import { exigirCuentaActiva } from '@/lib/alcance/sesion'
import { FormularioDiario } from '@/features/reportes/Formulario'
import { reporteDelDia, alpDeLaSemana, metaDeLaSemana } from '@/features/reportes/consultas'
import { hoyISO, enPalabras } from '@/lib/metricas/semana'

export const metadata: Metadata = { title: 'Mi actividad · Gladiators OS' }

export default async function MiActividad({
  searchParams,
}: { searchParams: Promise<{ dia?: string }> }) {
  const perfil = await exigirCuentaActiva()
  const { dia } = await searchParams
  const fecha = dia && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : hoyISO()

  const [reporte, acumulado, meta] = await Promise.all([
    reporteDelDia(perfil.id, fecha),
    alpDeLaSemana(perfil.id, fecha, fecha),
    metaDeLaSemana(perfil.id, fecha),
  ])

  return (
    <>
      <header className="mb-e6">
        <h1 className="font-serif text-t7 font-medium text-blanco">Mi actividad</h1>
        <p className="mt-e2 text-gris">{enPalabras(fecha)} · registra tu día en menos de un minuto.</p>
      </header>

      <FormularioDiario
        fecha={fecha}
        estado={reporte?.status ?? 'borrador'}
        metaSemanal={meta}
        acumuladoSemana={acumulado}
        {...(reporte ? { inicial: reporte } : {})}
      />
    </>
  )
}
