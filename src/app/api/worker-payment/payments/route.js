import { MongoClient, ObjectId } from 'mongodb'

const uri = process.env.MONGODB_URI
const client = new MongoClient(uri)

async function connectToDatabase() {
  await client.connect()
  return client.db('abu_bakkar_leathers')
}

export async function GET() {
  try {
    const db = await connectToDatabase()
    const payments = await db.collection('worker_payments')
      .find({})
      .sort({ createdAt: -1 })
      .toArray()
    
    return Response.json({
      success: true,
      payments
    })
  } catch (error) {
    console.error('Error fetching worker payments:', error)
    return Response.json({
      success: false,
      message: 'Failed to fetch worker payments'
    }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const { workerName, productName, quantity, totalPayment } = await request.json()
    
    if (!workerName || !productName || !quantity || !totalPayment) {
      return Response.json({
        success: false,
        message: 'All fields are required'
      }, { status: 400 })
    }

    const db = await connectToDatabase()
    
    const result = await db.collection('worker_payments').insertOne({
      workerName,
      productName,
      quantity: parseInt(quantity),
      totalPayment: parseFloat(totalPayment),
      createdAt: new Date(),
      updatedAt: new Date()
    })

    return Response.json({
      success: true,
      message: 'Worker payment added successfully',
      id: result.insertedId
    })
  } catch (error) {
    console.error('Error adding worker payment:', error)
    return Response.json({
      success: false,
      message: 'Failed to add worker payment'
    }, { status: 500 })
  }
}

export async function PUT(request) {
  try {
    const url = new URL(request.url)
    const id = url.searchParams.get('id')
    const { workerName, productName, quantity, totalPayment } = await request.json()
    
    if (!id || !workerName || !productName || !quantity || !totalPayment) {
      return Response.json({
        success: false,
        message: 'ID and all fields are required'
      }, { status: 400 })
    }

    const db = await connectToDatabase()
    
    const result = await db.collection('worker_payments').updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          workerName,
          productName,
          quantity: parseInt(quantity),
          totalPayment: parseFloat(totalPayment),
          updatedAt: new Date()
        }
      }
    )

    if (result.matchedCount === 0) {
      return Response.json({
        success: false,
        message: 'Worker payment not found'
      }, { status: 404 })
    }

    return Response.json({
      success: true,
      message: 'Worker payment updated successfully'
    })
  } catch (error) {
    console.error('Error updating worker payment:', error)
    return Response.json({
      success: false,
      message: 'Failed to update worker payment'
    }, { status: 500 })
  }
}

export async function DELETE(request) {
  try {
    const url = new URL(request.url)
    const id = url.searchParams.get('id')
    
    if (!id) {
      return Response.json({
        success: false,
        message: 'ID is required'
      }, { status: 400 })
    }

    const db = await connectToDatabase()
    
    const result = await db.collection('worker_payments').deleteOne({ _id: new ObjectId(id) })

    if (result.deletedCount === 0) {
      return Response.json({
        success: false,
        message: 'Worker payment not found'
      }, { status: 404 })
    }

    return Response.json({
      success: true,
      message: 'Worker payment deleted successfully'
    })
  } catch (error) {
    console.error('Error deleting worker payment:', error)
    return Response.json({
      success: false,
      message: 'Failed to delete worker payment'
    }, { status: 500 })
  }
}