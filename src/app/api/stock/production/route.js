import clientPromise from '@/lib/mongodb'
import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { GridFSBucket } from 'mongodb'

const imageHostingKey = process.env.NEXT_PUBLIC_IMGBB_KEY
const imageHostingApi = `https://api.imgbb.com/1/upload?key=${imageHostingKey}`

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

const deleteImageFromImgbb = async (imageUrl) => {
  try {
    const urlParts = imageUrl.split('/')
    const imageId = urlParts[4]

    if (!imageId) return false

    const deleteUrl = `https://api.imgbb.com/1/delete/${imageId}?key=${imageHostingKey}`

    const response = await fetch(deleteUrl, {
      method: 'GET',
    })

    return response.ok
  } catch (error) {
    console.error('Error deleting image from imgbb:', error)
    return false
  }
}

// Helper function to handle PDF upload to GridFS
const uploadPdfToGridFS = async (db, file, filename) => {
  const bucket = new GridFSBucket(db, { bucketName: 'productionFiles' })
  
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

// ✅ UPDATED: Enhanced function to calculate net available finished product quantities with product code support
const calculateNetAvailableFinishedProducts = async (db) => {
  console.log('🔍 Calculating net available finished products...')
  
  const finishedProductsCollection = db.collection('finished_products')
  // ✅ UPDATED: Use unified stock_removal_logs for consistency
  const stockRemovalLogCollection = db.collection('stock_removal_logs')
  
  // Get all finished products
  const finishedProducts = await finishedProductsCollection.find({}).toArray()
  
  // ✅ UPDATED: Get all completed product removals from unified collection
  const allRemovals = await stockRemovalLogCollection
    .find({ 
      status: 'completed',
      category: 'finished_product' // ✅ Filter by category for finished products
    })
    .toArray()
  
  // Calculate net quantities by product ID
  const productQuantities = {}
  
  // First, add all finished product quantities
  finishedProducts.forEach(product => {
    productQuantities[product._id.toString()] = {
      productId: product._id,
      productName: product.productName,
      productCode: product.productCode || null, // ✅ NEW: Include product code
      originalFulfilledQuantity: product.fulfilledQuantity || 0,
      totalRemoved: 0,
      currentAvailableQuantity: product.fulfilledQuantity || 0,
      finishedAt: product.finishedAt,
      // Preserve original product data
      originalProduct: product
    }
  })
  
  // ✅ UPDATED: Process removals from unified collection
  allRemovals.forEach(removal => {
    const productId = removal.stockType || removal.productId // Support both field names
    if (productQuantities[productId]) {
      productQuantities[productId].totalRemoved += removal.actualRemovedQuantity || removal.removeQuantity || 0
    }
  })
  
  // Calculate current available quantities
  Object.keys(productQuantities).forEach(productId => {
    const product = productQuantities[productId]
    product.currentAvailableQuantity = Math.max(0, product.originalFulfilledQuantity - product.totalRemoved)
    
    // Add percentage moved/sold
    product.percentageMoved = product.originalFulfilledQuantity > 0 
      ? ((product.totalRemoved / product.originalFulfilledQuantity) * 100).toFixed(2)
      : 0
  })
  
  console.log('📊 Net finished product quantities calculated:', Object.keys(productQuantities).length, 'products')
  return productQuantities
}

// ✅ UPDATED: Enhanced validation function with product code support
const validateAndFormatMaterials = (materials) => {
  if (!materials || !Array.isArray(materials)) {
    return []
  }

  return materials
    .filter((material) => material.name && material.name.trim() !== '')
    .map((material, index) => ({
      id: `material_${index + 1}`,
      name: material.name.trim(),
      price: parseFloat(material.price) || 0,
    }))
}

// ✅ NEW: Function to validate and format product code
const validateProductCode = (productCode) => {
  if (!productCode || typeof productCode !== 'string') {
    return null
  }
  
  const trimmed = productCode.trim()
  if (trimmed === '') {
    return null
  }
  
  // Optional: Add product code format validation (e.g., PD-001, WL-100)
  const codePattern = /^[A-Z]{2}-\d{3}$/i
  if (!codePattern.test(trimmed)) {
    console.warn('⚠️ Product code format warning:', trimmed, 'Expected format: XX-000')
  }
  
  return trimmed.toUpperCase() // Standardize to uppercase
}

export async function GET(req) {
  console.log('🔍 GET /api/stock/production - Starting')

  try {
    const { searchParams } = new URL(req.url)
    const downloadFile = searchParams.get('downloadFile')
    const fileId = searchParams.get('fileId')
    const getNetQuantities = searchParams.get('getNetQuantities') // NEW: Get net quantities

    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    const productionCollection = db.collection('production')
    const applyCollection = db.collection('production_apply')

    console.log('✅ MongoDB connected successfully')

    // Handle PDF file download
    if (downloadFile === 'true' && fileId) {
      try {
        if (!ObjectId.isValid(fileId)) {
          return NextResponse.json(
            { error: 'Invalid file ID format' },
            { status: 400 }
          )
        }

        const bucket = new GridFSBucket(db, { bucketName: 'productionFiles' })
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

    // Regular production jobs query
    const items = await productionCollection.find().toArray()
    console.log(`📦 Found ${items.length} production jobs`)

    // NEW: Get net quantities for finished products if requested
    let netFinishedProductQuantities = {}
    if (getNetQuantities === 'true') {
      netFinishedProductQuantities = await calculateNetAvailableFinishedProducts(db)
    }

    const itemsWithApplications = await Promise.all(
      items.map(async (item) => {
        const applicationCount = await applyCollection.countDocuments({
          jobId: item._id.toString(),
        })

        const approvedApps = await applyCollection
          .find({
            jobId: item._id.toString(),
            status: 'approved',
          })
          .toArray()

        const approvedQuantity = approvedApps.reduce(
          (sum, app) => sum + app.quantity,
          0
        )
        const remainingQuantity = Math.max(0, item.quantity - approvedQuantity)

        // ✅ UPDATED: Enhanced item with product code and finished product net quantities
        const enhancedItem = {
          ...item,
          applicationCount,
          approvedQuantity,
          remainingQuantity:
            item.remainingQuantity !== undefined
              ? item.remainingQuantity
              : remainingQuantity,
          fulfilledQuantity:
            item.fulfilledQuantity !== undefined
              ? item.fulfilledQuantity
              : approvedQuantity,
          // ✅ NEW: Ensure product code is included
          productCode: item.productCode || null,
        }

        // ✅ UPDATED: Add net quantity info with product code matching
        if (getNetQuantities === 'true') {
          const relatedFinishedProducts = Object.values(netFinishedProductQuantities)
            .filter(fp => {
              // Match by product name and optionally by product code
              const nameMatch = fp.originalProduct.productName === item.productName
              const codeMatch = item.productCode && fp.productCode 
                ? fp.productCode === item.productCode 
                : true // If no codes, just match by name
              return nameMatch && codeMatch
            })

          if (relatedFinishedProducts.length > 0) {
            const totalOriginalProduced = relatedFinishedProducts.reduce(
              (sum, fp) => sum + fp.originalFulfilledQuantity, 0
            )
            const totalCurrentAvailable = relatedFinishedProducts.reduce(
              (sum, fp) => sum + fp.currentAvailableQuantity, 0
            )
            const totalRemoved = relatedFinishedProducts.reduce(
              (sum, fp) => sum + fp.totalRemoved, 0
            )

            enhancedItem.finishedProductsSummary = {
              totalOriginalProduced,
              totalCurrentAvailable,
              totalRemoved,
              relatedProductsCount: relatedFinishedProducts.length,
              inventoryTurnoverRate: totalOriginalProduced > 0 
                ? ((totalRemoved / totalOriginalProduced) * 100).toFixed(2)
                : 0,
              // ✅ NEW: Include product code info
              matchedByProductCode: item.productCode && relatedFinishedProducts.some(fp => fp.productCode === item.productCode)
            }
          }
        }

        return enhancedItem
      })
    )

    // ✅ UPDATED: Enhanced response with product code statistics
    if (getNetQuantities === 'true') {
      const responseData = {
        items: itemsWithApplications,
        netFinishedProductQuantities,
        statistics: {
          totalProductionJobs: itemsWithApplications.length,
          totalFinishedProducts: Object.keys(netFinishedProductQuantities).length,
          totalOriginalProduced: Object.values(netFinishedProductQuantities)
            .reduce((sum, fp) => sum + fp.originalFulfilledQuantity, 0),
          totalCurrentAvailable: Object.values(netFinishedProductQuantities)
            .reduce((sum, fp) => sum + fp.currentAvailableQuantity, 0),
          totalRemoved: Object.values(netFinishedProductQuantities)
            .reduce((sum, fp) => sum + fp.totalRemoved, 0),
          // ✅ NEW: Product code statistics
          jobsWithProductCode: itemsWithApplications.filter(item => item.productCode).length,
          uniqueProductCodes: [...new Set(itemsWithApplications.map(item => item.productCode).filter(Boolean))].length,
        },
        generatedAt: new Date(),
        dataIntegrityNote: "Original production and finished product records are preserved. Net quantities calculated separately. Product codes tracked for enhanced inventory management."
      }

      console.log('✅ GET /api/stock/production with net quantities - Success')
      return NextResponse.json(responseData)
    }

    console.log('✅ GET /api/stock/production - Success')
    return NextResponse.json(itemsWithApplications)
  } catch (err) {
    console.error('❌ GET /api/stock/production error:', err)
    console.error('Error stack:', err.stack)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req) {
  console.log('📝 POST /api/stock/production - Starting')
  console.log('🔧 IMGBB Key present:', !!imageHostingKey)

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
        } else if (key === 'materials') {
          try {
            body[key] = JSON.parse(value)
          } catch {
            body[key] = value
          }
        } else {
          body[key] = value
        }
      }
    } else {
      body = await req.json()
    }

    console.log('📝 Received body:', {
      productName: body.productName,
      productCode: body.productCode, // ✅ NEW: Log product code
      quantity: body.quantity,
      description: body.description?.substring(0, 50),
      hasImage: !!body.image,
      hasPdf: !!pdfFile,
      materialsCount: body.materials?.length || 0,
    })

    // ✅ UPDATED: Enhanced validation with product code
    if (!body.productName || !body.quantity) {
      console.error('❌ Missing required fields')
      return NextResponse.json(
        {
          error: 'Product name and quantity are required',
        },
        { status: 400 }
      )
    }

    // ✅ NEW: Validate product code if provided
    const validatedProductCode = validateProductCode(body.productCode)
    if (body.productCode && !validatedProductCode) {
      console.error('❌ Invalid product code format')
      return NextResponse.json(
        {
          error: 'Product code must be a non-empty string (recommended format: XX-000)',
        },
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

    if (!imageHostingKey && body.image) {
      console.error('❌ IMGBB API key not configured')
      return NextResponse.json(
        {
          error: 'Image hosting service not configured',
        },
        { status: 500 }
      )
    }

    console.log('🔗 Connecting to MongoDB...')
    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    const collection = db.collection('production')
    const auditCollection = db.collection('audit_logs') // NEW: Audit logging
    console.log('✅ MongoDB connected successfully')

    let imageUrl = null
    let deleteUrl = null

    // Handle image upload (existing functionality)
    if (body.image) {
      console.log('📷 Uploading image to IMGBB...')
      try {
        const form = new URLSearchParams()
        form.append('image', body.image)

        const uploadRes = await fetch(imageHostingApi, {
          method: 'POST',
          body: form,
        })

        console.log('📷 IMGBB response status:', uploadRes.status)

        if (!uploadRes.ok) {
          const errorText = await uploadRes.text()
          console.error('❌ IMGBB upload failed:', errorText)
          throw new Error(`Image upload failed with status ${uploadRes.status}`)
        }

        const uploadData = await uploadRes.json()
        console.log('📷 IMGBB upload result:', uploadData.success)

        if (uploadData.success) {
          imageUrl = uploadData.data.display_url
          deleteUrl = uploadData.data.delete_url
          console.log('✅ Image uploaded successfully')
        } else {
          console.error('❌ IMGBB upload failed:', uploadData)
          throw new Error('Image upload failed: ' + JSON.stringify(uploadData))
        }
      } catch (imageError) {
        console.error('❌ Image upload error:', imageError)
        console.log('⚠️ Continuing without image')
      }
    }

    let pdfFileId = null
    let pdfFileName = null

    // Handle PDF upload
    if (pdfFile && pdfFile.size > 0) {
      try {
        const timestamp = Date.now()
        pdfFileName = `production_${timestamp}_${pdfFile.name}`
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

    const formattedMaterials = validateAndFormatMaterials(body.materials)
    console.log('🧾 Processed materials:', formattedMaterials.length)

    const totalMaterialCost = formattedMaterials.reduce(
      (sum, material) => sum + material.price,
      0
    )

    console.log('💾 Inserting document to MongoDB...')

    // ✅ UPDATED: Enhanced production job document with product code
    const document = {
      productName: body.productName,
      productCode: validatedProductCode, // ✅ NEW: Add product code field
      description: body.description || '',
      quantity: Number(body.quantity),
      remainingQuantity: Number(body.quantity),
      fulfilledQuantity: 0,
      unit: body.unit || 'pcs',
      materials: formattedMaterials,
      totalMaterialCost: totalMaterialCost,
      image: imageUrl,
      imageDeleteUrl: deleteUrl,
      date: new Date(),
      status: body.status || 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
      
      // NEW: Audit trail metadata
      createdBy: 'admin',
      clientIP: getClientIP(req),
      userAgent: req.headers.get('user-agent') || 'unknown',
      
      // ✅ UPDATED: Enhanced tracking with product code support
      originalQuantityPreserved: true,
      productionStage: 'planning',
      inventoryTracking: {
        enableNetQuantityTracking: true,
        preserveOriginalRecords: true,
        productCodeTracking: !!validatedProductCode // Track if product code is used
      }
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

    // ✅ UPDATED: Enhanced audit log with product code
    await auditCollection.insertOne({
      action: 'production_job_created',
      resourceType: 'production',
      resourceId: result.insertedId,
      details: {
        productName: body.productName,
        productCode: validatedProductCode, // ✅ NEW: Include product code in audit
        quantity: Number(body.quantity),
        materialsCost: totalMaterialCost,
        hasPdfFile: !!pdfFileId,
        hasImage: !!imageUrl,
        note: 'Production job created with enhanced tracking and product code support'
      },
      timestamp: new Date(),
      clientIP: getClientIP(req),
      userAgent: req.headers.get('user-agent') || 'unknown',
      success: true
    })

    console.log('✅ Document inserted successfully:', result.insertedId)
    console.log('✅ POST /api/stock/production - Success')

    return NextResponse.json(
      {
        success: true,
        insertedId: result.insertedId,
        message: pdfFile ? 'Production job created with PDF file' : 'Production job created',
        fileUploaded: !!pdfFileId,
        productCode: validatedProductCode, // ✅ NEW: Return validated product code
        note: 'Enhanced with finished product tracking and product code support'
      },
      { status: 201 }
    )
  } catch (err) {
    console.error('❌ POST /api/stock/production error:', err)
    console.error('Error stack:', err.stack)
    return NextResponse.json(
      {
        error: 'Failed to create production job',
        details: err.message,
      },
      { status: 500 }
    )
  }
}

export async function PATCH(req) {
  console.log('🔄 PATCH /api/stock/production - Starting')

  try {
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
        } else if (key === 'materials') {
          try {
            body[key] = JSON.parse(value)
          } catch {
            body[key] = value
          }
        } else {
          body[key] = value
        }
      }
    } else {
      body = await req.json()
    }

    console.log('🔄 PATCH request:', { 
      id, 
      productName: body.productName,
      productCode: body.productCode, // ✅ NEW: Log product code updates
      hasPdf: !!pdfFile 
    })

    if (!id) {
      console.error('❌ Missing ID parameter')
      return NextResponse.json({ error: 'ID is required' }, { status: 400 })
    }

    if (!ObjectId.isValid(id)) {
      console.error('❌ Invalid ObjectId:', id)
      return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 })
    }

    // ✅ NEW: Validate product code if being updated
    if (body.productCode !== undefined) {
      const validatedProductCode = validateProductCode(body.productCode)
      if (body.productCode && !validatedProductCode) {
        console.error('❌ Invalid product code format')
        return NextResponse.json(
          {
            error: 'Product code must be a non-empty string (recommended format: XX-000)',
          },
          { status: 400 }
        )
      }
      body.productCode = validatedProductCode // Use validated version
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
    const collection = db.collection('production')
    const auditCollection = db.collection('audit_logs') // NEW: Audit logging

    // Get existing document for audit trail
    const existingDoc = await collection.findOne({ _id: new ObjectId(id) })
    if (!existingDoc) {
      return NextResponse.json(
        { error: 'Production job not found' },
        { status: 404 }
      )
    }

    // Handle PDF file update
    if (pdfFile && pdfFile.size > 0) {
      try {
        // Delete old PDF file if exists
        if (existingDoc?.pdfFile?.fileId) {
          const bucket = new GridFSBucket(db, { bucketName: 'productionFiles' })
          try {
            await bucket.delete(new ObjectId(existingDoc.pdfFile.fileId))
            console.log('🗑️ Old PDF file deleted')
          } catch (deleteError) {
            console.warn('⚠️ Failed to delete old PDF file:', deleteError)
          }
        }

        // Upload new PDF file
        const timestamp = Date.now()
        const pdfFileName = `production_${timestamp}_${pdfFile.name}`
        const pdfFileId = await uploadPdfToGridFS(db, pdfFile, pdfFileName)
        
        body.pdfFile = {
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

    if (body.materials) {
      const formattedMaterials = validateAndFormatMaterials(body.materials)
      body.materials = formattedMaterials
      body.totalMaterialCost = formattedMaterials.reduce(
        (sum, material) => sum + material.price,
        0
      )
      console.log('🧾 Updated materials:', formattedMaterials.length)
    }

    if (body.quantity !== undefined) {
      const fulfilledQuantity = existingDoc.fulfilledQuantity || 0
      body.remainingQuantity = Math.max(
        0,
        Number(body.quantity) - fulfilledQuantity
      )
      console.log('🔄 Updated remaining quantity:', body.remainingQuantity)
    }

    // ✅ UPDATED: Enhanced update data with product code audit trail
    const updateData = {
      ...body, 
      updatedAt: new Date(),
      lastModifiedBy: 'admin',
      lastModifiedReason: body.updateReason || 'production_job_update',
      clientIP: getClientIP(req),
      userAgent: req.headers.get('user-agent') || 'unknown',
    }

    const result = await collection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    )

    // ✅ UPDATED: Enhanced audit log with product code changes
    await auditCollection.insertOne({
      action: 'production_job_updated',
      resourceType: 'production',
      resourceId: id,
      details: {
        updatedFields: Object.keys(body),
        originalData: existingDoc,
        hasPdfUpdate: !!pdfFile,
        productCodeChanged: body.productCode !== undefined && body.productCode !== existingDoc.productCode,
        oldProductCode: existingDoc.productCode,
        newProductCode: body.productCode,
        note: 'Production job updated with enhanced tracking and product code support'
      },
      timestamp: new Date(),
      clientIP: getClientIP(req),
      userAgent: req.headers.get('user-agent') || 'unknown',
      success: result.modifiedCount > 0
    })

    console.log('✅ PATCH /api/stock/production - Success')
    return NextResponse.json({ 
      ...result, 
      message: pdfFile ? 'Production job updated with new PDF file' : 'Production job updated',
      productCode: body.productCode, // ✅ NEW: Return updated product code
      note: 'Enhanced tracking and product code support preserved'
    })
  } catch (err) {
    console.error('❌ PATCH /api/stock/production error:', err)
    console.error('Error stack:', err.stack)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(req) {
  console.log('🗑️ DELETE /api/stock/production - Starting')

  try {
    if (!isAdmin(req)) {
      console.error('❌ Unauthorized delete attempt')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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
    const productionCollection = db.collection('production')
    const applyCollection = db.collection('production_apply')
    const auditCollection = db.collection('audit_logs') // NEW: Audit logging

    const job = await productionCollection.findOne({ _id: new ObjectId(id) })

    if (!job) {
      console.error('❌ Job not found:', id)
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    console.log('📋 Found job to delete:', job.productName, 'Code:', job.productCode)

    let imageDeleted = false
    let pdfDeleted = false

    // Delete image from IMGBB if exists
    if (job.image) {
      console.log('🗑️ Deleting image from IMGBB...')
      imageDeleted = await deleteImageFromImgbb(job.image)
      console.log(
        `📷 Image deletion ${
          imageDeleted ? 'successful' : 'failed'
        } for job ${id}`
      )
    }

    // Delete PDF from GridFS if exists
    if (job.pdfFile?.fileId) {
      try {
        const bucket = new GridFSBucket(db, { bucketName: 'productionFiles' })
        await bucket.delete(new ObjectId(job.pdfFile.fileId))
        pdfDeleted = true
        console.log('🗑️ PDF file deleted successfully')
      } catch (pdfDeleteError) {
        console.warn('⚠️ Failed to delete PDF file:', pdfDeleteError)
      }
    }

    console.log('🗑️ Deleting job applications...')
    const applicationsDeleteResult = await applyCollection.deleteMany({
      jobId: id,
    })
    console.log(
      `📋 Deleted ${applicationsDeleteResult.deletedCount} applications`
    )

    console.log('🗑️ Deleting job...')
    const jobDeleteResult = await productionCollection.deleteOne({
      _id: new ObjectId(id),
    })

    // ✅ UPDATED: Enhanced audit log with product code information
    await auditCollection.insertOne({
      action: 'production_job_deleted',
      resourceType: 'production',
      resourceId: id,
      details: {
        deletedJob: job,
        productName: job.productName,
        productCode: job.productCode, // ✅ NEW: Include product code in audit
        quantity: job.quantity,
        applicationsDeleted: applicationsDeleteResult.deletedCount,
        imageDeleted: imageDeleted,
        pdfDeleted: pdfDeleted,
        note: 'Complete production job deletion with cleanup and product code tracking'
      },
      timestamp: new Date(),
      clientIP: getClientIP(req),
      userAgent: req.headers.get('user-agent') || 'unknown',
      success: jobDeleteResult.deletedCount > 0
    })

    console.log('✅ DELETE /api/stock/production - Success')
    return NextResponse.json({
      message: 'Production job and related data deleted successfully',
      jobDeleted: jobDeleteResult.deletedCount > 0,
      applicationsDeleted: applicationsDeleteResult.deletedCount,
      imageDeleted: imageDeleted,
      pdfDeleted: pdfDeleted,
      productCode: job.productCode, // ✅ NEW: Return deleted product code
      note: 'Enhanced audit trail with product code tracking preserved'
    })
  } catch (err) {
    console.error('❌ DELETE /api/stock/production error:', err)
    console.error('Error stack:', err.stack)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
