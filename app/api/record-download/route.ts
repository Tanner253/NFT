import { NextResponse } from 'next/server'
import clientPromise from '@/lib/mongodb'

export async function POST(request: Request) {
  try {
    const { seedText, walletAddress, transactionSignature } = await request.json()

    if (!seedText || !walletAddress || !transactionSignature) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    if (seedText.length > 32) {
      return NextResponse.json(
        { error: 'Seed text too long' },
        { status: 400 }
      )
    }

    const client = await clientPromise
    const db = client.db('nft-downloads')
    const downloads = db.collection('downloads')

    // Create unique index on seedText if it doesn't exist
    await downloads.createIndex({ seedText: 1 }, { unique: true })

    // Try to insert the download record
    const result = await downloads.insertOne({
      seedText,
      walletAddress,
      transactionSignature,
      timestamp: new Date(),
      createdAt: new Date()
    })

    return NextResponse.json({
      success: true,
      id: result.insertedId
    })
  } catch (error: any) {
    console.error('Error recording download:', error)

    // Handle duplicate key error
    if (error.code === 11000) {
      return NextResponse.json(
        { error: 'This design has already been downloaded' },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to record download' },
      { status: 500 }
    )
  }
}

