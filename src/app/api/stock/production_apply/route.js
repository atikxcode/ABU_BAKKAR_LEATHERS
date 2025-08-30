// app/api/stock/production_apply/route.js
import clientPromise from '@/lib/mongodb'
import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'

// ----------------- Helpers -----------------
const isAdmin = (req) => req.headers.get('role') === 'admin'
const isWorker = (req) => req.headers.get('role') === 'worker'

// Helper function to update production job remaining quantity
const updateJobRemainingQuantity = async (db, jobId) => {
  try {
    const applyCollection = db.collection('production_apply')
    const productionCollection = db.collection('production')

    // Get all approved applications for this job
    const approvedApps = await applyCollection
      .find({
        jobId: jobId,
        status: 'approved',
      })
      .toArray()

    // Calculate total approved quantity
    const totalApprovedQuantity = approvedApps.reduce(
      (sum, app) => sum + app.quantity,
      0
    )

    // Get original job to calculate remaining quantity
    const originalJob = await productionCollection.findOne({
      _id: new ObjectId(jobId),
    })
    if (!originalJob) return false

    const remainingQuantity = Math.max(
      0,
      originalJob.quantity - totalApprovedQuantity
    )

    // Update the job with remaining quantity and fulfilled quantity
    await productionCollection.updateOne(
      { _id: new ObjectId(jobId) },
      {
        $set: {
          remainingQuantity: remainingQuantity,
          fulfilledQuantity: totalApprovedQuantity,
          updatedAt: new Date(),
        },
      }
    )

    // If remaining quantity is 0, automatically close the job
    if (remainingQuantity === 0) {
      await productionCollection.updateOne(
        { _id: new ObjectId(jobId) },
        { $set: { status: 'closed' } }
      )
    }

    return true
  } catch (error) {
    console.error('Error updating job remaining quantity:', error)
    return false
  }
}

// ----------------- GET -----------------
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

// ----------------- POST -----------------
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

    const usersCol = db.collection('user')
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

    // Check against remaining quantity if it exists, otherwise use original quantity
    const availableQuantity =
      job.remainingQuantity !== undefined ? job.remainingQuantity : job.quantity

    if (Number(quantity) > availableQuantity)
      return NextResponse.json(
        {
          error: `Cannot apply for more than ${availableQuantity} (remaining quantity)`,
        },
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

    // Get the current application to check for status change
    const currentApp = await collection.findOne({ _id: new ObjectId(id) })
    if (!currentApp) {
      return NextResponse.json(
        { error: 'Application not found' },
        { status: 404 }
      )
    }

    // Update the application
    const result = await collection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { ...body, updatedAt: new Date() } }
    )

    // If status is being changed, update the job's remaining quantity
    if (body.status && body.status !== currentApp.status) {
      await updateJobRemainingQuantity(db, currentApp.jobId)
    }

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ----------------- DELETE -----------------
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

    // Get the application before deleting to update job quantities
    const application = await collection.findOne({ _id: new ObjectId(id) })

    const result = await collection.deleteOne({ _id: new ObjectId(id) })

    // Update job remaining quantity after deletion
    if (application) {
      await updateJobRemainingQuantity(db, application.jobId)
    }

    return NextResponse.json({ message: 'Deleted successfully', result })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
