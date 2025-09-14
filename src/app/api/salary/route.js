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
    const salaryType = searchParams.get('type')
    const addedBy = searchParams.get('addedBy')
    const viewMode = searchParams.get('viewMode')

    let query = {}

    if (startDate && endDate) {
      query.paymentDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      }
    }

    if (salaryType) {
      query.type = salaryType
    }

    if (salaryType === 'laborer') {
      if (addedBy) {
        query.addedBy = addedBy
      }
    } else if (salaryType === 'worker') {
      if (workerEmail) {
        query.workerEmail = workerEmail
      }
    }

    const salaries = await db
      .collection('salary')
      .find(query)
      .sort({ paymentDate: -1, createdAt: -1 })
      .toArray()

    // ✅ NEW: Enrich salary data with calculated fields for advance payments
    const enrichedSalaries = salaries.map(salary => {
      // Calculate advance payment totals
      const totalAdvancePaid = salary.advancePayments 
        ? salary.advancePayments.reduce((sum, advance) => sum + advance.amount, 0)
        : 0

      // Calculate remaining balance
      const totalSalaryAmount = salary.totalSalaryAmount || salary.amount
      const remainingBalance = totalSalaryAmount - totalAdvancePaid

      // Determine payment status
      let paymentStatus = salary.status || 'pending'
      if (salary.advancePayments && salary.advancePayments.length > 0) {
        if (remainingBalance <= 0) {
          paymentStatus = 'fully_paid'
        } else {
          paymentStatus = 'partial_paid'
        }
      }

      return {
        ...salary,
        // ✅ NEW: Calculated fields for advance payments
        totalAdvancePaid: totalAdvancePaid,
        remainingBalance: Math.max(0, remainingBalance),
        paymentProgress: totalSalaryAmount > 0 ? (totalAdvancePaid / totalSalaryAmount * 100).toFixed(1) : 0,
        hasAdvancePayments: salary.advancePayments && salary.advancePayments.length > 0,
        advancePaymentsCount: salary.advancePayments ? salary.advancePayments.length : 0,
        calculatedStatus: paymentStatus,
        // Backward compatibility
        displayAmount: salary.totalSalaryAmount || salary.amount,
        isAdvancePaymentSystem: !!salary.totalSalaryAmount
      }
    })

    return NextResponse.json(enrichedSalaries)
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

    // ✅ NEW: Detect if this is an advance payment request
    const isAdvancePayment = salaryData.paymentType === 'advance'
    const isAddingToExisting = salaryData.existingSalaryId

    if (isAddingToExisting) {
      // ✅ NEW: Handle adding advance payment to existing salary record
      return await handleAdvancePayment(db, salaryData)
    }

    // Original validation for new salary records
    const requiredFields = ['amount', 'paymentDate', 'type']
    for (const field of requiredFields) {
      if (!salaryData[field]) {
        return NextResponse.json(
          { message: `${field} is required` },
          { status: 400 }
        )
      }
    }

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

      if (!salaryData.addedBy) {
        salaryData.addedBy = 'admin'
      }
    }

    // ✅ NEW: Handle advance payment system for new records
    let newSalary
    if (isAdvancePayment && salaryData.totalSalaryAmount) {
      // Create new salary record with advance payment structure
      const advanceAmount = parseFloat(salaryData.amount)
      const totalAmount = parseFloat(salaryData.totalSalaryAmount)

      // Validate advance amount
      if (advanceAmount > totalAmount) {
        return NextResponse.json(
          { message: 'Advance amount cannot exceed total salary amount' },
          { status: 400 }
        )
      }

      newSalary = {
        ...salaryData,
        // ✅ NEW: Advance payment structure
        totalSalaryAmount: totalAmount,
        advancePayments: [
          {
            amount: advanceAmount,
            paidDate: new Date(salaryData.paymentDate),
            description: salaryData.description || 'Initial advance payment',
            paidBy: 'admin'
          }
        ],
        // Original amount field kept for backward compatibility
        amount: advanceAmount,
        paymentDate: new Date(salaryData.paymentDate),
        createdAt: new Date(),
        updatedAt: new Date(),
        status: advanceAmount >= totalAmount ? 'fully_paid' : 'partial_paid',
        paymentType: 'advance',
        isAdvancePaymentSystem: true
      }
    } else {
      // Original salary record creation (backward compatibility)
      newSalary = {
        ...salaryData,
        amount: parseFloat(salaryData.amount),
        paymentDate: new Date(salaryData.paymentDate),
        createdAt: new Date(),
        updatedAt: new Date(),
        status: salaryData.status || 'paid',
        paymentType: 'full',
        isAdvancePaymentSystem: false
      }
    }

    const result = await db.collection('salary').insertOne(newSalary)

    return NextResponse.json({
      message: isAdvancePayment ? 'Advance payment record created successfully' : 'Salary record created successfully',
      id: result.insertedId,
      isAdvancePayment: isAdvancePayment,
      totalAmount: newSalary.totalSalaryAmount || newSalary.amount,
      advanceAmount: isAdvancePayment ? parseFloat(salaryData.amount) : null,
      remainingBalance: isAdvancePayment ? (newSalary.totalSalaryAmount - parseFloat(salaryData.amount)) : 0
    })
  } catch (error) {
    console.error('Error creating salary:', error)
    return NextResponse.json(
      { message: 'Failed to create salary record' },
      { status: 500 }
    )
  }
}

// ✅ NEW: Function to handle adding advance payments to existing salary records
async function handleAdvancePayment(db, salaryData) {
  try {
    const existingSalaryId = salaryData.existingSalaryId
    const advanceAmount = parseFloat(salaryData.amount)

    // Get existing salary record
    const existingSalary = await db.collection('salary').findOne({ _id: new ObjectId(existingSalaryId) })
    
    if (!existingSalary) {
      return NextResponse.json(
        { message: 'Existing salary record not found' },
        { status: 404 }
      )
    }

    // Calculate current advance total
    const currentAdvanceTotal = existingSalary.advancePayments 
      ? existingSalary.advancePayments.reduce((sum, advance) => sum + advance.amount, 0)
      : 0

    const totalSalaryAmount = existingSalary.totalSalaryAmount || existingSalary.amount
    const newAdvanceTotal = currentAdvanceTotal + advanceAmount

    // Validate new advance amount
    if (newAdvanceTotal > totalSalaryAmount) {
      return NextResponse.json(
        { 
          message: `Advance amount (${advanceAmount}) would exceed remaining balance. Current advances: ${currentAdvanceTotal}, Total salary: ${totalSalaryAmount}`,
          currentAdvanceTotal,
          remainingBalance: totalSalaryAmount - currentAdvanceTotal,
          requestedAmount: advanceAmount
        },
        { status: 400 }
      )
    }

    // Add new advance payment
    const newAdvancePayment = {
      amount: advanceAmount,
      paidDate: new Date(salaryData.paymentDate),
      description: salaryData.description || 'Additional advance payment',
      paidBy: 'admin'
    }

    // Update existing salary record
    const updatedAdvancePayments = existingSalary.advancePayments ? 
      [...existingSalary.advancePayments, newAdvancePayment] : 
      [newAdvancePayment]

    const newStatus = newAdvanceTotal >= totalSalaryAmount ? 'fully_paid' : 'partial_paid'

    const updateResult = await db.collection('salary').updateOne(
      { _id: new ObjectId(existingSalaryId) },
      { 
        $set: {
          advancePayments: updatedAdvancePayments,
          status: newStatus,
          updatedAt: new Date(),
          // Update amount field to reflect latest payment (for backward compatibility)
          amount: newAdvanceTotal,
          paymentDate: new Date(salaryData.paymentDate)
        }
      }
    )

    if (updateResult.matchedCount === 0) {
      return NextResponse.json(
        { message: 'Failed to update salary record' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      message: 'Advance payment added successfully',
      advanceAmount: advanceAmount,
      totalAdvancePaid: newAdvanceTotal,
      remainingBalance: Math.max(0, totalSalaryAmount - newAdvanceTotal),
      status: newStatus,
      totalSalaryAmount: totalSalaryAmount
    })
  } catch (error) {
    console.error('Error adding advance payment:', error)
    return NextResponse.json(
      { message: 'Failed to add advance payment' },
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
    delete updates._id

    // ✅ NEW: Handle advance payment updates
    if (updates.updateType === 'advance_payment') {
      return await updateAdvancePayment(db, id, updates)
    }

    // Original update logic with enhancements
    const updateData = {
      ...updates,
      updatedAt: new Date(),
    }

    if (updates.amount) {
      updateData.amount = parseFloat(updates.amount)
    }

    if (updates.paymentDate) {
      updateData.paymentDate = new Date(updates.paymentDate)
    }

    // ✅ NEW: Handle updates to advance payment system records
    if (updates.totalSalaryAmount) {
      updateData.totalSalaryAmount = parseFloat(updates.totalSalaryAmount)
      
      // Recalculate status based on new total
      const existingSalary = await db.collection('salary').findOne({ _id: new ObjectId(id) })
      if (existingSalary && existingSalary.advancePayments) {
        const totalAdvancePaid = existingSalary.advancePayments.reduce((sum, advance) => sum + advance.amount, 0)
        const newTotalSalary = parseFloat(updates.totalSalaryAmount)
        updateData.status = totalAdvancePaid >= newTotalSalary ? 'fully_paid' : 'partial_paid'
      }
    }

    const result = await db
      .collection('salary')
      .updateOne({ _id: new ObjectId(id) }, { $set: updateData })

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

// ✅ NEW: Function to update specific advance payments
async function updateAdvancePayment(db, salaryId, updates) {
  try {
    const advanceIndex = updates.advanceIndex
    const advanceUpdates = updates.advanceData

    if (advanceIndex === undefined) {
      return NextResponse.json(
        { message: 'Advance payment index is required' },
        { status: 400 }
      )
    }

    // Get existing salary record
    const existingSalary = await db.collection('salary').findOne({ _id: new ObjectId(salaryId) })
    
    if (!existingSalary || !existingSalary.advancePayments || !existingSalary.advancePayments[advanceIndex]) {
      return NextResponse.json(
        { message: 'Advance payment not found' },
        { status: 404 }
      )
    }

    // Update the specific advance payment
    const updatedAdvancePayments = [...existingSalary.advancePayments]
    updatedAdvancePayments[advanceIndex] = {
      ...updatedAdvancePayments[advanceIndex],
      ...advanceUpdates,
      amount: parseFloat(advanceUpdates.amount) || updatedAdvancePayments[advanceIndex].amount,
      paidDate: advanceUpdates.paidDate ? new Date(advanceUpdates.paidDate) : updatedAdvancePayments[advanceIndex].paidDate
    }

    // Recalculate totals and status
    const totalAdvancePaid = updatedAdvancePayments.reduce((sum, advance) => sum + advance.amount, 0)
    const totalSalaryAmount = existingSalary.totalSalaryAmount || existingSalary.amount
    const newStatus = totalAdvancePaid >= totalSalaryAmount ? 'fully_paid' : 'partial_paid'

    // Update the record
    const updateResult = await db.collection('salary').updateOne(
      { _id: new ObjectId(salaryId) },
      { 
        $set: {
          advancePayments: updatedAdvancePayments,
          status: newStatus,
          updatedAt: new Date(),
          amount: totalAdvancePaid // Keep backward compatibility
        }
      }
    )

    if (updateResult.matchedCount === 0) {
      return NextResponse.json(
        { message: 'Failed to update advance payment' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      message: 'Advance payment updated successfully',
      totalAdvancePaid: totalAdvancePaid,
      remainingBalance: Math.max(0, totalSalaryAmount - totalAdvancePaid),
      status: newStatus
    })
  } catch (error) {
    console.error('Error updating advance payment:', error)
    return NextResponse.json(
      { message: 'Failed to update advance payment' },
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
    const deleteType = searchParams.get('deleteType')
    const advanceIndex = searchParams.get('advanceIndex')

    if (!id) {
      return NextResponse.json(
        { message: 'Salary ID is required' },
        { status: 400 }
      )
    }

    // ✅ NEW: Handle deleting specific advance payments
    if (deleteType === 'advance_payment' && advanceIndex !== null) {
      return await deleteAdvancePayment(db, id, parseInt(advanceIndex))
    }

    // Original delete logic - delete entire salary record
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

// ✅ NEW: Function to delete specific advance payments
async function deleteAdvancePayment(db, salaryId, advanceIndex) {
  try {
    // Get existing salary record
    const existingSalary = await db.collection('salary').findOne({ _id: new ObjectId(salaryId) })
    
    if (!existingSalary || !existingSalary.advancePayments || !existingSalary.advancePayments[advanceIndex]) {
      return NextResponse.json(
        { message: 'Advance payment not found' },
        { status: 404 }
      )
    }

    // Remove the specific advance payment
    const updatedAdvancePayments = existingSalary.advancePayments.filter((_, index) => index !== advanceIndex)

    // Recalculate totals and status
    const totalAdvancePaid = updatedAdvancePayments.reduce((sum, advance) => sum + advance.amount, 0)
    const totalSalaryAmount = existingSalary.totalSalaryAmount || existingSalary.amount
    const newStatus = updatedAdvancePayments.length === 0 ? 'pending' : (totalAdvancePaid >= totalSalaryAmount ? 'fully_paid' : 'partial_paid')

    // Update the record
    const updateResult = await db.collection('salary').updateOne(
      { _id: new ObjectId(salaryId) },
      { 
        $set: {
          advancePayments: updatedAdvancePayments,
          status: newStatus,
          updatedAt: new Date(),
          amount: totalAdvancePaid || existingSalary.totalSalaryAmount // Reset if no advances left
        }
      }
    )

    if (updateResult.matchedCount === 0) {
      return NextResponse.json(
        { message: 'Failed to delete advance payment' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      message: 'Advance payment deleted successfully',
      totalAdvancePaid: totalAdvancePaid,
      remainingBalance: Math.max(0, totalSalaryAmount - totalAdvancePaid),
      status: newStatus,
      remainingAdvancePayments: updatedAdvancePayments.length
    })
  } catch (error) {
    console.error('Error deleting advance payment:', error)
    return NextResponse.json(
      { message: 'Failed to delete advance payment' },
      { status: 500 }
    )
  }
}
