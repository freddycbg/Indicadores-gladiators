import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: true,
  // No se desactiva la comprobación de tipos ni el lint en el build: es el
  // comportamiento por defecto y así se queda. Un build que pasa con
  // errores de tipos no es un build.
}

export default config
