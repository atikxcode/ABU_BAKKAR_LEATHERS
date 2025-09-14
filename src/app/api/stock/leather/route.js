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
  const bucket = new GridFSBucket(db, { bucketName: 'leatherFiles' })
  
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

// FIXED: NEW function to calculate net available stock (original - total removed)
// This does NOT modify original submissions - only calculates net availability
const calculateNetAvailableStock = async (db) => {
  console.log('🔍 Calculating net available stock...')
  
  const leatherCollection = db.collection('leather')
  const stockRemovalLogCollection = db.collection('stock_removal_logs')
  
  // Get all approved leather entries (original submissions - NEVER MODIFIED)
  const approvedEntries = await leatherCollection
    .find({ status: 'approved' })
    .toArray()
  
  // Get all completed stock removals
  const allRemovals = await stockRemovalLogCollection
    .find({ status: 'completed' })
    .toArray()
  
  // Calculate net stock by type
  const stockByType = {}
  
  // First, add all approved stock (original quantities)
  approvedEntries.forEach(entry => {
    if (!stockByType[entry.type]) {
      stockByType[entry.type] = {
        totalOriginal: 0,
        totalRemoved: 0,
        netAvailable: 0,
        entries: []
      }
    }
    stockByType[entry.type].totalOriginal += entry.quantity
    stockByType[entry.type].entries.push({
      id: entry._id,
      quantity: entry.quantity, // Original quantity - never changed
      workerName: entry.workerName,
      company: entry.company,
      date: entry.date,
      submissionDate: entry.createdAt
    })
  })
  
  // Then, subtract all removals
  allRemovals.forEach(removal => {
    if (stockByType[removal.stockType]) {
      stockByType[removal.stockType].totalRemoved += removal.actualRemovedQuantity
    }
  })
  
  // Calculate net available
  Object.keys(stockByType).forEach(type => {
    const stock = stockByType[type]
    stock.netAvailable = Math.max(0, stock.totalOriginal - stock.totalRemoved)
    
    // Add percentage consumed
    stock.percentageConsumed = stock.totalOriginal > 0 
      ? ((stock.totalRemoved / stock.totalOriginal) * 100).toFixed(2)
      : 0
  })
  
  console.log('📊 Net stock calculated:', Object.keys(stockByType).length, 'types')
  return stockByType
}

// REMOVED: The old updateCombinedStockAfterRemoval function
// This was the problematic function that modified original worker submissions
// Stock removal is now handled by the separate /api/stock/removal endpoint

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const status = searchParams.get('status')
    const type = searchParams.get('type')
    const workerEmail = searchParams.get('workerEmail')
    const company = searchParams.get('company')
    const downloadFile = searchParams.get('downloadFile')
    const fileId = searchParams.get('fileId')
    const includeRemovalHistory = searchParams.get('includeRemovalHistory')
    const getNetStock = searchParams.get('getNetStock') // NEW: Get net available stock

    console.log('🔍 Leather stock request:', {
      startDate,
      endDate,
      status,
      type,
      workerEmail,
      company,
      downloadFile,
      fileId,
      includeRemovalHistory,
      getNetStock,
    })

    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    const collection = db.collection('leather')
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

        const bucket = new GridFSBucket(db, { bucketName: 'leatherFiles' })
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

    // NEW: Handle net stock calculation request
    // FIXED: Handle net stock calculation request - include original submissions
if (getNetStock === 'true') {
  console.log('🔍 Getting net stock WITH original submissions...')
  
  // Get the net stock data
  const netStockData = await calculateNetAvailableStock(db)
  
  // ALSO get the original submissions (same query logic as below)
  let query = {}
  
  if (startDate && endDate) {
    query.date = {
      $gte: new Date(startDate),
      $lte: new Date(endDate + 'T23:59:59.999Z'),
    }
  }

  if (status && status !== 'all') query.status = status
  if (type) query.type = new RegExp(type, 'i')
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
          
          // Add net stock context for this type
          netStockInfo: netStockData[item.type] ? {
            totalOriginalInSystem: netStockData[item.type].totalOriginal,
            totalRemovedFromSystem: netStockData[item.type].totalRemoved,
            netAvailableInSystem: netStockData[item.type].netAvailable,
            percentageConsumed: netStockData[item.type].percentageConsumed
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
    items: enrichedItems, // ✅ This was missing!
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
    dataIntegrityNote: "Original worker submissions are preserved. Net quantities calculated separately.",
    message: 'Original submissions and net stock data retrieved successfully'
  }

  console.log('✅ Returning', enrichedItems.length, 'original submissions WITH net stock data')
  return NextResponse.json(responseData)
}


    // Regular leather stock query (NEVER MODIFIED - these are original submissions)
    let query = {}

    if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate + 'T23:59:59.999Z'),
      }
    }

    if (status && status !== 'all') query.status = status
    if (type) query.type = new RegExp(type, 'i')
    if (workerEmail) query.workerEmail = new RegExp(workerEmail, 'i')
    if (company) query.company = new RegExp(company, 'i')

    let projection = {}
    // FIXED: Remove problematic removalHistory field as it's no longer used
    if (includeRemovalHistory !== 'true') {
      projection = {}
    }

    // Get original submissions (NEVER MODIFIED)
    const items = await collection.find(query, { projection }).sort({ date: -1 }).toArray()

    // Get net stock data for additional context
    const netStockData = await calculateNetAvailableStock(db)

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
            
            // Add net stock context for this type
            netStockInfo: netStockData[item.type] ? {
              totalOriginalInSystem: netStockData[item.type].totalOriginal,
              totalRemovedFromSystem: netStockData[item.type].totalRemoved,
              netAvailableInSystem: netStockData[item.type].netAvailable,
              percentageConsumed: netStockData[item.type].percentageConsumed
            } : null,
            
            // This entry's contribution to the system
            contributionToStock: item.status === 'approved' ? item.quantity : 0,
            
            // FIXED: Remove problematic legacy fields
            // removalSummary: removed as it was based on modified data
            // netQuantity: item.quantity (this is always original quantity now)
            // hasBeenReduced: removed as it was misleading
            // isFullyConsumed: removed as original entries are never consumed
            
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
        
        // FIXED: Remove problematic legacy statistics
        // totalWithRemovalHistory: removed as we don't track this anymore
        // fullyConsumedItems: removed as original entries are never consumed
        
        // Net stock statistics
        totalNetAvailable: Object.values(netStockData).reduce((sum, stock) => sum + stock.netAvailable, 0),
        totalRemoved: Object.values(netStockData).reduce((sum, stock) => sum + stock.totalRemoved, 0),
        
        // Stock type breakdown with net quantities
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
      dataIntegrityNote: "Original worker submissions are preserved. Net quantities calculated separately."
    }

    console.log(
      '✅ Returning original submissions + net stock data:',
      enrichedItems.length,
      'items'
    )
    return NextResponse.json(responseData)
  } catch (err) {
    console.error('❌ GET leather stock error:', err)
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
      !body.type ||
      typeof body.type !== 'string' ||
      body.type.trim() === ''
    ) {
      return NextResponse.json(
        { error: 'Leather type is required and must be a non-empty string' },
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
    const collection = db.collection('leather')
    const auditCollection = db.collection('audit_logs')

    const { workerName, workerEmail, ...rest } = body

    let pdfFileId = null
    let pdfFileName = null

    // Handle PDF upload if file exists
    if (pdfFile && pdfFile.size > 0) {
      try {
        const timestamp = Date.now()
        pdfFileName = `leather_${timestamp}_${pdfFile.name}`
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
      type: body.type.trim(),
      company: body.company.trim(),
      quantity: quantity, // ORIGINAL QUANTITY - NEVER CHANGES
      unit: body.unit.trim(),
      workerName: workerName || 'Unknown',
      workerEmail: workerEmail || 'unknown@example.com',
      date: new Date(body.date) || new Date(),
      status: body.status || 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
      
      // FIXED: Remove problematic tracking fields that were being modified
      // removalHistory: [], // REMOVED - this was causing confusion
      // totalRemoved: 0,    // REMOVED - calculated separately now
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
      action: 'leather_stock_created',
      resourceType: 'leather',
      resourceId: result.insertedId,
      details: {
        stockType: body.type,
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

    console.log('✅ Created original leather stock submission:', result.insertedId)
    return NextResponse.json(
      { 
        ...result, 
        message: pdfFile ? 'Leather stock submission created with PDF file' : 'Leather stock submission created',
        fileUploaded: !!pdfFileId,
        note: 'Original submission preserved - will never be modified by stock removals'
      }, 
      { status: 201 }
    )
  } catch (err) {
    console.error('❌ POST leather stock error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(req) {
  try {
    if (!isAdmin(req)) {
      console.warn('⚠️ Unauthorized PATCH attempt on leather stock')
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
    const collection = db.collection('leather')
    const auditCollection = db.collection('audit_logs')

    // Get existing document for audit trail
    const existingDoc = await collection.findOne({ _id: new ObjectId(id) })
    if (!existingDoc) {
      return NextResponse.json(
        { error: 'Stock entry not found' },
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
          const bucket = new GridFSBucket(db, { bucketName: 'leatherFiles' })
          try {
            await bucket.delete(new ObjectId(existingDoc.pdfFile.fileId))
            console.log('🗑️ Old PDF file deleted')
          } catch (deleteError) {
            console.warn('⚠️ Failed to delete old PDF file:', deleteError)
          }
        }

        // Upload new PDF file
        const timestamp = Date.now()
        const pdfFileName = `leather_${timestamp}_${pdfFile.name}`
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
      action: 'leather_stock_updated',
      resourceType: 'leather',
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
        { error: 'Stock entry not found' },
        { status: 404 }
      )
    }

    console.log('✅ Updated leather stock entry (preserving original quantities):', id)
    return NextResponse.json({ 
      ...result, 
      message: pdfFile ? 'Stock entry updated with new PDF file' : 'Stock entry updated',
      note: 'Original quantities preserved for audit trail'
    })
  } catch (err) {
    console.error('❌ PATCH leather stock error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(req) {
  try {
    if (!isAdmin(req)) {
      console.warn('⚠️ Unauthorized DELETE attempt on leather stock')
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
    const type = searchParams.get('type')
    const deleteType = searchParams.get('deleteType')

    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    const collection = db.collection('leather')
    const auditCollection = db.collection('audit_logs')
    const bucket = new GridFSBucket(db, { bucketName: 'leatherFiles' })

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
                associatedStockId: doc._id,
                stockType: doc.type,
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
                associatedStockId: doc._id
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
          { error: 'Stock entry not found' },
          { status: 404 }
        )
      }

      // Delete associated PDF file if exists
      await deleteAssociatedFiles([document])

      const result = await collection.deleteOne({ _id: new ObjectId(id) })

      // Create comprehensive audit log
      await auditCollection.insertOne({
        action: 'leather_stock_deleted',
        resourceType: 'leather',
        resourceId: id,
        details: {
          deletedDocument: document,
          stockType: document.type,
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

      console.log(`✅ Single stock entry ${id} deleted successfully`)
      return NextResponse.json({
        message: 'Original worker submission deleted successfully',
        deletedCount: result.deletedCount,
        note: 'This was an original worker submission - consider using stock removal system instead'
      })
    }

    if (deleteType === 'bulk') {
      let query = {}

      if (startDate && endDate) {
        query.date = {
          $gte: new Date(startDate),
          $lte: new Date(endDate + 'T23:59:59.999Z'),
        }
      }

      if (status && status !== 'all') query.status = status
      if (type) query.type = new RegExp(type, 'i')

      if (Object.keys(query).length === 0) {
        return NextResponse.json(
          {
            error: 'Bulk delete requires at least one filter criteria',
          },
          { status: 400 }
        )
      }

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
        action: 'leather_stock_bulk_deleted',
        resourceType: 'leather',
        details: {
          query: query,
          deletedCount: result.deletedCount,
          documentsDeleted: documentsToDelete.map(doc => ({
            id: doc._id,
            type: doc.type,
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
        message: `${result.deletedCount} original worker submissions deleted successfully`,
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
          { error: 'Stock entry not found' },
          { status: 404 }
        )
      }

      // Delete associated PDF file if exists
      await deleteAssociatedFiles([document])

      const result = await collection.deleteOne({ _id: new ObjectId(id) })

      return NextResponse.json({ 
        message: 'Deleted successfully', 
        result,
        note: 'Original worker submission deleted'
      })
    }

    return NextResponse.json(
      {
        error: 'Invalid delete request. Specify deleteType as single or bulk',
      },
      { status: 400 }
    )
  } catch (err) {
    console.error('❌ DELETE leather stock error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
