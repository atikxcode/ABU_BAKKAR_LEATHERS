import clientPromise from '@/lib/mongodb'
import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { GridFSBucket } from 'mongodb'

const isAdmin = (req) => {
  const role = req.headers.get('role')
  return role === 'admin'
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

    console.log('🔍 Leather stock request:', {
      startDate,
      endDate,
      status,
      type,
      workerEmail,
      company,
      downloadFile,
      fileId,
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

    // Regular leather stock query
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

    const items = await collection.find(query).sort({ date: -1 }).toArray()

    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        try {
          const worker = await usersCollection.findOne({
            email: item.workerEmail,
          })
          return {
            ...item,
            workerPhone: worker?.phone || worker?.phoneNumber || 'N/A',
          }
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

    console.log(
      '✅ Returning leather stock items with phone numbers:',
      enrichedItems.length
    )
    return NextResponse.json(enrichedItems)
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

    // Create the document
    const document = {
      ...rest,
      type: body.type.trim(),
      company: body.company.trim(),
      quantity: Number(body.quantity),
      unit: body.unit.trim(),
      workerName: workerName || 'Unknown',
      workerEmail: workerEmail || 'unknown@example.com',
      date: new Date(body.date) || new Date(),
      status: body.status || 'pending',
      createdAt: new Date(),
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

    console.log('✅ Created leather stock entry:', result.insertedId)
    return NextResponse.json(
      { 
        ...result, 
        message: pdfFile ? 'Leather stock entry created with PDF file' : 'Leather stock entry created',
        fileUploaded: !!pdfFileId 
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

    if (
      body.quantity !== undefined &&
      (isNaN(body.quantity) || Number(body.quantity) <= 0)
    ) {
      return NextResponse.json(
        { error: 'Quantity must be a positive number' },
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

    const updateData = { ...body, updatedAt: new Date() }
    if (body.quantity !== undefined) {
      updateData.quantity = Number(body.quantity)
    }

    // Handle PDF file update
    if (pdfFile && pdfFile.size > 0) {
      try {
        // Get existing document to delete old file if exists
        const existingDoc = await collection.findOne({ _id: new ObjectId(id) })
        
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

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: 'Stock entry not found' },
        { status: 404 }
      )
    }

    console.log('✅ Updated leather stock entry:', id)
    return NextResponse.json({ 
      ...result, 
      message: pdfFile ? 'Leather stock entry updated with new PDF file' : 'Leather stock entry updated' 
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
    const bucket = new GridFSBucket(db, { bucketName: 'leatherFiles' })

    // Helper function to delete associated PDF files
    const deleteAssociatedFiles = async (documents) => {
      for (const doc of documents) {
        if (doc.pdfFile?.fileId) {
          try {
            await bucket.delete(new ObjectId(doc.pdfFile.fileId))
            console.log('🗑️ Deleted PDF file:', doc.pdfFile.fileName)
          } catch (fileDeleteError) {
            console.warn('⚠️ Failed to delete PDF file:', fileDeleteError)
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

      console.log(`✅ Single stock entry ${id} deleted successfully`)
      return NextResponse.json({
        message: 'Stock entry deleted successfully',
        deletedCount: result.deletedCount,
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

      // Get documents first to delete associated files
      const documentsToDelete = await collection.find(query).toArray()
      await deleteAssociatedFiles(documentsToDelete)

      const result = await collection.deleteMany(query)

      console.log(
        `✅ Bulk delete completed: ${result.deletedCount} entries deleted`
      )
      return NextResponse.json({
        message: `${result.deletedCount} stock entries deleted successfully`,
        deletedCount: result.deletedCount,
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

      return NextResponse.json({ message: 'Deleted successfully', result })
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
