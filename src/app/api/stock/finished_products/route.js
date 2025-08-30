// app/api/stock/finished_products/route.js
import clientPromise from '@/lib/mongodb'
import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'

// Helper function to check admin role
const isAdmin = (req) => {
  const role = req.headers.get('role')
  return role === 'admin'
}

export async function GET(req) {
  try {
    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    const collection = db.collection('finished_products')

    const items = await collection.find().sort({ finishedAt: -1 }).toArray()
    return NextResponse.json(items)
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req) {
  try {
    if (!isAdmin(req)) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      )
    }

    const body = await req.json()
    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    const finishedCollection = db.collection('finished_products')
    const productionCollection = db.collection('production')

    // Get the original production job
    const productionJob = await productionCollection.findOne({
      _id: new ObjectId(body.productionJobId),
    })

    if (!productionJob) {
      return NextResponse.json(
        { error: 'Production job not found' },
        { status: 404 }
      )
    }

    // Create finished product entry
    const finishedProduct = {
      productionJobId: body.productionJobId,
      productName: productionJob.productName,
      description: productionJob.description,
      originalQuantity: productionJob.quantity,
      fulfilledQuantity: productionJob.fulfilledQuantity || 0,
      remainingQuantity: productionJob.remainingQuantity || 0,
      image: productionJob.image,
      finishedAt: new Date(),
      finishedBy: body.finishedBy || 'Admin',
      notes: body.notes || '',
      status: 'completed',
    }

    const result = await finishedCollection.insertOne(finishedProduct)

    // Update production job status to finished
    await productionCollection.updateOne(
      { _id: new ObjectId(body.productionJobId) },
      {
        $set: {
          status: 'finished',
          finishedAt: new Date(),
        },
      }
    )

    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(req) {
  try {
    if (!isAdmin(req)) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    const body = await req.json()

    if (!id)
      return NextResponse.json({ error: 'ID is required' }, { status: 400 })

    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    const collection = db.collection('finished_products')

    const result = await collection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { ...body, updatedAt: new Date() } }
    )

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(req) {
  try {
    if (!isAdmin(req)) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id)
      return NextResponse.json({ error: 'ID is required' }, { status: 400 })

    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    const collection = db.collection('finished_products')

    const result = await collection.deleteOne({ _id: new ObjectId(id) })
    return NextResponse.json({ message: 'Deleted successfully', result })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
