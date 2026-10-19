/** Un solo trazo, un solo tamaño base. Nada de glifos Unicode como iconos. */
const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6,
            strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

export const ICONOS = {
  casa: <><path d="M2.5 7.5 9 2.5l6.5 5V15a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V7.5Z" {...P}/><path d="M7 16v-5h4v5" {...P}/></>,
  hoja: <><rect x="3" y="2.5" width="12" height="13" rx="1.5" {...P}/><path d="M6 6.5h6M6 9.5h6M6 12.5h3.5" {...P}/></>,
  barras: <><path d="M2.5 15.5h13M5 15.5V9M9 15.5V3.5M13 15.5v-4" {...P}/></>,
  'persona-mas': <><circle cx="7" cy="6" r="2.7" {...P}/><path d="M2 15c0-2.7 2.3-4.3 5-4.3s5 1.6 5 4.3" {...P}/><path d="M12.5 5h4M14.5 3v4" {...P}/></>,
  documento: <><path d="M4 2.5h6.5L14 6v9.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-12a1 1 0 0 1 1-1Z" {...P}/><path d="M10 2.5V6h3.5" {...P}/><path d="M5.8 12.4c1.6-.5 2.3-2.2 1.8-3-.5-.7-1.4.3-1 2 .4 1.6 1.4 1.6 2 .9.5-.6 1.3-.6 1.8.1" {...P}/></>,
  diana: <><circle cx="9" cy="9" r="6.3" {...P}/><circle cx="9" cy="9" r="2.5" {...P}/></>,
  archivo: <><path d="M4 2.5h7l3.5 3.5v9a1 1 0 0 1-1 1h-9.5a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1Z" {...P}/><path d="M10.5 2.5V6h3.5" {...P}/></>,
  personas: <><circle cx="6.2" cy="6" r="2.4" {...P}/><circle cx="12.4" cy="7" r="1.9" {...P}/><path d="M1.8 14.6c0-2.4 2-3.8 4.4-3.8s4.4 1.4 4.4 3.8" {...P}/><path d="M12 10.9c2 .2 3.4 1.5 3.4 3.7" {...P}/></>,
  persona: <><circle cx="9" cy="5.6" r="2.7" {...P}/><path d="M3.4 15c0-3 2.5-4.7 5.6-4.7s5.6 1.7 5.6 4.7" {...P}/></>,
  engrane: <><circle cx="9" cy="9" r="2.4" {...P}/><path d="M9 1.8v2M9 14.2v2M16.2 9h-2M3.8 9h-2M14.1 3.9l-1.4 1.4M5.3 12.7l-1.4 1.4M14.1 14.1l-1.4-1.4M5.3 5.3 3.9 3.9" {...P}/></>,
  reloj: <><circle cx="9" cy="9" r="6.3" {...P}/><path d="M9 5.2V9l2.6 1.6" {...P}/></>,
  campana: <><path d="M9 2.5a4.4 4.4 0 0 0-4.4 4.4c0 4-1.6 5.2-1.6 5.2h12s-1.6-1.2-1.6-5.2A4.4 4.4 0 0 0 9 2.5Z" {...P}/><path d="M7.6 14.6a1.6 1.6 0 0 0 2.8 0" {...P}/></>,
  lupa: <><circle cx="7.6" cy="7.6" r="4.8" {...P}/><path d="M11.2 11.2 15 15" {...P}/></>,
  salir: <><path d="M6.5 15.5H4a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1h2.5" {...P}/><path d="M11.5 12 15 9l-3.5-3M15 9H6.5" {...P}/></>,
} as const

export type NombreIcono = keyof typeof ICONOS

export function Icono({ nombre, tam = 17, className }: {
  nombre: NombreIcono; tam?: number; className?: string
}) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 18 18" className={className} aria-hidden>
      {ICONOS[nombre]}
    </svg>
  )
}
