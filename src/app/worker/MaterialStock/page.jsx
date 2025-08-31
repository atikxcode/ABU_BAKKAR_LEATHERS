'use client'

import { useContext, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { format } from 'date-fns'
import Swal from 'sweetalert2'
import { AuthContext } from '../../../../Provider/AuthProvider'

export default function MaterialStockPage() {
  const { user } = useContext(AuthContext)
  const userEmail = user?.email
  // Try multiple possible name properties from AuthContext
  const userName = user?.name || user?.displayName || user?.fullName || ''

  const [stocks, setStocks] = useState([])
  const [myStocks, setMyStocks] = useState([])
  const [othersStocks, setOthersStocks] = useState([])
  const [loading, setLoading] = useState(false)
  const [showMyStocks, setShowMyStocks] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterMaterial, setFilterMaterial] = useState('all')
  const [currentUser, setCurrentUser] = useState(null) // Add this state

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    defaultValues: {
      date: format(new Date(), 'yyyy-MM-dd'),
      material: '',
      quantity: '',
      unit: 'kg',
    },
  })

  // Fetch current user from database
  const fetchCurrentUser = async () => {
    if (!userEmail) return
    try {
      const res = await fetch(`/api/user?email=${userEmail}`)
      if (res.ok) {
        const { user: userFromDB } = await res.json()
        setCurrentUser(userFromDB)
        console.log('Current user from DB:', userFromDB) // Debug log
      }
    } catch (err) {
      console.error('Error fetching current user:', err)
    }
  }

  // Fetch all material stocks
  const fetchStocks = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/stock/materials')
      if (res.ok) {
        const data = await res.json()
        setStocks(data)

        // Separate my stocks and others stocks
        const my = data.filter((stock) => stock.workerEmail === userEmail)
        const others = data.filter((stock) => stock.workerEmail !== userEmail)

        setMyStocks(my)
        setOthersStocks(others)
      } else {
        Swal.fire('Error', 'Failed to fetch material stock data', 'error')
      }
    } catch (err) {
      console.error('Error fetching material stock:', err)
      Swal.fire('Error', 'Network error occurred', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (userEmail) {
      fetchStocks()
      fetchCurrentUser() // Fetch user data from database
    }
  }, [userEmail])

  // Debug: Log user information
  useEffect(() => {
    console.log('Auth user:', user)
    console.log('User email:', userEmail)
    console.log('User name:', userName)
    console.log('Current user from DB:', currentUser)
  }, [user, userEmail, userName, currentUser])

  // Submit material stock report
  const onSubmit = async (data) => {
    // Use database user info if available, fallback to auth context
    const workerName = currentUser?.name || userName || 'Unknown Worker'
    const workerEmail = userEmail

    if (!workerEmail) {
      Swal.fire(
        'Error',
        'User email not available. Please log in again.',
        'error'
      )
      return
    }

    if (!workerName || workerName === 'Unknown Worker') {
      console.warn('Worker name not found, using email as fallback')
    }

    console.log('Submitting with:', { workerName, workerEmail }) // Debug log

    setLoading(true)
    try {
      const response = await fetch('/api/stock/materials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          material: data.material.trim().toLowerCase(),
          quantity: Number(data.quantity),
          status: 'pending',
          workerName: workerName,
          workerEmail: workerEmail,
        }),
      })

      if (response.ok) {
        Swal.fire(
          'Success!',
          'Material stock report submitted successfully',
          'success'
        )
        reset()
        fetchStocks()
      } else {
        const error = await response.json()
        Swal.fire(
          'Error',
          error.message || 'Failed to submit material stock report',
          'error'
        )
      }
    } catch (err) {
      console.error('Error submitting material stock:', err)
      Swal.fire('Error', 'Network error occurred', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Get unique material types for filter
  const materialTypes = [
    ...new Set(stocks.map((stock) => stock.material)),
  ].sort()

  // Filter stocks function
  const filterStocks = (stockArray) => {
    return stockArray.filter((stock) => {
      const matchesSearch =
        stock.material?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        stock.workerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        stock.workerEmail?.toLowerCase().includes(searchTerm.toLowerCase())

      const matchesStatus =
        filterStatus === 'all' || stock.status === filterStatus
      const matchesMaterial =
        filterMaterial === 'all' || stock.material === filterMaterial

      return matchesSearch && matchesStatus && matchesMaterial
    })
  }

  const filteredMyStocks = filterStocks(myStocks)
  const filteredOthersStocks = filterStocks(othersStocks)
  const currentDisplayStocks = showMyStocks
    ? filteredMyStocks
    : filteredOthersStocks

  // Calculate statistics
  const myPendingCount = myStocks.filter((s) => s.status === 'pending').length
  const myApprovedCount = myStocks.filter((s) => s.status === 'approved').length
  const myRejectedCount = myStocks.filter((s) => s.status === 'rejected').length
  const myTotalQuantity = myStocks.reduce(
    (sum, s) => sum + (s.quantity || 0),
    0
  )

  return (
    <div className="min-h-screen p-4 bg-amber-50">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-amber-900 mb-8 text-center">
          Material Stock Reports
        </h1>

        {/* Debug Info - Remove this in production */}
        {/* <div className="mb-4 p-4 bg-blue-100 rounded-lg text-sm">
          <p>
            <strong>Debug Info:</strong>
          </p>
          <p>Email: {userEmail || 'Not available'}</p>
          <p>Auth Name: {userName || 'Not available'}</p>
          <p>DB Name: {currentUser?.name || 'Not available'}</p>
        </div> */}

        {/* Rest of your component remains exactly the same... */}
        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg p-4 shadow border border-amber-200">
            <div className="text-amber-900 text-sm font-medium">
              My Total Reports
            </div>
            <div className="text-2xl font-bold text-amber-900">
              {myStocks.length}
            </div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow border border-amber-200">
            <div className="text-green-900 text-sm font-medium">Approved</div>
            <div className="text-2xl font-bold text-green-900">
              {myApprovedCount}
            </div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow border border-amber-200">
            <div className="text-yellow-900 text-sm font-medium">Pending</div>
            <div className="text-2xl font-bold text-yellow-900">
              {myPendingCount}
            </div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow border border-amber-200">
            <div className="text-purple-900 text-sm font-medium">
              Total Quantity
            </div>
            <div className="text-2xl font-bold text-purple-900">
              {myTotalQuantity}
            </div>
          </div>
        </div>

        {/* Submit New Material Stock Form */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8 border border-amber-200">
          <h2 className="text-xl font-semibold text-amber-900 mb-4">
            Submit New Material Stock Report
          </h2>

          <form
            onSubmit={handleSubmit(onSubmit)}
            className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end"
          >
            <div>
              <label className="block text-sm font-medium text-amber-900 mb-1">
                Date
              </label>
              <input
                type="date"
                {...register('date', { required: 'Date is required' })}
                className="w-full border border-amber-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-amber-400 focus:outline-none"
              />
              {errors.date && (
                <p className="text-red-500 text-xs mt-1">
                  {errors.date.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-amber-900 mb-1">
                Material Name
              </label>
              <input
                type="text"
                placeholder="e.g., glue, thread, dye"
                {...register('material', {
                  required: 'Material name is required',
                })}
                className="w-full border border-amber-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-amber-400 focus:outline-none"
              />
              {errors.material && (
                <p className="text-red-500 text-xs mt-1">
                  {errors.material.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-amber-900 mb-1">
                Quantity
              </label>
              <input
                type="number"
                step="0.01"
                placeholder="Enter quantity"
                {...register('quantity', {
                  required: 'Quantity is required',
                  min: { value: 0.01, message: 'Quantity must be positive' },
                })}
                className="w-full border border-amber-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-amber-400 focus:outline-none"
              />
              {errors.quantity && (
                <p className="text-red-500 text-xs mt-1">
                  {errors.quantity.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-amber-900 mb-1">
                Unit
              </label>
              <select
                {...register('unit', { required: 'Unit is required' })}
                className="w-full border border-amber-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-amber-400 focus:outline-none mb-2"
              >
                <option value="kg">Kilogram</option>
                <option value="liter">Liter</option>
                <option value="piece">Piece</option>
                <option value="roll">Roll</option>
                <option value="meter">Meter</option>
              </select>
              <button
                type="submit"
                disabled={loading || !userEmail}
                className="w-full bg-amber-900 text-white py-2 px-4 rounded-lg hover:bg-amber-800 transition disabled:opacity-50 font-medium"
              >
                {loading ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </form>
        </div>

        {/* View Toggle and Filters */}
        <div className="bg-white rounded-xl shadow-lg p-4 mb-6 border border-amber-200">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
            {/* View Toggle */}
            <div>
              <label className="block text-sm font-medium text-amber-900 mb-1">
                View
              </label>
              <div className="flex rounded-lg border border-amber-300 overflow-hidden">
                <button
                  onClick={() => setShowMyStocks(true)}
                  className={`flex-1 py-2 px-3 text-sm font-medium transition ${
                    showMyStocks
                      ? 'bg-amber-900 text-white'
                      : 'bg-white text-amber-900 hover:bg-amber-50'
                  }`}
                >
                  My Materials ({myStocks.length})
                </button>
                <button
                  onClick={() => setShowMyStocks(false)}
                  className={`flex-1 py-2 px-3 text-sm font-medium transition ${
                    !showMyStocks
                      ? 'bg-amber-900 text-white'
                      : 'bg-white text-amber-900 hover:bg-amber-50'
                  }`}
                >
                  Others' Materials ({othersStocks.length})
                </button>
              </div>
            </div>

            {/* Search */}
            <div>
              <label className="block text-sm font-medium text-amber-900 mb-1">
                Search
              </label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by material, worker..."
                className="w-full border border-amber-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-amber-400 focus:outline-none text-sm"
              />
            </div>

            {/* Status Filter */}
            <div>
              <label className="block text-sm font-medium text-amber-900 mb-1">
                Status
              </label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full border border-amber-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-amber-400 focus:outline-none text-sm"
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>

            {/* Material Filter */}
            <div>
              <label className="block text-sm font-medium text-amber-900 mb-1">
                Material
              </label>
              <select
                value={filterMaterial}
                onChange={(e) => setFilterMaterial(e.target.value)}
                className="w-full border border-amber-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-amber-400 focus:outline-none text-sm"
              >
                <option value="all">All Materials</option>
                {materialTypes.map((material) => (
                  <option key={material} value={material}>
                    {material.charAt(0).toUpperCase() + material.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            {/* Refresh Button */}
            <div>
              <button
                onClick={fetchStocks}
                disabled={loading}
                className="w-full bg-blue-600 text-white py-2 px-3 rounded-lg hover:bg-blue-700 transition text-sm font-medium disabled:opacity-50"
              >
                {loading ? 'Loading...' : '🔄 Refresh'}
              </button>
            </div>
          </div>
        </div>

        {/* Material Stock Table */}
        <div className="bg-white shadow-lg rounded-xl p-6 border border-amber-200">
          <h2 className="text-xl font-semibold mb-4 text-amber-900">
            {showMyStocks ? 'My Material Reports' : "Others' Material Reports"}
            <span className="text-sm font-normal text-gray-600 ml-2">
              ({currentDisplayStocks.length} entries)
            </span>
          </h2>

          {loading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-amber-900"></div>
              <p className="mt-2 text-amber-900">Loading...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm border-collapse border border-gray-300">
                <thead className="bg-amber-100">
                  <tr>
                    <th className="px-4 py-3 border border-gray-300 text-left font-semibold text-amber-900">
                      Date
                    </th>
                    <th className="px-4 py-3 border border-gray-300 text-left font-semibold text-amber-900">
                      Material
                    </th>
                    <th className="px-4 py-3 border border-gray-300 text-left font-semibold text-amber-900">
                      Quantity
                    </th>
                    <th className="px-4 py-3 border border-gray-300 text-left font-semibold text-amber-900">
                      Unit
                    </th>
                    <th className="px-4 py-3 border border-gray-300 text-left font-semibold text-amber-900">
                      Status
                    </th>
                    {!showMyStocks && (
                      <>
                        <th className="px-4 py-3 border border-gray-300 text-left font-semibold text-amber-900">
                          Worker Name
                        </th>
                        <th className="px-4 py-3 border border-gray-300 text-left font-semibold text-amber-900">
                          Worker Email
                        </th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {currentDisplayStocks.map((stock) => (
                    <tr
                      key={stock._id}
                      className="hover:bg-amber-50 transition-colors"
                    >
                      <td className="px-4 py-3 border border-gray-300">
                        {format(new Date(stock.date), 'MMM dd, yyyy')}
                      </td>
                      <td className="px-4 py-3 border border-gray-300 font-medium capitalize">
                        {stock.material}
                      </td>
                      <td className="px-4 py-3 border border-gray-300 text-right">
                        {stock.quantity}
                      </td>
                      <td className="px-4 py-3 border border-gray-300">
                        {stock.unit}
                      </td>
                      <td className="px-4 py-3 border border-gray-300">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            stock.status === 'approved'
                              ? 'bg-green-100 text-green-800'
                              : stock.status === 'rejected'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {stock.status.charAt(0).toUpperCase() +
                            stock.status.slice(1)}
                        </span>
                      </td>
                      {!showMyStocks && (
                        <>
                          <td className="px-4 py-3 border border-gray-300">
                            {stock.workerName}
                          </td>
                          <td className="px-4 py-3 border border-gray-300 text-xs text-gray-600">
                            {stock.workerEmail}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {currentDisplayStocks.length === 0 && !loading && (
            <div className="text-center py-12">
              <div className="text-gray-400 mb-4">
                <svg
                  className="mx-auto h-16 w-16"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-gray-500 text-lg">No material reports found</p>
              <p className="text-gray-400 text-sm mt-2">
                {showMyStocks
                  ? "You haven't submitted any material reports yet"
                  : 'No other workers have submitted material reports'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
