// app/api/<feature>/route.js
import clientPromise from '@/lib/mongodb'
import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'

// Helper function to check admin role (simple example, adapt as needed)
const isAdmin = (req) => {
  const role = req.headers.get('role') // assuming role sent in headers
  return role === 'admin'
}

export async function GET(req) {
  try {
    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    const collection = db.collection('finished_products') // replace with collection

    const items = await collection.find().toArray()
    return NextResponse.json(items)
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req) {
  try {
    const body = await req.json()
    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    const collection = db.collection('finished_products') // replace with collection

    const result = await collection.insertOne({
      ...body,
      date: new Date(),
      status: body.status || 'pending',
    })

    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(req) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    const body = await req.json()

    if (!id)
      return NextResponse.json({ error: 'ID is required' }, { status: 400 })

    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    const collection = db.collection('finished_products') // replace with collection

    const result = await collection.updateOne(
      { _id: new ObjectId(id) },
      { $set: body }
    )

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(req) {
  try {
    if (!isAdmin(req)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id)
      return NextResponse.json({ error: 'ID is required' }, { status: 400 })

    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    const collection = db.collection('finished_products') // replace with collection

    const result = await collection.deleteOne({ _id: new ObjectId(id) })
    return NextResponse.json({ message: 'Deleted successfully', result })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
