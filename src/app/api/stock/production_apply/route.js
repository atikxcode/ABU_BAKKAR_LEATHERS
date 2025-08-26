import clientPromise from '@/lib/mongodb'
import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'

// ----------------- Helpers -----------------
const isAdmin = (req) => req.headers.get('role') === 'admin'
const isWorker = (req) => req.headers.get('role') === 'worker'

// ----------------- GET -----------------
// GET /api/stock/production_apply?jobId=<jobId>
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const jobId = searchParams.get('jobId')

    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    const collection = db.collection('production_apply')

    let query = {}
    if (jobId) query.jobId = jobId

    const applications = await collection.find(query).toArray()
    return NextResponse.json(applications)
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ----------------- POST -----------------
// POST /api/stock/production_apply
export async function POST(req) {
  try {
    if (!isWorker(req)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const email = req.headers.get('email')
    if (!email) {
      return NextResponse.json(
        { error: 'Worker email not provided' },
        { status: 400 }
      )
    }

    const body = await req.json()
    const { jobId, quantity, note } = body

    if (!jobId || !quantity) {
      return NextResponse.json(
        { error: 'Job ID and quantity are required' },
        { status: 400 }
      )
    }

    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')

    const usersCol = db.collection('users')
    const jobsCol = db.collection('production')
    const applyCol = db.collection('production_apply')

    // Fetch worker from users collection
    const worker = await usersCol.findOne({ email })
    if (!worker) {
      return NextResponse.json({ error: 'Worker not found' }, { status: 404 })
    }

    // Fetch the job
    const job = await jobsCol.findOne({ _id: new ObjectId(jobId) })
    if (!job)
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    if (job.status !== 'open')
      return NextResponse.json(
        { error: 'Job not open for applications' },
        { status: 400 }
      )
    if (Number(quantity) > Number(job.quantity))
      return NextResponse.json(
        { error: `Cannot apply for more than ${job.quantity}` },
        { status: 400 }
      )

    // Check if worker already applied
    const existing = await applyCol.findOne({
      jobId,
      workerId: worker._id.toString(),
    })
    if (existing)
      return NextResponse.json(
        { error: 'You already applied for this job' },
        { status: 400 }
      )

    // Insert application
    const result = await applyCol.insertOne({
      jobId,
      workerId: worker._id.toString(),
      workerName: worker.name,
      quantity: Number(quantity),
      note: note || '',
      status: 'pending',
      appliedAt: new Date(),
    })

    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ----------------- PATCH -----------------
// PATCH /api/stock/production_apply?id=<applicationId>
export async function PATCH(req) {
  try {
    if (!isAdmin(req))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    const body = await req.json()

    if (!id)
      return NextResponse.json(
        { error: 'Application ID is required' },
        { status: 400 }
      )

    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    const collection = db.collection('production_apply')

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
// DELETE /api/stock/production_apply?id=<applicationId>
export async function DELETE(req) {
  try {
    if (!isAdmin(req))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id)
      return NextResponse.json(
        { error: 'Application ID is required' },
        { status: 400 }
      )

    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    const collection = db.collection('production_apply')

    const result = await collection.deleteOne({ _id: new ObjectId(id) })
    return NextResponse.json({ message: 'Deleted successfully', result })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
