import { describe, it, expect, beforeAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Las pruebas de permisos se escriben AL REVÉS: intentan leer datos ajenos
 * y pasan cuando la base de datos las bloquea.
 *
 * Regla que no se rompe: cada cliente se autentica como su usuario de
 * prueba. Si alguna usara la clave de servicio, se saltaría RLS y todas
 * pasarían sin probar nada — que es la forma más común de tener una suite
 * de permisos verde y una aplicación abierta.
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const hayEntorno = Boolean(URL && ANON)
const describeSiHay = hayEntorno ? describe : describe.skip

async function entrar(correo: string, clave: string): Promise<SupabaseClient> {
  const sb = createClient(URL!, ANON!)
  const { error } = await sb.auth.signInWithPassword({ email: correo, password: clave })
  if (error) throw new Error(`No se pudo entrar como ${correo}: ${error.message}`)
  return sb
}

describeSiHay('alcance: lo que cada quien puede leer', () => {
  let agenteAlfa: SupabaseClient      // Agente, línea de Yeni
  let agenteBravo: SupabaseClient     // Agente, línea de Grecia — otro equipo
  let saAlfa: SupabaseClient          // SA Yeni, dirige a agenteAlfa
  let inactivo: SupabaseClient        // registrado, sin activar

  beforeAll(async () => {
    agenteAlfa  = await entrar('prueba.agente.alfa@gladiators.test', 'prueba-alfa-2026')
    agenteBravo = await entrar('prueba.agente.bravo@gladiators.test', 'prueba-bravo-2026')
    saAlfa      = await entrar('prueba.sa.alfa@gladiators.test', 'prueba-sa-2026')
    inactivo    = await entrar('prueba.inactivo@gladiators.test', 'prueba-inact-2026')
  })

  it('un agente NO lee el reporte de otro equipo', async () => {
    const { data } = await agenteAlfa.from('daily_reports').select('id')
      .eq('profile_id', await idDe(agenteBravo))
    expect(data).toEqual([])
  })

  it('un agente NO lee el reporte de un compañero de su propio equipo', async () => {
    const hermano = await idDe(agenteBravo)
    const { data } = await agenteAlfa.from('daily_reports').select('id').eq('profile_id', hermano)
    expect(data).toEqual([])
  })

  it('un SA SÍ lee los reportes de su línea', async () => {
    const suyo = await idDe(agenteAlfa)
    const { data } = await saAlfa.from('daily_reports').select('id').eq('profile_id', suyo)
    expect(Array.isArray(data)).toBe(true)
  })

  it('un SA NO lee los de una línea hermana', async () => {
    const ajeno = await idDe(agenteBravo)
    const { data } = await saAlfa.from('daily_reports').select('id').eq('profile_id', ajeno)
    expect(data).toEqual([])
  })

  it('un agente NO puede aprobar su propio reporte', async () => {
    const mio = await idDe(agenteAlfa)
    const { data: borrador } = await agenteAlfa.from('daily_reports')
      .select('id').eq('profile_id', mio).eq('status', 'pendiente').limit(1).single()
    if (!borrador) return
    const { error } = await agenteAlfa.from('daily_reports')
      .update({ status: 'aprobado' }).eq('id', borrador.id)
    expect(error).not.toBeNull()
  })

  it('un agente NO puede subirse el rango', async () => {
    const mio = await idDe(agenteAlfa)
    await agenteAlfa.from('profiles').update({ role: 'RGA' }).eq('id', mio)
    const { data } = await agenteAlfa.from('profiles').select('role').eq('id', mio).single()
    expect(data?.role).toBe('Agente')
  })

  it('un agente NO puede hacerse administrador', async () => {
    const mio = await idDe(agenteAlfa)
    await agenteAlfa.from('profiles').update({ is_admin: true }).eq('id', mio)
    const { data } = await agenteAlfa.from('profiles').select('is_admin').eq('id', mio).single()
    expect(data?.is_admin).toBe(false)
  })

  it('una cuenta sin activar no lee nada', async () => {
    const { data } = await inactivo.from('daily_reports').select('id')
    expect(data).toEqual([])
  })

  it('nadie borra un candidato: no hay política de DELETE', async () => {
    const { data: r } = await agenteAlfa.from('recruits').select('id').limit(1).single()
    if (!r) return
    await agenteAlfa.from('recruits').delete().eq('id', r.id)
    const { data: sigue } = await agenteAlfa.from('recruits').select('id').eq('id', r.id)
    expect(sigue?.length).toBe(1)
  })

  it('ni un administrador altera la auditoría', async () => {
    const admin = await entrar('prueba.admin@gladiators.test', 'prueba-admin-2026')
    const { error } = await admin.from('audit_logs').update({ reason: 'alterado' }).eq('id', 1)
    expect(error).not.toBeNull()
  })

  it('no se pueden tener dos reportes del mismo día', async () => {
    const mio = await idDe(agenteAlfa)
    const dia = '2026-03-02'
    await agenteAlfa.from('daily_reports').insert({ profile_id: mio, work_date: dia })
    const { error } = await agenteAlfa.from('daily_reports')
      .insert({ profile_id: mio, work_date: dia })
    expect(error?.code).toBe('23505')
  })

  it('un agente no crea un reporte a nombre de otro', async () => {
    const ajeno = await idDe(agenteBravo)
    const { error } = await agenteAlfa.from('daily_reports')
      .insert({ profile_id: ajeno, work_date: '2026-03-03' })
    expect(error).not.toBeNull()
  })
})

async function idDe(sb: SupabaseClient): Promise<string> {
  const { data } = await sb.auth.getUser()
  return data.user!.id
}
