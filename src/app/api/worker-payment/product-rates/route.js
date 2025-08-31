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
    const productRates = await db.collection('product_rates').find({}).toArray()
    
    return Response.json({
      success: true,
      productRates
    })
  } catch (error) {
    console.error('Error fetching product rates:', error)
    return Response.json({
      success: false,
      message: 'Failed to fetch product rates'
    }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const { productName, ratePerUnit } = await request.json()
    
    if (!productName || !ratePerUnit) {
      return Response.json({
        success: false,
        message: 'Product name and rate per unit are required'
      }, { status: 400 })
    }

    const db = await connectToDatabase()
    
    // Check if product already exists
    const existingProduct = await db.collection('product_rates').findOne({ productName })
    if (existingProduct) {
      return Response.json({
        success: false,
        message: 'Product already exists'
      }, { status: 400 })
    }

    const result = await db.collection('product_rates').insertOne({
      productName,
      ratePerUnit: parseFloat(ratePerUnit),
      createdAt: new Date(),
      updatedAt: new Date()
    })

    return Response.json({
      success: true,
      message: 'Product rate added successfully',
      id: result.insertedId
    })
  } catch (error) {
    console.error('Error adding product rate:', error)
    return Response.json({
      success: false,
      message: 'Failed to add product rate'
    }, { status: 500 })
  }
}

export async function PUT(request) {
  try {
    const url = new URL(request.url)
    const id = url.searchParams.get('id')
    const { productName, ratePerUnit } = await request.json()
    
    if (!id || !productName || !ratePerUnit) {
      return Response.json({
        success: false,
        message: 'ID, product name and rate per unit are required'
      }, { status: 400 })
    }

    const db = await connectToDatabase()
    
    const result = await db.collection('product_rates').updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          productName,
          ratePerUnit: parseFloat(ratePerUnit),
          updatedAt: new Date()
        }
      }
    )

    if (result.matchedCount === 0) {
      return Response.json({
        success: false,
        message: 'Product rate not found'
      }, { status: 404 })
    }

    return Response.json({
      success: true,
      message: 'Product rate updated successfully'
    })
  } catch (error) {
    console.error('Error updating product rate:', error)
    return Response.json({
      success: false,
      message: 'Failed to update product rate'
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
    
    const result = await db.collection('product_rates').deleteOne({ _id: new ObjectId(id) })

    if (result.deletedCount === 0) {
      return Response.json({
        success: false,
        message: 'Product rate not found'
      }, { status: 404 })
    }

    return Response.json({
      success: true,
      message: 'Product rate deleted successfully'
    })
  } catch (error) {
    console.error('Error deleting product rate:', error)
    return Response.json({
      success: false,
      message: 'Failed to delete product rate'
    }, { status: 500 })
  }
}