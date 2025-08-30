// app/api/stock/production/route.js
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
  try {
    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    const productionCollection = db.collection('production')
    const applyCollection = db.collection('production_apply')

    // Get all production jobs
    const items = await productionCollection.find().toArray()

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

    return NextResponse.json(itemsWithApplications)
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ----------------- POST -----------------
export async function POST(req) {
  try {
    const body = await req.json()
    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    const collection = db.collection('production')

    let imageUrl = null
    let deleteUrl = null

    // Upload image to IMGBB if frontend sent Base64 string
    if (body.image) {
      const form = new URLSearchParams()
      form.append('image', body.image)

      const uploadRes = await fetch(imageHostingApi, {
        method: 'POST',
        body: form,
      })

      const uploadData = await uploadRes.json()
      if (uploadData.success) {
        imageUrl = uploadData.data.display_url
        deleteUrl = uploadData.data.delete_url
      } else {
        console.error('IMGBB upload failed', uploadData)
      }
    }

    const result = await collection.insertOne({
      productName: body.productName,
      description: body.description,
      quantity: Number(body.quantity),
      remainingQuantity: Number(body.quantity),
      fulfilledQuantity: 0,
      unit: body.unit || 'pcs',
      image: imageUrl,
      imageDeleteUrl: deleteUrl,
      date: new Date(),
      status: body.status || 'pending',
    })

    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ----------------- PATCH -----------------
export async function PATCH(req) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    const body = await req.json()

    if (!id)
      return NextResponse.json({ error: 'ID is required' }, { status: 400 })

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
      }
    }

    const result = await collection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { ...body, updatedAt: new Date() } }
    )

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ----------------- DELETE -----------------
export async function DELETE(req) {
  try {
    if (!isAdmin(req)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id)
      return NextResponse.json({ error: 'ID is required' }, { status: 400 })

    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    const productionCollection = db.collection('production')
    const applyCollection = db.collection('production_apply')

    // First, get the job to access image info
    const job = await productionCollection.findOne({ _id: new ObjectId(id) })

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // Delete the image from imgbb if it exists
    if (job.image) {
      const imageDeleted = await deleteImageFromImgbb(job.image)
      console.log(
        `Image deletion ${imageDeleted ? 'successful' : 'failed'} for job ${id}`
      )
    }

    // Delete all applications for this job
    const applicationsDeleteResult = await applyCollection.deleteMany({
      jobId: id,
    })

    // Delete the job itself
    const jobDeleteResult = await productionCollection.deleteOne({
      _id: new ObjectId(id),
    })

    return NextResponse.json({
      message: 'Job and related data deleted successfully',
      jobDeleted: jobDeleteResult.deletedCount > 0,
      applicationsDeleted: applicationsDeleteResult.deletedCount,
      imageDeleted: !!job.image,
    })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
