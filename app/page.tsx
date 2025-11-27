'use client'

import dynamic from 'next/dynamic'

const ParticleEngine = dynamic(() => import('@/components/ParticleEngine'), {
  ssr: false,
})

export default function Home() {
  return <ParticleEngine />
}

