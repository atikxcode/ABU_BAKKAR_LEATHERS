import clientPromise from '@/lib/mongodb'
import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'

const isAdmin = (req) => req.headers.get('role') === 'admin'
const isWorker = (req) => req.headers.get('role') === 'worker'

// ✅ UPDATED: Modified to handle unlimited applications - no longer constrains by original quantity
const updateJobQuantities = async (db, jobId) => {
  try {
    const applyCollection = db.collection('production_apply')
    const productionCollection = db.collection('production')

    // Calculate total approved quantities (not limited by original job quantity)
    const approvedPipeline = [
      {
        $match: {
          jobId: jobId,
          status: 'approved'
        },
      },
      {
        $group: {
          _id: '$jobId',
          totalApproved: { $sum: '$quantity' },
        },
      },
    ]

    // Calculate total delivered quantities
    const deliveredPipeline = [
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

    const [approvedResults, deliveredResults] = await Promise.all([
      applyCollection.aggregate(approvedPipeline).toArray(),
      applyCollection.aggregate(deliveredPipeline).toArray()
    ])

    const totalApprovedQuantity = approvedResults.length > 0 ? approvedResults[0].totalApproved : 0
    const totalDeliveredQuantity = deliveredResults.length > 0 ? deliveredResults[0].totalDelivered : 0

    const originalJob = await productionCollection.findOne({
      _id: new ObjectId(jobId),
    })
    if (!originalJob) return false

    // ✅ NEW: Calculate remaining based on approved quantities, not original job quantity
    const remainingFromApproved = Math.max(0, totalApprovedQuantity - totalDeliveredQuantity)
    
    // ✅ NEW: Track if job exceeded original target
    const exceededOriginalTarget = totalApprovedQuantity > originalJob.quantity
    const exceedanceAmount = Math.max(0, totalApprovedQuantity - originalJob.quantity)

    await productionCollection.updateOne(
      { _id: new ObjectId(jobId) },
      {
        $set: {
          // ✅ UPDATED: New tracking fields for unlimited application model
          approvedQuantity: totalApprovedQuantity, // Total approved by admin
          remainingQuantity: remainingFromApproved, // Remaining from approved (for delivery tracking)
          fulfilledQuantity: totalDeliveredQuantity, // Actually delivered
          originalTargetQuantity: originalJob.quantity, // Preserve original target
          exceededOriginalTarget: exceededOriginalTarget,
          exceedanceAmount: exceedanceAmount,
          
          // ✅ NEW: Progress tracking
          progressStats: {
            targetQuantity: originalJob.quantity,
            approvedQuantity: totalApprovedQuantity,
            deliveredQuantity: totalDeliveredQuantity,
            progressPercentage: originalJob.quantity > 0 ? ((totalDeliveredQuantity / originalJob.quantity) * 100).toFixed(2) : 0,
            approvalPercentage: originalJob.quantity > 0 ? ((totalApprovedQuantity / originalJob.quantity) * 100).toFixed(2) : 0,
            exceededTarget: exceededOriginalTarget,
            exceedancePercentage: exceededOriginalTarget ? ((exceedanceAmount / originalJob.quantity) * 100).toFixed(2) : 0
          },
          
          updatedAt: new Date(),
          lastQuantityUpdate: new Date(),
          unlimitedApplicationsEnabled: true // Flag to indicate this job uses unlimited model
        },
      }
    )

    console.log('📊 Job quantities updated:', {
      jobId,
      originalTarget: originalJob.quantity,
      totalApproved: totalApprovedQuantity,
      totalDelivered: totalDeliveredQuantity,
      exceededTarget: exceededOriginalTarget,
      exceedance: exceedanceAmount
    })

    return true
  } catch (error) {
    console.error('❌ Error updating job quantities:', error)
    return false
  }
}

export async function GET(req) {
  console.log('🔍 GET /api/stock/production_apply - Starting')

  try {
    const { searchParams } = new URL(req.url)
    const jobId = searchParams.get('jobId')

    console.log('🔍 GET request params:', { jobId })

    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    const applyCollection = db.collection('production_apply')
    const usersCollection = db.collection('user')

    let query = {}
    if (jobId) query.jobId = jobId

    const applications = await applyCollection.find(query).toArray()
    console.log(`📊 Found ${applications.length} applications`)

    const enrichedApplications = await Promise.all(
      applications.map(async (app) => {
        const worker = await usersCollection.findOne({
          _id: new ObjectId(app.workerId),
        })
        return {
          ...app,
          workerPhone: worker?.phone || 'N/A',
          workerCompany: app.workerCompany || worker?.company || 'N/A',
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
  console.log('📝 POST /api/stock/production_apply - Starting')

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
    const { jobId, quantity, note, company } = body

    console.log('📝 Application request:', {
      email,
      jobId,
      quantity,
      note,
      company,
    })

    // ✅ UPDATED: Enhanced validation (removed quantity limit check)
    if (!quantity || Number(quantity) <= 0) {
      console.error('❌ Invalid quantity')
      return NextResponse.json(
        { error: 'Quantity must be a positive number' },
        { status: 400 }
      )
    }

    // ✅ NEW: Add reasonable upper limit to prevent abuse (optional)
    if (Number(quantity) > 50000) {
      console.error('❌ Quantity too large')
      return NextResponse.json(
        { error: 'Quantity cannot exceed 50,000 pieces for a single application' },
        { status: 400 }
      )
    }

    if (!note || note.trim() === '') {
      console.error('❌ Missing note')
      return NextResponse.json({ error: 'Note is required' }, { status: 400 })
    }

    if (!company || company.trim() === '') {
      console.error('❌ Missing company')
      return NextResponse.json(
        { error: 'Company name is required' },
        { status: 400 }
      )
    }

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

    // ✅ REMOVED: Quantity limit validation - workers can now apply for any amount
    // ✅ INFO: Log that unlimited applications are enabled
    console.log('📈 Unlimited applications enabled - no quantity restrictions')
    console.log('📊 Original target quantity:', job.quantity)
    console.log('📊 Applied quantity:', quantity)
    if (Number(quantity) > job.quantity) {
      console.log('🔥 Application exceeds original target by:', Number(quantity) - job.quantity)
    }

    // Check if worker already applied
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

    // ✅ UPDATED: Enhanced application document with unlimited application metadata
    const applicationDocument = {
      jobId,
      workerId: worker._id.toString(),
      workerName: worker.name,
      workerEmail: email,
      workerCompany: company.trim(),
      quantity: Number(quantity),
      note: note.trim(),
      status: 'pending',
      appliedAt: new Date(),
      deliveredQuantity: 0,
      deliveredAt: null,
      deliveredBy: null,
      
      // ✅ NEW: Enhanced metadata for unlimited applications
      unlimitedApplicationEnabled: true,
      originalJobTarget: job.quantity,
      exceedsOriginalTarget: Number(quantity) > job.quantity,
      exceedanceAmount: Math.max(0, Number(quantity) - job.quantity),
      applicationMetadata: {
        appliedViaUnlimitedMode: true,
        targetExceedancePercentage: job.quantity > 0 ? ((Math.max(0, Number(quantity) - job.quantity) / job.quantity) * 100).toFixed(2) : 0,
        applicationToTargetRatio: job.quantity > 0 ? (Number(quantity) / job.quantity).toFixed(2) : 0
      }
    }

    const result = await applyCol.insertOne(applicationDocument)

    // Update job quantities after new application
    await updateJobQuantities(db, jobId)

    console.log('✅ Application created:', result.insertedId)
    console.log('📊 Application summary:', {
      worker: worker.name,
      quantity: Number(quantity),
      exceedsTarget: Number(quantity) > job.quantity,
      targetQuantity: job.quantity
    })
    console.log('✅ POST /api/stock/production_apply - Success')
    
    return NextResponse.json({
      ...result,
      message: 'Application submitted successfully',
      applicationInfo: {
        appliedQuantity: Number(quantity),
        originalTarget: job.quantity,
        exceedsTarget: Number(quantity) > job.quantity,
        exceedanceAmount: Math.max(0, Number(quantity) - job.quantity)
      }
    }, { status: 201 })
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

    console.log('🔄 PATCH request:', { id, body })

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

    // Handle delivery quantity updates
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

    // ✅ NEW: Enhanced update with unlimited application metadata
    const updateData = {
      ...body,
      updatedAt: new Date(),
      lastModifiedBy: 'admin'
    }

    // ✅ NEW: Track status changes for unlimited applications
    if (body.status && body.status !== currentApp.status) {
      updateData.statusHistory = [
        ...(currentApp.statusHistory || []),
        {
          from: currentApp.status,
          to: body.status,
          changedAt: new Date(),
          changedBy: 'admin',
          unlimitedApplicationContext: currentApp.exceedsOriginalTarget || false
        }
      ]
      
      console.log('📈 Status change tracking:', {
        from: currentApp.status,
        to: body.status,
        exceedsTarget: currentApp.exceedsOriginalTarget
      })
    }

    const result = await collection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    )

    // Update job quantities whenever delivery or status changes
    if (
      body.deliveredQuantity !== undefined ||
      (body.status && body.status !== currentApp.status)
    ) {
      console.log('🔄 Updating job quantities...')
      await updateJobQuantities(db, currentApp.jobId)
    }

    console.log('✅ PATCH /api/stock/production_apply - Success')
    return NextResponse.json({
      ...result,
      message: 'Application updated successfully',
      unlimitedApplicationEnabled: true
    })
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

    // Update job quantities after deletion
    if (application) {
      console.log('🔄 Updating job quantities after deletion...')
      await updateJobQuantities(db, application.jobId)
      
      // ✅ NEW: Log deletion of unlimited application
      console.log('🗑️ Deleted unlimited application:', {
        worker: application.workerName,
        quantity: application.quantity,
        exceededTarget: application.exceedsOriginalTarget || false,
        originalTarget: application.originalJobTarget
      })
    }

    console.log('✅ DELETE /api/stock/production_apply - Success')
    return NextResponse.json({
      message: 'Application deleted successfully',
      result,
      deletedApplicationInfo: {
        workerName: application.workerName,
        quantity: application.quantity,
        exceededTarget: application.exceedsOriginalTarget || false
      }
    })
  } catch (err) {
    console.error('❌ DELETE /api/stock/production_apply error:', err)
    console.error('Error stack:', err.stack)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
