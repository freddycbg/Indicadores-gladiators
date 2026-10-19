import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: true,
  // El brief lo pide explícitamente: nada de claves administrativas en el
  // navegador. Solo NEXT_PUBLIC_* cruza al cliente, y ahí solo va la URL
  // del proyecto y la clave publicable.
  eslint: { ignoreDuringBuilds: false },
  typescript: { ignoreBuildErrors: false },
}

export default config
