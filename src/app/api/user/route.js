import clientPromise from '@/lib/mongodb'
import { NextResponse } from 'next/server'

// GET: return all users OR check by email if provided
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const email = searchParams.get('email')

    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')

    if (email) {
      const user = await db.collection('user').findOne({ email })
      return NextResponse.json({ exists: !!user, user })
    }

    const users = await db.collection('user').find().toArray()
    return NextResponse.json(users)
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST: insert user only if not exists
export async function POST(req) {
  try {
    const body = await req.json()
    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')

    // check if user already exists
    const existingUser = await db
      .collection('user')
      .findOne({ email: body.email })
    if (existingUser) {
      return NextResponse.json(
        { message: 'User already exists', user: existingUser },
        { status: 200 }
      )
    }

    // enforce pending if not provided
    body.status = body.status || 'pending'

    const result = await db.collection('user').insertOne(body)
    return NextResponse.json(
      { message: 'User created', result },
      { status: 201 }
    )
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// PATCH: approve user (admin only)
export async function PATCH(req) {
  try {
    const body = await req.json()
    const { email, status } = body

    if (!email || !status) {
      return NextResponse.json(
        { error: 'Email and status required' },
        { status: 400 }
      )
    }

    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')

    const result = await db
      .collection('user')
      .updateOne({ email }, { $set: { status } })

    return NextResponse.json({ message: 'User status updated', result })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
