'use client'

import { useEffect, useState } from 'react'
import { DateRangePicker } from 'react-date-range'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { format } from 'date-fns'
import Swal from 'sweetalert2'
import 'react-date-range/dist/styles.css'
import 'react-date-range/dist/theme/default.css'

export default function AdminMaterialStockPage() {
  const [stocks, setStocks] = useState([])
  const [loading, setLoading] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [selectedItems, setSelectedItems] = useState([])
  const [selectAll, setSelectAll] = useState(false)
  const [dateRange, setDateRange] = useState([
    {
      startDate: new Date(new Date().setMonth(new Date().getMonth() - 1)),
      endDate: new Date(),
      key: 'selection',
    },
  ])

  // Fetch all material stock reports
  // Update this function in your frontend
  const fetchStocks = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()

      // Only add filters if they are explicitly set
      if (filterStatus !== 'all') {
        params.append('status', filterStatus)
      }

      if (searchTerm.trim()) {
        params.append('material', searchTerm.trim())
      }

      // Don't add date filter by default - only when user applies it
      // Remove these lines that apply default date range:
      // const range = dateRange[0]
      // params.append('startDate', format(range.startDate, 'yyyy-MM-dd'))
      // params.append('endDate', format(range.endDate, 'yyyy-MM-dd'))

      console.log('📡 Fetching materials with params:', params.toString())

      const res = await fetch(`/api/stock/materials?${params}`)
      if (res.ok) {
        const data = await res.json()
        setStocks(data)
      } else {
        Swal.fire('Error', 'Failed to fetch material stock data', 'error')
      }
    } catch (err) {
      console.error('Error fetching stock:', err)
      Swal.fire('Error', 'Network error occurred', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStocks()
  }, [])

  // Approve or Reject stock
  const updateStatus = async (id, status) => {
    try {
      const res = await fetch(`/api/stock/materials?id=${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          role: 'admin',
        },
        body: JSON.stringify({ status }),
      })

      if (res.ok) {
        fetchStocks()
        Swal.fire(
          'Success!',
          `Material stock ${status} successfully`,
          'success'
        )
      } else {
        Swal.fire('Error', 'Failed to update status', 'error')
      }
    } catch (err) {
      console.error(err)
      Swal.fire('Error', 'Network error occurred', 'error')
    }
  }

  // Single item delete
  const deleteSingleStock = async (stock) => {
    const result = await Swal.fire({
      title: 'Delete Material Stock Entry?',
      html: `
        <div class="text-left">
          <p><strong>Material:</strong> ${stock.material}</p>
          <p><strong>Quantity:</strong> ${stock.quantity} ${stock.unit}</p>
          <p><strong>Worker:</strong> ${stock.workerName}</p>
          <p><strong>Date:</strong> ${format(
            new Date(stock.date),
            'MMM dd, yyyy'
          )}</p>
          <p class="text-red-600 font-semibold mt-3">⚠️ This will permanently delete this material stock entry!</p>
        </div>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Yes, Delete It!',
    })

    if (result.isConfirmed) {
      try {
        const response = await fetch(
          `/api/stock/materials?id=${stock._id}&deleteType=single`,
          {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
              role: 'admin',
            },
          }
        )

        if (response.ok) {
          const result = await response.json()
          Swal.fire('Deleted!', result.message, 'success')
          fetchStocks()
        } else {
          const error = await response.json()
          Swal.fire(
            'Error',
            error.message || 'Failed to delete material stock entry',
            'error'
          )
        }
      } catch (err) {
        console.error(err)
        Swal.fire('Error', 'An error occurred while deleting', 'error')
      }
    }
  }

  // Bulk delete functionality
  const showBulkDeleteModal = () => {
    setShowDeleteModal(true)
  }

  const performBulkDelete = async (criteria) => {
    try {
      const params = new URLSearchParams({
        deleteType: 'bulk',
        ...criteria,
      })

      const response = await fetch(`/api/stock/materials?${params}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          role: 'admin',
        },
      })

      if (response.ok) {
        const result = await response.json()
        Swal.fire('Success!', result.message, 'success')
        fetchStocks()
        setShowDeleteModal(false)
      } else {
        const error = await response.json()
        Swal.fire('Error', error.message || 'Failed to delete entries', 'error')
      }
    } catch (err) {
      console.error(err)
      Swal.fire('Error', 'An error occurred during bulk delete', 'error')
    }
  }

  // Handle item selection
  const handleItemSelection = (stockId) => {
    setSelectedItems((prev) => {
      if (prev.includes(stockId)) {
        return prev.filter((id) => id !== stockId)
      } else {
        return [...prev, stockId]
      }
    })
  }

  // Handle select all
  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedItems([])
    } else {
      setSelectedItems(filteredStocks.map((stock) => stock._id))
    }
    setSelectAll(!selectAll)
  }

  // Delete selected items
  const deleteSelectedItems = async () => {
    if (selectedItems.length === 0) {
      Swal.fire('Warning', 'Please select items to delete', 'warning')
      return
    }

    const result = await Swal.fire({
      title: 'Delete Selected Items?',
      html: `
        <div class="text-left">
          <p><strong>Selected Items:</strong> ${selectedItems.length}</p>
          <p class="text-red-600 font-semibold mt-3">⚠️ This will permanently delete all selected material stock entries!</p>
        </div>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Yes, Delete All Selected!',
    })

    if (result.isConfirmed) {
      try {
        let deletedCount = 0
        for (const stockId of selectedItems) {
          const response = await fetch(
            `/api/stock/materials?id=${stockId}&deleteType=single`,
            {
              method: 'DELETE',
              headers: {
                'Content-Type': 'application/json',
                role: 'admin',
              },
            }
          )
          if (response.ok) deletedCount++
        }

        Swal.fire(
          'Success!',
          `${deletedCount} items deleted successfully`,
          'success'
        )
        setSelectedItems([])
        setSelectAll(false)
        fetchStocks()
      } catch (err) {
        console.error(err)
        Swal.fire(
          'Error',
          'An error occurred while deleting selected items',
          'error'
        )
      }
    }
  }

  // Handle date range change
  const handleDateRangeChange = (ranges) => {
    setDateRange([ranges.selection])
  }

  const applyDateFilter = () => {
    fetchStocks()
    setShowDatePicker(false)
  }

  // Calculate combined stock per material type
  const combinedStock = stocks
    .filter((s) => s.status === 'approved')
    .reduce((acc, curr) => {
      if (!acc[curr.material]) acc[curr.material] = 0
      acc[curr.material] += curr.quantity
      return acc
    }, {})

  // Download comprehensive stock report
  const downloadStockReport = () => {
    const doc = new jsPDF()

    // Header
    doc.setFontSize(20)
    doc.text('Material Stock Report', 14, 15)

    doc.setFontSize(12)
    doc.text(
      `Period: ${format(dateRange[0].startDate, 'MMM dd, yyyy')} - ${format(
        dateRange[0].endDate,
        'MMM dd, yyyy'
      )}`,
      14,
      25
    )

    // Summary Statistics
    doc.setFontSize(14)
    doc.setFont(undefined, 'bold')
    doc.text('Summary:', 14, 40)

    doc.setFontSize(12)
    doc.setFont(undefined, 'normal')
    doc.text(`Total Entries: ${filteredStocks.length}`, 14, 50)
    doc.text(
      `Approved: ${
        filteredStocks.filter((s) => s.status === 'approved').length
      }`,
      14,
      60
    )
    doc.text(
      `Pending: ${filteredStocks.filter((s) => s.status === 'pending').length}`,
      14,
      70
    )
    doc.text(
      `Rejected: ${
        filteredStocks.filter((s) => s.status === 'rejected').length
      }`,
      14,
      80
    )

    // Combined Stock Table
    if (Object.keys(combinedStock).length > 0) {
      doc.setFontSize(14)
      doc.setFont(undefined, 'bold')
      doc.text('Approved Stock Summary:', 14, 100)

      const stockTableData = Object.entries(combinedStock).map(
        ([material, quantity]) => [material, quantity.toString()]
      )

      autoTable(doc, {
        head: [['Material Type', 'Total Quantity']],
        body: stockTableData,
        startY: 110,
        styles: { fontSize: 10 },
        headStyles: { fillColor: [146, 64, 14] },
      })
    }

    // Detailed Stock Entries
    const currentY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 20 : 130

    doc.setFontSize(14)
    doc.setFont(undefined, 'bold')
    doc.text('Detailed Stock Entries:', 14, currentY)

    const detailTableData = filteredStocks.map((stock) => [
      format(new Date(stock.date), 'MMM dd, yyyy'),
      stock.material,
      stock.quantity.toString(),
      stock.unit,
      stock.status,
      stock.workerName,
    ])

    autoTable(doc, {
      head: [['Date', 'Material', 'Quantity', 'Unit', 'Status', 'Worker']],
      body: detailTableData,
      startY: currentY + 10,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [146, 64, 14] },
    })

    const fileName = `material_stock_report_${format(
      new Date(),
      'yyyy-MM-dd'
    )}.pdf`
    doc.save(fileName)
  }

  // Download detailed report
  const downloadDetailedReport = () => {
    const doc = new jsPDF()

    doc.setFontSize(20)
    doc.text('Detailed Material Stock Report', 14, 15)

    doc.setFontSize(12)
    doc.text(
      `Period: ${format(dateRange[0].startDate, 'MMM dd, yyyy')} - ${format(
        dateRange[0].endDate,
        'MMM dd, yyyy'
      )}`,
      14,
      25
    )

    let yPosition = 40

    // Performance Summary
    doc.setFontSize(14)
    doc.setFont(undefined, 'bold')
    doc.text('Performance Summary:', 14, yPosition)
    yPosition += 15

    doc.setFontSize(11)
    doc.setFont(undefined, 'normal')
    doc.text(
      `• Total Material Stock Entries: ${filteredStocks.length}`,
      20,
      yPosition
    )
    yPosition += 8
    doc.text(
      `• Approved Entries: ${
        filteredStocks.filter((s) => s.status === 'approved').length
      }`,
      20,
      yPosition
    )
    yPosition += 8
    doc.text(
      `• Total Approved Quantity: ${Object.values(combinedStock).reduce(
        (sum, qty) => sum + qty,
        0
      )}`,
      20,
      yPosition
    )
    yPosition += 15

    // Stock Details by Material Type
    doc.setFontSize(14)
    doc.setFont(undefined, 'bold')
    doc.text('Stock Details by Material Type:', 14, yPosition)
    yPosition += 15

    Object.entries(combinedStock).forEach(([material, quantity]) => {
      if (yPosition > 250) {
        doc.addPage()
        yPosition = 20
      }

      doc.setFontSize(12)
      doc.setFont(undefined, 'bold')
      doc.text(`${material}: ${quantity} units`, 20, yPosition)
      yPosition += 10

      // Get entries for this material type
      const materialEntries = filteredStocks.filter(
        (s) => s.material === material && s.status === 'approved'
      )

      doc.setFontSize(10)
      doc.setFont(undefined, 'normal')
      materialEntries.forEach((entry) => {
        if (yPosition > 270) {
          doc.addPage()
          yPosition = 20
        }
        doc.text(
          `  • ${entry.workerName}: ${entry.quantity} ${entry.unit} (${format(
            new Date(entry.date),
            'MMM dd'
          )})`,
          25,
          yPosition
        )
        yPosition += 6
      })
      yPosition += 10
    })

    const fileName = `detailed_material_stock_report_${format(
      new Date(),
      'yyyy-MM-dd'
    )}.pdf`
    doc.save(fileName)
  }

  // Filter stocks based on search term, status, and date range
  const filteredStocks = stocks.filter((stock) => {
    const matchesSearch =
      stock.material?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      stock.workerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      stock.workerEmail?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesStatus =
      filterStatus === 'all' || stock.status === filterStatus

    return matchesSearch && matchesStatus
  })

  return (
    <div className="min-h-screen p-4 bg-amber-50">
      <h1 className="text-3xl font-bold text-amber-900 mb-8 text-center">
        Material Stock Management
      </h1>

      {/* Controls */}
      <div className="bg-white rounded-xl shadow-lg p-4 mb-6 border border-amber-200">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-amber-900 mb-1">
              Search
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Material, worker name..."
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

          {/* Date Range */}
          <div>
            <label className="block text-sm font-medium text-amber-900 mb-1">
              Date Range
            </label>
            <button
              onClick={() => setShowDatePicker(!showDatePicker)}
              className="w-full border border-amber-300 px-3 py-2 rounded-lg text-left text-sm hover:bg-amber-50"
            >
              {format(dateRange[0].startDate, 'MMM dd')} -{' '}
              {format(dateRange[0].endDate, 'MMM dd')}
            </button>
          </div>

          {/* Download Buttons */}
          <div>
            <button
              onClick={downloadStockReport}
              className="w-full bg-blue-600 text-white py-2 px-3 rounded-lg hover:bg-blue-700 transition text-sm font-medium"
            >
              📄 Summary Report
            </button>
          </div>

          <div>
            <button
              onClick={downloadDetailedReport}
              className="w-full bg-green-600 text-white py-2 px-3 rounded-lg hover:bg-green-700 transition text-sm font-medium"
            >
              📋 Detailed Report
            </button>
          </div>

          {/* Bulk Actions */}
          <div>
            <button
              onClick={showBulkDeleteModal}
              className="w-full bg-red-600 text-white py-2 px-3 rounded-lg hover:bg-red-700 transition text-sm font-medium"
            >
              🗑️ Bulk Delete
            </button>
          </div>
        </div>

        {/* Date Range Picker */}
        {showDatePicker && (
          <div className="mt-4 flex flex-col items-center">
            <DateRangePicker
              ranges={dateRange}
              onChange={handleDateRangeChange}
              showSelectionPreview={true}
              moveRangeOnFirstSelection={false}
              months={2}
              direction="horizontal"
            />
            <div className="mt-4 flex gap-2">
              <button
                onClick={applyDateFilter}
                className="bg-amber-600 text-white py-2 px-4 rounded-lg hover:bg-amber-700 transition"
              >
                Apply Filter
              </button>
              <button
                onClick={() => setShowDatePicker(false)}
                className="bg-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-400 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Selection Actions */}
      {selectedItems.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex justify-between items-center">
            <span className="text-blue-900 font-medium">
              {selectedItems.length} item(s) selected
            </span>
            <button
              onClick={deleteSelectedItems}
              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition text-sm font-medium"
            >
              Delete Selected
            </button>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg p-4 shadow border border-amber-200">
          <div className="text-amber-900 text-sm font-medium">
            Total Entries
          </div>
          <div className="text-2xl font-bold text-amber-900">
            {filteredStocks.length}
          </div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow border border-amber-200">
          <div className="text-green-900 text-sm font-medium">Approved</div>
          <div className="text-2xl font-bold text-green-900">
            {filteredStocks.filter((s) => s.status === 'approved').length}
          </div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow border border-amber-200">
          <div className="text-yellow-900 text-sm font-medium">Pending</div>
          <div className="text-2xl font-bold text-yellow-900">
            {filteredStocks.filter((s) => s.status === 'pending').length}
          </div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow border border-amber-200">
          <div className="text-red-900 text-sm font-medium">Rejected</div>
          <div className="text-2xl font-bold text-red-900">
            {filteredStocks.filter((s) => s.status === 'rejected').length}
          </div>
        </div>
      </div>

      {/* Submitted Stock Table */}
      <div className="bg-white shadow-lg rounded-xl p-6 mb-6 border border-amber-200">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-amber-900">
            Submitted Material Stocks
          </h2>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selectAll}
                onChange={handleSelectAll}
                className="rounded border-amber-300 text-amber-600 focus:ring-amber-500"
              />
              <span className="text-sm text-amber-900">Select All</span>
            </label>
          </div>
        </div>

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
                    Select
                  </th>
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
                  <th className="px-4 py-3 border border-gray-300 text-left font-semibold text-amber-900">
                    Worker Name
                  </th>
                  <th className="px-4 py-3 border border-gray-300 text-left font-semibold text-amber-900">
                    Worker Email
                  </th>
                  <th className="px-4 py-3 border border-gray-300 text-left font-semibold text-amber-900">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredStocks.map((stock) => (
                  <tr
                    key={stock._id}
                    className="hover:bg-amber-50 transition-colors"
                  >
                    <td className="px-4 py-3 border border-gray-300">
                      <input
                        type="checkbox"
                        checked={selectedItems.includes(stock._id)}
                        onChange={() => handleItemSelection(stock._id)}
                        className="rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                      />
                    </td>
                    <td className="px-4 py-3 border border-gray-300">
                      {format(new Date(stock.date), 'MMM dd, yyyy')}
                    </td>
                    <td className="px-4 py-3 border border-gray-300 font-medium capitalize">
                      {stock.material}
                    </td>
                    <td className="px-4 py-3 border border-gray-300">
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
                    <td className="px-4 py-3 border border-gray-300">
                      {stock.workerName}
                    </td>
                    <td className="px-4 py-3 border border-gray-300">
                      {stock.workerEmail}
                    </td>
                    <td className="px-4 py-3 border border-gray-300">
                      <div className="flex gap-2">
                        {stock.status === 'pending' && (
                          <>
                            <button
                              onClick={() =>
                                updateStatus(stock._id, 'approved')
                              }
                              disabled={loading}
                              className="bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 disabled:opacity-50 text-xs font-medium"
                            >
                              ✓ Approve
                            </button>
                            <button
                              onClick={() =>
                                updateStatus(stock._id, 'rejected')
                              }
                              disabled={loading}
                              className="bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700 disabled:opacity-50 text-xs font-medium"
                            >
                              ✗ Reject
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => deleteSingleStock(stock)}
                          className="text-red-600 hover:text-red-800 transition-colors p-1"
                          title="Delete Entry"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filteredStocks.length === 0 && !loading && (
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
            <p className="text-gray-500 text-lg">
              No material stock entries found
            </p>
          </div>
        )}
      </div>

      {/* Combined Stock Summary */}
      <div className="bg-white shadow-lg rounded-xl p-6 border border-amber-200">
        <h2 className="text-xl font-semibold mb-4 text-amber-900">
          Combined Approved Material Stock
        </h2>
        {Object.keys(combinedStock).length === 0 ? (
          <p className="text-gray-500">No approved material stock yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm border-collapse border border-gray-300">
              <thead className="bg-amber-100">
                <tr>
                  <th className="px-4 py-3 border border-gray-300 text-left font-semibold text-amber-900">
                    Material Type
                  </th>
                  <th className="px-4 py-3 border border-gray-300 text-left font-semibold text-amber-900">
                    Total Quantity
                  </th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(combinedStock).map(([material, quantity]) => (
                  <tr
                    key={material}
                    className="hover:bg-amber-50 transition-colors"
                  >
                    <td className="px-4 py-3 border border-gray-300 font-medium capitalize">
                      {material}
                    </td>
                    <td className="px-4 py-3 border border-gray-300 font-bold text-green-600">
                      {quantity}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bulk Delete Modal */}
      {showDeleteModal && (
        <BulkDeleteModal
          onClose={() => setShowDeleteModal(false)}
          onDelete={performBulkDelete}
          dateRange={dateRange}
        />
      )}
    </div>
  )
}

// Bulk Delete Modal Component
function BulkDeleteModal({ onClose, onDelete, dateRange }) {
  const [deleteRange, setDeleteRange] = useState(dateRange)
  const [deleteStatus, setDeleteStatus] = useState('all')
  const [deleteMaterial, setDeleteMaterial] = useState('')

  const handleDelete = () => {
    const criteria = {
      startDate: format(deleteRange[0].startDate, 'yyyy-MM-dd'),
      endDate: format(deleteRange[0].endDate, 'yyyy-MM-dd'),
    }

    if (deleteStatus !== 'all') {
      criteria.status = deleteStatus
    }

    if (deleteMaterial.trim()) {
      criteria.material = deleteMaterial.trim()
    }

    Swal.fire({
      title: 'Confirm Bulk Delete',
      html: `
        <div class="text-left">
          <p><strong>Date Range:</strong> ${format(
            deleteRange[0].startDate,
            'MMM dd, yyyy'
          )} - ${format(deleteRange[0].endDate, 'MMM dd, yyyy')}</p>
          <p><strong>Status:</strong> ${
            deleteStatus === 'all' ? 'All statuses' : deleteStatus
          }</p>
          <p><strong>Material:</strong> ${deleteMaterial || 'All materials'}</p>
          <p class="text-red-600 font-semibold mt-3">⚠️ This will permanently delete all matching entries!</p>
        </div>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      confirmButtonText: 'Yes, Delete All!',
    }).then((result) => {
      if (result.isConfirmed) {
        onDelete(criteria)
      }
    })
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6">
        <h2 className="text-2xl font-bold text-amber-900 mb-4">
          Bulk Delete Options
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-amber-900 mb-1">
              Date Range
            </label>
            <DateRangePicker
              ranges={deleteRange}
              onChange={(ranges) => setDeleteRange([ranges.selection])}
              showSelectionPreview={false}
              months={1}
              direction="horizontal"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-amber-900 mb-1">
              Status Filter
            </label>
            <select
              value={deleteStatus}
              onChange={(e) => setDeleteStatus(e.target.value)}
              className="w-full border border-amber-300 px-3 py-2 rounded-lg"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending Only</option>
              <option value="approved">Approved Only</option>
              <option value="rejected">Rejected Only</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-amber-900 mb-1">
              Material Type (Optional)
            </label>
            <input
              type="text"
              value={deleteMaterial}
              onChange={(e) => setDeleteMaterial(e.target.value)}
              placeholder="Enter material type to filter..."
              className="w-full border border-amber-300 px-3 py-2 rounded-lg"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-400 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            className="flex-1 bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition"
          >
            Delete Matching Items
          </button>
        </div>
      </div>
    </div>
  )
}
