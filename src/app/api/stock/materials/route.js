// app/api/stock/materials/route.js
import clientPromise from '@/lib/mongodb'
import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'

// Helper function to check admin role
const isAdmin = (req) => {
  const role = req.headers.get('role')
  return role === 'admin'
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const status = searchParams.get('status')
    const material = searchParams.get('material')
    const workerEmail = searchParams.get('workerEmail')

    console.log('🔍 Material stock request:', {
      startDate,
      endDate,
      status,
      material,
      workerEmail,
    })

    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    const collection = db.collection('materials')

    // Build query filter - ONLY apply date filter if dates are provided
    let query = {}

    // Only filter by date if both dates are explicitly provided
    if (startDate && endDate) {
      try {
        query.date = {
          $gte: new Date(startDate),
          $lte: new Date(endDate + 'T23:59:59.999Z'),
        }
        console.log('📅 Applying date filter:', {
          from: startDate,
          to: endDate,
          query: query.date,
        })
      } catch (dateError) {
        console.error('❌ Invalid date format:', dateError)
        return NextResponse.json(
          { error: 'Invalid date format provided' },
          { status: 400 }
        )
      }
    } else {
      console.log('📅 No date filter applied - showing all records')
    }

    if (status && status !== 'all') {
      query.status = status
      console.log('🏷️ Status filter:', status)
    }

    if (material) {
      query.material = new RegExp(material, 'i')
      console.log('🧰 Material filter:', material)
    }

    if (workerEmail) {
      query.workerEmail = new RegExp(workerEmail, 'i')
      console.log('👤 Worker filter:', workerEmail)
    }

    console.log('🔍 Final query:', JSON.stringify(query, null, 2))

    // Get items with error handling for invalid dates
    const items = await collection.find(query).toArray()

    // Filter out records with invalid dates and sort manually
    const validItems = items
      .filter((item) => {
        if (!item.date) {
          console.warn('⚠️ Record missing date:', item._id)
          return false
        }

        // Check for obviously invalid dates
        const dateStr = item.date.toString()
        if (
          dateStr.includes('+061651') ||
          dateStr.includes('undefined') ||
          dateStr.includes('Invalid')
        ) {
          console.warn('⚠️ Invalid date found:', item._id, item.date)
          return false
        }

        // Try to create a valid date
        try {
          const testDate = new Date(item.date)
          if (isNaN(testDate.getTime())) {
            console.warn('⚠️ Unparseable date:', item._id, item.date)
            return false
          }
        } catch (e) {
          console.warn('⚠️ Date parsing error:', item._id, item.date, e.message)
          return false
        }

        return true
      })
      .sort((a, b) => {
        // Sort by date descending, with error handling
        try {
          return new Date(b.date) - new Date(a.date)
        } catch (e) {
          return 0
        }
      })

    console.log('✅ Total records found:', items.length)
    console.log('✅ Valid records returned:', validItems.length)

    if (validItems.length !== items.length) {
      console.warn(
        `⚠️ Filtered out ${
          items.length - validItems.length
        } records with invalid dates`
      )
    }

    return NextResponse.json(validItems)
  } catch (err) {
    console.error('❌ GET material stock error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req) {
  try {
    const body = await req.json()

    // Enhanced input validation
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

    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    const collection = db.collection('materials')

    const { workerName, workerEmail, ...rest } = body

    // Ensure proper date handling
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

    const result = await collection.insertOne({
      ...rest,
      material: body.material.trim().toLowerCase(),
      quantity: Number(body.quantity),
      unit: body.unit.trim(),
      workerName: workerName || 'Unknown',
      workerEmail: workerEmail || 'unknown@example.com',
      date: dateValue,
      status: body.status || 'pending',
      createdAt: new Date(),
    })

    console.log('✅ Created material stock entry:', result.insertedId)
    return NextResponse.json(result, { status: 201 })
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
    const body = await req.json()

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 })
    }

    // Validate ObjectId format
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 })
    }

    // Validate status if being updated
    if (
      body.status &&
      !['pending', 'approved', 'rejected'].includes(body.status)
    ) {
      return NextResponse.json(
        { error: 'Status must be pending, approved, or rejected' },
        { status: 400 }
      )
    }

    // Validate quantity if being updated
    if (
      body.quantity !== undefined &&
      (isNaN(body.quantity) || Number(body.quantity) <= 0)
    ) {
      return NextResponse.json(
        { error: 'Quantity must be a positive number' },
        { status: 400 }
      )
    }

    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    const collection = db.collection('materials')

    // Prepare update data
    const updateData = { ...body, updatedAt: new Date() }
    if (body.quantity !== undefined) {
      updateData.quantity = Number(body.quantity)
    }

    const result = await collection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    )

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: 'Material stock entry not found' },
        { status: 404 }
      )
    }

    console.log('✅ Updated material stock entry:', id)
    return NextResponse.json(result)
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
    const deleteType = searchParams.get('deleteType') // 'single' or 'bulk'

    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    const collection = db.collection('materials')

    // Single delete
    if (deleteType === 'single' && id) {
      if (!ObjectId.isValid(id)) {
        return NextResponse.json(
          { error: 'Invalid ID format' },
          { status: 400 }
        )
      }

      const result = await collection.deleteOne({ _id: new ObjectId(id) })

      if (result.deletedCount === 0) {
        console.log(`❌ DELETE failed: Material stock entry ${id} not found`)
        return NextResponse.json(
          { error: 'Material stock entry not found' },
          { status: 404 }
        )
      }

      console.log(`✅ Single material stock entry ${id} deleted successfully`)
      return NextResponse.json({
        message: 'Material stock entry deleted successfully',
        deletedCount: result.deletedCount,
      })
    }

    // Bulk delete by criteria
    if (deleteType === 'bulk') {
      let query = {}

      // Build query for bulk delete
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

      // Safety check - don't delete everything without criteria
      if (Object.keys(query).length === 0) {
        return NextResponse.json(
          {
            error: 'Bulk delete requires at least one filter criteria',
          },
          { status: 400 }
        )
      }

      console.log('🗑️ Bulk delete query:', JSON.stringify(query, null, 2))

      const result = await collection.deleteMany(query)

      console.log(
        `✅ Bulk delete completed: ${result.deletedCount} entries deleted`
      )
      return NextResponse.json({
        message: `${result.deletedCount} material stock entries deleted successfully`,
        deletedCount: result.deletedCount,
      })
    }

    // Legacy single delete (backwards compatibility)
    if (id && !deleteType) {
      if (!ObjectId.isValid(id)) {
        return NextResponse.json(
          { error: 'Invalid ID format' },
          { status: 400 }
        )
      }

      const result = await collection.deleteOne({ _id: new ObjectId(id) })

      if (result.deletedCount === 0) {
        return NextResponse.json(
          { error: 'Material stock entry not found' },
          { status: 404 }
        )
      }

      return NextResponse.json({ message: 'Deleted successfully', result })
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
