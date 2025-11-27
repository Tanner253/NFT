import type { Metadata } from 'next'
import './globals.css'
import { SolanaWalletProvider } from '@/components/WalletProvider'

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
      <body>
        <SolanaWalletProvider>
          {children}
        </SolanaWalletProvider>
      </body>
    </html>
  )
}

