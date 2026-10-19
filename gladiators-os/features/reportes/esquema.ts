import { z } from 'zod'

/**
 * La validación, en un solo sitio.
 *
 * El mismo esquema corre en el formulario y en el servidor. No es por
 * elegancia: una revisión del modelo encontró que la regla de PRESS se
 * avisaba en azul al agente —sin detenerlo— y salía en rojo con botón
 * "Devolver" en la pantalla del líder. El sistema conocía la regla, dejaba
 * mandar el reporte mal, y el viaje de ida y vuelta lo pagaban los dos.
 *
 * Si la regla existe, detiene. Si no detiene, no es regla.
 */

const entero = z.coerce.number().int().min(0, 'No puede ser negativo').max(999, 'Revisa ese número')

/** Los diez enteros. El ALP va aparte porque es moneda. */
export const METRICAS = [
  'app', 'press', 'press_sale', 'press_no_sale', 'caller_calls',
  'no_show', 'no_califica', 'reschedule', 'cita_cedida', 'referidos',
] as const

export type ClaveMetrica = (typeof METRICAS)[number]

export const esquemaReporte = z
  .object({
    work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Falta la fecha'),

    app: entero,
    press: entero,
    press_sale: entero,
    press_no_sale: entero,
    caller_calls: entero,
    no_show: entero,
    no_califica: entero,
    reschedule: entero,
    cita_cedida: entero,
    referidos: entero,
    alp: z.coerce.number().min(0, 'No puede ser negativo').max(9_999_999, 'Revisa esa cifra'),

    sin_actividad: z.boolean().default(false),
    motivo_sin_actividad: z.string().trim().nullable().default(null),
    comentario: z.string().trim().max(500, 'Máximo 500 caracteres').nullable().default(null),
  })
  // Un día sin actividad exige motivo y no admite cifras. Si no, el "día
  // sin actividad" se vuelve un cajón donde cabe cualquier cosa.
  .refine((d) => !d.sin_actividad || (d.motivo_sin_actividad ?? '').length > 0, {
    path: ['motivo_sin_actividad'],
    message: 'Dinos por qué no hubo actividad',
  })
  .refine(
    (d) => !d.sin_actividad || METRICAS.every((k: ClaveMetrica) => d[k] === 0),
    { path: ['sin_actividad'], message: 'Marcaste día sin actividad pero hay números capturados' },
  )
  // La regla que antes solo avisaba.
  .refine((d) => d.press_sale + d.press_no_sale <= d.press, {
    path: ['press_sale'],
    message: 'PRESS SALE más PRESS NO SALE no pueden pasar de PRESS',
  })
  // Una venta sin presentación no existe en este negocio.
  .refine((d) => d.press_sale === 0 || d.press > 0, {
    path: ['press_sale'],
    message: 'Hay ventas sin presentaciones. Revisa PRESS',
  })
  // No se reporta el futuro.
  .refine((d) => d.work_date <= hoyLocal(), {
    path: ['work_date'],
    message: 'Todavía no puedes reportar ese día',
  })

export type DatosReporte = z.infer<typeof esquemaReporte>

export const MOTIVOS_SIN_ACTIVIDAD = [
  'Capacitación', 'Permiso', 'Enfermedad', 'Día libre', 'Otro',
] as const

function hoyLocal(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Traduce un error de Postgres a algo que una persona pueda accionar. */
export function mensajeDeFallo(codigo: string | undefined, detalle: string): string {
  switch (codigo) {
    case '23505':
      return 'Ya tienes un reporte de ese día. Ábrelo y corrígelo en vez de crear otro.'
    case '23514':
      return detalle.includes('press_cuadra')
        ? 'PRESS SALE más PRESS NO SALE no pueden pasar de PRESS.'
        : detalle.includes('sin_actividad')
          ? 'Marcaste día sin actividad, así que los números tienen que ir en cero y el motivo lleno.'
          : 'Hay un número que no cuadra. Revisa lo que capturaste.'
    case '42501':
      return 'Tu cuenta no puede hacer este cambio. Si crees que debería, habla con tu líder.'
    case 'PGRST301':
      return 'Se cerró tu sesión. Vuelve a entrar; no se perdió lo que escribiste.'
    default:
      return 'No se pudo guardar ahora mismo. Nada se perdió: intenta otra vez en un momento.'
  }
}
