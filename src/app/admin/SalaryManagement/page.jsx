'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { format } from 'date-fns'
import Swal from 'sweetalert2'
import {
  FaPlus,
  FaSearch,
  FaEdit,
  FaTrash,
  FaMoneyBillWave,
  FaUsers,
  FaHardHat,
  FaCreditCard,
  FaHistory,
  FaEye,
  FaPercentage
} from 'react-icons/fa'
import SpreadsheetApp from '../../../../components/SpreadsheetApp'

export default function AdminSalaryPage() {
  const [salaries, setSalaries] = useState([])
  const [workers, setWorkers] = useState([])
  const [loading, setLoading] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingSalary, setEditingSalary] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('all')
  
  // ✅ NEW: Advance payment states
  const [showAdvanceForm, setShowAdvanceForm] = useState(false)
  const [selectedSalaryForAdvance, setSelectedSalaryForAdvance] = useState(null)
  const [showAdvanceHistory, setShowAdvanceHistory] = useState(false)
  const [selectedAdvanceHistory, setSelectedAdvanceHistory] = useState(null)
  const [paymentMode, setPaymentMode] = useState('full') // 'full' or 'advance'

  // ✅ NEW: Enhanced stats with advance payments
  const [stats, setStats] = useState({
    totalPaid: 0,
    workersSalary: 0,
    laborersSalary: 0,
    totalWorkers: 0,
    totalLaborers: 0,
    totalAdvancesPaid: 0,
    pendingBalances: 0,
    partiallyPaidCount: 0
  })

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors }
  } = useForm({
    defaultValues: {
      type: 'worker',
      paymentDate: format(new Date(), 'yyyy-MM-dd'),
      amount: '',
      status: 'paid',
      paymentType: 'full'
    }
  })

  // ✅ NEW: Advance payment form
  const {
    register: registerAdvance,
    handleSubmit: handleAdvanceSubmit,
    reset: resetAdvance,
    formState: { errors: advanceErrors }
  } = useForm({
    defaultValues: {
      amount: '',
      paymentDate: format(new Date(), 'yyyy-MM-dd'),
      description: ''
    }
  })

  const salaryType = watch('type')
  const currentPaymentType = watch('paymentType')

  // Fetch workers from your existing user API
  const fetchWorkers = async () => {
    try {
      const res = await fetch('/api/user')
      if (res.ok) {
        const data = await res.json()
        const approvedWorkers = data.filter(user => user.status === 'approved')
        setWorkers(approvedWorkers)
      }
    } catch (error) {
      console.error('Error fetching workers:', error)
    }
  }

  // ✅ UPDATED: Enhanced fetch salaries with advance payment data
  const fetchSalaries = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterType !== 'all') {
        params.append('type', filterType)
        
        if (filterType === 'laborer') {
          params.append('addedBy', 'admin')
        }
      } else {
        const [workerRes, laborRes] = await Promise.all([
          fetch('/api/salary?type=worker'),
          fetch('/api/salary?type=laborer&addedBy=admin')
        ])

        if (workerRes.ok && laborRes.ok) {
          const [workerData, laborData] = await Promise.all([
            workerRes.json(),
            laborRes.json()
          ])
          const combinedData = [...workerData, ...laborData]
          setSalaries(combinedData)
          calculateEnhancedStats(combinedData)
          return
        }
      }

      const res = await fetch(`/api/salary?${params}`)
      if (res.ok) {
        const data = await res.json()
        setSalaries(data)
        calculateEnhancedStats(data)
      }
    } catch (error) {
      console.error('Error fetching salaries:', error)
      Swal.fire('Error', 'Failed to fetch salary data', 'error')
    } finally {
      setLoading(false)
    }
  }

  // ✅ NEW: Enhanced statistics calculation including advance payments
  const calculateEnhancedStats = (salaryData) => {
    const totalPaid = salaryData.reduce((sum, salary) => sum + (salary.totalAdvancePaid || salary.amount), 0)
    const workersSalary = salaryData
      .filter(s => s.type === 'worker')
      .reduce((sum, salary) => sum + (salary.totalAdvancePaid || salary.amount), 0)
    const laborersSalary = salaryData
      .filter(s => s.type === 'laborer')
      .reduce((sum, salary) => sum + (salary.totalAdvancePaid || salary.amount), 0)
    
    const totalWorkers = new Set(salaryData.filter(s => s.type === 'worker').map(s => s.workerEmail)).size
    const totalLaborers = new Set(salaryData.filter(s => s.type === 'laborer').map(s => s.laborName)).size

    // ✅ NEW: Advanced payment statistics
    const totalAdvancesPaid = salaryData
      .filter(s => s.hasAdvancePayments)
      .reduce((sum, salary) => sum + (salary.totalAdvancePaid || 0), 0)
    
    const pendingBalances = salaryData
      .reduce((sum, salary) => sum + (salary.remainingBalance || 0), 0)
    
    const partiallyPaidCount = salaryData.filter(s => s.calculatedStatus === 'partial_paid').length

    setStats({
      totalPaid,
      workersSalary,
      laborersSalary,
      totalWorkers,
      totalLaborers,
      totalAdvancesPaid,
      pendingBalances,
      partiallyPaidCount
    })
  }

  useEffect(() => {
    fetchWorkers()
    fetchSalaries()
  }, [filterType])

  // ✅ UPDATED: Enhanced form submission with advance payment support
  const onSubmit = async (data) => {
    setLoading(true)
    try {
      const method = editingSalary ? 'PUT' : 'POST'
      const url = editingSalary ? `/api/salary?id=${editingSalary._id}` : '/api/salary'

      const submitData = {
        ...data,
        amount: parseFloat(data.amount)
      }

      // ✅ NEW: Handle advance payment type
      if (data.paymentType === 'advance' && data.totalSalaryAmount) {
        submitData.totalSalaryAmount = parseFloat(data.totalSalaryAmount)
        submitData.paymentType = 'advance'
      }

      if (data.type === 'laborer' && !editingSalary) {
        submitData.addedBy = 'admin'
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitData)
      })

      if (res.ok) {
        const result = await res.json()
        const message = result.isAdvancePayment 
          ? `Advance payment of $${result.advanceAmount} added! Remaining: $${result.remainingBalance}`
          : `Salary ${editingSalary ? 'updated' : 'added'} successfully`
        
        Swal.fire('Success!', message, 'success')
        reset()
        setShowAddForm(false)
        setEditingSalary(null)
        setPaymentMode('full')
        fetchSalaries()
      } else {
        const error = await res.json()
        Swal.fire('Error', error.message, 'error')
      }
    } catch (error) {
      console.error('Error saving salary:', error)
      Swal.fire('Error', 'Failed to save salary', 'error')
    } finally {
      setLoading(false)
    }
  }

  // ✅ NEW: Handle advance payment submission
  const onAdvanceSubmit = async (data) => {
    if (!selectedSalaryForAdvance) return

    setLoading(true)
    try {
      const res = await fetch('/api/salary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          existingSalaryId: selectedSalaryForAdvance._id,
          amount: parseFloat(data.amount),
          paymentDate: data.paymentDate,
          description: data.description || 'Additional advance payment'
        })
      })

      if (res.ok) {
        const result = await res.json()
        Swal.fire({
          title: 'Advance Payment Added!',
          html: `
            <div class="text-left">
              <p><strong>Amount:</strong> $${result.advanceAmount}</p>
              <p><strong>Total Paid:</strong> $${result.totalAdvancePaid}</p>
              <p><strong>Remaining:</strong> $${result.remainingBalance}</p>
              <p><strong>Status:</strong> ${result.status}</p>
            </div>
          `,
          icon: 'success'
        })
        resetAdvance()
        setShowAdvanceForm(false)
        setSelectedSalaryForAdvance(null)
        fetchSalaries()
      } else {
        const error = await res.json()
        Swal.fire('Error', error.message, 'error')
      }
    } catch (error) {
      console.error('Error adding advance payment:', error)
      Swal.fire('Error', 'Failed to add advance payment', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Handle worker selection
  const handleWorkerSelect = (workerEmail) => {
    const selectedWorker = workers.find(w => w.email === workerEmail)
    if (selectedWorker) {
      setValue('workerName', selectedWorker.name)
      setValue('workerPhone', selectedWorker.phone || '')
    }
  }

  // ✅ UPDATED: Enhanced edit salary with advance payment support
  const editSalary = (salary) => {
    setEditingSalary(salary)
    setValue('type', salary.type)
    setValue('amount', (salary.totalAdvancePaid || salary.amount).toString())
    setValue('paymentDate', format(new Date(salary.paymentDate), 'yyyy-MM-dd'))
    setValue('status', salary.calculatedStatus || salary.status || 'paid')
    setValue('description', salary.description || '')
    
    // ✅ NEW: Set payment type and total salary amount for advance payments
    if (salary.isAdvancePaymentSystem) {
      setValue('paymentType', 'advance')
      setValue('totalSalaryAmount', salary.totalSalaryAmount.toString())
      setPaymentMode('advance')
    } else {
      setValue('paymentType', 'full')
      setPaymentMode('full')
    }
    
    if (salary.type === 'worker') {
      setValue('workerEmail', salary.workerEmail || '')
      setValue('workerName', salary.workerName || '')
      setValue('workerPhone', salary.workerPhone || '')
    } else {
      setValue('laborName', salary.laborName || '')
      setValue('laborPhone', salary.laborPhone || '')
    }
    
    setShowAddForm(true)
  }

  // ✅ NEW: Show advance payment form
  const showAdvancePaymentForm = (salary) => {
    setSelectedSalaryForAdvance(salary)
    setShowAdvanceForm(true)
    resetAdvance()
  }

  // ✅ NEW: Show advance payment history
  const viewAdvanceHistory = (salary) => {
    setSelectedAdvanceHistory(salary)
    setShowAdvanceHistory(true)
  }

  // Delete salary
  const deleteSalary = async (salary) => {
    const displayAmount = salary.displayAmount || salary.amount
    const result = await Swal.fire({
      title: 'Delete Salary Record?',
      html: `
        <div class="text-left">
          <p>Delete ${salary.type} salary record?</p>
          ${salary.isAdvancePaymentSystem ? `
            <p><strong>Total Salary:</strong> $${salary.totalSalaryAmount}</p>
            <p><strong>Total Paid:</strong> $${salary.totalAdvancePaid}</p>
            <p><strong>Advances:</strong> ${salary.advancePaymentsCount} payments</p>
          ` : `
            <p><strong>Amount:</strong> $${displayAmount}</p>
          `}
        </div>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Yes, Delete!'
    })

    if (result.isConfirmed) {
      try {
        const res = await fetch(`/api/salary?id=${salary._id}`, {
          method: 'DELETE'
        })

        if (res.ok) {
          Swal.fire('Deleted!', 'Salary record has been deleted.', 'success')
          fetchSalaries()
        } else {
          Swal.fire('Error', 'Failed to delete salary record', 'error')
        }
      } catch (error) {
        console.error('Error deleting salary:', error)
        Swal.fire('Error', 'Failed to delete salary record', 'error')
      }
    }
  }

  // Filter salaries
  const filteredSalaries = salaries.filter(salary => {
    const matchesSearch = 
      (salary.workerName && salary.workerName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (salary.laborName && salary.laborName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (salary.workerEmail && salary.workerEmail.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (salary.description && salary.description.toLowerCase().includes(searchTerm.toLowerCase()))
    
    return matchesSearch
  })

  // ✅ NEW: Get progress bar for advance payments
  const getProgressBar = (salary) => {
    if (!salary.isAdvancePaymentSystem) return null
    
    const progress = parseFloat(salary.paymentProgress || 0)
    const isComplete = salary.calculatedStatus === 'fully_paid'
    
    return (
      <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
        <div
          className={`h-2 rounded-full transition-all duration-300 ${
            isComplete ? 'bg-green-500' : 'bg-blue-500'
          }`}
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen p-2 sm:p-4 lg:p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-4 sm:mb-6 lg:mb-8">
          <h1 className="text-xl sm:text-2xl lg:text-3xl xl:text-4xl font-bold text-gray-900 mb-2">
            Admin Salary Management
          </h1>
          <p className="text-gray-600 text-xs sm:text-sm lg:text-base">
            Manage worker salaries and advance payments for Abu Bakkar Leathers
          </p>
        </div>

        {/* ✅ UPDATED: Enhanced Statistics Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-2 sm:gap-4 lg:gap-6 mb-4 sm:mb-6 lg:mb-8">
          <div className="bg-white rounded-lg lg:rounded-xl p-3 sm:p-4 lg:p-6 shadow-sm border border-gray-200">
            <div className="flex items-center gap-2 lg:gap-3">
              <div className="p-1.5 sm:p-2 bg-blue-100 rounded-lg">
                <FaMoneyBillWave className="text-blue-600 text-sm sm:text-base lg:text-lg" />
              </div>
              <div>
                <p className="text-xs sm:text-sm text-gray-600">Total Paid</p>
                <p className="text-lg sm:text-xl font-bold text-gray-900">${stats.totalPaid.toLocaleString()}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg lg:rounded-xl p-3 sm:p-4 lg:p-6 shadow-sm border border-gray-200">
            <div className="flex items-center gap-2 lg:gap-3">
              <div className="p-1.5 sm:p-2 bg-green-100 rounded-lg">
                <FaUsers className="text-green-600 text-sm sm:text-base lg:text-lg" />
              </div>
              <div>
                <p className="text-xs sm:text-sm text-gray-600">Workers</p>
                <p className="text-lg sm:text-xl font-bold text-gray-900">${stats.workersSalary.toLocaleString()}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg lg:rounded-xl p-3 sm:p-4 lg:p-6 shadow-sm border border-gray-200">
            <div className="flex items-center gap-2 lg:gap-3">
              <div className="p-1.5 sm:p-2 bg-amber-100 rounded-lg">
                <FaHardHat className="text-amber-600 text-sm sm:text-base lg:text-lg" />
              </div>
              <div>
                <p className="text-xs sm:text-sm text-gray-600">Laborers</p>
                <p className="text-lg sm:text-xl font-bold text-gray-900">${stats.laborersSalary.toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* ✅ NEW: Advance payment statistics */}
          <div className="bg-white rounded-lg lg:rounded-xl p-3 sm:p-4 lg:p-6 shadow-sm border border-gray-200">
            <div className="flex items-center gap-2 lg:gap-3">
              <div className="p-1.5 sm:p-2 bg-purple-100 rounded-lg">
                <FaCreditCard className="text-purple-600 text-sm sm:text-base lg:text-lg" />
              </div>
              <div>
                <p className="text-xs sm:text-sm text-gray-600">Advances</p>
                <p className="text-lg sm:text-xl font-bold text-gray-900">${stats.totalAdvancesPaid.toLocaleString()}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg lg:rounded-xl p-3 sm:p-4 lg:p-6 shadow-sm border border-gray-200">
            <div className="flex items-center gap-2 lg:gap-3">
              <div className="p-1.5 sm:p-2 bg-orange-100 rounded-lg">
                <FaMoneyBillWave className="text-orange-600 text-sm sm:text-base lg:text-lg" />
              </div>
              <div>
                <p className="text-xs sm:text-sm text-gray-600">Pending</p>
                <p className="text-lg sm:text-xl font-bold text-gray-900">${stats.pendingBalances.toLocaleString()}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg lg:rounded-xl p-3 sm:p-4 lg:p-6 shadow-sm border border-gray-200">
            <div className="flex items-center gap-2 lg:gap-3">
              <div className="p-1.5 sm:p-2 bg-yellow-100 rounded-lg">
                <FaPercentage className="text-yellow-600 text-sm sm:text-base lg:text-lg" />
              </div>
              <div>
                <p className="text-xs sm:text-sm text-gray-600">Partial</p>
                <p className="text-lg sm:text-xl font-bold text-gray-900">{stats.partiallyPaidCount}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg lg:rounded-xl p-3 sm:p-4 lg:p-6 shadow-sm border border-gray-200">
            <div className="flex items-center gap-2 lg:gap-3">
              <div className="p-1.5 sm:p-2 bg-red-100 rounded-lg">
                <FaUsers className="text-red-600 text-sm sm:text-base lg:text-lg" />
              </div>
              <div>
                <p className="text-xs sm:text-sm text-gray-600">Total People</p>
                <p className="text-lg sm:text-xl font-bold text-gray-900">{stats.totalWorkers + stats.totalLaborers}</p>
              </div>
            </div>
          </div>
        </div>

        {/* SpreadSheet Data */}
        <SpreadsheetApp />

        {/* Controls */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 lg:p-6 mb-4 sm:mb-6 lg:mb-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 items-end">
            {/* Add Button */}
            <div>
              <button
                onClick={() => {
                  setShowAddForm(true)
                  setEditingSalary(null)
                  setPaymentMode('full')
                  reset()
                }}
                className="w-full bg-blue-600 text-white py-2 px-3 sm:px-4 rounded-lg hover:bg-blue-700 transition text-xs sm:text-sm font-medium flex items-center justify-center gap-2"
              >
                <FaPlus className="text-xs" />
                Add Salary
              </button>
            </div>

            {/* Search */}
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                Search
              </label>
              <div className="relative">
                <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-xs" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search names..."
                  className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-xs sm:text-sm"
                />
              </div>
            </div>

            {/* Type Filter */}
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                Filter by Type
              </label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-xs sm:text-sm"
              >
                <option value="all">All Types</option>
                <option value="worker">Workers</option>
                <option value="laborer">Admin Laborers</option>
              </select>
            </div>

            {/* Refresh Button */}
            <div>
              <button
                onClick={fetchSalaries}
                disabled={loading}
                className="w-full bg-gray-100 text-gray-700 py-2 px-3 rounded-lg hover:bg-gray-200 transition text-xs sm:text-sm font-medium disabled:opacity-50"
              >
                {loading ? 'Loading...' : 'Refresh'}
              </button>
            </div>
          </div>
        </div>

        {/* ✅ UPDATED: Enhanced Add/Edit Salary Form with Advance Payment Support */}
        {showAddForm && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 sm:p-6 mb-6 sm:mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900">
                {editingSalary ? 'Edit Salary' : 'Add New Salary'}
              </h2>
              <button
                onClick={() => {
                  setShowAddForm(false)
                  setEditingSalary(null)
                  setPaymentMode('full')
                  reset()
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Salary Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Salary Type *
                  </label>
                  <select
                    {...register('type', { required: 'Salary type is required' })}
                    className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="worker">Worker</option>
                    <option value="laborer">Admin Laborer</option>
                  </select>
                  {errors.type && (
                    <p className="text-red-500 text-xs mt-1">{errors.type.message}</p>
                  )}
                </div>

                {/* ✅ NEW: Payment Mode Selection */}
                {!editingSalary && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Payment Mode *
                    </label>
                    <select
                      {...register('paymentType')}
                      value={paymentMode}
                      onChange={(e) => {
                        setPaymentMode(e.target.value)
                        setValue('paymentType', e.target.value)
                      }}
                      className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="full">Full Payment</option>
                      <option value="advance">Advance Payment</option>
                    </select>
                  </div>
                )}

                {/* Worker Section */}
                {salaryType === 'worker' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Select Worker *
                      </label>
                      <select
                        {...register('workerEmail', { required: 'Worker is required' })}
                        onChange={(e) => handleWorkerSelect(e.target.value)}
                        className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">Select Worker</option>
                        {workers.map(worker => (
                          <option key={worker._id} value={worker.email}>
                            {worker.name} ({worker.email})
                          </option>
                        ))}
                      </select>
                      {errors.workerEmail && (
                        <p className="text-red-500 text-xs mt-1">{errors.workerEmail.message}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Worker Name
                      </label>
                      <input
                        type="text"
                        {...register('workerName')}
                        readOnly
                        className="w-full border border-gray-300 px-3 py-2 rounded-lg bg-gray-50"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Worker Phone
                      </label>
                      <input
                        type="text"
                        {...register('workerPhone')}
                        readOnly
                        className="w-full border border-gray-300 px-3 py-2 rounded-lg bg-gray-50"
                      />
                    </div>
                  </>
                )}

                {/* Laborer Section */}
                {salaryType === 'laborer' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Admin Laborer Name *
                      </label>
                      <input
                        type="text"
                        {...register('laborName', { required: 'Laborer name is required' })}
                        className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      {errors.laborName && (
                        <p className="text-red-500 text-xs mt-1">{errors.laborName.message}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Laborer Phone *
                      </label>
                      <input
                        type="tel"
                        {...register('laborPhone', { required: 'Laborer phone is required' })}
                        className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      {errors.laborPhone && (
                        <p className="text-red-500 text-xs mt-1">{errors.laborPhone.message}</p>
                      )}
                    </div>
                  </>
                )}

                {/* ✅ NEW: Total Salary Amount (for advance payments) */}
                {paymentMode === 'advance' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Total Salary Amount ($) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      {...register('totalSalaryAmount', {
                        required: paymentMode === 'advance' ? 'Total salary amount is required for advance payments' : false,
                        min: { value: 0.01, message: 'Total salary must be positive' }
                      })}
                      className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="5000"
                    />
                    {errors.totalSalaryAmount && (
                      <p className="text-red-500 text-xs mt-1">{errors.totalSalaryAmount.message}</p>
                    )}
                  </div>
                )}

                {/* Amount Field */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {paymentMode === 'advance' ? 'Advance Amount ($) *' : 'Amount ($) *'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    {...register('amount', {
                      required: 'Amount is required',
                      min: { value: 0.01, message: 'Amount must be positive' }
                    })}
                    className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder={paymentMode === 'advance' ? '2000' : '5000'}
                  />
                  {errors.amount && (
                    <p className="text-red-500 text-xs mt-1">{errors.amount.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Payment Date *
                  </label>
                  <input
                    type="date"
                    {...register('paymentDate', { required: 'Payment date is required' })}
                    className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  {errors.paymentDate && (
                    <p className="text-red-500 text-xs mt-1">{errors.paymentDate.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Payment Status
                  </label>
                  <select
                    {...register('status')}
                    className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="paid">Paid</option>
                    <option value="pending">Pending</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description/Notes
                </label>
                <textarea
                  {...register('description')}
                  rows={3}
                  className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Additional notes..."
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-blue-600 text-white py-2 px-6 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 font-medium"
                >
                  {loading ? 'Saving...' : editingSalary ? 'Update Salary' : (paymentMode === 'advance' ? 'Add Advance Payment' : 'Add Salary')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false)
                    setEditingSalary(null)
                    setPaymentMode('full')
                    reset()
                  }}
                  className="bg-gray-300 text-gray-700 py-2 px-6 rounded-lg hover:bg-gray-400 transition font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ✅ NEW: Advance Payment Form */}
        {showAdvanceForm && selectedSalaryForAdvance && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 sm:p-6 mb-6 sm:mb-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg sm:text-xl font-semibold text-gray-900">
                  Add Advance Payment
                </h2>
                <p className="text-sm text-gray-600">
                  {selectedSalaryForAdvance.type === 'worker' ? selectedSalaryForAdvance.workerName : selectedSalaryForAdvance.laborName}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowAdvanceForm(false)
                  setSelectedSalaryForAdvance(null)
                  resetAdvance()
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            {/* Current Status Display */}
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Total Salary:</span>
                  <p className="font-bold text-gray-900">${selectedSalaryForAdvance.totalSalaryAmount || selectedSalaryForAdvance.amount}</p>
                </div>
                <div>
                  <span className="text-gray-600">Total Paid:</span>
                  <p className="font-bold text-blue-600">${selectedSalaryForAdvance.totalAdvancePaid || 0}</p>
                </div>
                <div>
                  <span className="text-gray-600">Remaining:</span>
                  <p className="font-bold text-orange-600">${selectedSalaryForAdvance.remainingBalance || 0}</p>
                </div>
                <div>
                  <span className="text-gray-600">Progress:</span>
                  <p className="font-bold text-green-600">{selectedSalaryForAdvance.paymentProgress || 0}%</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleAdvanceSubmit(onAdvanceSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Advance Amount ($) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    {...registerAdvance('amount', {
                      required: 'Advance amount is required',
                      min: { value: 0.01, message: 'Amount must be positive' },
                      max: { 
                        value: selectedSalaryForAdvance.remainingBalance || 0, 
                        message: `Cannot exceed remaining balance of $${selectedSalaryForAdvance.remainingBalance || 0}` 
                      }
                    })}
                    className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder={`Max: $${selectedSalaryForAdvance.remainingBalance || 0}`}
                  />
                  {advanceErrors.amount && (
                    <p className="text-red-500 text-xs mt-1">{advanceErrors.amount.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Payment Date *
                  </label>
                  <input
                    type="date"
                    {...registerAdvance('paymentDate', { required: 'Payment date is required' })}
                    className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  {advanceErrors.paymentDate && (
                    <p className="text-red-500 text-xs mt-1">{advanceErrors.paymentDate.message}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description/Notes
                </label>
                <textarea
                  {...registerAdvance('description')}
                  rows={3}
                  className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Additional notes for this advance payment..."
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-green-600 text-white py-2 px-6 rounded-lg hover:bg-green-700 transition disabled:opacity-50 font-medium"
                >
                  {loading ? 'Adding...' : 'Add Advance Payment'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAdvanceForm(false)
                    setSelectedSalaryForAdvance(null)
                    resetAdvance()
                  }}
                  className="bg-gray-300 text-gray-700 py-2 px-6 rounded-lg hover:bg-gray-400 transition font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ✅ NEW: Advance Payment History Modal */}
        {showAdvanceHistory && selectedAdvanceHistory && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">
                      Advance Payment History
                    </h2>
                    <p className="text-gray-600">
                      {selectedAdvanceHistory.type === 'worker' ? selectedAdvanceHistory.workerName : selectedAdvanceHistory.laborName}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setShowAdvanceHistory(false)
                      setSelectedAdvanceHistory(null)
                    }}
                    className="text-gray-500 hover:text-gray-700 text-2xl"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="p-6 overflow-y-auto max-h-[70vh]">
                {selectedAdvanceHistory.advancePayments && selectedAdvanceHistory.advancePayments.length > 0 ? (
                  <div className="space-y-4">
                    {selectedAdvanceHistory.advancePayments.map((payment, index) => (
                      <div key={index} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div>
                            <span className="text-sm text-gray-600">Payment #{index + 1}</span>
                            <p className="font-bold text-lg text-green-600">${payment.amount}</p>
                          </div>
                          <div>
                            <span className="text-sm text-gray-600">Date</span>
                            <p className="font-medium">{format(new Date(payment.paidDate), 'MMM dd, yyyy')}</p>
                          </div>
                          <div>
                            <span className="text-sm text-gray-600">Paid By</span>
                            <p className="font-medium">{payment.paidBy}</p>
                          </div>
                          <div>
                            <span className="text-sm text-gray-600">Status</span>
                            <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                              Completed
                            </span>
                          </div>
                        </div>
                        {payment.description && (
                          <div className="mt-2">
                            <span className="text-sm text-gray-600">Description:</span>
                            <p className="text-sm text-gray-800">{payment.description}</p>
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Summary */}
                    <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                      <h3 className="font-bold text-blue-900 mb-2">Payment Summary</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-blue-700">Total Salary:</span>
                          <p className="font-bold text-blue-900">${selectedAdvanceHistory.totalSalaryAmount || selectedAdvanceHistory.amount}</p>
                        </div>
                        <div>
                          <span className="text-blue-700">Total Paid:</span>
                          <p className="font-bold text-blue-900">${selectedAdvanceHistory.totalAdvancePaid}</p>
                        </div>
                        <div>
                          <span className="text-blue-700">Remaining:</span>
                          <p className="font-bold text-blue-900">${selectedAdvanceHistory.remainingBalance}</p>
                        </div>
                        <div>
                          <span className="text-blue-700">Progress:</span>
                          <p className="font-bold text-blue-900">{selectedAdvanceHistory.paymentProgress}%</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <FaHistory className="mx-auto h-16 w-16 text-gray-300 mb-4" />
                    <p className="text-gray-500">No advance payment history available</p>
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-gray-200">
                <button
                  onClick={() => {
                    setShowAdvanceHistory(false)
                    setSelectedAdvanceHistory(null)
                  }}
                  className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ✅ UPDATED: Enhanced Salary Records Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-gray-200">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900">
              Salary Records ({filteredSalaries.length})
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Worker salaries, admin-managed labor payments, and advance payment tracking
            </p>
          </div>

          {loading ? (
            <div className="p-8 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-2 text-gray-600">Loading salaries...</p>
            </div>
          ) : filteredSalaries.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <FaMoneyBillWave className="mx-auto h-16 w-16 text-gray-300 mb-4" />
              <p className="text-lg mb-2">No salary records found</p>
              <p className="text-sm">Add salary records to get started</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Progress
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredSalaries.map((salary) => (
                    <tr key={salary._id} className="hover:bg-gray-50">
                      <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {format(new Date(salary.paymentDate), 'MMM dd, yyyy')}
                      </td>
                      <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            salary.type === 'worker' 
                              ? 'bg-blue-100 text-blue-800' 
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {salary.type === 'worker' ? 'Worker' : 'Laborer'}
                          </span>
                          {salary.isAdvancePaymentSystem && (
                            <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-800">
                              Advance
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div>
                          <div className="font-medium">
                            {salary.type === 'worker' ? salary.workerName : salary.laborName}
                          </div>
                          {salary.workerEmail && (
                            <div className="text-xs text-gray-500">{salary.workerEmail}</div>
                          )}
                          {salary.hasAdvancePayments && (
                            <div className="text-xs text-blue-600">
                              {salary.advancePaymentsCount} advance payments
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm">
                        {salary.isAdvancePaymentSystem ? (
                          <div className="space-y-1">
                            <div className="font-semibold text-green-600">
                              ${salary.totalAdvancePaid || 0} / ${salary.totalSalaryAmount}
                            </div>
                            <div className="text-xs text-gray-500">
                              Remaining: ${salary.remainingBalance || 0}
                            </div>
                          </div>
                        ) : (
                          <div className="font-semibold text-green-600">
                            ${(salary.displayAmount || salary.amount).toLocaleString()}
                          </div>
                        )}
                      </td>
                      <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                        {salary.isAdvancePaymentSystem ? (
                          <div className="w-full">
                            <div className="flex justify-between text-xs text-gray-600 mb-1">
                              <span>Progress</span>
                              <span>{salary.paymentProgress}%</span>
                            </div>
                            {getProgressBar(salary)}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-500">Full Payment</span>
                        )}
                      </td>
                      <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          salary.calculatedStatus === 'fully_paid' || salary.status === 'paid'
                            ? 'bg-green-100 text-green-800' 
                            : salary.calculatedStatus === 'partial_paid'
                            ? 'bg-yellow-100 text-yellow-800'
                            : salary.status === 'pending'
                            ? 'bg-gray-100 text-gray-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {salary.calculatedStatus === 'fully_paid' ? 'Fully Paid' : 
                           salary.calculatedStatus === 'partial_paid' ? 'Partial' :
                           salary.status || 'Pending'}
                        </span>
                      </td>
                      <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => editSalary(salary)}
                            className="text-blue-600 hover:text-blue-900 p-1"
                            title="Edit"
                          >
                            <FaEdit />
                          </button>
                          
                          {/* ✅ NEW: Advance payment actions */}
                          {salary.isAdvancePaymentSystem && salary.remainingBalance > 0 && (
                            <button
                              onClick={() => showAdvancePaymentForm(salary)}
                              className="text-green-600 hover:text-green-900 p-1"
                              title="Add Advance Payment"
                            >
                              <FaCreditCard />
                            </button>
                          )}
                          
                          {salary.hasAdvancePayments && (
                            <button
                              onClick={() => viewAdvanceHistory(salary)}
                              className="text-purple-600 hover:text-purple-900 p-1"
                              title="View Payment History"
                            >
                              <FaHistory />
                            </button>
                          )}
                          
                          <button
                            onClick={() => deleteSalary(salary)}
                            className="text-red-600 hover:text-red-900 p-1"
                            title="Delete"
                          >
                            <FaTrash />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
