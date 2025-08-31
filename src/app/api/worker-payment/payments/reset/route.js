import { MongoClient } from 'mongodb'

const uri = process.env.MONGODB_URI
const client = new MongoClient(uri)

async function connectToDatabase() {
  await client.connect()
  return client.db('abu_bakkar_leathers')
}

export async function DELETE() {
  try {
    const db = await connectToDatabase()
    
    const result = await db.collection('worker_payments').deleteMany({})

    return Response.json({
      success: true,
      message: `Successfully reset ${result.deletedCount} worker payment records`,
      deletedCount: result.deletedCount
    })
  } catch (error) {
    console.error('Error resetting worker payments:', error)
    return Response.json({
      success: false,
      message: 'Failed to reset worker payments'
    }, { status: 500 })
  }
}