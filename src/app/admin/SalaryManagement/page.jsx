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
  FaHardHat
} from 'react-icons/fa'

export default function AdminSalaryPage() {
  const [salaries, setSalaries] = useState([])
  const [workers, setWorkers] = useState([])
  const [loading, setLoading] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingSalary, setEditingSalary] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [stats, setStats] = useState({
    totalPaid: 0,
    workersSalary: 0,
    laborersSalary: 0,
    totalWorkers: 0,
    totalLaborers: 0
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
      status: 'paid'
    }
  })

  const salaryType = watch('type')

  // Fetch workers from your existing user API
  const fetchWorkers = async () => {
    try {
      const res = await fetch('/api/user')
      if (res.ok) {
        const data = await res.json()
        // Filter only approved workers
        const approvedWorkers = data.filter(user => user.status === 'approved')
        setWorkers(approvedWorkers)
      }
    } catch (error) {
      console.error('Error fetching workers:', error)
    }
  }

  // Fetch salaries - **FIXED TO ONLY SHOW ADMIN LABOR RECORDS**
  const fetchSalaries = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterType !== 'all') {
        params.append('type', filterType)
        
        // **KEY FIX: Only show admin-added labor records, not worker-added ones**
        if (filterType === 'laborer') {
          params.append('addedBy', 'admin') // Only show admin-added labor records
        }
      } else {
        // When showing all records, we need to fetch both worker salaries and admin-added labor
        // This requires two separate API calls and merging results
        const [workerRes, laborRes] = await Promise.all([
          fetch('/api/salary?type=worker'),
          fetch('/api/salary?type=laborer&addedBy=admin') // Only admin labor
        ])

        if (workerRes.ok && laborRes.ok) {
          const [workerData, laborData] = await Promise.all([
            workerRes.json(),
            laborRes.json()
          ])
          const combinedData = [...workerData, ...laborData]
          setSalaries(combinedData)
          calculateStats(combinedData)
          return
        }
      }

      const res = await fetch(`/api/salary?${params}`)
      if (res.ok) {
        const data = await res.json()
        setSalaries(data)
        calculateStats(data)
      }
    } catch (error) {
      console.error('Error fetching salaries:', error)
      Swal.fire('Error', 'Failed to fetch salary data', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Calculate statistics
  const calculateStats = (salaryData) => {
    const totalPaid = salaryData.reduce((sum, salary) => sum + salary.amount, 0)
    const workersSalary = salaryData
      .filter(s => s.type === 'worker')
      .reduce((sum, salary) => sum + salary.amount, 0)
    const laborersSalary = salaryData
      .filter(s => s.type === 'laborer')
      .reduce((sum, salary) => sum + salary.amount, 0)
    
    const totalWorkers = new Set(salaryData.filter(s => s.type === 'worker').map(s => s.workerEmail)).size
    const totalLaborers = new Set(salaryData.filter(s => s.type === 'laborer').map(s => s.laborName)).size

    setStats({
      totalPaid,
      workersSalary,
      laborersSalary,
      totalWorkers,
      totalLaborers
    })
  }

  useEffect(() => {
    fetchWorkers()
    fetchSalaries()
  }, [filterType])

  // Handle form submission - **FIXED TO MARK ADMIN-ADDED LABOR**
  const onSubmit = async (data) => {
    setLoading(true)
    try {
      const method = editingSalary ? 'PUT' : 'POST'
      const url = editingSalary ? `/api/salary?id=${editingSalary._id}` : '/api/salary'

      // **KEY FIX: Mark labor records as admin-added**
      const submitData = {
        ...data,
        amount: parseFloat(data.amount)
      }

      // If it's a laborer record and being added by admin, mark it as admin-added
      if (data.type === 'laborer' && !editingSalary) {
        submitData.addedBy = 'admin'
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitData)
      })

      if (res.ok) {
        Swal.fire('Success!', `Salary ${editingSalary ? 'updated' : 'added'} successfully`, 'success')
        reset()
        setShowAddForm(false)
        setEditingSalary(null)
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

  // Handle worker selection
  const handleWorkerSelect = (workerEmail) => {
    const selectedWorker = workers.find(w => w.email === workerEmail)
    if (selectedWorker) {
      setValue('workerName', selectedWorker.name)
      setValue('workerPhone', selectedWorker.phone || '')
    }
  }

  // Edit salary
  const editSalary = (salary) => {
    setEditingSalary(salary)
    setValue('type', salary.type)
    setValue('amount', salary.amount.toString())
    setValue('paymentDate', format(new Date(salary.paymentDate), 'yyyy-MM-dd'))
    setValue('status', salary.status || 'paid')
    setValue('description', salary.description || '')
    
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

  // Delete salary
  const deleteSalary = async (salary) => {
    const result = await Swal.fire({
      title: 'Delete Salary Record?',
      text: `Delete ${salary.type} salary of $${salary.amount}?`,
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

  return (
    <div className="min-h-screen p-2 sm:p-4 lg:p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-4 sm:mb-6 lg:mb-8">
          <h1 className="text-xl sm:text-2xl lg:text-3xl xl:text-4xl font-bold text-gray-900 mb-2">
            Admin Salary Management
          </h1>
          <p className="text-gray-600 text-xs sm:text-sm lg:text-base">
            Manage worker salaries and admin labor payments for Abu Bakkar Leathers
          </p>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-4 lg:gap-6 mb-4 sm:mb-6 lg:mb-8">
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
                <p className="text-xs sm:text-sm text-gray-600">Admin Laborers</p>
                <p className="text-lg sm:text-xl font-bold text-gray-900">${stats.laborersSalary.toLocaleString()}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg lg:rounded-xl p-3 sm:p-4 lg:p-6 shadow-sm border border-gray-200">
            <div className="flex items-center gap-2 lg:gap-3">
              <div className="p-1.5 sm:p-2 bg-purple-100 rounded-lg">
                <FaUsers className="text-purple-600 text-sm sm:text-base lg:text-lg" />
              </div>
              <div>
                <p className="text-xs sm:text-sm text-gray-600">Total Workers</p>
                <p className="text-lg sm:text-xl font-bold text-gray-900">{stats.totalWorkers}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg lg:rounded-xl p-3 sm:p-4 lg:p-6 shadow-sm border border-gray-200 col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2 lg:gap-3">
              <div className="p-1.5 sm:p-2 bg-red-100 rounded-lg">
                <FaHardHat className="text-red-600 text-sm sm:text-base lg:text-lg" />
              </div>
              <div>
                <p className="text-xs sm:text-sm text-gray-600">Admin Laborers</p>
                <p className="text-lg sm:text-xl font-bold text-gray-900">{stats.totalLaborers}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 lg:p-6 mb-4 sm:mb-6 lg:mb-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 items-end">
            {/* Add Button */}
            <div>
              <button
                onClick={() => {
                  setShowAddForm(true)
                  setEditingSalary(null)
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

        {/* Add/Edit Salary Form */}
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

                {/* Common Fields */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Amount ($) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    {...register('amount', {
                      required: 'Amount is required',
                      min: { value: 0.01, message: 'Amount must be positive' }
                    })}
                    className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                  {loading ? 'Saving...' : editingSalary ? 'Update Salary' : 'Add Salary'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false)
                    setEditingSalary(null)
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

        {/* Salary Records Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-gray-200">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900">
              Salary Records ({filteredSalaries.length})
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Worker salaries and admin-managed labor payments only
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
                      Phone
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount
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
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          salary.type === 'worker' 
                            ? 'bg-blue-100 text-blue-800' 
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {salary.type === 'worker' ? 'Worker' : 'Admin Laborer'}
                        </span>
                      </td>
                      <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {salary.type === 'worker' ? salary.workerName : salary.laborName}
                        {salary.workerEmail && (
                          <div className="text-xs text-gray-500">{salary.workerEmail}</div>
                        )}
                      </td>
                      <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {salary.type === 'worker' ? salary.workerPhone || 'N/A' : salary.laborPhone || 'N/A'}
                      </td>
                      <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-semibold text-green-600">
                        ${salary.amount.toLocaleString()}
                      </td>
                      <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          salary.status === 'paid' 
                            ? 'bg-green-100 text-green-800' 
                            : salary.status === 'pending'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {salary.status}
                        </span>
                      </td>
                      <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => editSalary(salary)}
                            className="text-blue-600 hover:text-blue-900 p-1"
                            title="Edit"
                          >
                            <FaEdit />
                          </button>
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
