import clientPromise from '@/lib/mongodb'
import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { GridFSBucket } from 'mongodb'
import jsPDF from 'jspdf'
import 'jspdf-autotable'

const imageHostingKey = process.env.NEXT_PUBLIC_IMGBB_KEY
const imageHostingApi = `https://api.imgbb.com/1/upload?key=${imageHostingKey}`

const isAdmin = (req) => {
  const role = req.headers.get('role')
  return role === 'admin'
}

// ✅ NEW: Worker authentication helper
const isWorker = (req) => {
  const role = req.headers.get('role')
  return role === 'worker'
}

// ✅ NEW: Get worker email from request
const getWorkerEmail = (req) => {
  return req.headers.get('worker-email') || req.headers.get('user-email')
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
    const productCode = searchParams.get('productCode') // New search parameter
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

    let query = {}
    if (productCode) query.productCode = { $regex: new RegExp(productCode, 'i') } // Add product code search

    // ✅ NEW: Worker access control - only show jobs assigned to them or open jobs
    if (isWorker(req)) {
      const workerEmail = getWorkerEmail(req)
      if (workerEmail) {
        query.$or = [
          { 'assignedWorker.email': workerEmail }, // Jobs assigned to this worker
          { status: { $in: ['open', 'pending'] }, assignedWorker: { $exists: false } } // Open jobs without assignment
        ]
        console.log('👷 Worker access - filtering jobs for:', workerEmail)
      }
    }

    // Regular production jobs query
    const items = await productionCollection.find(query).toArray()
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

    // Add downloadable details endpoint logic
    if (searchParams.get('downloadDetails') && itemsWithApplications.length === 1) {
      const job = itemsWithApplications[0]
      const doc = new jsPDF()
      doc.setFontSize(16)
      doc.text(`Product Details - ${job.productName}`, 10, 10)
      doc.setFontSize(12)
      doc.text(`Product Code: ${job.productCode || 'N/A'}`, 10, 20)
      doc.text(`Description: ${job.description || 'No description'}`, 10, 30)
      doc.text(`Quantity: ${job.quantity}`, 10, 40)
      doc.text(`Fulfilled: ${job.fulfilledQuantity || 0}`, 10, 50)
      doc.text(`VAT %: ${job.vatPercentage || 0}%`, 10, 60)
      const totalMaterialCost = job.materials.reduce((sum, material) => sum + material.price, 0)
      const totalCostWithVAT = totalMaterialCost * (job.fulfilledQuantity || 0) * (1 + (parseFloat(job.vatPercentage || 0) / 100))
      doc.text(`Total Cost (including VAT): $${totalCostWithVAT.toFixed(2)}`, 10, 70)

      if (job.images && job.images[0]) {
        const imgResponse = await fetch(job.images[0])
        const imgBlob = await imgResponse.blob()
        const imgData = await new Promise((resolve) => {
          const reader = new FileReader()
          reader.onloadend = () => resolve(reader.result)
          reader.readAsDataURL(imgBlob)
        })
        doc.addImage(imgData, 'JPEG', 10, 80, 50, 50)
      }

      const pdfBuffer = doc.output('arraybuffer')
      return new NextResponse(pdfBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${job.productName}_details.pdf"`,
        },
      })
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
    // ✅ NEW: Check if user is admin (workers cannot create production jobs)
    if (!isAdmin(req)) {
      console.error('❌ Unauthorized: Only admins can create production jobs')
      return NextResponse.json(
        { error: 'Unauthorized: Only admins can create production jobs' },
        { status: 403 }
      )
    }

    // Check if it's form data (for file uploads) or JSON
    const contentType = req.headers.get('content-type')
    let body = {}
    let pdfFile = null
    const imageFiles = []

    if (contentType && contentType.includes('multipart/form-data')) {
      const formData = await req.formData()
      
      // Extract all form fields
      for (const [key, value] of formData.entries()) {
        if (key === 'pdfFile') {
          pdfFile = value
        } else if (key.startsWith('image')) {
          imageFiles.push(value) // ✅ NEW: Collect all image files
        } else if (key === 'materials') {
          try {
            body[key] = JSON.parse(value)
          } catch {
            body[key] = value
          }
        } else if (key === 'workerEmail') {
          body[key] = value
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
      hasImages: imageFiles.length > 0,
      hasPdf: !!pdfFile,
      materialsCount: body.materials?.length || 0,
      workerEmail: body.workerEmail,
      vatPercentage: body.vatPercentage,
    })

    // ✅ UPDATED: Enhanced validation with product code, VAT, and worker assignment
    if (!body.productName || !body.quantity || !body.productCode || !body.vatPercentage) {
      console.error('❌ Missing required fields')
      return NextResponse.json(
        {
          error: 'Product name, product code, quantity, and VAT % are required',
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

    if (!imageHostingKey && imageFiles.length > 0) {
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
    const userCollection = db.collection('user') // For worker lookup
    const auditCollection = db.collection('audit_logs') // NEW: Audit logging
    console.log('✅ MongoDB connected successfully')

    let imageUrls = []
    let deleteUrls = []

    // ✅ NEW: Handle multiple image uploads
    if (imageFiles.length > 0) {
      console.log('📷 Uploading multiple images to IMGBB...')
      for (const [index, file] of imageFiles.entries()) {
        try {
          const form = new URLSearchParams()
          const imageBase64 = await fileToBase64(file)
          form.append('image', imageBase64)

          const uploadRes = await fetch(imageHostingApi, {
            method: 'POST',
            body: form,
          })

          console.log(`📷 IMGBB response status for image ${index + 1}:`, uploadRes.status)

          if (!uploadRes.ok) {
            const errorText = await uploadRes.text()
            console.error(`❌ IMGBB upload failed for image ${index + 1}:`, errorText)
            throw new Error(`Image ${index + 1} upload failed with status ${uploadRes.status}`)
          }

          const uploadData = await uploadRes.json()
          console.log(`📷 IMGBB upload result for image ${index + 1}:`, uploadData.success)

          if (uploadData.success) {
            imageUrls.push(uploadData.data.display_url)
            deleteUrls.push(uploadData.data.delete_url)
            console.log(`✅ Image ${index + 1} uploaded successfully`)
          } else {
            console.error(`❌ IMGBB upload failed for image ${index + 1}:`, uploadData)
            throw new Error(`Image ${index + 1} upload failed: ${JSON.stringify(uploadData)}`)
          }
        } catch (imageError) {
          console.error(`❌ Image ${index + 1} upload error:`, imageError)
          console.log('⚠️ Continuing without all images')
          break
        }
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

    // ✅ NEW: Worker lookup and assignment
    let worker = null
    if (body.workerEmail) {
      worker = await userCollection.findOne({ email: body.workerEmail })
      if (!worker) {
        console.warn('⚠️ Worker email not found:', body.workerEmail)
      }
    }

    // ✅ NEW: Determine status based on worker assignment
    let jobStatus = body.status || 'pending'
    if (worker) {
      jobStatus = 'assigned' // Automatically set to assigned if worker is assigned
      console.log('👷 Job assigned to worker:', worker.email, '- Status set to assigned')
    }

    // ✅ UPDATED: Enhanced production job document with product code, VAT, and worker assignment
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
      vatPercentage: parseFloat(body.vatPercentage), // ✅ NEW: VAT percentage
      images: imageUrls, // ✅ NEW: Multiple images
      imageDeleteUrls: deleteUrls, // ✅ NEW: Multiple delete URLs
      date: new Date(),
      status: jobStatus, // ✅ NEW: Status based on worker assignment
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

    // ✅ NEW: Add worker assignment if found
    if (worker) {
      document.assignedWorker = {
        email: worker.email,
        name: worker.name || 'Unknown',
        assignedAt: new Date(),
      }
    }

    const result = await collection.insertOne(document)

    // ✅ UPDATED: Enhanced audit log with product code, VAT, and worker assignment
    await auditCollection.insertOne({
      action: 'production_job_created',
      resourceType: 'production',
      resourceId: result.insertedId,
      details: {
        productName: body.productName,
        productCode: validatedProductCode, // ✅ NEW: Include product code in audit
        quantity: Number(body.quantity),
        materialsCost: totalMaterialCost,
        vatPercentage: parseFloat(body.vatPercentage), // ✅ NEW: VAT in audit
        hasPdfFile: !!pdfFileId,
        hasImages: imageUrls.length > 0,
        imagesCount: imageUrls.length, // ✅ NEW: Image count
        workerEmail: body.workerEmail,
        workerAssigned: !!worker,
        statusSetTo: jobStatus, // ✅ NEW: Status in audit
        note: 'Production job created with multiple images, VAT, and worker assignment'
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
        imagesUploaded: imageUrls.length, // ✅ NEW: Image count in response
        productCode: validatedProductCode, // ✅ NEW: Return validated product code
        vatPercentage: parseFloat(body.vatPercentage), // ✅ NEW: VAT in response
        workerAssigned: !!worker,
        status: jobStatus, // ✅ NEW: Status in response
        note: 'Enhanced with multiple images, VAT, and worker assignment'
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
      hasPdf: !!pdfFile,
      workerEmail: body.workerEmail,
      vatPercentage: body.vatPercentage,
    })

    if (!id) {
      console.error('❌ Missing ID parameter')
      return NextResponse.json({ error: 'ID is required' }, { status: 400 })
    }

    if (!ObjectId.isValid(id)) {
      console.error('❌ Invalid ObjectId:', id)
      return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 })
    }

    // ✅ NEW: Access control - workers can only update jobs assigned to them
    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    const collection = db.collection('production')
    const userCollection = db.collection('user') // For worker lookup
    const auditCollection = db.collection('audit_logs') // NEW: Audit logging

    // Get existing document for validation and audit trail
    const existingDoc = await collection.findOne({ _id: new ObjectId(id) })
    if (!existingDoc) {
      return NextResponse.json(
        { error: 'Production job not found' },
        { status: 404 }
      )
    }

    // ✅ NEW: Worker access control
    if (isWorker(req)) {
      const workerEmail = getWorkerEmail(req)
      if (!existingDoc.assignedWorker || existingDoc.assignedWorker.email !== workerEmail) {
        console.error('❌ Unauthorized: Worker can only update assigned jobs')
        return NextResponse.json(
          { error: 'Unauthorized: You can only update jobs assigned to you' },
          { status: 403 }
        )
      }
      // Workers cannot change certain fields
      const workerRestrictedFields = ['productName', 'productCode', 'quantity', 'materials', 'vatPercentage', 'workerEmail']
      workerRestrictedFields.forEach(field => {
        if (body[field] !== undefined) {
          console.warn(`⚠️ Worker attempted to modify restricted field: ${field}`)
          delete body[field]
        }
      })
    }

    // ✅ NEW: Validate product code if being updated (admin only)
    if (body.productCode !== undefined && isAdmin(req)) {
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

    // Handle PDF file update (admin only)
    if (pdfFile && pdfFile.size > 0 && isAdmin(req)) {
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

    if (body.materials && isAdmin(req)) {
      const formattedMaterials = validateAndFormatMaterials(body.materials)
      body.materials = formattedMaterials
      body.totalMaterialCost = formattedMaterials.reduce(
        (sum, material) => sum + material.price,
        0
      )
      console.log('🧾 Updated materials:', formattedMaterials.length)
    }

    if (body.quantity !== undefined && isAdmin(req)) {
      const fulfilledQuantity = existingDoc.fulfilledQuantity || 0
      body.remainingQuantity = Math.max(
        0,
        Number(body.quantity) - fulfilledQuantity
      )
      console.log('🔄 Updated remaining quantity:', body.remainingQuantity)
    }

    // ✅ NEW: Worker assignment handling (admin only)
    let newWorker = null
    if (body.workerEmail !== undefined && isAdmin(req)) {
      if (body.workerEmail) {
        newWorker = await userCollection.findOne({ email: body.workerEmail })
        if (!newWorker) {
          console.warn('⚠️ Worker email not found:', body.workerEmail)
        } else {
          body.assignedWorker = {
            email: newWorker.email,
            name: newWorker.name || 'Unknown',
            assignedAt: new Date(),
          }
          // Set status to assigned if worker is assigned
          if (existingDoc.status !== 'assigned') {
            body.status = 'assigned'
            console.log('👷 Job assigned to worker:', newWorker.email, '- Status set to assigned')
          }
        }
      } else {
        // Remove worker assignment
        body.$unset = { assignedWorker: "" }
        if (existingDoc.status === 'assigned') {
          body.status = 'pending'
          console.log('👷 Worker assignment removed - Status set to pending')
        }
      }
    }

    // ✅ UPDATED: Enhanced update data with product code and worker assignment audit trail
    const updateData = {
      ...body,
      updatedAt: new Date(),
      lastModifiedBy: isAdmin(req) ? 'admin' : 'worker',
      lastModifiedReason: body.updateReason || 'production_job_update',
      clientIP: getClientIP(req),
      userAgent: req.headers.get('user-agent') || 'unknown',
    }

    const updateQuery = { $set: updateData }
    if (body.$unset) {
      updateQuery.$unset = body.$unset
      delete updateData.$unset
    }

    const result = await collection.updateOne(
      { _id: new ObjectId(id) },
      updateQuery
    )

    // ✅ UPDATED: Enhanced audit log with product code and worker assignment changes
    await auditCollection.insertOne({
      action: 'production_job_updated',
      resourceType: 'production',
      resourceId: id,
      details: {
        updatedFields: Object.keys(body).filter(key => key !== '$unset'),
        originalData: existingDoc,
        hasPdfUpdate: !!pdfFile,
        productCodeChanged: body.productCode !== undefined && body.productCode !== existingDoc.productCode,
        oldProductCode: existingDoc.productCode,
        newProductCode: body.productCode,
        workerAssignmentChanged: body.workerEmail !== undefined,
        oldWorkerEmail: existingDoc.assignedWorker?.email,
        newWorkerEmail: body.workerEmail,
        vatPercentageChanged: body.vatPercentage !== undefined && body.vatPercentage !== existingDoc.vatPercentage,
        oldVatPercentage: existingDoc.vatPercentage,
        newVatPercentage: body.vatPercentage,
        updatedBy: isAdmin(req) ? 'admin' : 'worker',
        note: 'Production job updated with enhanced tracking, product code, and worker assignment support'
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
      workerAssigned: !!newWorker,
      vatPercentage: body.vatPercentage,
      status: body.status,
      note: 'Enhanced tracking, product code, and worker assignment support preserved'
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

    let imagesDeleted = 0
    let pdfDeleted = false

    // ✅ NEW: Delete multiple images from IMGBB if they exist
    if (job.images && job.images.length > 0) {
      console.log('🗑️ Deleting multiple images from IMGBB...')
      for (const imageUrl of job.images) {
        const deleted = await deleteImageFromImgbb(imageUrl)
        if (deleted) {
          imagesDeleted++
        }
      }
      console.log(`📷 ${imagesDeleted}/${job.images.length} images deleted successfully`)
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

    // ✅ UPDATED: Enhanced audit log with product code, VAT, and worker assignment information
    await auditCollection.insertOne({
      action: 'production_job_deleted',
      resourceType: 'production',
      resourceId: id,
      details: {
        deletedJob: job,
        productName: job.productName,
        productCode: job.productCode, // ✅ NEW: Include product code in audit
        quantity: job.quantity,
        vatPercentage: job.vatPercentage, // ✅ NEW: VAT in audit
        assignedWorker: job.assignedWorker, // ✅ NEW: Worker assignment in audit
        applicationsDeleted: applicationsDeleteResult.deletedCount,
        imagesDeleted: imagesDeleted, // ✅ NEW: Multiple images
        totalImages: job.images?.length || 0, // ✅ NEW: Total image count
        pdfDeleted: pdfDeleted,
        note: 'Complete production job deletion with cleanup, product code, VAT, and worker assignment tracking'
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
      imagesDeleted: imagesDeleted, // ✅ NEW: Multiple images deleted count
      totalImages: job.images?.length || 0, // ✅ NEW: Total images
      pdfDeleted: pdfDeleted,
      productCode: job.productCode, // ✅ NEW: Return deleted product code
      vatPercentage: job.vatPercentage, // ✅ NEW: Return VAT
      assignedWorker: job.assignedWorker?.email, // ✅ NEW: Return assigned worker
      note: 'Enhanced audit trail with product code, VAT, and worker assignment tracking preserved'
    })
  } catch (err) {
    console.error('❌ DELETE /api/stock/production error:', err)
    console.error('Error stack:', err.stack)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ✅ NEW: Node.js compatible file to base64 conversion
const fileToBase64 = async (file) => {
  try {
    console.log('📄 Converting file to base64 (Node.js)...')
    
    // Convert File/Blob to Buffer using arrayBuffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const base64 = buffer.toString('base64')
    
    console.log('📄 Base64 conversion complete, length:', base64.length)
    return base64
  } catch (error) {
    console.error('❌ Base64 conversion failed:', error)
    throw error
  }
}

