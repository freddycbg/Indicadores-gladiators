import type { Metadata } from 'next'
import { FormularioEntrada } from './formulario'

export const metadata: Metadata = { title: 'Entrar · Gladiators OS' }

export default function Entrar() {
  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      {/* El lado cinematográfico: luz y materia, sin fotografía de archivo.
          El brief pide imágenes solo donde aporten; aquí aporta más una
          composición propia que una foto comprada. */}
      <section
        className="relative hidden flex-col justify-center overflow-hidden px-e8 lg:flex"
        style={{
          background:
            'radial-gradient(90% 70% at 30% 14%, rgb(216 180 106 / 0.20) 0%, transparent 62%),' +
            'radial-gradient(70% 60% at 82% 92%, rgb(105 169 245 / 0.10) 0%, transparent 60%),' +
            'linear-gradient(162deg, #0E141B 0%, #080B0F 58%, #05070A 100%)',
        }}
      >
        <div
          aria-hidden
          className="absolute inset-0 opacity-50"
          style={{
            backgroundImage:
              'repeating-linear-gradient(118deg, transparent 0 28px, rgb(216 180 106 / 0.04) 28px 29px)',
          }}
        />
        <div className="relative max-w-[32rem]">
          <Escudo className="mb-e7 h-[88px] w-[78px]" />
          <h1 className="font-serif text-t9 font-medium text-blanco">Gladiators OS</h1>
          <p className="mt-e3 text-t1 font-bold uppercase tracking-[0.24em] text-gris-2">
            American Income Life
          </p>
          <div className="my-e6 h-0.5 w-[54px] bg-oro" />
          <p className="font-serif text-t6 leading-relaxed text-gris">
            Disciplina.<br />Actividad.<br />Resultados.<br />
            <span className="text-oro">Libertad.</span>
          </p>
        </div>
      </section>

      <section className="flex flex-col justify-center px-e6 py-e8 sm:px-e8 lg:px-[64px]">
        <div className="mx-auto w-full max-w-[26rem]">
          <h2 className="font-serif text-t7 font-medium text-blanco">Bienvenido</h2>
          <p className="mt-e2 mb-e7 text-gris">Entra con tu cuenta.</p>
          <FormularioEntrada />
        </div>
      </section>
    </main>
  )
}

function Escudo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 34 38" fill="none" className={className} aria-hidden>
      <path d="M17 2 31 7v12c0 9-6 15.5-14 17C9 34.5 3 28 3 19V7L17 2Z"
        stroke="#D8B46A" strokeWidth="1.1" fill="rgb(216 180 106 / 0.08)" />
      <path d="M17 9v9M11 13v7M23 13v7" stroke="#D8B46A" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M11 24h12" stroke="#8E7338" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  )
}
