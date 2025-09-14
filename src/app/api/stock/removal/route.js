import clientPromise from '@/lib/mongodb'
import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'

// Authentication helper (enhanced)
const isAdmin = (req) => {
  const role = req.headers.get('role')
  return role === 'admin'
}

// Get client IP address for audit logging
const getClientIP = (req) => {
  const forwarded = req.headers.get('x-forwarded-for')
  const realIP = req.headers.get('x-real-ip')
  const clientIP = forwarded ? forwarded.split(',') : realIP
  return clientIP || 'unknown'
}

// ENHANCED: Helper function to calculate net available stock for leather, materials, AND finished products
const calculateCurrentNetStock = async (db, stockType, category) => {
  console.log(`🔍 Calculating net stock for: ${stockType} (${category})`)
  
  // Determine which collections to use based on category
  let stockCollection, removalLogCollection, typeField, queryField
  
  if (category === 'leather') {
    stockCollection = db.collection('leather')
    removalLogCollection = db.collection('stock_removal_logs')
    typeField = 'type'
    queryField = 'stockType'
  } else if (category === 'material') {
    stockCollection = db.collection('materials')
    removalLogCollection = db.collection('material_removal_logs')
    typeField = 'material'
    queryField = 'materialType'
  } else if (category === 'finished_product') {
    // Handle finished products
    stockCollection = db.collection('finished_products')
    removalLogCollection = db.collection('stock_removal_logs') // Use same collection with category filter
    typeField = '_id' // For finished products, we match by product ID
    queryField = 'productId'
  } else {
    throw new Error(`Invalid category: ${category}. Must be 'leather', 'material', or 'finished_product'`)
  }
  
  if (category === 'finished_product') {
    // Special handling for finished products
    const finishedProduct = await stockCollection.findOne({ _id: new ObjectId(stockType) })
    if (!finishedProduct) {
      return {
        totalOriginal: 0,
        totalRemoved: 0,
        netAvailable: 0,
        approvedEntries: 0,
        category
      }
    }
    
    const totalOriginal = finishedProduct.originalFulfilledQuantity || finishedProduct.fulfilledQuantity || 0
    
    // Get total removed for this specific product
    const completedRemovals = await removalLogCollection
      .find({ 
        productId: stockType,
        category: category,
        status: 'completed' 
      })
      .toArray()
    
    const totalRemoved = completedRemovals.reduce((sum, removal) => sum + (removal.actualRemovedQuantity || 0), 0)
    const netAvailable = Math.max(0, totalOriginal - totalRemoved)
    
    console.log(`📊 Finished product calculation for ${stockType}: Original=${totalOriginal}, Removed=${totalRemoved}, Net=${netAvailable}`)
    
    return {
      totalOriginal,
      totalRemoved,
      netAvailable,
      approvedEntries: 1,
      category,
      productData: finishedProduct
    }
  } else {
    // Original logic for leather and materials
    const approvedEntries = await stockCollection
      .find({ 
        [typeField]: stockType, 
        status: 'approved' 
      })
      .toArray()
    
    const totalOriginal = approvedEntries.reduce((sum, entry) => sum + entry.quantity, 0)
    
    const completedRemovals = await removalLogCollection
      .find({ 
        [queryField]: stockType,
        category: category,
        status: 'completed' 
      })
      .toArray()
    
    const totalRemoved = completedRemovals.reduce((sum, removal) => sum + (removal.actualRemovedQuantity || 0), 0)
    const netAvailable = Math.max(0, totalOriginal - totalRemoved)
    
    console.log(`📊 Stock calculation for ${stockType} (${category}): Original=${totalOriginal}, Removed=${totalRemoved}, Net=${netAvailable}`)
    
    return {
      totalOriginal,
      totalRemoved,
      netAvailable,
      approvedEntries: approvedEntries.length,
      category
    }
  }
}

// ENHANCED: Helper to get collection names based on category
const getCollectionInfo = (category) => {
  if (category === 'leather') {
    return {
      stockCollection: 'leather',
      removalLogCollection: 'stock_removal_logs',
      typeField: 'type',
      stockTypeField: 'stockType'
    }
  } else if (category === 'material') {
    return {
      stockCollection: 'materials', 
      removalLogCollection: 'material_removal_logs',
      typeField: 'material',
      stockTypeField: 'materialType'
    }
  } else if (category === 'finished_product') {
    return {
      stockCollection: 'finished_products',
      removalLogCollection: 'stock_removal_logs', // Unified collection
      typeField: '_id',
      stockTypeField: 'productId'
    }
  } else {
    throw new Error(`Invalid category: ${category}. Must be 'leather', 'material', or 'finished_product'`)
  }
}

export async function GET(req) {
  console.log('🔍 GET /api/stock/removal - Starting')

  try {
    const { searchParams } = new URL(req.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const stockType = searchParams.get('stockType')
    const confirmedBy = searchParams.get('confirmedBy')
    const purpose = searchParams.get('purpose')
    const category = searchParams.get('category') || 'all' // Updated to include finished_product

    console.log('📝 Stock removal request:', {
      startDate,
      endDate,
      stockType,
      confirmedBy,
      purpose,
      category,
    })

    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    
    // Handle unified or category-specific queries including finished products
    let removals = []
    
    if (category === 'all') {
      // Query leather, material, AND finished product removal logs
      const leatherRemovals = await db.collection('stock_removal_logs')
        .find(buildQuery({ startDate, endDate, stockType, confirmedBy, purpose, category: 'leather' }))
        .sort({ removalDate: -1, createdAt: -1 })
        .toArray()
        
      const materialRemovals = await db.collection('material_removal_logs')
        .find(buildQuery({ startDate, endDate, stockType, confirmedBy, purpose, category: 'material' }))
        .sort({ removalDate: -1, createdAt: -1 })
        .toArray()
      
      // Include finished product removals from stock_removal_logs
      const finishedProductRemovals = await db.collection('stock_removal_logs')
        .find(buildQuery({ startDate, endDate, stockType, confirmedBy, purpose, category: 'finished_product' }))
        .sort({ removalDate: -1, createdAt: -1 })
        .toArray()
      
      // Combine and sort by removal date
      removals = [...leatherRemovals, ...materialRemovals, ...finishedProductRemovals]
        .sort((a, b) => new Date(b.removalDate) - new Date(a.removalDate))
    } else {
      // Query specific category
      const { removalLogCollection } = getCollectionInfo(category)
      const query = buildQuery({ startDate, endDate, stockType, confirmedBy, purpose, category })
      
      removals = await db.collection(removalLogCollection)
        .find(query)
        .sort({ removalDate: -1, createdAt: -1 })
        .toArray()
    }

    console.log(`✅ Found ${removals.length} stock removal records`)

    // Calculate summary statistics
    const summary = calculateSummaryStats(removals)

    console.log('✅ GET /api/stock/removal - Success')
    return NextResponse.json({
      removals,
      summary,
      totalCount: removals.length,
      category,
      note: 'Original records preserved - these are separate removal records'
    })

  } catch (err) {
    console.error('❌ GET /api/stock/removal error:', err)
    console.error('Error stack:', err.stack)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// Helper function to build query based on parameters (updated for finished products)
function buildQuery({ startDate, endDate, stockType, confirmedBy, purpose, category }) {
  let query = {}

  // Always include category in the query
  query.category = category

  // Date range filter
  if (startDate && endDate) {
    query.removalDate = {
      $gte: new Date(startDate),
      $lte: new Date(endDate + 'T23:59:59.999Z'),
    }
  }

  // Stock type filter - use appropriate field based on category
  if (stockType && stockType !== 'all') {
    let stockTypeField
    if (category === 'leather') {
      stockTypeField = 'stockType'
    } else if (category === 'material') {
      stockTypeField = 'materialType'
    } else if (category === 'finished_product') {
      stockTypeField = 'productId'
    }
    
    if (stockTypeField) {
      query[stockTypeField] = new RegExp(stockType, 'i')
    }
  }

  // Confirmed by filter
  if (confirmedBy && confirmedBy !== 'all') {
    query.confirmedBy = new RegExp(confirmedBy, 'i')
  }

  // Purpose filter
  if (purpose && purpose !== 'all') {
    query.purpose = new RegExp(purpose, 'i')
  }

  return query
}

// Helper function to calculate summary statistics (updated for finished products)
function calculateSummaryStats(removals) {
  const summary = {
    totalRemovals: removals.length,
    totalQuantityRemoved: removals.reduce((sum, r) => sum + (r.actualRemovedQuantity || r.removeQuantity || 0), 0),
    uniqueStockTypes: [...new Set(removals.map(r => r.stockType || r.materialType || r.productName))].length,
    removalsThisMonth: removals.filter(r => {
      const removalDate = new Date(r.removalDate)
      const now = new Date()
      return removalDate.getMonth() === now.getMonth() && 
             removalDate.getFullYear() === now.getFullYear()
    }).length,
    removalsByPurpose: {},
    removalsByConfirmer: {},
    removalsByCategory: {}, // Category breakdown including finished_product
  }

  // Group by purpose, confirmer, and category
  removals.forEach(removal => {
    const removedQty = removal.actualRemovedQuantity || removal.removeQuantity || 0
    
    // By purpose
    if (!summary.removalsByPurpose[removal.purpose]) {
      summary.removalsByPurpose[removal.purpose] = {
        count: 0,
        totalQuantity: 0
      }
    }
    summary.removalsByPurpose[removal.purpose].count++
    summary.removalsByPurpose[removal.purpose].totalQuantity += removedQty

    // By confirmer
    if (!summary.removalsByConfirmer[removal.confirmedBy]) {
      summary.removalsByConfirmer[removal.confirmedBy] = {
        count: 0,
        totalQuantity: 0
      }
    }
    summary.removalsByConfirmer[removal.confirmedBy].count++
    summary.removalsByConfirmer[removal.confirmedBy].totalQuantity += removedQty

    // By category (including finished_product)
    const category = removal.category || 'unknown'
    if (!summary.removalsByCategory[category]) {
      summary.removalsByCategory[category] = {
        count: 0,
        totalQuantity: 0
      }
    }
    summary.removalsByCategory[category].count++
    summary.removalsByCategory[category].totalQuantity += removedQty
  })

  return summary
}

export async function POST(req) {
  console.log('📝 POST /api/stock/removal - Starting')

  try {
    // Check admin access
    if (!isAdmin(req)) {
      console.error('❌ Unauthorized stock removal attempt')
      return NextResponse.json(
        { error: 'Admin access required for stock removal' },
        { status: 403 }
      )
    }

    const body = await req.json()
    console.log('📝 Stock removal request:', body)

    // **FIXED: Enhanced validation including category (updated for finished products)**
    const requiredFields = [
      'stockType', // For finished products, this will be productId
      'removeQuantity',
      'availableQuantity',
      'purpose',
      'confirmedBy',
      'removalDate',
      'category' // **REQUIRED: This was missing in your data**
    ]

    for (const field of requiredFields) {
      if (!body[field]) {
        console.error(`❌ Missing required field: ${field}`)
        return NextResponse.json(
          { error: `${field} is required` },
          { status: 400 }
        )
      }
    }

    // **FIXED: Validate category (updated to include finished_product)**
    const validCategories = ['leather', 'material', 'finished_product']
    if (!validCategories.includes(body.category)) {
      return NextResponse.json(
        { error: `Category must be one of: ${validCategories.join(', ')}. Current category: ${body.category}` },
        { status: 400 }
      )
    }

    // Validate quantity
    const removeQuantity = parseFloat(body.removeQuantity)
    const availableQuantity = parseFloat(body.availableQuantity)

    if (isNaN(removeQuantity) || removeQuantity <= 0) {
      return NextResponse.json(
        { error: 'Remove quantity must be a positive number' },
        { status: 400 }
      )
    }

    if (isNaN(availableQuantity) || availableQuantity < 0) {
      return NextResponse.json(
        { error: 'Available quantity must be a non-negative number' },
        { status: 400 }
      )
    }

    if (removeQuantity > availableQuantity) {
      return NextResponse.json(
        { error: 'Remove quantity cannot exceed available quantity' },
        { status: 400 }
      )
    }

    // Validate purpose and confirmedBy
    if (!body.purpose.trim() || body.purpose.trim().length < 3) {
      return NextResponse.json(
        { error: 'Purpose must be at least 3 characters long' },
        { status: 400 }
      )
    }

    if (!body.confirmedBy.trim() || body.confirmedBy.trim().length < 2) {
      return NextResponse.json(
        { error: 'Confirmed by must be at least 2 characters long' },
        { status: 400 }
      )
    }

    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    
    // Get collection info based on category
    const { stockCollection, removalLogCollection, typeField, stockTypeField } = getCollectionInfo(body.category)

    // Get client information for audit trail
    const clientIP = getClientIP(req)
    const userAgent = req.headers.get('user-agent') || 'unknown'

    // Verify actual net stock availability before proceeding
    const currentStockStatus = await calculateCurrentNetStock(db, body.stockType.trim(), body.category)
    
    if (removeQuantity > currentStockStatus.netAvailable) {
      return NextResponse.json(
        { 
          error: `Insufficient net stock available. Requested: ${removeQuantity}, Available: ${currentStockStatus.netAvailable}`,
          details: currentStockStatus
        },
        { status: 400 }
      )
    }

    // **FIXED: Enhanced removal record creation with REQUIRED category field**
    const removalRecord = {
      // **CRITICAL: Category field - this was missing in your data!**
      category: body.category, // **REQUIRED FIELD**
      
      // Dynamic stock type field based on category
      [stockTypeField]: body.stockType.trim(),
      
      // Add product name for finished products
      ...(body.category === 'finished_product' && {
        productName: currentStockStatus.productData?.productName || body.productName || 'Unknown Product'
      }),
      
      // **FIXED: Ensure backwards compatibility with your existing fields**
      stockType: body.stockType.trim(), // Keep this for backwards compatibility
      removeQuantity: removeQuantity, // Keep this field as well
      
      // Common fields (matching your existing structure)
      requestedQuantity: removeQuantity,
      actualRemovedQuantity: removeQuantity, // This field exists in your data
      actualQuantityRemoved: removeQuantity, // Additional field for consistency
      availableQuantityBefore: currentStockStatus.netAvailable,
      remainingQuantityAfter: currentStockStatus.netAvailable - removeQuantity,
      purpose: body.purpose.trim(),
      destination: body.destination?.trim() || '',
      confirmedBy: body.confirmedBy.trim(),
      removalDate: new Date(body.removalDate),
      createdAt: new Date(),
      updatedAt: new Date(),
      
      // Audit trail (matching your existing structure)
      removedByAdmin: true,
      clientIP: clientIP,
      userAgent: userAgent,
      
      // Additional metadata (matching your existing fields)
      removalId: new ObjectId(),
      status: 'completed',
      
      // Financial fields (from your existing structure)
      unitCost: body.unitCost || 0,
      totalCostRemoved: (body.unitCost || 0) * removeQuantity,
      
      // Notes and attachments (from your existing structure)
      notes: body.notes || '',
      attachments: body.attachments || [],
      
      // **FIXED: Keep your existing fields for compatibility**
      affectedEntries: [], // This exists in your data
      stockUpdateCompleted: true, // This exists in your data
      stockUpdateTimestamp: new Date(), // This exists in your data
      
      // Approval workflow (from your existing structure)
      approvalRequired: false,
      approvedBy: body.confirmedBy.trim(),
      approvedAt: new Date(),
      
      // Stock calculation context
      stockCalculation: {
        totalOriginalStock: currentStockStatus.totalOriginal,
        totalPreviouslyRemoved: currentStockStatus.totalRemoved,
        netAvailableBefore: currentStockStatus.netAvailable,
        netAvailableAfter: currentStockStatus.netAvailable - removeQuantity
      },
      
      // Data integrity marker
      preservesOriginalSubmissions: true,
      calculationMethod: 'net_stock_tracking'
    }

    // For finished products, add additional context
    if (body.category === 'finished_product' && currentStockStatus.productData) {
      removalRecord.productContext = {
        originalProductName: currentStockStatus.productData.productName,
        productionJobId: currentStockStatus.productData.productionJobId,
        originalFulfilledQuantity: currentStockStatus.productData.originalFulfilledQuantity || currentStockStatus.productData.fulfilledQuantity,
        finishedAt: currentStockStatus.productData.finishedAt
      }
      
      // Financial impact for finished products
      if (currentStockStatus.productData.materialCostBreakdown) {
        removalRecord.financialImpact = {
          unitCost: currentStockStatus.productData.materialCostBreakdown.perUnit || 0,
          totalValueRemoved: (currentStockStatus.productData.materialCostBreakdown.perUnit || 0) * removeQuantity
        }
      }
    }

    console.log(`💾 Inserting ${body.category} removal record with category field...`)
    console.log('🔍 Removal record category:', removalRecord.category) // Debug log

    // **FIXED: Insert removal record in stock_removal_logs (unified for all categories)**
    const removalResult = await db.collection('stock_removal_logs').insertOne(removalRecord)

    console.log('✅ Stock removal record created with category:', removalRecord.category, 'ID:', removalResult.insertedId)

    // Create audit log entry
    const auditLogCollection = db.collection('audit_logs')
    await auditLogCollection.insertOne({
      action: `${body.category}_removal_logged`,
      resourceType: 'stock_removal',
      resourceId: removalResult.insertedId,
      details: {
        category: body.category, // **ENSURE CATEGORY IS LOGGED**
        stockType: body.stockType,
        requestedQuantity: removeQuantity,
        actualRemovedQuantity: removeQuantity,
        purpose: body.purpose,
        confirmedBy: body.confirmedBy,
        originalSubmissionsPreserved: true,
        netStockBefore: currentStockStatus.netAvailable,
        netStockAfter: currentStockStatus.netAvailable - removeQuantity,
        categoryFieldAdded: true // **MARKER FOR THIS FIX**
      },
      timestamp: new Date(),
      clientIP: clientIP,
      userAgent: userAgent,
      success: true
    })

    console.log(`✅ POST /api/stock/removal - Success (${body.category} with category field)`)

    return NextResponse.json({
      success: true,
      message: `${body.category.charAt(0).toUpperCase() + body.category.slice(1)} removal logged successfully with category field - original records preserved`,
      removalId: removalResult.insertedId,
      category: body.category, // **RETURN CATEGORY IN RESPONSE**
      actualQuantityRemoved: removeQuantity,
      preservedOriginalSubmissions: true,
      categoryFieldIncluded: true, // **CONFIRMATION THAT CATEGORY IS INCLUDED**
      data: {
        ...removalRecord,
        _id: removalResult.insertedId,
      }
    }, { status: 201 })

  } catch (err) {
    console.error('❌ POST /api/stock/removal error:', err)
    console.error('Error stack:', err.stack)

    // Log error to audit trail
    try {
      const client = await clientPromise
      const db = client.db('AbuBakkarLeathers')
      const auditLogCollection = db.collection('audit_logs')
      
      await auditLogCollection.insertOne({
        action: 'stock_removal_failed',
        resourceType: 'stock_removal',
        details: {
          error: err.message,
          stack: err.stack,
          requestBody: body || {}
        },
        timestamp: new Date(),
        clientIP: getClientIP(req),
        userAgent: req.headers.get('user-agent') || 'unknown',
        success: false
      })
    } catch (auditErr) {
      console.error('❌ Failed to log error to audit trail:', auditErr)
    }

    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(req) {
  console.log('🔄 PATCH /api/stock/removal - Starting')

  try {
    if (!isAdmin(req)) {
      console.error('❌ Unauthorized stock removal update attempt')
      return NextResponse.json(
        { error: 'Admin access required for stock removal updates' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    const category = searchParams.get('category') // Category parameter (now includes finished_product)
    const body = await req.json()

    console.log('🔄 Update removal request:', { id, category, body })

    if (!id) {
      return NextResponse.json({ error: 'Removal ID is required' }, { status: 400 })
    }

    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid removal ID format' }, { status: 400 })
    }

    if (!category || !['leather', 'material', 'finished_product'].includes(category)) {
      return NextResponse.json({ 
        error: 'Valid category (leather, material, or finished_product) is required' 
      }, { status: 400 })
    }

    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')

    // **FIXED: Check if removal exists (all categories now use stock_removal_logs)**
    const existingRemoval = await db.collection('stock_removal_logs').findOne({ 
      _id: new ObjectId(id),
      category: category 
    })
    
    if (!existingRemoval) {
      return NextResponse.json(
        { error: 'Stock removal record not found' },
        { status: 404 }
      )
    }

    // Prepare update data
    const updateData = {
      ...body,
      updatedAt: new Date(),
      lastModifiedBy: 'admin',
      lastModifiedReason: body.updateReason || 'Manual update',
      clientIP: getClientIP(req),
      userAgent: req.headers.get('user-agent') || 'unknown',
      // **PRESERVE CATEGORY FIELD**
      category: category, // Ensure category is preserved
      // Preserve important integrity markers
      preservesOriginalSubmissions: true,
      originalSubmissionsIntact: true,
    }

    // Remove fields that shouldn't be updated
    delete updateData._id
    delete updateData.createdAt
    delete updateData.removalId

    const result = await db.collection('stock_removal_logs').updateOne(
      { _id: new ObjectId(id), category: category },
      { $set: updateData }
    )

    // Create audit log
    const auditLogCollection = db.collection('audit_logs')
    await auditLogCollection.insertOne({
      action: `${category}_removal_updated`,
      resourceType: 'stock_removal',
      resourceId: id,
      details: {
        category: category,
        updatedFields: Object.keys(body),
        originalData: existingRemoval,
        newData: updateData,
        originalSubmissionsRemainIntact: true,
        categoryFieldPreserved: true
      },
      timestamp: new Date(),
      clientIP: getClientIP(req),
      userAgent: req.headers.get('user-agent') || 'unknown',
      success: true
    })

    console.log(`✅ PATCH /api/stock/removal - Success (${category})`)
    return NextResponse.json({
      success: true,
      message: `${category.charAt(0).toUpperCase() + category.slice(1)} removal record updated successfully`,
      category: category,
      modifiedCount: result.modifiedCount,
      note: 'Original records remain unmodified'
    })

  } catch (err) {
    console.error('❌ PATCH /api/stock/removal error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(req) {
  console.log('🗑️ DELETE /api/stock/removal - Starting')

  try {
    if (!isAdmin(req)) {
      console.error('❌ Unauthorized stock removal deletion attempt')
      return NextResponse.json(
        { error: 'Admin access required for stock removal deletion' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    const category = searchParams.get('category') // Category parameter (now includes finished_product)

    if (!id) {
      return NextResponse.json({ error: 'Removal ID is required' }, { status: 400 })
    }

    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid removal ID format' }, { status: 400 })
    }

    if (!category || !['leather', 'material', 'finished_product'].includes(category)) {
      return NextResponse.json({ 
        error: 'Valid category (leather, material, or finished_product) is required' 
      }, { status: 400 })
    }

    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')

    // Get removal record before deletion for audit (all categories use stock_removal_logs)
    const removalRecord = await db.collection('stock_removal_logs').findOne({ 
      _id: new ObjectId(id),
      category: category 
    })
    
    if (!removalRecord) {
      return NextResponse.json(
        { error: 'Stock removal record not found' },
        { status: 404 }
      )
    }

    // Delete the record
    const result = await db.collection('stock_removal_logs').deleteOne({ 
      _id: new ObjectId(id),
      category: category 
    })

    // Create audit log
    const auditLogCollection = db.collection('audit_logs')
    await auditLogCollection.insertOne({
      action: `${category}_removal_deleted`,
      resourceType: 'stock_removal',
      resourceId: id,
      details: {
        category: category,
        deletedRecord: removalRecord,
        reason: 'Manual deletion by admin',
        originalSubmissionsStillIntact: true,
        impact: `Only ${category} removal log deleted, original records preserved`
      },
      timestamp: new Date(),
      clientIP: getClientIP(req),
      userAgent: req.headers.get('user-agent') || 'unknown',
      success: true
    })

    console.log(`✅ DELETE /api/stock/removal - Success (${category})`)
    return NextResponse.json({
      success: true,
      message: `${category.charAt(0).toUpperCase() + category.slice(1)} removal record deleted successfully`,
      category: category,
      deletedCount: result.deletedCount,
      note: 'Original records remain preserved'
    })

  } catch (err) {
    console.error('❌ DELETE /api/stock/removal error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
