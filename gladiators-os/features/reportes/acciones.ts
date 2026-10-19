'use server'

import { revalidatePath } from 'next/cache'
import { clienteServidor } from '@/lib/supabase/servidor'
import { exigirCuentaActiva } from '@/lib/alcance/sesion'
import { esquemaReporte, mensajeDeFallo, type DatosReporte } from './esquema'
import type { EstadoReporte } from '@/lib/supabase/tipos'

export type Resultado =
  | { ok: true; id: string; estado: EstadoReporte }
  | { ok: false; mensaje: string; campo?: string }

/**
 * Guarda el reporte del día.
 *
 * Se valida aquí otra vez aunque el formulario ya haya validado: el
 * navegador se puede saltar. Y aun si esto se saltara, la base tiene sus
 * propias restricciones — tres capas, porque la de en medio es la única
 * que puede dar un mensaje decente y las otras dos son las que no mienten.
 */
export async function guardarReporte(
  entrada: unknown,
  enviar: boolean,
): Promise<Resultado> {
  const perfil = await exigirCuentaActiva()

  const leido = esquemaReporte.safeParse(entrada)
  if (!leido.success) {
    const primero = leido.error.errors[0]
    return {
      ok: false,
      mensaje: primero?.message ?? 'Revisa los datos.',
      ...(primero?.path[0] ? { campo: String(primero.path[0]) } : {}),
    }
  }

  const datos: DatosReporte = leido.data
  const sb = await clienteServidor()

  // Un upsert sobre (profile_id, work_date): si el agente pulsa dos veces
  // o se le va la señal a media petición, el resultado es el mismo.
  const { data, error } = await sb
    .from('daily_reports')
    .upsert(
      {
        profile_id: perfil.id,
        ...datos,
        status: enviar ? 'pendiente' : 'borrador',
      },
      { onConflict: 'profile_id,work_date' },
    )
    .select('id, status')
    .single()

  if (error) {
    return { ok: false, mensaje: mensajeDeFallo(error.code, error.details ?? error.message) }
  }

  revalidatePath('/mi-actividad')
  revalidatePath('/inicio')
  return { ok: true, id: data.id, estado: data.status as EstadoReporte }
}

/** Aprobar o devolver. Quién puede, lo decide la base: aquí solo se pide. */
export async function revisarReporte(
  id: string,
  decision: 'aprobado' | 'requiere_correccion',
  nota: string | null,
): Promise<Resultado> {
  await exigirCuentaActiva()

  if (decision === 'requiere_correccion' && !nota?.trim()) {
    return { ok: false, mensaje: 'Para devolverlo hay que decir qué corregir.', campo: 'nota' }
  }

  const sb = await clienteServidor()
  const { data, error } = await sb
    .from('daily_reports')
    .update({ status: decision, review_note: nota })
    .eq('id', id)
    .select('id, status')
    .single()

  if (error) {
    return { ok: false, mensaje: mensajeDeFallo(error.code, error.details ?? error.message) }
  }

  revalidatePath('/equipo')
  return { ok: true, id: data.id, estado: data.status as EstadoReporte }
}
