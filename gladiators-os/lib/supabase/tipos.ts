/**
 * Los tipos del esquema. Se corresponden uno a uno con las migraciones de
 * supabase/migrations: si cambias una, cambia la otra.
 *
 * Cuando Beru tenga el proyecto en pie, esto se regenera solo con
 *   npx supabase gen types typescript --project-id <ref> > lib/supabase/generados.ts
 * y este archivo se queda únicamente con los alias de dominio.
 */

/** Los cinco rangos reales. D-03. */
export type Rango = 'Agente' | 'SA' | 'GA' | 'MGA' | 'RGA'

export const RANGOS: readonly Rango[] = ['Agente', 'SA', 'GA', 'MGA', 'RGA'] as const

export function nivelDeRango(r: Rango): number {
  return RANGOS.indexOf(r)
}

/** D-01: las siete etapas reales. "Examen reprobado" no es una etapa. */
export type EtapaRecluta =
  | 'Pendiente por llamar'
  | 'Agendado para Webinar'
  | 'Agendado para entrevista'
  | 'En proceso de estudio'
  | 'Agendado para el examen'
  | 'Examen aprobado'
  | 'Examen reprobado'

export type UrgenciaContacto = 'Llamar de inmediato' | 'Normal' | 'Esperar unos días'

export type EstadoReporte = 'borrador' | 'pendiente' | 'aprobado' | 'requiere_correccion'

export interface Perfil {
  id: string
  full_name: string
  email: string
  role: Rango
  is_admin: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ReporteDiario {
  id: string
  profile_id: string
  work_date: string
  status: EstadoReporte
  app: number
  press: number
  press_sale: number
  press_no_sale: number
  caller_calls: number
  no_show: number
  no_califica: number
  reschedule: number
  cita_cedida: number
  referidos: number
  alp: number
  sin_actividad: boolean
  motivo_sin_actividad: string | null
  comentario: string | null
  submitted_at: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  review_note: string | null
  created_at: string
  updated_at: string
}

export interface Recluta {
  id: string
  first_name: string
  last_name: string
  phone: string
  email: string | null
  us_state: string | null
  urgency: UrgenciaContacto
  referred_by: string
  stage: EtapaRecluta
  comment: string | null
  is_active: boolean
  closed_reason: string | null
  referred_on: string
  created_at: string
  updated_at: string
}
