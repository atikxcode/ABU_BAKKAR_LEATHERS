import clientPromise from '@/lib/mongodb'
import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'

// Load from .env.local
const imageHostingKey = process.env.NEXT_PUBLIC_IMGBB_KEY
const imageHostingApi = `https://api.imgbb.com/1/upload?key=${imageHostingKey}`

// Helper function to check admin role
const isAdmin = (req) => {
  const role = req.headers.get('role')
  return role === 'admin'
}

// Helper function to delete image from imgbb
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

// ----------------- GET -----------------
export async function GET(req) {
  console.log('🔍 GET /api/stock/production - Starting')

  try {
    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    const productionCollection = db.collection('production')
    const applyCollection = db.collection('production_apply')

    console.log('✅ MongoDB connected successfully')

    // Get all production jobs
    const items = await productionCollection.find().toArray()
    console.log(`📦 Found ${items.length} production jobs`)

    // Get application counts and calculate remaining quantities for each job
    const itemsWithApplications = await Promise.all(
      items.map(async (item) => {
        const applicationCount = await applyCollection.countDocuments({
          jobId: item._id.toString(),
        })

        // Calculate approved quantity
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

        return {
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
        }
      })
    )

    console.log('✅ GET /api/stock/production - Success')
    return NextResponse.json(itemsWithApplications)
  } catch (err) {
    console.error('❌ GET /api/stock/production error:', err)
    console.error('Error stack:', err.stack)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ----------------- POST -----------------
export async function POST(req) {
  console.log('🚀 POST /api/stock/production - Starting')
  console.log('🔑 IMGBB Key present:', !!imageHostingKey)

  try {
    // Parse request body
    const body = await req.json()
    console.log('📝 Received body:', {
      productName: body.productName,
      quantity: body.quantity,
      description: body.description?.substring(0, 50),
      hasImage: !!body.image,
    })

    // Validate required fields
    if (!body.productName || !body.quantity) {
      console.error('❌ Missing required fields')
      return NextResponse.json(
        {
          error: 'Product name and quantity are required',
        },
        { status: 400 }
      )
    }

    if (!imageHostingKey) {
      console.error('❌ IMGBB API key not configured')
      return NextResponse.json(
        {
          error: 'Image hosting service not configured',
        },
        { status: 500 }
      )
    }

    // Connect to database
    console.log('🔌 Connecting to MongoDB...')
    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    const collection = db.collection('production')
    console.log('✅ MongoDB connected successfully')

    let imageUrl = null
    let deleteUrl = null

    // Upload image to IMGBB if frontend sent Base64 string
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
        // Continue without image rather than failing completely
        console.log('⚠️ Continuing without image')
      }
    }

    // Insert document
    console.log('💾 Inserting document to MongoDB...')
    const result = await collection.insertOne({
      productName: body.productName,
      description: body.description || '',
      quantity: Number(body.quantity),
      remainingQuantity: Number(body.quantity),
      fulfilledQuantity: 0,
      unit: body.unit || 'pcs',
      image: imageUrl,
      imageDeleteUrl: deleteUrl,
      date: new Date(),
      status: body.status || 'pending',
    })

    console.log('✅ Document inserted successfully:', result.insertedId)
    console.log('🎉 POST /api/stock/production - Success')

    return NextResponse.json(
      {
        success: true,
        insertedId: result.insertedId,
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

// ----------------- PATCH -----------------
export async function PATCH(req) {
  console.log('🔄 PATCH /api/stock/production - Starting')

  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    const body = await req.json()

    console.log('📝 PATCH request:', { id, body })

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
    const collection = db.collection('production')

    // If quantity is being updated, recalculate remaining quantity
    if (body.quantity !== undefined) {
      const currentJob = await collection.findOne({ _id: new ObjectId(id) })
      if (currentJob) {
        const fulfilledQuantity = currentJob.fulfilledQuantity || 0
        body.remainingQuantity = Math.max(
          0,
          Number(body.quantity) - fulfilledQuantity
        )
        console.log('🔄 Updated remaining quantity:', body.remainingQuantity)
      }
    }

    const result = await collection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { ...body, updatedAt: new Date() } }
    )

    console.log('✅ PATCH /api/stock/production - Success')
    return NextResponse.json(result)
  } catch (err) {
    console.error('❌ PATCH /api/stock/production error:', err)
    console.error('Error stack:', err.stack)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ----------------- DELETE -----------------
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

    // First, get the job to access image info
    const job = await productionCollection.findOne({ _id: new ObjectId(id) })

    if (!job) {
      console.error('❌ Job not found:', id)
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    console.log('📦 Found job to delete:', job.productName)

    // Delete the image from imgbb if it exists
    if (job.image) {
      console.log('🖼️ Deleting image from IMGBB...')
      const imageDeleted = await deleteImageFromImgbb(job.image)
      console.log(
        `🖼️ Image deletion ${
          imageDeleted ? 'successful' : 'failed'
        } for job ${id}`
      )
    }

    // Delete all applications for this job
    console.log('📋 Deleting job applications...')
    const applicationsDeleteResult = await applyCollection.deleteMany({
      jobId: id,
    })
    console.log(
      `📋 Deleted ${applicationsDeleteResult.deletedCount} applications`
    )

    // Delete the job itself
    console.log('🗑️ Deleting job...')
    const jobDeleteResult = await productionCollection.deleteOne({
      _id: new ObjectId(id),
    })

    console.log('✅ DELETE /api/stock/production - Success')
    return NextResponse.json({
      message: 'Job and related data deleted successfully',
      jobDeleted: jobDeleteResult.deletedCount > 0,
      applicationsDeleted: applicationsDeleteResult.deletedCount,
      imageDeleted: !!job.image,
    })
  } catch (err) {
    console.error('❌ DELETE /api/stock/production error:', err)
    console.error('Error stack:', err.stack)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
