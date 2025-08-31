'use client'

import { useState, useEffect, useContext } from 'react'
import { useForm } from 'react-hook-form'
import { format } from 'date-fns'
import Swal from 'sweetalert2'
import { AuthContext } from '../../../../Provider/AuthProvider'
import {
  FaPlus,
  FaSearch,
  FaEdit,
  FaTrash,
  FaMoneyBillWave,
  FaUsers,
  FaHardHat,
  FaCalendarAlt,
  FaEye
} from 'react-icons/fa'

export default function WorkerSalaryPage() {
  const { user } = useContext(AuthContext)
  const userEmail = user?.email
  const userName = user?.name || user?.displayName || 'Worker'

  const [mySalaries, setMySalaries] = useState([])
  const [myLaborSalaries, setMyLaborSalaries] = useState([])
  const [loading, setLoading] = useState(false)
  const [showAddLaborForm, setShowAddLaborForm] = useState(false)
  const [editingLabor, setEditingLabor] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterMonth, setFilterMonth] = useState('')
  const [activeTab, setActiveTab] = useState('salary') // 'salary' or 'labor'
  const [stats, setStats] = useState({
    totalSalary: 0,
    totalLaborSalary: 0,
    totalEarnings: 0,
    pendingAmount: 0
  })

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors }
  } = useForm({
    defaultValues: {
      paymentDate: format(new Date(), 'yyyy-MM-dd'),
      amount: '',
      status: 'paid'
    }
  })

  // Fetch my worker salary records
  const fetchMySalaries = async () => {
    if (!userEmail) return

    setLoading(true)
    try {
      const params = new URLSearchParams({
        type: 'worker',
        workerEmail: userEmail
      })

      if (filterMonth) {
        const startDate = new Date(filterMonth + '-01')
        const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0)
        params.append('startDate', startDate.toISOString().split('T')[0])
        params.append('endDate', endDate.toISOString().split('T')[0])
      }

      const res = await fetch(`/api/salary?${params}`)
      if (res.ok) {
        const data = await res.json()
        setMySalaries(data)
      }
    } catch (error) {
      console.error('Error fetching my salaries:', error)
      Swal.fire('Error', 'Failed to fetch salary data', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Fetch my labor salary records (only ones I added)
  const fetchMyLaborSalaries = async () => {
    if (!userEmail) return

    setLoading(true)
    try {
      const params = new URLSearchParams({
        type: 'laborer',
        addedBy: userEmail // This ensures only labor records added by this worker are fetched
      })

      if (filterMonth) {
        const startDate = new Date(filterMonth + '-01')
        const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0)
        params.append('startDate', startDate.toISOString().split('T')[0])
        params.append('endDate', endDate.toISOString().split('T')[0])
      }

      const res = await fetch(`/api/salary?${params}`)
      if (res.ok) {
        const data = await res.json()
        setMyLaborSalaries(data) // This should now only contain labor records added by this worker
      }
    } catch (error) {
      console.error('Error fetching my labor salaries:', error)
      Swal.fire('Error', 'Failed to fetch labor salary data', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Calculate statistics
  const calculateStats = () => {
    const totalSalary = mySalaries.reduce((sum, salary) => sum + salary.amount, 0)
    const totalLaborSalary = myLaborSalaries.reduce((sum, salary) => sum + salary.amount, 0)
    const totalEarnings = totalSalary + totalLaborSalary
    
    const pendingAmount = [...mySalaries, ...myLaborSalaries]
      .filter(s => s.status === 'pending')
      .reduce((sum, salary) => sum + salary.amount, 0)

    setStats({
      totalSalary,
      totalLaborSalary,
      totalEarnings,
      pendingAmount
    })
  }

  useEffect(() => {
    if (userEmail) {
      fetchMySalaries()
      fetchMyLaborSalaries()
    }
  }, [userEmail, filterMonth])

  useEffect(() => {
    calculateStats()
  }, [mySalaries, myLaborSalaries])

  // Handle labor form submission
  const onSubmitLabor = async (data) => {
    setLoading(true)
    try {
      const method = editingLabor ? 'PUT' : 'POST'
      const url = editingLabor ? `/api/salary?id=${editingLabor._id}` : '/api/salary'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          type: 'laborer',
          amount: parseFloat(data.amount),
          addedBy: userEmail // Mark as added by this worker
        })
      })

      if (res.ok) {
        Swal.fire('Success!', `Labor salary ${editingLabor ? 'updated' : 'added'} successfully`, 'success')
        reset()
        setShowAddLaborForm(false)
        setEditingLabor(null)
        fetchMyLaborSalaries()
      } else {
        const error = await res.json()
        Swal.fire('Error', error.message, 'error')
      }
    } catch (error) {
      console.error('Error saving labor salary:', error)
      Swal.fire('Error', 'Failed to save labor salary', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Edit labor salary
  const editLaborSalary = (labor) => {
    setEditingLabor(labor)
    setValue('laborName', labor.laborName)
    setValue('laborPhone', labor.laborPhone || '')
    setValue('amount', labor.amount.toString())
    setValue('paymentDate', format(new Date(labor.paymentDate), 'yyyy-MM-dd'))
    setValue('status', labor.status || 'paid')
    setValue('description', labor.description || '')
    setShowAddLaborForm(true)
  }

  // Delete labor salary
  const deleteLaborSalary = async (labor) => {
    const result = await Swal.fire({
      title: 'Delete Labor Salary?',
      text: `Delete labor salary for ${labor.laborName} of $${labor.amount}?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Yes, Delete!'
    })

    if (result.isConfirmed) {
      try {
        const res = await fetch(`/api/salary?id=${labor._id}`, {
          method: 'DELETE'
        })

        if (res.ok) {
          Swal.fire('Deleted!', 'Labor salary has been deleted.', 'success')
          fetchMyLaborSalaries()
        } else {
          Swal.fire('Error', 'Failed to delete labor salary', 'error')
        }
      } catch (error) {
        console.error('Error deleting labor salary:', error)
        Swal.fire('Error', 'Failed to delete labor salary', 'error')
      }
    }
  }

  // Filter data
  const filteredSalaries = mySalaries.filter(salary =>
    salary.workerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    salary.description?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const filteredLaborSalaries = myLaborSalaries.filter(labor =>
    labor.laborName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    labor.description?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (!userEmail) {
    return (
      <div className="min-h-screen p-2 sm:p-4 lg:p-8 bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
          <p className="text-gray-600">Please log in to view your salary information</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-2 sm:p-4 lg:p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-4 sm:mb-6 lg:mb-8">
          <h1 className="text-xl sm:text-2xl lg:text-3xl xl:text-4xl font-bold text-gray-900 mb-2">
            My Salary Dashboard
          </h1>
          <p className="text-gray-600 text-xs sm:text-sm lg:text-base">
            Track your salary and manage labor payments
          </p>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 lg:gap-6 mb-4 sm:mb-6 lg:mb-8">
          <div className="bg-white rounded-lg lg:rounded-xl p-3 sm:p-4 lg:p-6 shadow-sm border border-gray-200">
            <div className="flex items-center gap-2 lg:gap-3">
              <div className="p-1.5 sm:p-2 bg-blue-100 rounded-lg">
                <FaMoneyBillWave className="text-blue-600 text-sm sm:text-base lg:text-lg" />
              </div>
              <div>
                <p className="text-xs sm:text-sm text-gray-600">Total Earnings</p>
                <p className="text-lg sm:text-xl font-bold text-gray-900">${stats.totalEarnings.toLocaleString()}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg lg:rounded-xl p-3 sm:p-4 lg:p-6 shadow-sm border border-gray-200">
            <div className="flex items-center gap-2 lg:gap-3">
              <div className="p-1.5 sm:p-2 bg-green-100 rounded-lg">
                <FaUsers className="text-green-600 text-sm sm:text-base lg:text-lg" />
              </div>
              <div>
                <p className="text-xs sm:text-sm text-gray-600">My Salary</p>
                <p className="text-lg sm:text-xl font-bold text-gray-900">${stats.totalSalary.toLocaleString()}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg lg:rounded-xl p-3 sm:p-4 lg:p-6 shadow-sm border border-gray-200">
            <div className="flex items-center gap-2 lg:gap-3">
              <div className="p-1.5 sm:p-2 bg-amber-100 rounded-lg">
                <FaHardHat className="text-amber-600 text-sm sm:text-base lg:text-lg" />
              </div>
              <div>
                <p className="text-xs sm:text-sm text-gray-600">Labor Salaries</p>
                <p className="text-lg sm:text-xl font-bold text-gray-900">${stats.totalLaborSalary.toLocaleString()}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg lg:rounded-xl p-3 sm:p-4 lg:p-6 shadow-sm border border-gray-200 col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2 lg:gap-3">
              <div className="p-1.5 sm:p-2 bg-red-100 rounded-lg">
                <FaCalendarAlt className="text-red-600 text-sm sm:text-base lg:text-lg" />
              </div>
              <div>
                <p className="text-xs sm:text-sm text-gray-600">Pending</p>
                <p className="text-lg sm:text-xl font-bold text-gray-900">${stats.pendingAmount.toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 lg:p-6 mb-4 sm:mb-6 lg:mb-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 items-end">
            {/* Tab Toggle */}
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                View
              </label>
              <div className="flex rounded-lg border border-gray-300 overflow-hidden">
                <button
                  onClick={() => setActiveTab('salary')}
                  className={`flex-1 py-2 px-3 text-xs sm:text-sm font-medium transition ${
                    activeTab === 'salary'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <FaEye className="inline mr-1" />
                  My Salary
                </button>
                <button
                  onClick={() => setActiveTab('labor')}
                  className={`flex-1 py-2 px-3 text-xs sm:text-sm font-medium transition ${
                    activeTab === 'labor'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <FaHardHat className="inline mr-1" />
                  Labor
                </button>
              </div>
            </div>

            {/* Add Labor Button */}
            {activeTab === 'labor' && (
              <div>
                <button
                  onClick={() => {
                    setShowAddLaborForm(true)
                    setEditingLabor(null)
                    reset()
                  }}
                  className="w-full bg-green-600 text-white py-2 px-3 sm:px-4 rounded-lg hover:bg-green-700 transition text-xs sm:text-sm font-medium flex items-center justify-center gap-2"
                >
                  <FaPlus className="text-xs" />
                  Add Labor
                </button>
              </div>
            )}

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
                  placeholder="Search..."
                  className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-xs sm:text-sm"
                />
              </div>
            </div>

            {/* Month Filter */}
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                Month Filter
              </label>
              <input
                type="month"
                value={filterMonth}
                onChange={(e) => setFilterMonth(e.target.value)}
                className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-xs sm:text-sm"
              />
            </div>
          </div>
        </div>

        {/* Add Labor Form */}
        {showAddLaborForm && activeTab === 'labor' && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 sm:p-6 mb-6 sm:mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900">
                {editingLabor ? 'Edit Labor Salary' : 'Add Labor Salary'}
              </h2>
              <button
                onClick={() => {
                  setShowAddLaborForm(false)
                  setEditingLabor(null)
                  reset()
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmitLabor)} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Labor Name *
                  </label>
                  <input
                    type="text"
                    {...register('laborName', { required: 'Labor name is required' })}
                    className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  {errors.laborName && (
                    <p className="text-red-500 text-xs mt-1">{errors.laborName.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Labor Phone
                  </label>
                  <input
                    type="tel"
                    {...register('laborPhone')}
                    className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

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
                  className="bg-green-600 text-white py-2 px-6 rounded-lg hover:bg-green-700 transition disabled:opacity-50 font-medium"
                >
                  {loading ? 'Saving...' : editingLabor ? 'Update Labor Salary' : 'Add Labor Salary'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddLaborForm(false)
                    setEditingLabor(null)
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

        {/* Data Display */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-gray-200">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900">
              {activeTab === 'salary' ? 'My Salary Records' : 'My Labor Salary Records'}
              <span className="text-sm font-normal text-gray-600 ml-2">
                ({activeTab === 'salary' ? filteredSalaries.length : filteredLaborSalaries.length} entries)
              </span>
            </h2>
          </div>

          {loading ? (
            <div className="p-8 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-2 text-gray-600">Loading...</p>
            </div>
          ) : activeTab === 'salary' ? (
            // My Salary Records
            filteredSalaries.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <FaMoneyBillWave className="mx-auto h-16 w-16 text-gray-300 mb-4" />
                <p className="text-lg mb-2">No salary records found</p>
                <p className="text-sm">Your salary records will appear here</p>
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
                        Amount
                      </th>
                      <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Description
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredSalaries.map((salary) => (
                      <tr key={salary._id} className="hover:bg-gray-50">
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {format(new Date(salary.paymentDate), 'MMM dd, yyyy')}
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
                        <td className="px-4 sm:px-6 py-4 text-sm text-gray-900">
                          {salary.description || 'N/A'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            // My Labor Records
            filteredLaborSalaries.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <FaHardHat className="mx-auto h-16 w-16 text-gray-300 mb-4" />
                <p className="text-lg mb-2">No labor salary records found</p>
                <p className="text-sm">Add labor salary records to track your labor payments</p>
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
                        Labor Name
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
                    {filteredLaborSalaries.map((labor) => (
                      <tr key={labor._id} className="hover:bg-gray-50">
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {format(new Date(labor.paymentDate), 'MMM dd, yyyy')}
                        </td>
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {labor.laborName}
                        </td>
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {labor.laborPhone || 'N/A'}
                        </td>
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-semibold text-green-600">
                          ${labor.amount.toLocaleString()}
                        </td>
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            labor.status === 'paid' 
                              ? 'bg-green-100 text-green-800' 
                              : labor.status === 'pending'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {labor.status}
                          </span>
                        </td>
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => editLaborSalary(labor)}
                              className="text-blue-600 hover:text-blue-900 p-1"
                              title="Edit"
                            >
                              <FaEdit />
                            </button>
                            <button
                              onClick={() => deleteLaborSalary(labor)}
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
            )
          )}
        </div>
      </div>
    </div>
  )
}
