// app/api/production/route.js
import clientPromise from '@/lib/mongodb'
import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'

// Load from .env.local
const imageHostingKey = process.env.NEXT_PUBLIC_IMGBB_KEY
const imageHostingApi = `https://api.imgbb.com/1/upload?key=${imageHostingKey}`

// Helper function to check admin role
const isAdmin = (req) => {
  const role = req.headers.get('role') // assuming role sent in headers
  return role === 'admin'
}

// ----------------- GET -----------------
export async function GET(req) {
  try {
    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    const collection = db.collection('production')

    const items = await collection.find().toArray()
    return NextResponse.json(items)
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ----------------- POST -----------------
export async function POST(req) {
  try {
    const body = await req.json()
    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    const collection = db.collection('production')

    let imageUrl = null

    // Upload image to IMGBB if frontend sent Base64 string
    if (body.image) {
      const form = new URLSearchParams()
      form.append('image', body.image) // Base64 without data:image/... prefix

      const uploadRes = await fetch(imageHostingApi, {
        method: 'POST',
        body: form,
      })

      const uploadData = await uploadRes.json()
      if (uploadData.success) {
        imageUrl = uploadData.data.display_url // store hosted image
      } else {
        console.error('IMGBB upload failed', uploadData)
      }
    }

    const result = await collection.insertOne({
      productName: body.productName,
      description: body.description,
      quantity: body.quantity,
      unit: body.unit || 'pcs',
      image: imageUrl,
      date: new Date(),
      status: body.status || 'pending',
    })

    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ----------------- PATCH -----------------
export async function PATCH(req) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    const body = await req.json()

    if (!id)
      return NextResponse.json({ error: 'ID is required' }, { status: 400 })

    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    const collection = db.collection('production')

    const result = await collection.updateOne(
      { _id: new ObjectId(id) },
      { $set: body }
    )

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ----------------- DELETE -----------------
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
    const collection = db.collection('production')

    const result = await collection.deleteOne({ _id: new ObjectId(id) })
    return NextResponse.json({ message: 'Deleted successfully', result })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
