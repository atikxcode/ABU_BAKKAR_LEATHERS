import clientPromise from '@/lib/mongodb'
import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'

// Helper function to check admin role
const isAdmin = (req) => {
  const role = req.headers.get('role')
  return role === 'admin'
}

export async function GET(req) {
  console.log('🔍 GET /api/stock/finished_products - Starting')

  try {
    const { searchParams } = new URL(req.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const workerEmail = searchParams.get('workerEmail')
    const isWorkerRequest = searchParams.get('workerOnly') === 'true'

    console.log('📝 Finished products request:', {
      startDate,
      endDate,
      workerEmail,
      isWorkerRequest,
    })

    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    const finishedCollection = db.collection('finished_products')
    const applicationsCollection = db.collection('production_apply')
    const productionCollection = db.collection('production') // Added for material details

    // Build query
    let query = {}

    // Date range filter
    if (startDate && endDate) {
      query.finishedAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate + 'T23:59:59.999Z'),
      }
    }

    let items
    if (isWorkerRequest && workerEmail) {
      console.log('📋 Getting worker finished products for:', workerEmail)

      // Get worker's approved applications with actual deliveries only
      const workerApplications = await applicationsCollection
        .find({
          workerEmail: workerEmail,
          status: 'approved',
          deliveredQuantity: { $exists: true, $gt: 0 },
        })
        .toArray()

      console.log('📝 Worker applications found:', workerApplications.length)

      const jobIds = workerApplications.map((app) => app.jobId)

      if (jobIds.length > 0) {
        query.productionJobId = { $in: jobIds }
        items = await finishedCollection
          .find(query)
          .sort({ finishedAt: -1 })
          .toArray()

        // Enrich with worker's ACTUAL contribution data and material details
        items = await Promise.all(
          items
            .map(async (item) => {
              const workerApp = workerApplications.find(
                (app) => app.jobId === item.productionJobId
              )

              // Get original production job for material details
              const originalJob = await productionCollection.findOne({
                _id: new ObjectId(item.productionJobId),
              })

              return {
                ...item,
                workerContribution: workerApp
                  ? workerApp.deliveredQuantity || 0
                  : 0,
                workerNotes: workerApp ? workerApp.note || '' : '',
                // Add material details from original job
                materials: originalJob?.materials || [],
                totalMaterialCost: originalJob?.totalMaterialCost || 0,
                materialCostBreakdown: {
                  perUnit: originalJob?.totalMaterialCost || 0,
                  totalForWorkerContribution:
                    (originalJob?.totalMaterialCost || 0) *
                    (workerApp?.deliveredQuantity || 0),
                },
              }
            })
            .filter((item) => item.workerContribution > 0)
        )
      } else {
        items = []
      }
    } else {
      // Admin request - get all finished products
      items = await finishedCollection
        .find(query)
        .sort({ finishedAt: -1 })
        .toArray()

      // Enrich with worker contribution data and material details for admin view
      items = await Promise.all(
        items.map(async (item) => {
          const applications = await applicationsCollection
            .find({
              jobId: item.productionJobId,
              status: 'approved',
            })
            .toArray()

          // Get original production job for material details
          const originalJob = await productionCollection.findOne({
            _id: new ObjectId(item.productionJobId),
          })

          // Calculate total material cost for the entire production
          const totalMaterialCostForProduction =
            (originalJob?.totalMaterialCost || 0) * item.fulfilledQuantity

          item.workerContributions = applications.map((app) => ({
            workerName: app.workerName,
            workerCompany: app.workerCompany || 'N/A',
            workerEmail: app.workerEmail,
            quantity: app.quantity,
            deliveredQuantity: app.deliveredQuantity || 0,
            note: app.note,
            // Calculate material cost for this worker's contribution
            materialCostForWorker:
              (originalJob?.totalMaterialCost || 0) *
              (app.deliveredQuantity || 0),
          }))

          // Add material details from original production job
          item.materials = originalJob?.materials || []
          item.totalMaterialCost = originalJob?.totalMaterialCost || 0
          item.materialCostBreakdown = {
            perUnit: originalJob?.totalMaterialCost || 0,
            totalForProduction: totalMaterialCostForProduction,
            totalDelivered: applications.reduce(
              (sum, app) =>
                sum +
                (originalJob?.totalMaterialCost || 0) *
                  (app.deliveredQuantity || 0),
              0
            ),
          }

          return item
        })
      )
    }

    console.log(
      '✅ Returning finished products with material details:',
      items.length
    )
    return NextResponse.json(items)
  } catch (err) {
    console.error('❌ Error in finished products API:', err)
    console.error('Error stack:', err.stack)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req) {
  console.log('🚀 POST /api/stock/finished_products - Starting')

  try {
    if (!isAdmin(req)) {
      console.error('❌ Unauthorized access attempt')
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      )
    }

    const body = await req.json()
    console.log('📝 Finished product request:', body)

    if (!body.productionJobId) {
      console.error('❌ Missing production job ID')
      return NextResponse.json(
        { error: 'Production job ID is required' },
        { status: 400 }
      )
    }

    if (!ObjectId.isValid(body.productionJobId)) {
      console.error('❌ Invalid production job ID format')
      return NextResponse.json(
        { error: 'Invalid production job ID format' },
        { status: 400 }
      )
    }

    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    const finishedCollection = db.collection('finished_products')
    const productionCollection = db.collection('production')
    const applyCollection = db.collection('production_apply')

    // Get the original production job
    const productionJob = await productionCollection.findOne({
      _id: new ObjectId(body.productionJobId),
    })

    if (!productionJob) {
      console.error('❌ Production job not found:', body.productionJobId)
      return NextResponse.json(
        { error: 'Production job not found' },
        { status: 404 }
      )
    }

    console.log('📦 Found production job:', productionJob.productName)

    // Get worker companies from applications
    const applications = await applyCollection
      .find({
        jobId: body.productionJobId,
        status: 'approved',
      })
      .toArray()

    console.log('📋 Found approved applications:', applications.length)

    // Collect all worker companies from applications
    const workerCompanies = applications
      .map((app) => app.workerCompany)
      .filter((company) => company && company.trim() !== '')
      .filter((company, index, arr) => arr.indexOf(company) === index) // Remove duplicates

    console.log('🏢 Worker companies involved:', workerCompanies)

    // Calculate total material costs
    const totalMaterialCostForProduction =
      (productionJob.totalMaterialCost || 0) * productionJob.fulfilledQuantity
    const totalMaterialCostDelivered = applications.reduce(
      (sum, app) =>
        sum +
        (productionJob.totalMaterialCost || 0) * (app.deliveredQuantity || 0),
      0
    )

    // Create finished product entry with complete material details
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
      // Worker companies
      workerCompanies: workerCompanies.length > 0 ? workerCompanies : ['N/A'],
      workerCompany: workerCompanies.length > 0 ? workerCompanies[0] : 'N/A',
      // Material details from original production job
      materials: productionJob.materials || [],
      totalMaterialCost: productionJob.totalMaterialCost || 0,
      materialCostBreakdown: {
        perUnit: productionJob.totalMaterialCost || 0,
        totalForProduction: totalMaterialCostForProduction,
        totalDelivered: totalMaterialCostDelivered,
        savings: totalMaterialCostForProduction - totalMaterialCostDelivered,
      },
    }

    const result = await finishedCollection.insertOne(finishedProduct)
    console.log(
      '✅ Finished product created with material details:',
      result.insertedId
    )

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

    console.log('✅ Production job marked as finished')
    console.log('✅ POST /api/stock/finished_products - Success')
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    console.error('❌ POST /api/stock/finished_products error:', err)
    console.error('Error stack:', err.stack)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(req) {
  console.log('🗑️ DELETE /api/stock/finished_products - Starting')

  try {
    if (!isAdmin(req)) {
      console.error('❌ Unauthorized access attempt')
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      console.error('❌ Missing ID parameter')
      return NextResponse.json({ error: 'ID is required' }, { status: 400 })
    }

    if (!ObjectId.isValid(id)) {
      console.error('❌ Invalid ObjectId:', id)
      return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 })
    }

    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    const collection = db.collection('finished_products')

    const existingItem = await collection.findOne({ _id: new ObjectId(id) })
    if (!existingItem) {
      console.error('❌ Finished product not found:', id)
      return NextResponse.json(
        { error: 'Finished product not found' },
        { status: 404 }
      )
    }

    const result = await collection.deleteOne({ _id: new ObjectId(id) })
    console.log('✅ DELETE /api/stock/finished_products - Success')
    return NextResponse.json({ message: 'Deleted successfully', result })
  } catch (err) {
    console.error('❌ DELETE /api/stock/finished_products error:', err)
    console.error('Error stack:', err.stack)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
