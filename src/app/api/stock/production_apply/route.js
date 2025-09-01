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

    // Use aggregation for better performance
    const pipeline = [
      {
        $match: {
          jobId: jobId,
          status: 'approved',
          deliveredQuantity: { $exists: true, $gt: 0 },
        },
      },
      {
        $group: {
          _id: '$jobId',
          totalDelivered: { $sum: '$deliveredQuantity' },
        },
      },
    ]

    const results = await applyCollection.aggregate(pipeline).toArray()
    const totalDeliveredQuantity =
      results.length > 0 ? results[0].totalDelivered : 0

    const originalJob = await productionCollection.findOne({
      _id: new ObjectId(jobId),
    })
    if (!originalJob) return false

    const remainingQuantity = Math.max(
      0,
      originalJob.quantity - totalDeliveredQuantity
    )

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

export async function GET(req) {
  console.log('🔍 GET /api/stock/production_apply - Starting')

  try {
    const { searchParams } = new URL(req.url)
    const jobId = searchParams.get('jobId')

    console.log('📝 GET request params:', { jobId })

    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    const applyCollection = db.collection('production_apply')
    const usersCollection = db.collection('user')

    let query = {}
    if (jobId) query.jobId = jobId

    const applications = await applyCollection.find(query).toArray()
    console.log(`📦 Found ${applications.length} applications`)

    // Enrich applications with worker details including company
    const enrichedApplications = await Promise.all(
      applications.map(async (app) => {
        const worker = await usersCollection.findOne({
          _id: new ObjectId(app.workerId),
        })
        return {
          ...app,
          workerPhone: worker?.phone || 'N/A',
          workerCompany: worker?.company || 'N/A', // ✅ ADDED COMPANY FIELD
          workerEmail: app.workerEmail || worker?.email || 'N/A',
        }
      })
    )

    console.log('✅ GET /api/stock/production_apply - Success')
    return NextResponse.json(enrichedApplications)
  } catch (err) {
    console.error('❌ GET /api/stock/production_apply error:', err)
    console.error('Error stack:', err.stack)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req) {
  console.log('🚀 POST /api/stock/production_apply - Starting')

  try {
    if (!isWorker(req)) {
      console.error('❌ Unauthorized access attempt')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const email = req.headers.get('email')
    if (!email) {
      console.error('❌ Missing worker email')
      return NextResponse.json(
        { error: 'Worker email not provided' },
        { status: 400 }
      )
    }

    const body = await req.json()
    const { jobId, quantity, note } = body

    console.log('📝 Application request:', { email, jobId, quantity })

    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    const usersCol = db.collection('user')
    const jobsCol = db.collection('production')
    const applyCol = db.collection('production_apply')

    const worker = await usersCol.findOne({ email })
    if (!worker) {
      console.error('❌ Worker not found:', email)
      return NextResponse.json({ error: 'Worker not found' }, { status: 404 })
    }

    const job = await jobsCol.findOne({ _id: new ObjectId(jobId) })
    if (!job) {
      console.error('❌ Job not found:', jobId)
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    if (job.status !== 'open') {
      console.error('❌ Job not open for applications:', job.status)
      return NextResponse.json(
        { error: 'Job not open for applications' },
        { status: 400 }
      )
    }

    const availableQuantity =
      job.remainingQuantity !== undefined ? job.remainingQuantity : job.quantity
    if (Number(quantity) > availableQuantity) {
      console.error('❌ Quantity exceeds available:', {
        requested: quantity,
        available: availableQuantity,
      })
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
    if (existing) {
      console.error('❌ Worker already applied:', {
        worker: worker.name,
        jobId,
      })
      return NextResponse.json(
        { error: 'You already applied for this job' },
        { status: 400 }
      )
    }

    // Store application with company info
    const result = await applyCol.insertOne({
      jobId,
      workerId: worker._id.toString(),
      workerName: worker.name,
      workerEmail: email,
      workerCompany: worker.company || 'N/A', // ✅ ADDED COMPANY STORAGE
      quantity: Number(quantity),
      note: note || '',
      status: 'pending',
      appliedAt: new Date(),
      deliveredQuantity: 0,
      deliveredAt: null,
      deliveredBy: null,
    })

    console.log('✅ Application created:', result.insertedId)
    console.log('✅ POST /api/stock/production_apply - Success')
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    console.error('❌ POST /api/stock/production_apply error:', err)
    console.error('Error stack:', err.stack)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(req) {
  console.log('🔄 PATCH /api/stock/production_apply - Starting')

  try {
    if (!isAdmin(req)) {
      console.error('❌ Unauthorized access attempt')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    const body = await req.json()

    console.log('📝 PATCH request:', { id, body })

    if (!id) {
      console.error('❌ Missing application ID')
      return NextResponse.json(
        { error: 'Application ID is required' },
        { status: 400 }
      )
    }

    if (!ObjectId.isValid(id)) {
      console.error('❌ Invalid ObjectId:', id)
      return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 })
    }

    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    const collection = db.collection('production_apply')

    const currentApp = await collection.findOne({ _id: new ObjectId(id) })
    if (!currentApp) {
      console.error('❌ Application not found:', id)
      return NextResponse.json(
        { error: 'Application not found' },
        { status: 404 }
      )
    }

    // Handle delivery confirmation
    if (body.deliveredQuantity !== undefined) {
      body.deliveredAt = new Date()
      body.deliveredBy = 'Admin'

      if (body.deliveredQuantity > currentApp.quantity) {
        console.error('❌ Delivered quantity exceeds approved:', {
          delivered: body.deliveredQuantity,
          approved: currentApp.quantity,
        })
        return NextResponse.json(
          {
            error: 'Delivered quantity cannot exceed approved quantity',
          },
          { status: 400 }
        )
      }
      console.log('📦 Delivery confirmed:', body.deliveredQuantity)
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
      console.log('🔄 Updating job quantities...')
      await updateJobQuantities(db, currentApp.jobId)
    }

    console.log('✅ PATCH /api/stock/production_apply - Success')
    return NextResponse.json(result)
  } catch (err) {
    console.error('❌ PATCH /api/stock/production_apply error:', err)
    console.error('Error stack:', err.stack)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(req) {
  console.log('🗑️ DELETE /api/stock/production_apply - Starting')

  try {
    if (!isAdmin(req)) {
      console.error('❌ Unauthorized access attempt')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      console.error('❌ Missing application ID')
      return NextResponse.json(
        { error: 'Application ID is required' },
        { status: 400 }
      )
    }

    if (!ObjectId.isValid(id)) {
      console.error('❌ Invalid ObjectId:', id)
      return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 })
    }

    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    const collection = db.collection('production_apply')

    const application = await collection.findOne({ _id: new ObjectId(id) })
    if (!application) {
      console.error('❌ Application not found:', id)
      return NextResponse.json(
        { error: 'Application not found' },
        { status: 404 }
      )
    }

    const result = await collection.deleteOne({ _id: new ObjectId(id) })

    if (application) {
      console.log('🔄 Updating job quantities after deletion...')
      await updateJobQuantities(db, application.jobId)
    }

    console.log('✅ DELETE /api/stock/production_apply - Success')
    return NextResponse.json({ message: 'Deleted successfully', result })
  } catch (err) {
    console.error('❌ DELETE /api/stock/production_apply error:', err)
    console.error('Error stack:', err.stack)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
