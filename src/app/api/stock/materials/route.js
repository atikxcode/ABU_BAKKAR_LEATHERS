import clientPromise from '@/lib/mongodb'
import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { GridFSBucket } from 'mongodb'

// Authentication helper (enhanced)
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

// Helper function to handle PDF upload to GridFS
const uploadPdfToGridFS = async (db, file, filename) => {
  const bucket = new GridFSBucket(db, { bucketName: 'materialFiles' })
  
  const uploadStream = bucket.openUploadStream(filename, {
    metadata: {
      contentType: file.type,
      uploadedAt: new Date(),
    }
  })

  const chunks = []
  const reader = file.stream().getReader()
  
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }
    
    const buffer = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0))
    let offset = 0
    for (const chunk of chunks) {
      buffer.set(chunk, offset)
      offset += chunk.length
    }
    
    return new Promise((resolve, reject) => {
      uploadStream.end(buffer, (error) => {
        if (error) {
          reject(error)
        } else {
          resolve(uploadStream.id)
        }
      })
    })
  } catch (error) {
    throw error
  }
}

// ✅ FIXED: Updated function to calculate net available material stock using unified collection
// This does NOT modify original submissions - only calculates net availability
const calculateNetAvailableMaterialStock = async (db) => {
  console.log('🔍 Calculating net available material stock...')
  
  const materialCollection = db.collection('materials')
  // ✅ FIXED: Use unified stock_removal_logs collection instead of material_removal_logs
  const stockRemovalLogCollection = db.collection('stock_removal_logs')
  
  // Get all approved material entries (original submissions - NEVER MODIFIED)
  const approvedEntries = await materialCollection
    .find({ status: 'approved' })
    .toArray()
  
  // ✅ FIXED: Get all completed material stock removals from unified collection with category filter
  const allRemovals = await stockRemovalLogCollection
    .find({ 
      status: 'completed',
      category: 'material' // ✅ Filter by category for materials
    })
    .toArray()
  
  console.log('📊 Found approved material entries:', approvedEntries.length)
  console.log('📊 Found material removals:', allRemovals.length)
  
  // Calculate net stock by material type
  const stockByType = {}
  
  // First, add all approved stock (original quantities)
  approvedEntries.forEach(entry => {
    if (!stockByType[entry.material]) {
      stockByType[entry.material] = {
        totalOriginal: 0,
        totalRemoved: 0,
        netAvailable: 0,
        entries: []
      }
    }
    stockByType[entry.material].totalOriginal += entry.quantity
    stockByType[entry.material].entries.push({
      id: entry._id,
      quantity: entry.quantity, // Original quantity - never changed
      workerName: entry.workerName,
      company: entry.company,
      date: entry.date,
      submissionDate: entry.createdAt
    })
  })
  
  // ✅ FIXED: Process removals from unified collection with proper field mapping
  allRemovals.forEach(removal => {
    // ✅ Support both stockType (new unified field) and materialType (legacy compatibility)
    const materialType = removal.stockType || removal.materialType
    
    if (!materialType) {
      console.warn('⚠️ Removal entry missing material type:', removal)
      return
    }
    
    console.log('🔍 Processing removal for material:', materialType, 'quantity:', removal.actualRemovedQuantity || removal.removeQuantity)
    
    if (stockByType[materialType]) {
      // ✅ Support both actualRemovedQuantity and removeQuantity fields
      const removedQuantity = removal.actualRemovedQuantity || removal.removeQuantity || 0
      stockByType[materialType].totalRemoved += removedQuantity
    } else {
      console.warn('⚠️ Material type not found in approved entries:', materialType)
      // Create entry for material type that has removals but no approved entries
      stockByType[materialType] = {
        totalOriginal: 0,
        totalRemoved: removal.actualRemovedQuantity || removal.removeQuantity || 0,
        netAvailable: 0,
        entries: []
      }
    }
  })
  
  // Calculate net available
  Object.keys(stockByType).forEach(type => {
    const stock = stockByType[type]
    stock.netAvailable = Math.max(0, stock.totalOriginal - stock.totalRemoved)
    
    // Add percentage consumed
    stock.percentageConsumed = stock.totalOriginal > 0 
      ? ((stock.totalRemoved / stock.totalOriginal) * 100).toFixed(2)
      : stock.totalRemoved > 0 ? '100.00' : '0.00' // Handle case where removals exist without approved entries
      
    console.log('📊 Final calculation for', type, ':', {
      totalOriginal: stock.totalOriginal,
      totalRemoved: stock.totalRemoved,
      netAvailable: stock.netAvailable,
      percentageConsumed: stock.percentageConsumed
    })
  })
  
  console.log('✅ Net material stock calculated:', Object.keys(stockByType).length, 'types')
  return stockByType
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const status = searchParams.get('status')
    const material = searchParams.get('material')
    const workerEmail = searchParams.get('workerEmail')
    const company = searchParams.get('company')
    const downloadFile = searchParams.get('downloadFile')
    const fileId = searchParams.get('fileId')
    const includeRemovalHistory = searchParams.get('includeRemovalHistory')
    const getNetStock = searchParams.get('getNetStock') // NEW: Get net available stock

    console.log('🔍 Material stock request:', {
      startDate,
      endDate,
      status,
      material,
      workerEmail,
      company,
      downloadFile,
      fileId,
      includeRemovalHistory,
      getNetStock,
    })

    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    const collection = db.collection('materials')
    const usersCollection = db.collection('user')

    // Handle PDF file download
    if (downloadFile === 'true' && fileId) {
      try {
        if (!ObjectId.isValid(fileId)) {
          return NextResponse.json(
            { error: 'Invalid file ID format' },
            { status: 400 }
          )
        }

        const bucket = new GridFSBucket(db, { bucketName: 'materialFiles' })
        const downloadStream = bucket.openDownloadStream(new ObjectId(fileId))
        
        const chunks = []
        for await (const chunk of downloadStream) {
          chunks.push(chunk)
        }
        
        const buffer = Buffer.concat(chunks)
        const fileInfo = await bucket.find({ _id: new ObjectId(fileId) }).next()
        
        if (!fileInfo) {
          return NextResponse.json(
            { error: 'File not found' },
            { status: 404 }
          )
        }

        return new NextResponse(buffer, {
          headers: {
            'Content-Type': fileInfo.metadata?.contentType || 'application/pdf',
            'Content-Disposition': `attachment; filename="${fileInfo.filename}"`,
          },
        })
      } catch (error) {
        console.error('❌ File download error:', error)
        return NextResponse.json(
          { error: 'File download failed' },
          { status: 500 }
        )
      }
    }

    // ✅ FIXED: Handle net stock calculation request - include original submissions
    if (getNetStock === 'true') {
      console.log('🔍 Getting net material stock WITH original submissions...')
      
      // Get the net stock data using the fixed function
      const netStockData = await calculateNetAvailableMaterialStock(db)
      
      // ALSO get the original submissions (same query logic as below)
      let query = {}
      
      if (startDate && endDate) {
        try {
          query.date = {
            $gte: new Date(startDate),
            $lte: new Date(endDate + 'T23:59:59.999Z'),
          }
        } catch (dateError) {
          console.error('❌ Invalid date format:', dateError)
          return NextResponse.json(
            { error: 'Invalid date format provided' },
            { status: 400 }
          )
        }
      }

      if (status && status !== 'all') query.status = status
      if (material) query.material = new RegExp(material, 'i')
      if (workerEmail) query.workerEmail = new RegExp(workerEmail, 'i')
      if (company) query.company = new RegExp(company, 'i')

      // Get original submissions
      const items = await collection.find(query).sort({ date: -1 }).toArray()

      // Enrich items with worker phone numbers
      const enrichedItems = await Promise.all(
        items.map(async (item) => {
          try {
            const worker = await usersCollection.findOne({
              email: item.workerEmail,
            })
            
            return {
              ...item,
              workerPhone: worker?.phone || worker?.phoneNumber || 'N/A',
              
              // Add net stock context for this material type
              netStockInfo: netStockData[item.material] ? {
                totalOriginalInSystem: netStockData[item.material].totalOriginal,
                totalRemovedFromSystem: netStockData[item.material].totalRemoved,
                netAvailableInSystem: netStockData[item.material].netAvailable,
                percentageConsumed: netStockData[item.material].percentageConsumed
              } : null,
              
              // This entry's contribution to the system
              contributionToStock: item.status === 'approved' ? item.quantity : 0,
              
              // Metadata
              lastModifiedDate: item.updatedAt || item.createdAt,
              isOriginalSubmission: true,
              originalQuantityPreserved: item.quantity,
            }
          } catch (err) {
            console.error('Error fetching worker info for email:', item.workerEmail, err)
            return {
              ...item,
              workerPhone: 'N/A',
            }
          }
        })
      )

      // Enhanced response with BOTH items and net stock
      const responseData = {
        items: enrichedItems, // ✅ This was missing in the original!
        netStock: netStockData,
        statistics: {
          totalItems: enrichedItems.length,
          approvedItems: enrichedItems.filter(item => item.status === 'approved').length,
          totalOriginalQuantity: enrichedItems.reduce((sum, item) => sum + (item.status === 'approved' ? item.quantity : 0), 0),
          totalNetAvailable: Object.values(netStockData).reduce((sum, stock) => sum + stock.netAvailable, 0),
          totalRemoved: Object.values(netStockData).reduce((sum, stock) => sum + stock.totalRemoved, 0),
          stockTypes: Object.entries(netStockData).map(([type, data]) => ({
            type,
            originalQuantity: data.totalOriginal,
            totalRemoved: data.totalRemoved,
            netAvailable: data.netAvailable,
            percentageConsumed: data.percentageConsumed,
            submissionCount: data.entries.length,
            workerContributions: data.entries.length
          }))
        },
        generatedAt: new Date(),
        dataIntegrityNote: "Original worker material submissions are preserved. Net quantities calculated separately from unified removal logs.",
        message: 'Original material submissions and net stock data retrieved successfully'
      }

      console.log('✅ Returning', enrichedItems.length, 'original material submissions WITH net stock data')
      return NextResponse.json(responseData)
    }

    // Regular materials stock query (NEVER MODIFIED - these are original submissions)
    let query = {}

    if (startDate && endDate) {
      try {
        query.date = {
          $gte: new Date(startDate),
          $lte: new Date(endDate + 'T23:59:59.999Z'),
        }
      } catch (dateError) {
        console.error('❌ Invalid date format:', dateError)
        return NextResponse.json(
          { error: 'Invalid date format provided' },
          { status: 400 }
        )
      }
    }

    if (status && status !== 'all') query.status = status
    if (material) query.material = new RegExp(material, 'i')
    if (workerEmail) query.workerEmail = new RegExp(workerEmail, 'i')
    if (company) query.company = new RegExp(company, 'i')

    let projection = {}
    // FIXED: Remove problematic removalHistory field as it's no longer used
    if (includeRemovalHistory !== 'true') {
      projection = {}
    }

    console.log('🔍 Final query:', JSON.stringify(query, null, 2))

    // Get original submissions (NEVER MODIFIED)
    const items = await collection.find(query, { projection }).sort({ date: -1 }).toArray()

    // ✅ Get net stock data using the fixed function for additional context
    const netStockData = await calculateNetAvailableMaterialStock(db)

    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        try {
          const worker = await usersCollection.findOne({
            email: item.workerEmail,
          })
          
          // Enhanced item with net stock context
          const enrichedItem = {
            ...item,
            workerPhone: worker?.phone || worker?.phoneNumber || 'N/A',
            
            // Add net stock context for this material type
            netStockInfo: netStockData[item.material] ? {
              totalOriginalInSystem: netStockData[item.material].totalOriginal,
              totalRemovedFromSystem: netStockData[item.material].totalRemoved,
              netAvailableInSystem: netStockData[item.material].netAvailable,
              percentageConsumed: netStockData[item.material].percentageConsumed
            } : null,
            
            // This entry's contribution to the system
            contributionToStock: item.status === 'approved' ? item.quantity : 0,
            
            // Metadata
            lastModifiedDate: item.updatedAt || item.createdAt,
            isOriginalSubmission: true, // Mark as original - never modified
            originalQuantityPreserved: item.quantity, // Preserve original for clarity
          }
          
          return enrichedItem
        } catch (err) {
          console.error(
            'Error fetching worker info for email:',
            item.workerEmail,
            err
          )
          return {
            ...item,
            workerPhone: 'N/A',
          }
        }
      })
    )

    // Enhanced response with net stock summary
    const responseData = {
      items: enrichedItems, // Original submissions - never modified
      netStock: netStockData, // Net available stock after removals
      statistics: {
        totalItems: enrichedItems.length,
        approvedItems: enrichedItems.filter(item => item.status === 'approved').length,
        totalOriginalQuantity: enrichedItems.reduce((sum, item) => sum + (item.status === 'approved' ? item.quantity : 0), 0),
        
        // Net stock statistics
        totalNetAvailable: Object.values(netStockData).reduce((sum, stock) => sum + stock.netAvailable, 0),
        totalRemoved: Object.values(netStockData).reduce((sum, stock) => sum + stock.totalRemoved, 0),
        
        // Material type breakdown with net quantities
        stockTypes: Object.entries(netStockData).map(([type, data]) => ({
          type,
          originalQuantity: data.totalOriginal,
          totalRemoved: data.totalRemoved,
          netAvailable: data.netAvailable,
          percentageConsumed: data.percentageConsumed,
          submissionCount: data.entries.length,
          workerContributions: data.entries.length
        }))
      },
      generatedAt: new Date(),
      dataIntegrityNote: "Original worker material submissions are preserved. Net quantities calculated separately from unified removal logs."
    }

    console.log(
      '✅ Returning original material submissions + net stock data:',
      enrichedItems.length,
      'items'
    )
    return NextResponse.json(responseData)
  } catch (err) {
    console.error('❌ GET material stock error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req) {
  try {
    // Check if it's form data (for file uploads) or JSON
    const contentType = req.headers.get('content-type')
    let body = {}
    let pdfFile = null

    if (contentType && contentType.includes('multipart/form-data')) {
      const formData = await req.formData()
      
      // Extract all form fields
      for (const [key, value] of formData.entries()) {
        if (key === 'pdfFile') {
          pdfFile = value
        } else {
          body[key] = value
        }
      }
    } else {
      body = await req.json()
    }

    // Enhanced validation
    if (
      !body.material ||
      typeof body.material !== 'string' ||
      body.material.trim() === ''
    ) {
      return NextResponse.json(
        { error: 'Material type is required and must be a non-empty string' },
        { status: 400 }
      )
    }

    if (!body.quantity || isNaN(body.quantity) || Number(body.quantity) <= 0) {
      return NextResponse.json(
        { error: 'Quantity must be a positive number' },
        { status: 400 }
      )
    }

    if (
      !body.unit ||
      typeof body.unit !== 'string' ||
      body.unit.trim() === ''
    ) {
      return NextResponse.json(
        { error: 'Unit is required and must be a non-empty string' },
        { status: 400 }
      )
    }

    if (
      !body.company ||
      typeof body.company !== 'string' ||
      body.company.trim() === ''
    ) {
      return NextResponse.json(
        { error: 'Company is required and must be a non-empty string' },
        { status: 400 }
      )
    }

    // PDF file validation
    if (pdfFile && pdfFile.size > 0) {
      if (pdfFile.type !== 'application/pdf') {
        return NextResponse.json(
          { error: 'Only PDF files are allowed' },
          { status: 400 }
        )
      }

      // Check file size (5MB limit)
      const maxSize = 5 * 1024 * 1024 // 5MB
      if (pdfFile.size > maxSize) {
        return NextResponse.json(
          { error: 'PDF file size must be less than 5MB' },
          { status: 400 }
        )
      }
    }

    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    const collection = db.collection('materials')
    const auditCollection = db.collection('audit_logs')

    const { workerName, workerEmail, ...rest } = body

    let dateValue
    if (body.date) {
      try {
        dateValue = new Date(body.date)
        if (isNaN(dateValue.getTime())) {
          dateValue = new Date()
        }
      } catch (e) {
        dateValue = new Date()
      }
    } else {
      dateValue = new Date()
    }

    let pdfFileId = null
    let pdfFileName = null

    // Handle PDF upload if file exists
    if (pdfFile && pdfFile.size > 0) {
      try {
        const timestamp = Date.now()
        pdfFileName = `material_${timestamp}_${pdfFile.name}`
        pdfFileId = await uploadPdfToGridFS(db, pdfFile, pdfFileName)
        console.log('📁 PDF uploaded successfully with ID:', pdfFileId)
      } catch (uploadError) {
        console.error('❌ PDF upload error:', uploadError)
        return NextResponse.json(
          { error: 'Failed to upload PDF file' },
          { status: 500 }
        )
      }
    }

    // Create the enhanced document (ORIGINAL SUBMISSION - NEVER MODIFIED)
    const quantity = Number(body.quantity)
    const document = {
      ...rest,
      material: body.material.trim(),
      company: body.company.trim(),
      quantity: quantity, // ORIGINAL QUANTITY - NEVER CHANGES
      unit: body.unit.trim(),
      workerName: workerName || 'Unknown',
      workerEmail: workerEmail || 'unknown@example.com',
      date: dateValue,
      status: body.status || 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
      
      // FIXED: Remove problematic tracking fields that were being modified
      lastModifiedBy: 'system',
      lastModifiedReason: 'initial_creation',
      
      // Metadata
      clientIP: getClientIP(req),
      userAgent: req.headers.get('user-agent') || 'unknown',
      
      // Mark as original submission
      isOriginalSubmission: true,
      submissionPreserved: true,
    }

    // Add PDF information if uploaded
    if (pdfFileId) {
      document.pdfFile = {
        fileId: pdfFileId,
        fileName: pdfFileName,
        uploadedAt: new Date(),
      }
    }

    const result = await collection.insertOne(document)

    // Create audit log
    await auditCollection.insertOne({
      action: 'material_stock_created',
      resourceType: 'material',
      resourceId: result.insertedId,
      details: {
        materialType: body.material,
        quantity: quantity,
        company: body.company,
        workerName: workerName,
        hasPdfFile: !!pdfFileId,
        note: 'Original submission - will never be modified'
      },
      timestamp: new Date(),
      clientIP: getClientIP(req),
      userAgent: req.headers.get('user-agent') || 'unknown',
      success: true
    })

    console.log('✅ Created original material stock submission:', result.insertedId)
    return NextResponse.json(
      { 
        ...result, 
        message: pdfFile ? 'Material stock submission created with PDF file' : 'Material stock submission created',
        fileUploaded: !!pdfFileId,
        note: 'Original submission preserved - will never be modified by stock removals'
      }, 
      { status: 201 }
    )
  } catch (err) {
    console.error('❌ POST material stock error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(req) {
  try {
    if (!isAdmin(req)) {
      console.warn('⚠️ Unauthorized PATCH attempt on material stock')
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    
    // Check if it's form data (for file updates) or JSON
    const contentType = req.headers.get('content-type')
    let body = {}
    let pdfFile = null

    if (contentType && contentType.includes('multipart/form-data')) {
      const formData = await req.formData()
      
      // Extract all form fields
      for (const [key, value] of formData.entries()) {
        if (key === 'pdfFile') {
          pdfFile = value
        } else {
          body[key] = value
        }
      }
    } else {
      body = await req.json()
    }

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 })
    }

    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 })
    }

    if (
      body.status &&
      !['pending', 'approved', 'rejected'].includes(body.status)
    ) {
      return NextResponse.json(
        { error: 'Status must be pending, approved, or rejected' },
        { status: 400 }
      )
    }

    // IMPORTANT: Only allow admin to update status and metadata, NOT quantities
    // Quantities should remain as originally submitted by workers
    if (body.quantity !== undefined) {
      console.warn('⚠️ Attempt to modify original quantity blocked')
      return NextResponse.json(
        { error: 'Original quantities cannot be modified to preserve audit trail. Use stock removal system instead.' },
        { status: 400 }
      )
    }

    // PDF file validation
    if (pdfFile && pdfFile.size > 0) {
      if (pdfFile.type !== 'application/pdf') {
        return NextResponse.json(
          { error: 'Only PDF files are allowed' },
          { status: 400 }
        )
      }

      const maxSize = 5 * 1024 * 1024 // 5MB
      if (pdfFile.size > maxSize) {
        return NextResponse.json(
          { error: 'PDF file size must be less than 5MB' },
          { status: 400 }
        )
      }
    }

    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    const collection = db.collection('materials')
    const auditCollection = db.collection('audit_logs')

    // Get existing document for audit trail
    const existingDoc = await collection.findOne({ _id: new ObjectId(id) })
    if (!existingDoc) {
      return NextResponse.json(
        { error: 'Material stock entry not found' },
        { status: 404 }
      )
    }

    const updateData = { 
      ...body, 
      updatedAt: new Date(),
      lastModifiedBy: 'admin',
      lastModifiedReason: body.updateReason || 'admin_update',
      clientIP: getClientIP(req),
      // Ensure original submission marker is preserved
      isOriginalSubmission: true,
      submissionPreserved: true,
    }

    // Handle PDF file update
    if (pdfFile && pdfFile.size > 0) {
      try {
        // Delete old PDF file if exists
        if (existingDoc?.pdfFile?.fileId) {
          const bucket = new GridFSBucket(db, { bucketName: 'materialFiles' })
          try {
            await bucket.delete(new ObjectId(existingDoc.pdfFile.fileId))
            console.log('🗑️ Old PDF file deleted')
          } catch (deleteError) {
            console.warn('⚠️ Failed to delete old PDF file:', deleteError)
          }
        }

        // Upload new PDF file
        const timestamp = Date.now()
        const pdfFileName = `material_${timestamp}_${pdfFile.name}`
        const pdfFileId = await uploadPdfToGridFS(db, pdfFile, pdfFileName)
        
        updateData.pdfFile = {
          fileId: pdfFileId,
          fileName: pdfFileName,
          uploadedAt: new Date(),
        }
        
        console.log('📁 New PDF uploaded successfully with ID:', pdfFileId)
      } catch (uploadError) {
        console.error('❌ PDF upload error:', uploadError)
        return NextResponse.json(
          { error: 'Failed to upload PDF file' },
          { status: 500 }
        )
      }
    }

    const result = await collection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    )

    // Create audit log
    await auditCollection.insertOne({
      action: 'material_stock_updated',
      resourceType: 'material',
      resourceId: id,
      details: {
        updatedFields: Object.keys(body),
        originalData: existingDoc,
        hasPdfUpdate: !!pdfFile,
        note: 'Original quantities preserved - only status/metadata updated'
      },
      timestamp: new Date(),
      clientIP: getClientIP(req),
      userAgent: req.headers.get('user-agent') || 'unknown',
      success: result.modifiedCount > 0
    })

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: 'Material stock entry not found' },
        { status: 404 }
      )
    }

    console.log('✅ Updated material stock entry (preserving original quantities):', id)
    return NextResponse.json({ 
      ...result, 
      message: pdfFile ? 'Material stock entry updated with new PDF file' : 'Material stock entry updated',
      note: 'Original quantities preserved for audit trail'
    })
  } catch (err) {
    console.error('❌ PATCH material stock error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(req) {
  try {
    if (!isAdmin(req)) {
      console.warn('⚠️ Unauthorized DELETE attempt on material stock')
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const status = searchParams.get('status')
    const material = searchParams.get('material')
    const company = searchParams.get('company')
    const deleteType = searchParams.get('deleteType')

    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    const collection = db.collection('materials')
    const auditCollection = db.collection('audit_logs')
    const bucket = new GridFSBucket(db, { bucketName: 'materialFiles' })

    // Helper function to delete associated PDF files and create audit trail
    const deleteAssociatedFiles = async (documents) => {
      for (const doc of documents) {
        if (doc.pdfFile?.fileId) {
          try {
            await bucket.delete(new ObjectId(doc.pdfFile.fileId))
            console.log('🗑️ Deleted PDF file:', doc.pdfFile.fileName)
            
            // Log file deletion
            await auditCollection.insertOne({
              action: 'pdf_file_deleted',
              resourceType: 'gridfs_file',
              resourceId: doc.pdfFile.fileId,
              details: {
                fileName: doc.pdfFile.fileName,
                associatedMaterialId: doc._id,
                materialType: doc.material,
                deletedDuringStockRemoval: true
              },
              timestamp: new Date(),
              clientIP: getClientIP(req),
              success: true
            })
          } catch (fileDeleteError) {
            console.warn('⚠️ Failed to delete PDF file:', fileDeleteError)
            await auditCollection.insertOne({
              action: 'pdf_file_delete_failed',
              resourceType: 'gridfs_file',
              resourceId: doc.pdfFile.fileId,
              details: {
                error: fileDeleteError.message,
                fileName: doc.pdfFile.fileName,
                associatedMaterialId: doc._id
              },
              timestamp: new Date(),
              clientIP: getClientIP(req),
              success: false
            })
          }
        }
      }
    }

    if (deleteType === 'single' && id) {
      if (!ObjectId.isValid(id)) {
        return NextResponse.json(
          { error: 'Invalid ID format' },
          { status: 400 }
        )
      }

      // Get document first to delete associated file and create audit trail
      const document = await collection.findOne({ _id: new ObjectId(id) })
      if (!document) {
        return NextResponse.json(
          { error: 'Material stock entry not found' },
          { status: 404 }
        )
      }

      // Delete associated PDF file if exists
      await deleteAssociatedFiles([document])

      const result = await collection.deleteOne({ _id: new ObjectId(id) })

      // Create comprehensive audit log
      await auditCollection.insertOne({
        action: 'material_stock_deleted',
        resourceType: 'material',
        resourceId: id,
        details: {
          deletedDocument: document,
          materialType: document.material,
          quantity: document.quantity,
          company: document.company,
          workerName: document.workerName,
          hasPdfFile: !!document.pdfFile?.fileId,
          wasOriginalSubmission: document.isOriginalSubmission || false,
          deletionReason: 'Admin deletion of original worker submission'
        },
        timestamp: new Date(),
        clientIP: getClientIP(req),
        userAgent: req.headers.get('user-agent') || 'unknown',
        success: result.deletedCount > 0
      })

      console.log(`✅ Single material stock entry ${id} deleted successfully`)
      return NextResponse.json({
        message: 'Original worker material submission deleted successfully',
        deletedCount: result.deletedCount,
        note: 'This was an original worker submission - consider using stock removal system instead'
      })
    }

    if (deleteType === 'bulk') {
      let query = {}

      if (startDate && endDate) {
        try {
          query.date = {
            $gte: new Date(startDate),
            $lte: new Date(endDate + 'T23:59:59.999Z'),
          }
        } catch (dateError) {
          return NextResponse.json(
            { error: 'Invalid date format for bulk delete' },
            { status: 400 }
          )
        }
      }

      if (status && status !== 'all') query.status = status
      if (material) query.material = new RegExp(material, 'i')
      if (company) query.company = new RegExp(company, 'i')

      if (Object.keys(query).length === 0) {
        return NextResponse.json(
          {
            error: 'Bulk delete requires at least one filter criteria',
          },
          { status: 400 }
        )
      }

      console.log('🗑️ Bulk delete query:', JSON.stringify(query, null, 2))

      // Get documents first to delete associated files and create audit trail
      const documentsToDelete = await collection.find(query).toArray()
      
      if (documentsToDelete.length === 0) {
        return NextResponse.json({
          message: 'No matching documents found to delete',
          deletedCount: 0,
        })
      }

      await deleteAssociatedFiles(documentsToDelete)

      const result = await collection.deleteMany(query)

      // Create bulk audit log
      await auditCollection.insertOne({
        action: 'material_stock_bulk_deleted',
        resourceType: 'material',
        details: {
          query: query,
          deletedCount: result.deletedCount,
          documentsDeleted: documentsToDelete.map(doc => ({
            id: doc._id,
            material: doc.material,
            quantity: doc.quantity,
            company: doc.company,
            workerName: doc.workerName,
            wasOriginalSubmission: doc.isOriginalSubmission || false
          })),
          pdfFilesDeleted: documentsToDelete.filter(doc => doc.pdfFile?.fileId).length,
          note: 'Bulk deletion of original worker submissions'
        },
        timestamp: new Date(),
        clientIP: getClientIP(req),
        userAgent: req.headers.get('user-agent') || 'unknown',
        success: result.deletedCount > 0
      })

      console.log(
        `✅ Bulk delete completed: ${result.deletedCount} entries deleted`
      )
      return NextResponse.json({
        message: `${result.deletedCount} original worker material submissions deleted successfully`,
        deletedCount: result.deletedCount,
        note: 'These were original worker submissions - consider using stock removal system for inventory management'
      })
    }

    if (id && !deleteType) {
      if (!ObjectId.isValid(id)) {
        return NextResponse.json(
          { error: 'Invalid ID format' },
          { status: 400 }
        )
      }

      // Get document first to delete associated file
      const document = await collection.findOne({ _id: new ObjectId(id) })
      if (!document) {
        return NextResponse.json(
          { error: 'Material stock entry not found' },
          { status: 404 }
        )
      }

      // Delete associated PDF file if exists
      await deleteAssociatedFiles([document])

      const result = await collection.deleteOne({ _id: new ObjectId(id) })

      return NextResponse.json({ 
        message: 'Deleted successfully', 
        result,
        note: 'Original worker material submission deleted'
      })
    }

    return NextResponse.json(
      {
        error: 'Invalid delete request. Specify deleteType as single or bulk',
      },
      { status: 400 }
    )
  } catch (err) {
    console.error('❌ DELETE material stock error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
