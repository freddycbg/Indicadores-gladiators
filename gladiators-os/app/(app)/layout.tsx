import { exigirSesion, dirigeLinea } from '@/lib/alcance/sesion'
import { menuPara } from '@/components/shell/navegacion'
import { Lateral } from '@/components/shell/Lateral'
import { Superior } from '@/components/shell/Superior'
import { CuentaPendiente } from '@/components/estados/Estados'

export default async function ArmazonApp({ children }: { children: React.ReactNode }) {
  const perfil = await exigirSesion()

  // D-06: toda cuenta nace inactiva. Entra, y lo que ve es esto — no una
  // pantalla vacía ni un error.
  if (!perfil.is_active) {
    return (
      <main className="mx-auto grid min-h-dvh max-w-[42rem] place-items-center px-e5">
        <CuentaPendiente nombre={perfil.full_name} />
      </main>
    )
  }

  const lidera = await dirigeLinea(perfil.id)

  return (
    <div className="flex min-h-dvh">
      <Lateral entradas={menuPara(perfil, lidera)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Superior perfil={perfil} />
        <main className="min-w-0 flex-1 p-e6">{children}</main>
      </div>
    </div>
  )
}
