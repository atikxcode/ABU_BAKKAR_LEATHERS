// app/api/stock/production_apply/route.js
import clientPromise from '@/lib/mongodb'
import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'

const isAdmin = (req) => req.headers.get('role') === 'admin'
const isWorker = (req) => req.headers.get('role') === 'worker'

// Helper function to update production job quantities
const updateJobQuantities = async (db, jobId) => {
  try {
    const applyCollection = db.collection('production_apply')
    const productionCollection = db.collection('production')

    // Get all delivered applications for this job
    const deliveredApps = await applyCollection
      .find({
        jobId: jobId,
        status: 'approved',
        deliveredQuantity: { $exists: true, $gt: 0 },
      })
      .toArray()

    // Calculate total delivered quantity
    const totalDeliveredQuantity = deliveredApps.reduce(
      (sum, app) => sum + (app.deliveredQuantity || 0),
      0
    )

    // Get original job to calculate remaining quantity
    const originalJob = await productionCollection.findOne({
      _id: new ObjectId(jobId),
    })
    if (!originalJob) return false

    const remainingQuantity = Math.max(
      0,
      originalJob.quantity - totalDeliveredQuantity
    )

    // Update the job with delivered quantities
    await productionCollection.updateOne(
      { _id: new ObjectId(jobId) },
      {
        $set: {
          remainingQuantity: remainingQuantity,
          fulfilledQuantity: totalDeliveredQuantity,
          updatedAt: new Date(),
        },
      }
    )

    return true
  } catch (error) {
    console.error('Error updating job quantities:', error)
    return false
  }
}

// GET endpoint remains the same
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const jobId = searchParams.get('jobId')

    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    const applyCollection = db.collection('production_apply')
    const usersCollection = db.collection('user')

    let query = {}
    if (jobId) query.jobId = jobId

    const applications = await applyCollection.find(query).toArray()

    // Enrich applications with worker phone numbers
    const enrichedApplications = await Promise.all(
      applications.map(async (app) => {
        const worker = await usersCollection.findOne({
          _id: new ObjectId(app.workerId),
        })
        return {
          ...app,
          workerPhone: worker?.phone || 'N/A',
          workerEmail: worker?.email || 'N/A',
        }
      })
    )

    return NextResponse.json(enrichedApplications)
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST endpoint remains the same
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

    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    const usersCol = db.collection('user')
    const jobsCol = db.collection('production')
    const applyCol = db.collection('production_apply')

    const worker = await usersCol.findOne({ email })
    if (!worker) {
      return NextResponse.json({ error: 'Worker not found' }, { status: 404 })
    }

    const job = await jobsCol.findOne({ _id: new ObjectId(jobId) })
    if (!job)
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    if (job.status !== 'open')
      return NextResponse.json(
        { error: 'Job not open for applications' },
        { status: 400 }
      )

    const availableQuantity =
      job.remainingQuantity !== undefined ? job.remainingQuantity : job.quantity
    if (Number(quantity) > availableQuantity) {
      return NextResponse.json(
        {
          error: `Cannot apply for more than ${availableQuantity} (remaining quantity)`,
        },
        { status: 400 }
      )
    }

    const existing = await applyCol.findOne({
      jobId,
      workerId: worker._id.toString(),
    })
    if (existing)
      return NextResponse.json(
        { error: 'You already applied for this job' },
        { status: 400 }
      )

    const result = await applyCol.insertOne({
      jobId,
      workerId: worker._id.toString(),
      workerName: worker.name,
      quantity: Number(quantity),
      note: note || '',
      status: 'pending',
      appliedAt: new Date(),
      deliveredQuantity: 0, // Initialize delivered quantity
      deliveredAt: null,
      deliveredBy: null,
    })

    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// Enhanced PATCH endpoint to handle delivery confirmations
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

    // Get the current application
    const currentApp = await collection.findOne({ _id: new ObjectId(id) })
    if (!currentApp) {
      return NextResponse.json(
        { error: 'Application not found' },
        { status: 404 }
      )
    }

    // Handle delivery confirmation
    if (body.deliveredQuantity !== undefined) {
      body.deliveredAt = new Date()
      body.deliveredBy = 'Admin'

      // Validate delivered quantity doesn't exceed approved quantity
      if (body.deliveredQuantity > currentApp.quantity) {
        return NextResponse.json(
          {
            error: 'Delivered quantity cannot exceed approved quantity',
          },
          { status: 400 }
        )
      }
    }

    // Update the application
    const result = await collection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { ...body, updatedAt: new Date() } }
    )

    // Update job quantities if delivery was confirmed or status changed
    if (
      body.deliveredQuantity !== undefined ||
      (body.status && body.status !== currentApp.status)
    ) {
      await updateJobQuantities(db, currentApp.jobId)
    }

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE endpoint remains the same
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

    const application = await collection.findOne({ _id: new ObjectId(id) })
    const result = await collection.deleteOne({ _id: new ObjectId(id) })

    if (application) {
      await updateJobQuantities(db, application.jobId)
    }

    return NextResponse.json({ message: 'Deleted successfully', result })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
