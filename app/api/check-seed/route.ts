import { NextResponse } from 'next/server'
import clientPromise from '@/lib/mongodb'

export async function POST(request: Request) {
  try {
    const { seedText } = await request.json()

    if (!seedText || seedText.length > 32) {
      return NextResponse.json(
        { error: 'Invalid seed text' },
        { status: 400 }
      )
    }

    const client = await clientPromise
    const db = client.db('nft-downloads')
    const downloads = db.collection('downloads')

    // Check if this seed has already been downloaded
    const existing = await downloads.findOne({ seedText })

    if (existing) {
      return NextResponse.json({
        available: false,
        message: 'This design has already been downloaded',
        downloadedBy: existing.walletAddress,
        downloadedAt: existing.timestamp
      })
    }

    return NextResponse.json({
      available: true,
      message: 'This design is available for download'
    })
  } catch (error) {
    console.error('Error checking seed:', error)
    return NextResponse.json(
      { error: 'Failed to check seed availability' },
      { status: 500 }
    )
  }
}

