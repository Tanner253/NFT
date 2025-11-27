import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '$NFT - Name Fungible Token',
  description: 'Procedurally generated 3D particle shapes from text input',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

