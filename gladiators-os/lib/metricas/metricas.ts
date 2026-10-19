/**
 * Las fórmulas de Gladiators OS. Todas. En un solo sitio.
 *
 * El brief lo pide explícitamente: el panel, los rankings y los reportes
 * no pueden usar fórmulas distintas. Si alguien escribe `pressSale / press`
 * dentro de un componente, es un error de revisión — no una preferencia.
 *
 * Transcritas del sistema actual y verificadas contra su código fuente.
 * Ver docs/FASE-1-ESPECIFICACION.md y docs/DECISIONES.md.
 */

/** Los once indicadores del reporte diario. Nombres fijados por D-02. */
export const INDICADORES = [
  { key: 'app',         label: 'Appointment (APP)',      corto: 'APP',           tipo: 'entero', mejor: 'alto' },
  { key: 'press',       label: 'Presentaciones (PRESS)', corto: 'PRESS',         tipo: 'entero', mejor: 'alto' },
  { key: 'press_sale',  label: 'PRESS SALE',             corto: 'PRESS SALE',    tipo: 'entero', mejor: 'alto' },
  { key: 'press_no_sale', label: 'PRESS NO SALE',        corto: 'PRESS NO SALE', tipo: 'entero', mejor: 'bajo' },
  { key: 'caller_calls', label: 'Llamadas del Caller',   corto: 'CALLER',        tipo: 'entero', mejor: 'alto' },
  { key: 'no_show',     label: 'NO SHOW',                corto: 'NO SHOW',       tipo: 'entero', mejor: 'bajo' },
  { key: 'no_califica', label: 'No Califica',            corto: 'NO CALIF.',     tipo: 'entero', mejor: 'bajo' },
  { key: 'reschedule',  label: 'Reschedule',             corto: 'RESCH.',        tipo: 'entero', mejor: 'bajo' },
  { key: 'cita_cedida', label: 'Cita cedida',            corto: 'CEDIDA',        tipo: 'entero', mejor: 'bajo' },
  { key: 'referidos',   label: 'Referidos (REF)',        corto: 'REF',           tipo: 'entero', mejor: 'alto' },
  { key: 'alp',         label: 'ALP',                    corto: 'ALP',           tipo: 'moneda', mejor: 'alto' },
] as const

export type ClaveIndicador = (typeof INDICADORES)[number]['key']

export type Totales = Record<ClaveIndicador, number>

/**
 * Una tasa sin base no es cero: no existe.
 *
 * El sistema actual devuelve null cuando el denominador es cero, y es la
 * decisión correcta — un cero dice "nadie faltó" cuando la verdad es "no
 * hubo citas". La interfaz muestra un guion, no un 0%.
 */
export type Tasa = number | null

function tasa(numerador: number, denominador: number): Tasa {
  return denominador > 0 ? (numerador / denominador) * 100 : null
}

/** NO SHOW ÷ APP × 100. Verificada en el sistema actual. */
export function tasaNoShow(t: Pick<Totales, 'no_show' | 'app'>): Tasa {
  return tasa(t.no_show, t.app)
}

/**
 * PRESS SALE ÷ PRESS × 100. Verificada en el sistema actual.
 *
 * Esta es la "conversión de presentación a venta" del brief, y aquí no
 * sufre el problema de atribución que el brief temía: PRESS SALE es un
 * conteo capturado, no una inferencia. La fórmula es exacta.
 */
export function tasaCierre(t: Pick<Totales, 'press_sale' | 'press'>): Tasa {
  return tasa(t.press_sale, t.press)
}

/**
 * D-04: no existe show rate en la V1.
 *
 * El brief lo definía como citas realizadas ÷ programadas, pero el sistema
 * no tiene el concepto de "cita realizada": una cita puede acabar en
 * Reschedule, No Califica o Cita cedida sin ser ni realizada ni no-show.
 * Definirlo exige decidir antes qué desenlaces cuentan.
 */

/** Resultado acumulado ÷ objetivo × 100. Sin meta no hay porcentaje. */
export function progresoMeta(acumulado: number, objetivo: number | null | undefined): Tasa {
  if (objetivo == null || objetivo <= 0) return null
  return (acumulado / objetivo) * 100
}

/** Verde ≥ 90 · Amarillo 60–89 · Rojo < 60. Umbrales del sistema actual. */
export const UMBRAL_VERDE = 90
export const UMBRAL_AMARILLO = 60

export type Semaforo = 'verde' | 'amarillo' | 'rojo' | 'sin-meta'

export function semaforo(progreso: Tasa): Semaforo {
  if (progreso == null) return 'sin-meta'
  if (progreso >= UMBRAL_VERDE) return 'verde'
  if (progreso >= UMBRAL_AMARILLO) return 'amarillo'
  return 'rojo'
}

/**
 * Constancia: días con reporte ÷ días hábiles del periodo.
 *
 * Los días hábiles son LOS SIETE, a propósito. Lo dice el comentario del
 * sistema actual y lo confirman los datos: hay registros en sábados y
 * domingos, y contar solo lunes a viernes daría constancias por encima del
 * 100% a quien trabaja el fin de semana.
 */
export const DIAS_HABILES = [0, 1, 2, 3, 4, 5, 6] as const

export function constancia(diasConReporte: number, diasHabiles: number): Tasa {
  return tasa(diasConReporte, diasHabiles)
}

/**
 * Hora a partir de la cual el día se da por cerrado.
 *
 * Antes de esa hora no significa nada decir que nadie ha reportado: a las
 * nueve de la mañana faltan todos. "Sin reportar" evalúa el último día YA
 * CERRADO, que por la mañana es el día anterior.
 */
export const HORA_CORTE_REPORTE = 22

export function ultimoDiaCerrado(ahora: Date = new Date()): Date {
  const d = new Date(ahora)
  if (d.getHours() < HORA_CORTE_REPORTE) d.setDate(d.getDate() - 1)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Nivel de embudo de cada etapa. D-01.
 *
 * "Examen reprobado" comparte el nivel 4 con "Agendado para el examen"
 * porque quien reprueba SÍ llegó a presentarlo. Por eso el embudo dibuja
 * seis peldaños y no siete. Debe coincidir con etapa_nivel() en
 * supabase/migrations/004_reclutamiento.sql.
 */
export const ETAPAS = [
  { key: 'Pendiente por llamar',     nivel: 0, terminal: false },
  { key: 'Agendado para Webinar',    nivel: 1, terminal: false },
  { key: 'Agendado para entrevista', nivel: 2, terminal: false },
  { key: 'En proceso de estudio',    nivel: 3, terminal: false },
  { key: 'Agendado para el examen',  nivel: 4, terminal: false },
  { key: 'Examen aprobado',          nivel: 5, terminal: true  },
  { key: 'Examen reprobado',         nivel: 4, terminal: true  },
] as const

export type Etapa = (typeof ETAPAS)[number]['key']

/** Los seis peldaños del embudo. Reprobado no es uno: es un desenlace. */
export const PELDANOS_EMBUDO = [
  'Cargados', 'Webinar', 'Entrevista', 'En estudio', 'Agendado a examen', 'Examen aprobado',
] as const

export function nivelDeEtapa(e: Etapa): number {
  return ETAPAS.find((x) => x.key === e)!.nivel
}

/** Suma los once indicadores de un conjunto de registros. */
export function sumar(registros: readonly Partial<Totales>[]): Totales {
  const t = Object.fromEntries(INDICADORES.map((i) => [i.key, 0])) as Totales
  for (const r of registros) {
    for (const { key } of INDICADORES) t[key] += Number(r[key] ?? 0)
  }
  return t
}

/**
 * Variación entre dos periodos, con el signo corregido por la dirección
 * de mejora. En NO SHOW subir es mala noticia aunque el número crezca.
 */
export function variacion(actual: number, anterior: number, mejor: 'alto' | 'bajo') {
  const delta = actual - anterior
  const pct = anterior > 0 ? (delta / anterior) * 100 : null
  const esMejora = mejor === 'alto' ? delta > 0 : delta < 0
  return { delta, pct, esMejora: delta === 0 ? null : esMejora }
}
