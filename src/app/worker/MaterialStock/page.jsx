'use client'

import { useContext, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { format } from 'date-fns'
import Swal from 'sweetalert2'
import { AuthContext } from '../../../../Provider/AuthProvider'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { FaDownload, FaFilter, FaFilePdf, FaCalendarAlt } from 'react-icons/fa'

export default function MaterialStockPage() {
  const { user } = useContext(AuthContext)
  const userEmail = user?.email
  const userName = user?.name || user?.displayName || user?.fullName || ''

  const [stocks, setStocks] = useState([])
  const [myStocks, setMyStocks] = useState([])
  const [othersStocks, setOthersStocks] = useState([])
  const [loading, setLoading] = useState(false)
  const [downloadLoading, setDownloadLoading] = useState(false)
  const [showMyStocks, setShowMyStocks] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterMaterial, setFilterMaterial] = useState('all')
  const [filterCompany, setFilterCompany] = useState('all')
  const [currentUser, setCurrentUser] = useState(null)
  const [dateRange, setDateRange] = useState({
    startDate: '',
    endDate: '',
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    defaultValues: {
      date: format(new Date(), 'yyyy-MM-dd'),
      material: '',
      company: '',
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
      fetchCurrentUser()
    }
  }, [userEmail])

  // Submit material stock report
  const onSubmit = async (data) => {
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

    setLoading(true)
    try {
      const response = await fetch('/api/stock/materials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          material: data.material.trim().toLowerCase(),
          company: data.company.trim(),
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

  // PDF Generation Function
  const generatePDF = (
    data,
    filename,
    title = 'Material Stock Report',
    includeStats = false
  ) => {
    const doc = new jsPDF()

    // Header
    doc.setFontSize(20)
    doc.setFont(undefined, 'bold')
    doc.text('Abu Bakkar Leathers', 14, 15)
    doc.setFontSize(16)
    doc.text(title, 14, 25)

    doc.setFontSize(12)
    doc.setFont(undefined, 'normal')
    doc.text(`Worker: ${currentUser?.name || userName}`, 14, 35)
    doc.text(`Email: ${userEmail}`, 14, 45)
    doc.text(
      `Generated on: ${format(new Date(), 'MMM dd, yyyy HH:mm:ss')}`,
      14,
      55
    )
    doc.text(`Total Reports: ${data.length}`, 14, 65)

    let startY = 75

    // Add statistics if requested
    if (includeStats && data.length > 0) {
      const approvedCount = data.filter((s) => s.status === 'approved').length
      const pendingCount = data.filter((s) => s.status === 'pending').length
      const rejectedCount = data.filter((s) => s.status === 'rejected').length
      const totalQuantity = data.reduce((sum, s) => sum + (s.quantity || 0), 0)

      doc.setFont(undefined, 'bold')
      doc.text('Summary Statistics:', 14, startY)
      doc.setFont(undefined, 'normal')
      doc.text(
        `Approved: ${approvedCount} | Pending: ${pendingCount} | Rejected: ${rejectedCount}`,
        14,
        startY + 10
      )
      doc.text(`Total Quantity: ${totalQuantity}`, 14, startY + 20)

      // Company breakdown
      const companies = {}
      data.forEach((stock) => {
        if (!companies[stock.company]) {
          companies[stock.company] = { count: 0, quantity: 0 }
        }
        companies[stock.company].count++
        companies[stock.company].quantity += stock.quantity || 0
      })

      doc.setFont(undefined, 'bold')
      doc.text('Company Breakdown:', 14, startY + 35)
      doc.setFont(undefined, 'normal')

      let yPos = startY + 45
      Object.entries(companies).forEach(([company, stats]) => {
        doc.text(
          `${company}: ${stats.count} reports, ${stats.quantity} total quantity`,
          20,
          yPos
        )
        yPos += 7
      })

      startY = yPos + 10
    }

    // Prepare table data
    const tableData = data.map((item) => [
      format(new Date(item.date), 'dd/MM/yyyy'),
      item.material || 'N/A',
      item.company || 'N/A',
      (item.quantity || 0).toString(),
      item.unit || 'N/A',
      item.status || 'pending',
      item.workerPhone || 'N/A',
    ])

    // Generate table
    autoTable(doc, {
      head: [
        ['Date', 'Material', 'Company', 'Quantity', 'Unit', 'Status', 'Phone'],
      ],
      body: tableData,
      startY: startY,
      styles: {
        fontSize: 8,
        cellPadding: 2,
      },
      headStyles: {
        fillColor: [146, 64, 14],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245],
      },
    })

    // Save the PDF
    doc.save(filename)
  }

  // Download single stock report as PDF
  const downloadSingleReportPDF = async (stock) => {
    setDownloadLoading(true)
    try {
      const doc = new jsPDF()

      // Header
      doc.setFontSize(20)
      doc.setFont(undefined, 'bold')
      doc.text('Abu Bakkar Leathers - Individual Material Stock Report', 14, 15)

      doc.setFontSize(12)
      doc.setFont(undefined, 'normal')
      doc.text(`Worker: ${stock.workerName}`, 14, 25)
      doc.text(`Email: ${stock.workerEmail}`, 14, 35)
      doc.text(
        `Generated on: ${format(new Date(), 'MMM dd, yyyy HH:mm:ss')}`,
        14,
        45
      )

      // Stock Details
      doc.setFont(undefined, 'bold')
      doc.text('Material Stock Details:', 14, 60)
      doc.setFont(undefined, 'normal')

      const stockDetails = [
        ['Date', format(new Date(stock.date), 'MMM dd, yyyy')],
        ['Material', stock.material || 'N/A'],
        ['Company', stock.company || 'N/A'],
        ['Quantity', stock.quantity?.toString() || '0'],
        ['Unit', stock.unit || 'N/A'],
        ['Status', stock.status || 'pending'],
        ['Worker Phone', stock.workerPhone || 'N/A'],
      ]

      autoTable(doc, {
        head: [['Field', 'Value']],
        body: stockDetails,
        startY: 65,
        styles: {
          fontSize: 10,
          cellPadding: 3,
        },
        headStyles: {
          fillColor: [146, 64, 14],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
        },
        alternateRowStyles: {
          fillColor: [245, 245, 245],
        },
      })

      doc.save(
        `material-stock-${stock.material}-${format(
          new Date(stock.date),
          'yyyy-MM-dd'
        )}.pdf`
      )
      Swal.fire(
        'Success!',
        'Individual report downloaded successfully',
        'success'
      )
    } catch (err) {
      console.error('Error downloading single report:', err)
      Swal.fire('Error', 'Failed to download report', 'error')
    } finally {
      setDownloadLoading(false)
    }
  }

  // Download all my reports as PDF
  const downloadAllMyReportsPDF = async () => {
    setDownloadLoading(true)
    try {
      let filteredStocks = myStocks

      // Apply date range filter if specified
      if (dateRange.startDate && dateRange.endDate) {
        filteredStocks = filteredStocks.filter((stock) => {
          const stockDate = new Date(stock.date)
          return (
            stockDate >= new Date(dateRange.startDate) &&
            stockDate <= new Date(dateRange.endDate)
          )
        })
      }

      if (filteredStocks.length === 0) {
        Swal.fire(
          'No Data',
          'No material stock reports found for the selected criteria',
          'info'
        )
        return
      }

      generatePDF(
        filteredStocks,
        `my-material-stock-reports-${format(new Date(), 'yyyy-MM-dd')}.pdf`,
        'My Complete Material Stock Reports',
        true
      )

      Swal.fire('Success!', 'All reports downloaded successfully', 'success')
    } catch (err) {
      console.error('Error downloading all reports:', err)
      Swal.fire('Error', 'Failed to download reports', 'error')
    } finally {
      setDownloadLoading(false)
    }
  }

  // Download filtered reports by current filters
  const downloadFilteredReportsPDF = async () => {
    setDownloadLoading(true)
    try {
      let filteredData = filterStocks(myStocks)

      if (filteredData.length === 0) {
        Swal.fire(
          'No Data',
          'No material stock reports found for the current filters',
          'info'
        )
        return
      }

      generatePDF(
        filteredData,
        `filtered-material-stock-reports-${format(
          new Date(),
          'yyyy-MM-dd'
        )}.pdf`,
        'Filtered Material Stock Reports',
        true
      )

      Swal.fire(
        'Success!',
        'Filtered reports downloaded successfully',
        'success'
      )
    } catch (err) {
      console.error('Error downloading filtered reports:', err)
      Swal.fire('Error', 'Failed to download filtered reports', 'error')
    } finally {
      setDownloadLoading(false)
    }
  }

  // Get unique values for filters
  const materialTypes = [
    ...new Set(stocks.map((stock) => stock.material)),
  ].sort()
  const companies = [...new Set(stocks.map((stock) => stock.company))].sort()

  // Filter stocks function
  const filterStocks = (stockArray) => {
    return stockArray.filter((stock) => {
      const matchesSearch =
        stock.material?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        stock.company?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        stock.workerName?.toLowerCase().includes(searchTerm.toLowerCase())

      const matchesStatus =
        filterStatus === 'all' || stock.status === filterStatus
      const matchesMaterial =
        filterMaterial === 'all' || stock.material === filterMaterial
      const matchesCompany =
        filterCompany === 'all' || stock.company === filterCompany

      return matchesSearch && matchesStatus && matchesMaterial && matchesCompany
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
            className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end"
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
                Company *
              </label>
              <input
                type="text"
                placeholder="Enter company name"
                {...register('company', { required: 'Company is required' })}
                className="w-full border border-amber-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-amber-400 focus:outline-none"
              />
              {errors.company && (
                <p className="text-red-500 text-xs mt-1">
                  {errors.company.message}
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

        {/* Download Reports Section */}
        <div className="bg-white rounded-xl shadow-lg p-4 mb-6 border border-amber-200">
          <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4">
            <h3 className="text-lg font-semibold text-amber-900">
              Download My Reports (PDF)
            </h3>

            {/* Date Range Filters for Download */}
            <div className="flex flex-col sm:flex-row gap-2 flex-1">
              <div className="flex flex-col md:flex-row items-center gap-2">
                <FaCalendarAlt className="text-amber-600" />
                <input
                  type="date"
                  value={dateRange.startDate}
                  onChange={(e) =>
                    setDateRange({ ...dateRange, startDate: e.target.value })
                  }
                  className="border border-amber-300 px-2 py-1 rounded text-sm"
                  placeholder="Start Date"
                />
                <span className="text-amber-600">to</span>
                <input
                  type="date"
                  value={dateRange.endDate}
                  onChange={(e) =>
                    setDateRange({ ...dateRange, endDate: e.target.value })
                  }
                  className="border border-amber-300 px-2 py-1 rounded text-sm"
                  placeholder="End Date"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={downloadAllMyReportsPDF}
                disabled={downloadLoading}
                className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition disabled:opacity-50 font-medium flex items-center gap-2"
              >
                <FaFilePdf />
                {downloadLoading ? 'Downloading...' : 'Download All'}
              </button>

              <button
                onClick={downloadFilteredReportsPDF}
                disabled={downloadLoading}
                className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition disabled:opacity-50 font-medium flex items-center gap-2"
              >
                <FaFilter />
                {downloadLoading ? 'Downloading...' : 'Download Filtered'}
              </button>
            </div>
          </div>
        </div>

        {/* View Toggle and Filters */}
        <div className="bg-white rounded-xl shadow-lg p-4 mb-6 border border-amber-200">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
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
                  My Stocks ({myStocks.length})
                </button>
                <button
                  onClick={() => setShowMyStocks(false)}
                  className={`flex-1 py-2 px-3 text-sm font-medium transition ${
                    !showMyStocks
                      ? 'bg-amber-900 text-white'
                      : 'bg-white text-amber-900 hover:bg-amber-50'
                  }`}
                >
                  Others' Stocks ({othersStocks.length})
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
                placeholder="Search by material, company, worker..."
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

            {/* Company Filter */}
            <div>
              <label className="block text-sm font-medium text-amber-900 mb-1">
                Company
              </label>
              <select
                value={filterCompany}
                onChange={(e) => setFilterCompany(e.target.value)}
                className="w-full border border-amber-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-amber-400 focus:outline-none text-sm"
              >
                <option value="all">All Companies</option>
                {companies.map((company, index) => (
                  <option key={company + index} value={company}>
                    {company}
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
                      Company
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
                      <th className="px-4 py-3 border border-gray-300 text-left font-semibold text-amber-900">
                        Worker Name
                      </th>
                    )}
                    {showMyStocks && (
                      <th className="px-4 py-3 border border-gray-300 text-center font-semibold text-amber-900">
                        Actions
                      </th>
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
                      <td className="px-4 py-3 border border-gray-300 font-medium">
                        {stock.company || 'N/A'}
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
                        <td className="px-4 py-3 border border-gray-300">
                          {stock.workerName}
                        </td>
                      )}
                      {showMyStocks && (
                        <td className="px-4 py-3 border border-gray-300 text-center">
                          <button
                            onClick={() => downloadSingleReportPDF(stock)}
                            disabled={downloadLoading}
                            className="bg-red-600 text-white px-3 py-1 rounded text-xs hover:bg-red-700 transition disabled:opacity-50 flex items-center gap-1 mx-auto"
                          >
                            <FaFilePdf className="text-xs" />
                            {downloadLoading ? 'PDF...' : 'PDF'}
                          </button>
                        </td>
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
