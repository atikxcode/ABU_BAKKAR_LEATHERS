import clientPromise from '@/lib/mongodb'
import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'

const isAdmin = (req) => {
  const role = req.headers.get('role')
  return role === 'admin'
}

// Helper function to get client IP for audit trail
const getClientIP = (req) => {
  const forwarded = req.headers.get('x-forwarded-for')
  const realIP = req.headers.get('x-real-ip')
  const clientIP = forwarded ? forwarded.split(',')[0] : realIP
  return clientIP || 'unknown'
}

// UPDATED: Function to calculate net available quantities using unified removal system
const calculateNetAvailableFinishedProducts = async (db, filterQuery = {}) => {
  console.log('🔍 Calculating net available finished products...')
  
  const finishedProductsCollection = db.collection('finished_products')
  // CHANGED: Use unified stock_removal_logs with category filter
  const removalLogCollection = db.collection('stock_removal_logs')
  
  // Get finished products based on filter
  const finishedProducts = await finishedProductsCollection.find(filterQuery).toArray()
  
  // CHANGED: Get all completed finished product removals from unified collection
  const allRemovals = await removalLogCollection
    .find({ 
      category: 'finished_product', // NEW: Filter by category
      status: 'completed' 
    })
    .toArray()
  
  // Calculate net quantities by product ID
  const enhancedProducts = await Promise.all(
    finishedProducts.map(async (product) => {
      // CHANGED: Get removals for this specific product using productId field
      const productRemovals = allRemovals.filter(
        removal => removal.productId === product._id.toString()
      )
      
      const totalRemoved = productRemovals.reduce(
        (sum, removal) => sum + (removal.actualRemovedQuantity || 0), 0
      )
      
      // Use originalFulfilledQuantity if available, otherwise fulfilledQuantity
      const originalFulfilled = product.originalFulfilledQuantity || product.fulfilledQuantity || 0
      const currentAvailable = Math.max(0, originalFulfilled - totalRemoved)
      
      // Calculate movement statistics
      const percentageMoved = originalFulfilled > 0 
        ? ((totalRemoved / originalFulfilled) * 100).toFixed(2)
        : 0
      
      return {
        ...product,
        // ENHANCED: Quantity tracking with proper fallbacks
        originalFulfilledQuantity: originalFulfilled,
        totalRemoved: totalRemoved,
        currentAvailableQuantity: currentAvailable,
        percentageMoved: parseFloat(percentageMoved),
        
        // ENHANCED: Inventory status and movement tracking
        inventoryStatus: currentAvailable > 0 ? 'available' : 'sold_out',
        lastMovementDate: productRemovals.length > 0 
          ? new Date(Math.max(...productRemovals.map(r => new Date(r.removalDate))))
          : null,
        
        // UPDATED: Removal history summary using unified format
        removalHistory: {
          totalRemovals: productRemovals.length,
          totalQuantityRemoved: totalRemoved,
          lastRemovalDate: productRemovals.length > 0
            ? new Date(Math.max(...productRemovals.map(r => new Date(r.removalDate))))
            : null,
          removalDetails: productRemovals.map(r => ({
            id: r._id,
            date: r.removalDate,
            quantity: r.actualRemovedQuantity,
            purpose: r.purpose,
            destination: r.destination,
            confirmedBy: r.confirmedBy,
            category: r.category // NEW: Include category info
          }))
        },
        
        // ENHANCED: Data integrity and audit markers
        isOriginalRecord: true,
        dataPreserved: true,
        netQuantityCalculated: true,
        calculatedAt: new Date(),
        
        // ENHANCED: Business metrics
        turnoverRate: originalFulfilled > 0 ? ((totalRemoved / originalFulfilled) * 100).toFixed(2) : 0,
        stockStatus: currentAvailable === 0 ? 'depleted' : currentAvailable < (originalFulfilled * 0.2) ? 'low_stock' : 'adequate',
        
        // ENHANCED: Financial impact (if material costs available)
        financialImpact: product.materialCostBreakdown ? {
          originalValue: (product.materialCostBreakdown.perUnit || 0) * originalFulfilled,
          currentValue: (product.materialCostBreakdown.perUnit || 0) * currentAvailable,
          movedValue: (product.materialCostBreakdown.perUnit || 0) * totalRemoved
        } : null
      }
    })
  )
  
  console.log('📊 Net quantities calculated for', enhancedProducts.length, 'finished products using unified removal system')
  return enhancedProducts
}

// ENHANCED: Function to get comprehensive statistics
const getFinishedProductStatistics = (products) => {
  const totalProducts = products.length
  const totalOriginalProduced = products.reduce((sum, p) => sum + (p.originalFulfilledQuantity || p.fulfilledQuantity || 0), 0)
  const totalCurrentAvailable = products.reduce((sum, p) => sum + (p.currentAvailableQuantity || p.fulfilledQuantity || 0), 0)
  const totalRemoved = products.reduce((sum, p) => sum + (p.totalRemoved || 0), 0)
  const totalMaterialCost = products.reduce((sum, p) => {
    const cost = p.materialCostBreakdown?.totalForProduction || 
                 parseFloat(p.totalProductionMaterialCost) || 0
    return sum + cost
  }, 0)
  
  const availableProducts = products.filter(p => (p.currentAvailableQuantity || p.fulfilledQuantity || 0) > 0).length
  const soldOutProducts = products.filter(p => (p.currentAvailableQuantity || p.fulfilledQuantity || 0) === 0).length
  const lowStockProducts = products.filter(p => p.stockStatus === 'low_stock').length
  
  // ENHANCED: Advanced analytics
  const avgTurnoverRate = totalOriginalProduced > 0 
    ? ((totalRemoved / totalOriginalProduced) * 100).toFixed(2)
    : 0
  
  const inventoryValue = totalMaterialCost * (totalCurrentAvailable / Math.max(totalOriginalProduced, 1))
  const movedValue = totalMaterialCost * (totalRemoved / Math.max(totalOriginalProduced, 1))
  
  return {
    // Basic metrics
    totalProducts,
    totalOriginalProduced,
    totalCurrentAvailable,
    totalRemoved,
    totalMaterialCost,
    
    // Status breakdown
    availableProducts,
    soldOutProducts,
    lowStockProducts,
    
    // Performance metrics
    averageTurnoverRate: parseFloat(avgTurnoverRate),
    inventoryValue: parseFloat(inventoryValue.toFixed(2)),
    movedValue: parseFloat(movedValue.toFixed(2)),
    
    // Efficiency metrics
    stockEfficiency: totalOriginalProduced > 0 ? ((totalCurrentAvailable / totalOriginalProduced) * 100).toFixed(2) : 0,
    movementVelocity: totalProducts > 0 ? (totalRemoved / totalProducts).toFixed(2) : 0,
    
    // Financial overview
    financialOverview: {
      totalInvestment: totalMaterialCost,
      currentAssetValue: inventoryValue,
      realizedValue: movedValue,
      utilizationRate: totalMaterialCost > 0 ? ((movedValue / totalMaterialCost) * 100).toFixed(2) : 0
    }
  }
}

export async function GET(req) {
  console.log('🔍 GET /api/stock/finished_products - Starting')

  try {
    const { searchParams } = new URL(req.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const workerEmail = searchParams.get('workerEmail')
    const isWorkerRequest = searchParams.get('workerOnly') === 'true'
    const getNetQuantities = searchParams.get('getNetQuantities') // ENHANCED: Net quantities flag

    console.log('📝 Enhanced finished products request:', {
      startDate,
      endDate,
      workerEmail,
      isWorkerRequest,
      getNetQuantities,
      'Net quantities enabled': getNetQuantities === 'true'
    })

    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    const finishedCollection = db.collection('finished_products')
    const applicationsCollection = db.collection('production_apply')
    const productionCollection = db.collection('production')

    let query = {}

    if (startDate && endDate) {
      query.finishedAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate + 'T23:59:59.999Z'),
      }
    }

    let items

    if (isWorkerRequest && workerEmail) {
      console.log('📋 Getting worker finished products for:', workerEmail)

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
        
        // ENHANCED: Use net quantity calculation for worker requests too
        if (getNetQuantities === 'true') {
          console.log('🔍 Using unified net quantity calculation for worker request')
          items = await calculateNetAvailableFinishedProducts(db, query)
        } else {
          items = await finishedCollection.find(query).sort({ finishedAt: -1 }).toArray()
        }

        items = await Promise.all(
          items
            .map(async (item) => {
              const workerApp = workerApplications.find(
                (app) => app.jobId === item.productionJobId
              )

              const originalJob = await productionCollection.findOne({
                _id: new ObjectId(item.productionJobId),
              })

              return {
                ...item,
                workerContribution: workerApp ? workerApp.deliveredQuantity || 0 : 0,
                workerNotes: workerApp ? workerApp.note || '' : '',
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
      // ENHANCED: Admin request with unified net quantities
      console.log('📋 Processing admin request, net quantities:', getNetQuantities === 'true')
      
      if (getNetQuantities === 'true') {
        console.log('🔍 Calculating unified net quantities for admin request')
        items = await calculateNetAvailableFinishedProducts(db, query)
      } else {
        console.log('🔍 Getting basic finished products')
        items = await finishedCollection.find(query).sort({ finishedAt: -1 }).toArray()
      }

      // ENHANCED: Enrich items with production details
      items = await Promise.all(
        items.map(async (item) => {
          const applications = await applicationsCollection
            .find({
              jobId: item.productionJobId,
              status: 'approved',
            })
            .toArray()

          const originalJob = await productionCollection.findOne({
            _id: new ObjectId(item.productionJobId),
          })

          // ENHANCED: Use proper quantity for calculations
          const baseQuantity = item.originalFulfilledQuantity || item.fulfilledQuantity || 0
          const totalMaterialCostForProduction = (originalJob?.totalMaterialCost || 0) * baseQuantity

          // ENHANCED: Worker contributions with better data
          item.workerContributions = applications.map((app) => ({
            workerName: app.workerName,
            workerCompany: app.workerCompany || 'N/A',
            workerEmail: app.workerEmail,
            quantity: app.quantity,
            deliveredQuantity: app.deliveredQuantity || 0,
            note: app.note,
            materialCostForWorker:
              (originalJob?.totalMaterialCost || 0) * (app.deliveredQuantity || 0),
            contributionPercentage: baseQuantity > 0 
              ? (((app.deliveredQuantity || 0) / baseQuantity) * 100).toFixed(2)
              : 0
          }))

          // ENHANCED: Material information
          item.materials = originalJob?.materials || []
          item.totalMaterialCost = originalJob?.totalMaterialCost || 0
          item.materialCostBreakdown = {
            perUnit: originalJob?.totalMaterialCost || 0,
            totalForProduction: totalMaterialCostForProduction,
            totalDelivered: applications.reduce(
              (sum, app) =>
                sum +
                (originalJob?.totalMaterialCost || 0) * (app.deliveredQuantity || 0),
              0
            ),
            savings: totalMaterialCostForProduction - applications.reduce(
              (sum, app) =>
                sum +
                (originalJob?.totalMaterialCost || 0) * (app.deliveredQuantity || 0),
              0
            )
          }

          // ENHANCED: Production metadata
          item.productionMetadata = {
            totalWorkers: applications.length,
            avgDeliveryPerWorker: applications.length > 0 
              ? (applications.reduce((sum, app) => sum + (app.deliveredQuantity || 0), 0) / applications.length).toFixed(2)
              : 0,
            productionEfficiency: item.originalQuantity > 0 
              ? ((baseQuantity / item.originalQuantity) * 100).toFixed(2)
              : 0
          }

          return item
        })
      )
    }

    // ENHANCED: Response structure with comprehensive data
    if (getNetQuantities === 'true') {
      console.log('📊 Generating enhanced response with unified statistics')
      const statistics = getFinishedProductStatistics(items)
      
      const responseData = {
        items: items, // Enhanced items with net quantities
        statistics,
        metadata: {
          totalRecords: items.length,
          calculationMethod: 'unified_net_quantity_tracking',
          removalSystem: 'unified_stock_removal_logs',
          generatedAt: new Date(),
          queryFilters: {
            startDate,
            endDate,
            isWorkerRequest,
            workerEmail
          }
        },
        dataIntegrityNote: "Original finished product records are preserved. Net quantities calculated from unified removal logs.",
        message: 'Enhanced finished products with unified inventory tracking',
        version: '2.1'
      }

      console.log('✅ Returning enhanced finished products with unified net quantities:', items.length)
      return NextResponse.json(responseData)
    }

    console.log('✅ Returning basic finished products with material details:', items.length)
    return NextResponse.json(items)
  } catch (err) {
    console.error('❌ Error in enhanced finished products API:', err)
    console.error('Error stack:', err.stack)
    return NextResponse.json({ 
      error: 'Failed to retrieve finished products',
      details: err.message,
      timestamp: new Date()
    }, { status: 500 })
  }
}

export async function POST(req) {
  console.log('🚀 POST /api/stock/finished_products - Starting Enhanced Creation')

  try {
    if (!isAdmin(req)) {
      console.error('❌ Unauthorized access attempt')
      return NextResponse.json(
        { error: 'Admin access required for finished product creation' },
        { status: 403 }
      )
    }

    const body = await req.json()
    console.log('📝 Enhanced finished product request:', body)

    // ENHANCED: Validation
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
    const auditCollection = db.collection('audit_logs')

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

    // ENHANCED: Get comprehensive application data
    const applications = await applyCollection
      .find({
        jobId: body.productionJobId,
        status: 'approved',
      })
      .toArray()

    console.log('📋 Found approved applications:', applications.length)

    // ENHANCED: Worker company analysis
    const workerCompanies = applications
      .map((app) => app.workerCompany)
      .filter((company) => company && company.trim() !== '')
      .filter((company, index, arr) => arr.indexOf(company) === index)

    const workerDetails = applications.map(app => ({
      name: app.workerName,
      company: app.workerCompany || 'N/A',
      email: app.workerEmail,
      deliveredQuantity: app.deliveredQuantity || 0,
      contributionPercentage: productionJob.fulfilledQuantity > 0 
        ? (((app.deliveredQuantity || 0) / productionJob.fulfilledQuantity) * 100).toFixed(2)
        : 0
    }))

    console.log('🏢 Worker companies involved:', workerCompanies)

    // ENHANCED: Financial calculations
    const totalMaterialCostForProduction =
      (productionJob.totalMaterialCost || 0) * (productionJob.fulfilledQuantity || 0)
    const totalMaterialCostDelivered = applications.reduce(
      (sum, app) =>
        sum +
        (productionJob.totalMaterialCost || 0) * (app.deliveredQuantity || 0),
      0
    )

    const currentTimestamp = new Date()

    // ENHANCED: Comprehensive finished product document
    const finishedProduct = {
      // Basic product information
      productionJobId: body.productionJobId,
      productName: productionJob.productName,
      description: productionJob.description,
      originalQuantity: productionJob.quantity,
      fulfilledQuantity: productionJob.fulfilledQuantity || 0,
      remainingQuantity: productionJob.remainingQuantity || 0,
      image: productionJob.image,
      
      // Timing information
      finishedAt: currentTimestamp,
      finishedBy: body.finishedBy || 'Admin',
      notes: body.notes || '',
      status: 'completed',

      // Worker information
      workerCompanies: workerCompanies.length > 0 ? workerCompanies : ['N/A'],
      workerCompany: workerCompanies.length > 0 ? workerCompanies[0] : 'N/A',
      workerDetails: workerDetails,
      totalWorkers: applications.length,

      // Material information
      materials: productionJob.materials || [],
      totalMaterialCost: productionJob.totalMaterialCost || 0,
      materialCostBreakdown: {
        perUnit: productionJob.totalMaterialCost || 0,
        totalForProduction: totalMaterialCostForProduction,
        totalDelivered: totalMaterialCostDelivered,
        savings: totalMaterialCostForProduction - totalMaterialCostDelivered,
        efficiencyRate: totalMaterialCostForProduction > 0 
          ? ((totalMaterialCostDelivered / totalMaterialCostForProduction) * 100).toFixed(2)
          : 0
      },

      // ENHANCED: Comprehensive tracking metadata
      createdAt: currentTimestamp,
      updatedAt: currentTimestamp,
      createdBy: 'admin',
      clientIP: getClientIP(req),
      userAgent: req.headers.get('user-agent') || 'unknown',
      
      // ENHANCED: Data integrity and tracking markers
      isOriginalRecord: true,
      preserveOriginalQuantities: true,
      enableNetQuantityTracking: true,
      dataVersion: '2.1', // Updated version
      
      // ENHANCED: Initialize comprehensive quantity tracking
      originalFulfilledQuantity: productionJob.fulfilledQuantity || 0,
      currentAvailableQuantity: productionJob.fulfilledQuantity || 0,
      totalRemoved: 0,
      percentageMoved: 0,
      inventoryStatus: 'available',
      stockStatus: 'adequate',
      
      // ENHANCED: Production metrics
      productionMetrics: {
        originalOrderQuantity: productionJob.quantity,
        actualProducedQuantity: productionJob.fulfilledQuantity || 0,
        productionEfficiency: productionJob.quantity > 0 
          ? (((productionJob.fulfilledQuantity || 0) / productionJob.quantity) * 100).toFixed(2)
          : 0,
        averageWorkerContribution: applications.length > 0 
          ? ((productionJob.fulfilledQuantity || 0) / applications.length).toFixed(2)
          : 0,
        totalMaterialCostPerUnit: productionJob.fulfilledQuantity > 0 
          ? ((productionJob.totalMaterialCost || 0) / (productionJob.fulfilledQuantity || 1)).toFixed(2)
          : 0
      },
      
      // ENHANCED: System tracking with unified removal system
      systemMetadata: {
        creationMethod: 'enhanced_tracking',
        trackingVersion: '2.1',
        removalSystemEnabled: true,
        unifiedRemovalSystem: true, // NEW: Uses unified stock_removal_logs
        auditTrailEnabled: true,
        dataIntegrityProtected: true
      }
    }

    const result = await finishedCollection.insertOne(finishedProduct)
    console.log('✅ Enhanced finished product created:', result.insertedId)

    // ENHANCED: Update production job with comprehensive linking
    await productionCollection.updateOne(
      { _id: new ObjectId(body.productionJobId) },
      {
        $set: {
          status: 'finished',
          finishedAt: currentTimestamp,
          finishedProductId: result.insertedId,
          completionMetadata: {
            finishedBy: body.finishedBy || 'Admin',
            totalWorkers: applications.length,
            finalEfficiency: productionJob.quantity > 0 
              ? (((productionJob.fulfilledQuantity || 0) / productionJob.quantity) * 100).toFixed(2)
              : 0,
            enhancedTrackingEnabled: true,
            unifiedRemovalSystemReady: true // NEW
          }
        },
      }
    )

    // ENHANCED: Comprehensive audit log
    await auditCollection.insertOne({
      action: 'enhanced_finished_product_created',
      resourceType: 'finished_product',
      resourceId: result.insertedId,
      details: {
        productionJobId: body.productionJobId,
        productName: productionJob.productName,
        fulfilledQuantity: productionJob.fulfilledQuantity || 0,
        totalMaterialCost: totalMaterialCostForProduction,
        workerCompaniesCount: workerCompanies.length,
        totalWorkers: applications.length,
        productionEfficiency: productionJob.quantity > 0 
          ? (((productionJob.fulfilledQuantity || 0) / productionJob.quantity) * 100).toFixed(2)
          : 0,
        enhancedFeaturesEnabled: {
          netQuantityTracking: true,
          unifiedRemovalSystem: true, // NEW
          removalSystemReady: true,
          comprehensiveAuditTrail: true,
          dataIntegrityProtection: true
        },
        note: 'Enhanced finished product with unified tracking capabilities'
      },
      timestamp: currentTimestamp,
      clientIP: getClientIP(req),
      userAgent: req.headers.get('user-agent') || 'unknown',
      success: true
    })

    console.log('✅ Production job marked as finished with unified tracking')
    console.log('✅ POST /api/stock/finished_products - Enhanced Success')
    
    return NextResponse.json({
      success: true,
      insertedId: result.insertedId,
      message: 'Enhanced finished product created with unified inventory tracking',
      features: {
        originalQuantityPreserved: true,
        netQuantityTrackingEnabled: true,
        unifiedRemovalSystemReady: true, // NEW
        removalSystemReady: true,
        comprehensiveAuditTrail: true,
        enhancedMetrics: true
      },
      productDetails: {
        productName: productionJob.productName,
        fulfilledQuantity: productionJob.fulfilledQuantity || 0,
        totalWorkers: applications.length,
        materialCost: totalMaterialCostForProduction
      },
      version: '2.1' // Updated version
    }, { status: 201 })
  } catch (err) {
    console.error('❌ Enhanced POST finished products error:', err)
    console.error('Error stack:', err.stack)
    return NextResponse.json({ 
      error: 'Failed to create enhanced finished product',
      details: err.message,
      timestamp: new Date()
    }, { status: 500 })
  }
}

export async function DELETE(req) {
  console.log('🗑️ DELETE /api/stock/finished_products - Starting Enhanced Deletion')

  try {
    if (!isAdmin(req)) {
      console.error('❌ Unauthorized access attempt')
      return NextResponse.json(
        { error: 'Admin access required for finished product deletion' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      console.error('❌ Missing ID parameter')
      return NextResponse.json({ error: 'Product ID is required' }, { status: 400 })
    }

    if (!ObjectId.isValid(id)) {
      console.error('❌ Invalid ObjectId:', id)
      return NextResponse.json({ error: 'Invalid product ID format' }, { status: 400 })
    }

    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    const collection = db.collection('finished_products')
    const auditCollection = db.collection('audit_logs')
    // CHANGED: Use unified stock_removal_logs instead of separate collection
    const removalLogCollection = db.collection('stock_removal_logs')

    const existingItem = await collection.findOne({ _id: new ObjectId(id) })
    if (!existingItem) {
      console.error('❌ Finished product not found:', id)
      return NextResponse.json(
        { error: 'Finished product not found' },
        { status: 404 }
      )
    }

    // CHANGED: Check comprehensive removal history from unified system
    const associatedRemovals = await removalLogCollection
      .find({ 
        productId: id,
        category: 'finished_product' // NEW: Filter by category
      })
      .toArray()

    const totalRemovedQuantity = associatedRemovals.reduce((sum, r) => sum + (r.actualRemovedQuantity || 0), 0)
    const currentAvailable = (existingItem.originalFulfilledQuantity || existingItem.fulfilledQuantity || 0) - totalRemovedQuantity

    // ENHANCED: Deletion impact analysis
    const deletionImpact = {
      productName: existingItem.productName,
      originalQuantity: existingItem.originalFulfilledQuantity || existingItem.fulfilledQuantity || 0,
      currentAvailable: currentAvailable,
      totalRemoved: totalRemovedQuantity,
      associatedRemovals: associatedRemovals.length,
      materialValue: existingItem.materialCostBreakdown?.totalForProduction || 0,
      hasRemovalHistory: associatedRemovals.length > 0,
      dataLossWarning: associatedRemovals.length > 0 ? 'Historical removal data will be orphaned in unified system' : 'No removal history to preserve',
      unifiedSystemImpact: 'Removals tracked in unified stock_removal_logs system' // NEW
    }

    const result = await collection.deleteOne({ _id: new ObjectId(id) })

    // ENHANCED: Comprehensive audit log with unified system impact analysis
    await auditCollection.insertOne({
      action: 'enhanced_finished_product_deleted',
      resourceType: 'finished_product',
      resourceId: id,
      details: {
        deletedProduct: {
          id: existingItem._id,
          productName: existingItem.productName,
          originalFulfilledQuantity: existingItem.originalFulfilledQuantity || existingItem.fulfilledQuantity,
          productionJobId: existingItem.productionJobId,
          finishedAt: existingItem.finishedAt,
          createdAt: existingItem.createdAt
        },
        deletionImpact: deletionImpact,
        associatedRemovals: associatedRemovals.map(r => ({
          id: r._id,
          date: r.removalDate,
          quantity: r.actualRemovedQuantity,
          purpose: r.purpose,
          confirmedBy: r.confirmedBy,
          category: r.category // NEW: Include category
        })),
        unifiedSystemNote: 'Removal records remain in unified stock_removal_logs with category=finished_product', // NEW
        recommendations: {
          auditAction: associatedRemovals.length > 0 ? 'Review orphaned removal logs in unified system' : 'No follow-up required',
          dataRecovery: 'Original production data permanently lost',
          alternativeAction: 'Consider using unified removal system instead of deletion for inventory management'
        },
        note: 'Enhanced deletion with unified system impact analysis'
      },
      timestamp: new Date(),
      clientIP: getClientIP(req),
      userAgent: req.headers.get('user-agent') || 'unknown',
      success: result.deletedCount > 0,
      severity: associatedRemovals.length > 0 ? 'high' : 'medium'
    })

    console.log('✅ Enhanced DELETE finished product - Success with unified system impact analysis')
    
    return NextResponse.json({ 
      success: true,
      message: 'Finished product deleted successfully with unified system impact analysis', 
      deletionResult: {
        deletedCount: result.deletedCount,
        productName: existingItem.productName,
        impactAnalysis: deletionImpact
      },
      warnings: {
        removalHistoryLoss: associatedRemovals.length > 0,
        dataRecovery: 'Original production data permanently lost',
        orphanedRemovals: associatedRemovals.length,
        unifiedSystemNote: 'Removal records remain in unified stock_removal_logs' // NEW
      },
      recommendations: {
        auditAction: associatedRemovals.length > 0 ? 'Review and clean up orphaned removal logs in unified system' : 'No additional action required',
        futureAction: 'Use unified removal system (/api/stock/removal with category=finished_product) instead of record deletion'
      },
      version: '2.1' // Updated version
    })
  } catch (err) {
    console.error('❌ Enhanced DELETE finished products error:', err)
    console.error('Error stack:', err.stack)
    return NextResponse.json({ 
      error: 'Failed to delete finished product',
      details: err.message,
      timestamp: new Date()
    }, { status: 500 })
  }
}
