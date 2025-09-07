import clientPromise from '@/lib/mongodb'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    const collection = db.collection('spreadsheetData')

    const data = await collection.findOne()
    
    return NextResponse.json(data ? data.data : {})
  } catch (error) {
    console.error('Error fetching spreadsheet data:', error)
    return NextResponse.json(
      { message: 'Failed to fetch spreadsheet data' },
      { status: 500 }
    )
  }
}

export async function POST(request) {
  try {
    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    const collection = db.collection('spreadsheetData')
    const spreadsheetData = await request.json()

    // Remove all previous data
    await collection.deleteMany({})
    
    // Insert new data
    const result = await collection.insertOne({ 
      data: spreadsheetData,
      createdAt: new Date(),
      updatedAt: new Date()
    })

    return NextResponse.json({
      message: 'Spreadsheet data saved successfully',
      id: result.insertedId
    })
  } catch (error) {
    console.error('Error saving spreadsheet data:', error)
    return NextResponse.json(
      { message: 'Failed to save spreadsheet data' },
      { status: 500 }
    )
  }
}