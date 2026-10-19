import type { Perfil } from '@/lib/supabase/tipos'

export interface Entrada {
  href: string
  texto: string
  icono: string
  seccion?: string
}

/**
 * El menú se arma con el rol. No se esconde con CSS.
 *
 * Un agente no tiene en su HTML los enlaces de administración: no están
 * ocultos, no existen. Y aun así, si alguien escribiera la ruta a mano, se
 * daría contra RLS — esto decide qué se dibuja, no quién entra.
 */
export function menuPara(perfil: Perfil, dirigeLinea: boolean): Entrada[] {
  const base: Entrada[] = [
    { href: '/inicio',         texto: 'Inicio',            icono: 'casa' },
    { href: '/mi-actividad',   texto: 'Mi actividad',      icono: 'hoja' },
    { href: '/indicadores',    texto: 'Indicadores',       icono: 'barras' },
    { href: '/reclutamiento',  texto: 'Reclutamiento',     icono: 'persona-mas' },
    { href: '/docusign',       texto: 'DocuSign',          icono: 'documento' },
    { href: '/metas',          texto: 'Metas y concursos', icono: 'diana' },
    { href: '/reportes',       texto: 'Reportes',          icono: 'archivo' },
  ]

  // "Líder" no es un rol: es la condición de tener gente colgando.
  if (dirigeLinea) {
    base.push({ href: '/equipo', texto: 'Mi equipo', icono: 'personas', seccion: 'Equipo' })
  }

  if (perfil.is_admin) {
    base.push(
      { href: '/admin/usuarios',  texto: 'Usuarios y permisos',  icono: 'persona', seccion: 'Administración' },
      { href: '/admin/ajustes',   texto: 'Configuración',        icono: 'engrane' },
      { href: '/admin/historial', texto: 'Historial de cambios', icono: 'reloj' },
    )
  }

  return base
}
