import clientPromise from '@/lib/mongodb'
import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const workerEmail = searchParams.get('workerEmail')
    const salaryType = searchParams.get('type') // 'worker' or 'laborer'
    const addedBy = searchParams.get('addedBy') // Who added the record
    const viewMode = searchParams.get('viewMode') // 'admin' or 'worker'

    let query = {}

    // Date range filter
    if (startDate && endDate) {
      query.paymentDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    }

    // Salary type filter
    if (salaryType) {
      query.type = salaryType
    }

    // **FIX: Handle labor records filtering properly**
    if (salaryType === 'laborer') {
      if (addedBy) {
        // Filter labor records by who added them
        query.addedBy = addedBy
      }
    } else if (salaryType === 'worker') {
      // For worker salary records, filter by workerEmail
      if (workerEmail) {
        query.workerEmail = workerEmail
      }
    }

    const salaries = await db
      .collection('salary')
      .find(query)
      .sort({ paymentDate: -1, createdAt: -1 })
      .toArray()

    return NextResponse.json(salaries)
  } catch (error) {
    console.error('Error fetching salaries:', error)
    return NextResponse.json(
      { message: 'Failed to fetch salaries' },
      { status: 500 }
    )
  }
}


export async function POST(request) {
  try {
    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    const salaryData = await request.json()

    // Validate required fields
    const requiredFields = ['amount', 'paymentDate', 'type']
    for (const field of requiredFields) {
      if (!salaryData[field]) {
        return NextResponse.json(
          { message: `${field} is required` },
          { status: 400 }
        )
      }
    }

    // Additional validation based on salary type
    if (salaryData.type === 'worker') {
      if (!salaryData.workerEmail || !salaryData.workerName) {
        return NextResponse.json(
          { message: 'Worker email and name are required for worker salary' },
          { status: 400 }
        )
      }
    } else if (salaryData.type === 'laborer') {
      if (!salaryData.laborName) {
        return NextResponse.json(
          { message: 'Laborer name is required for laborer salary' },
          { status: 400 }
        )
      }
      
      // Set addedBy field for labor records
      // If not provided, default to 'admin'
      if (!salaryData.addedBy) {
        salaryData.addedBy = 'admin'
      }
    }

    const newSalary = {
      ...salaryData,
      amount: parseFloat(salaryData.amount),
      paymentDate: new Date(salaryData.paymentDate),
      createdAt: new Date(),
      updatedAt: new Date(),
      status: salaryData.status || 'paid'
    }

    const result = await db.collection('salary').insertOne(newSalary)

    return NextResponse.json({
      message: 'Salary record created successfully',
      id: result.insertedId
    })
  } catch (error) {
    console.error('Error creating salary:', error)
    return NextResponse.json(
      { message: 'Failed to create salary record' },
      { status: 500 }
    )
  }
}

export async function PUT(request) {
  try {
    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    
    if (!id) {
      return NextResponse.json(
        { message: 'Salary ID is required' },
        { status: 400 }
      )
    }

    const updates = await request.json()
    delete updates._id // Remove _id from updates

    const updateData = {
      ...updates,
      updatedAt: new Date()
    }

    if (updates.amount) {
      updateData.amount = parseFloat(updates.amount)
    }

    if (updates.paymentDate) {
      updateData.paymentDate = new Date(updates.paymentDate)
    }

    const result = await db
      .collection('salary')
      .updateOne(
        { _id: new ObjectId(id) },
        { $set: updateData }
      )

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { message: 'Salary record not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ message: 'Salary record updated successfully' })
  } catch (error) {
    console.error('Error updating salary:', error)
    return NextResponse.json(
      { message: 'Failed to update salary record' },
      { status: 500 }
    )
  }
}

export async function DELETE(request) {
  try {
    const client = await clientPromise
    const db = client.db('AbuBakkarLeathers')
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    
    if (!id) {
      return NextResponse.json(
        { message: 'Salary ID is required' },
        { status: 400 }
      )
    }

    const result = await db
      .collection('salary')
      .deleteOne({ _id: new ObjectId(id) })

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { message: 'Salary record not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ message: 'Salary record deleted successfully' })
  } catch (error) {
    console.error('Error deleting salary:', error)
    return NextResponse.json(
      { message: 'Failed to delete salary record' },
      { status: 500 }
    )
  }
}
