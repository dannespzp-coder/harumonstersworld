import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Harumonstersworld',
  description: 'El Digital World de Haru — criaturas de datos que viven, evolucionan y mueren',
  icons: { icon: '/favicon.ico' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
