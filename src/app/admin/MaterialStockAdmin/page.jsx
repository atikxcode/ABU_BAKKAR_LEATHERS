'use client'

import { useEffect, useState } from 'react'
import { DateRangePicker } from 'react-date-range'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { format } from 'date-fns'
import Swal from 'sweetalert2'
import {
  FaDownload,
  FaTrash,
  FaCheck,
  FaTimes,
  FaCalendarAlt,
  FaFilePdf,
  FaUser,
  FaBuilding,
} from 'react-icons/fa'
import 'react-date-range/dist/styles.css'
import 'react-date-range/dist/theme/default.css'

export default function AdminMaterialStockPage() {
  const [stocks, setStocks] = useState([])
  const [loading, setLoading] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterCompany, setFilterCompany] = useState('all')
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
  const fetchStocks = async () => {
    setLoading(true)
    try {
      const range = dateRange[0]
      const params = new URLSearchParams({
        startDate: format(range.startDate, 'yyyy-MM-dd'),
        endDate: format(range.endDate, 'yyyy-MM-dd'),
      })

      if (filterStatus !== 'all') {
        params.append('status', filterStatus)
      }

      if (filterCompany !== 'all') {
        params.append('company', filterCompany)
      }

      const res = await fetch(`/api/stock/materials?${params}`)
      if (res.ok) {
        const data = await res.json()
        setStocks(data)
      } else {
        Swal.fire('Error', 'Failed to fetch stock data', 'error')
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

  // Get unique companies for filter
  const uniqueCompanies = [
    ...new Set(stocks.map((stock) => stock.company)),
  ].sort()

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
        Swal.fire('Success!', `Stock ${status} successfully`, 'success')
      } else {
        Swal.fire('Error', 'Failed to update status', 'error')
      }
    } catch (err) {
      console.error(err)
      Swal.fire('Error', 'Network error occurred', 'error')
    }
  }

  // Generate PDF for individual stock entry
  const generateIndividualStockPDF = (stock) => {
    const doc = new jsPDF()

    // Header
    doc.setFontSize(20)
    doc.setFont(undefined, 'bold')
    doc.text('Abu Bakkar Leathers - Individual Material Stock Entry', 14, 15)

    doc.setFontSize(12)
    doc.setFont(undefined, 'normal')
    doc.text(
      `Generated on: ${format(new Date(), 'MMM dd, yyyy HH:mm:ss')}`,
      14,
      25
    )

    // Stock Details
    doc.setFont(undefined, 'bold')
    doc.text('Material Stock Entry Details:', 14, 40)
    doc.setFont(undefined, 'normal')

    const stockDetails = [
      ['Date', format(new Date(stock.date), 'MMM dd, yyyy')],
      ['Material Type', stock.material || 'N/A'],
      ['Company', stock.company || 'N/A'],
      ['Quantity', stock.quantity?.toString() || '0'],
      ['Unit', stock.unit || 'N/A'],
      ['Status', stock.status || 'pending'],
      ['Worker Name', stock.workerName || 'N/A'],
      ['Worker Phone', stock.workerPhone || 'N/A'],
      [
        'Created At',
        stock.createdAt
          ? format(new Date(stock.createdAt), 'MMM dd, yyyy HH:mm')
          : 'N/A',
      ],
    ]

    autoTable(doc, {
      head: [['Field', 'Value']],
      body: stockDetails,
      startY: 45,
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
      `material_stock_${stock.material}_${stock.workerName}_${format(
        new Date(stock.date),
        'yyyy-MM-dd'
      )}.pdf`
    )
  }

  // Generate PDF for worker's combined stock
  const generateWorkerCombinedPDF = (workerName) => {
    const workerStocks = filteredStocks.filter(
      (stock) => stock.workerName === workerName
    )

    if (workerStocks.length === 0) {
      Swal.fire(
        'No Data',
        `No material stock entries found for worker: ${workerName}`,
        'info'
      )
      return
    }

    const doc = new jsPDF()

    // Header
    doc.setFontSize(20)
    doc.setFont(undefined, 'bold')
    doc.text('Abu Bakkar Leathers - Worker Material Stock Summary', 14, 15)

    doc.setFontSize(12)
    doc.setFont(undefined, 'normal')
    doc.text(`Worker: ${workerName}`, 14, 25)
    doc.text(
      `Generated on: ${format(new Date(), 'MMM dd, yyyy HH:mm:ss')}`,
      14,
      35
    )
    doc.text(`Total Entries: ${workerStocks.length}`, 14, 45)

    // Summary Statistics
    const approvedCount = workerStocks.filter(
      (s) => s.status === 'approved'
    ).length
    const pendingCount = workerStocks.filter(
      (s) => s.status === 'pending'
    ).length
    const rejectedCount = workerStocks.filter(
      (s) => s.status === 'rejected'
    ).length
    const totalQuantity = workerStocks.reduce(
      (sum, s) => sum + (s.quantity || 0),
      0
    )

    doc.setFont(undefined, 'bold')
    doc.text('Summary:', 14, 60)
    doc.setFont(undefined, 'normal')
    doc.text(
      `Approved: ${approvedCount} | Pending: ${pendingCount} | Rejected: ${rejectedCount}`,
      14,
      70
    )
    doc.text(`Total Quantity: ${totalQuantity}`, 14, 80)

    // Company Breakdown
    const companies = {}
    workerStocks.forEach((stock) => {
      if (!companies[stock.company]) {
        companies[stock.company] = { count: 0, quantity: 0 }
      }
      companies[stock.company].count++
      companies[stock.company].quantity += stock.quantity || 0
    })

    doc.setFont(undefined, 'bold')
    doc.text('Company Breakdown:', 14, 95)
    doc.setFont(undefined, 'normal')

    let yPos = 105
    Object.entries(companies).forEach(([company, stats]) => {
      doc.text(
        `${company}: ${stats.count} entries, ${stats.quantity} total quantity`,
        20,
        yPos
      )
      yPos += 7
    })

    // Detailed Table
    const tableData = workerStocks.map((stock) => [
      format(new Date(stock.date), 'dd/MM/yyyy'),
      stock.material || 'N/A',
      stock.company || 'N/A',
      (stock.quantity || 0).toString(),
      stock.unit || 'N/A',
      stock.status || 'pending',
    ])

    autoTable(doc, {
      head: [['Date', 'Material', 'Company', 'Quantity', 'Unit', 'Status']],
      body: tableData,
      startY: yPos + 10,
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

    doc.save(
      `worker_${workerName.replace(
        /\s+/g,
        '_'
      )}_combined_material_stock_${format(new Date(), 'yyyy-MM-dd')}.pdf`
    )
  }

  // Download all workers' reports separately
  const downloadAllWorkerReports = () => {
    const workers = [
      ...new Set(filteredStocks.map((stock) => stock.workerName)),
    ]

    if (workers.length === 0) {
      Swal.fire('No Data', 'No workers found in current filter', 'info')
      return
    }

    Swal.fire({
      title: 'Generating Reports',
      text: `Generating ${workers.length} worker reports...`,
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading()

        // Generate reports with delay to prevent browser freeze
        workers.forEach((worker, index) => {
          setTimeout(() => {
            generateWorkerCombinedPDF(worker)

            if (index === workers.length - 1) {
              Swal.fire(
                'Success!',
                `Generated ${workers.length} worker reports`,
                'success'
              )
            }
          }, index * 500)
        })
      },
    })
  }

  // Single item delete
  const deleteSingleStock = async (stock) => {
    const result = await Swal.fire({
      title: 'Delete Material Stock Entry?',
      html: `
        <div class="text-left">
          <p><strong>Material:</strong> ${stock.material}</p>
          <p><strong>Company:</strong> ${stock.company}</p>
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

    // Detailed Stock Entries including phone numbers
    const currentY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 20 : 130

    doc.setFontSize(14)
    doc.setFont(undefined, 'bold')
    doc.text('Detailed Stock Entries:', 14, currentY)

    const detailTableData = filteredStocks.map((stock) => [
      format(new Date(stock.date), 'MMM dd, yyyy'),
      stock.material,
      stock.company,
      stock.quantity.toString(),
      stock.unit,
      stock.status,
      stock.workerName,
      stock.workerPhone || 'N/A',
    ])

    autoTable(doc, {
      head: [
        [
          'Date',
          'Material',
          'Company',
          'Quantity',
          'Unit',
          'Status',
          'Worker',
          'Phone',
        ],
      ],
      body: detailTableData,
      startY: currentY + 10,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [146, 64, 14] },
      columnStyles: {
        7: { cellWidth: 25 }, // Phone column
      },
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
          `  • ${entry.workerName} (${entry.workerPhone || 'No phone'}): ${
            entry.quantity
          } ${entry.unit} (${format(new Date(entry.date), 'MMM dd')}) - ${
            entry.company
          }`,
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

  // Filter stocks based on search term, status, company and date range
  const filteredStocks = stocks.filter((stock) => {
    const matchesSearch =
      stock.material?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      stock.workerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      stock.company?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      stock.workerPhone?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesStatus =
      filterStatus === 'all' || stock.status === filterStatus

    const matchesCompany =
      filterCompany === 'all' || stock.company === filterCompany

    return matchesSearch && matchesStatus && matchesCompany
  })

  return (
    <div className="min-h-screen p-2 sm:p-4 bg-amber-50">
      <div className="max-w-full mx-auto">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-amber-900 mb-4 sm:mb-6 lg:mb-8 text-center px-2">
          Admin Material Stock Management
        </h1>

        {/* Controls - Fully Responsive */}
        <div className="bg-white rounded-xl shadow-lg p-2 sm:p-4 mb-4 sm:mb-6 border border-amber-200">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-2 sm:gap-4">
            {/* Search */}
            <div className="col-span-1 sm:col-span-2 lg:col-span-1">
              <label className="block text-xs sm:text-sm font-medium text-amber-900 mb-1">
                Search
              </label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Material, worker, company..."
                className="w-full border border-amber-300 px-2 sm:px-3 py-2 rounded-lg focus:ring-2 focus:ring-amber-400 focus:outline-none text-xs sm:text-sm"
              />
            </div>

            {/* Status Filter */}
            <div>
              <label className="block text-xs sm:text-sm font-medium text-amber-900 mb-1">
                Status
              </label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full border border-amber-300 px-2 sm:px-3 py-2 rounded-lg focus:ring-2 focus:ring-amber-400 focus:outline-none text-xs sm:text-sm"
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>

            {/* Company Filter */}
            <div>
              <label className="block text-xs sm:text-sm font-medium text-amber-900 mb-1">
                Company
              </label>
              <select
                value={filterCompany}
                onChange={(e) => setFilterCompany(e.target.value)}
                className="w-full border border-amber-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-amber-400 text-sm"
              >
                <option value="all">All Companies</option>
                {uniqueCompanies.map((company, index) => (
                  <option key={company + index} value={company}>
                    {company}
                  </option>
                ))}
              </select>
            </div>

            {/* Date Range */}
            <div>
              <label className="block text-xs sm:text-sm font-medium text-amber-900 mb-1">
                Date Range
              </label>
              <button
                onClick={() => setShowDatePicker(!showDatePicker)}
                className="w-full border border-amber-300 px-2 sm:px-3 py-2 rounded-lg text-left text-xs sm:text-sm hover:bg-amber-50 truncate"
              >
                {format(dateRange[0].startDate, 'MMM dd')} -{' '}
                {format(dateRange[0].endDate, 'MMM dd')}
              </button>
            </div>

            {/* Download Buttons - Stack on small screens */}
            <div className="grid grid-cols-2 gap-2 sm:contents">
              <div className="sm:col-span-1">
                <label className="block text-xs sm:text-sm font-medium text-amber-900 mb-1 sm:invisible">
                  &nbsp;
                </label>
                <button
                  onClick={downloadStockReport}
                  className="w-full bg-blue-600 text-white py-2 px-2 sm:px-3 rounded-lg hover:bg-blue-700 transition text-xs sm:text-sm font-medium"
                >
                  <span className="inline">📄 Summary</span>
                </button>
              </div>

              <div className="sm:col-span-1">
                <label className="block text-xs sm:text-sm font-medium text-amber-900 mb-1 sm:invisible">
                  &nbsp;
                </label>
                <button
                  onClick={downloadDetailedReport}
                  className="w-full bg-green-600 text-white py-2 px-2 sm:px-3 rounded-lg hover:bg-green-700 transition text-xs sm:text-sm font-medium"
                >
                  <span className="inline">📋 Detailed</span>
                </button>
              </div>
            </div>

            {/* Worker Reports */}
            <div className="col-span-1 sm:col-span-2 lg:col-span-1">
              <label className="block text-xs sm:text-sm font-medium text-amber-900 mb-1 lg:invisible">
                &nbsp;
              </label>
              <button
                onClick={downloadAllWorkerReports}
                className="w-full bg-purple-600 text-white py-2 px-2 sm:px-3 rounded-lg hover:bg-purple-700 transition text-xs sm:text-sm font-medium"
              >
                <FaUser className="inline mr-1" />
                <span className="hidden sm:inline">Worker Reports</span>
                <span className="sm:hidden">Workers</span>
              </button>
            </div>

            {/* Bulk Delete */}
            <div className="col-span-1 sm:col-span-2 lg:col-span-1">
              <label className="block text-xs sm:text-sm font-medium text-amber-900 mb-1 lg:invisible">
                &nbsp;
              </label>
              <button
                onClick={showBulkDeleteModal}
                className="w-full bg-red-600 text-white py-2 px-2 sm:px-3 rounded-lg hover:bg-red-700 transition text-xs sm:text-sm font-medium"
              >
                <span className="hidden sm:inline">🗑️ Bulk Delete</span>
                <span className="sm:hidden">🗑️ Delete</span>
              </button>
            </div>
          </div>

          {/* Date Range Picker - Responsive */}
          {showDatePicker && (
            <div className="mt-4 flex flex-col items-center">
              <div className="scale-75 sm:scale-100 origin-center">
                <DateRangePicker
                  ranges={dateRange}
                  onChange={handleDateRangeChange}
                  showSelectionPreview={true}
                  moveRangeOnFirstSelection={false}
                  months={window.innerWidth < 640 ? 1 : 2}
                  direction={
                    window.innerWidth < 640 ? 'vertical' : 'horizontal'
                  }
                />
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={applyDateFilter}
                  className="bg-amber-600 text-white py-2 px-4 rounded-lg hover:bg-amber-700 transition text-xs sm:text-sm"
                >
                  Apply Filter
                </button>
                <button
                  onClick={() => setShowDatePicker(false)}
                  className="bg-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-400 transition text-xs sm:text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Selection Actions */}
        {selectedItems.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4 mb-4 sm:mb-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0">
              <span className="text-blue-900 font-medium text-sm">
                {selectedItems.length} item(s) selected
              </span>
              <button
                onClick={deleteSelectedItems}
                className="bg-red-600 text-white px-3 sm:px-4 py-2 rounded-lg hover:bg-red-700 transition text-xs sm:text-sm font-medium"
              >
                Delete Selected
              </button>
            </div>
          </div>
        )}

        {/* Stats Cards - Responsive Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 mb-4 sm:mb-6">
          <div className="bg-white rounded-lg p-3 sm:p-4 shadow border border-amber-200">
            <div className="text-amber-900 text-xs sm:text-sm font-medium">
              Total Entries
            </div>
            <div className="text-lg sm:text-xl lg:text-2xl font-bold text-amber-900">
              {filteredStocks.length}
            </div>
          </div>
          <div className="bg-white rounded-lg p-3 sm:p-4 shadow border border-amber-200">
            <div className="text-green-900 text-xs sm:text-sm font-medium">
              Approved
            </div>
            <div className="text-lg sm:text-xl lg:text-2xl font-bold text-green-900">
              {filteredStocks.filter((s) => s.status === 'approved').length}
            </div>
          </div>
          <div className="bg-white rounded-lg p-3 sm:p-4 shadow border border-amber-200">
            <div className="text-yellow-900 text-xs sm:text-sm font-medium">
              Pending
            </div>
            <div className="text-lg sm:text-xl lg:text-2xl font-bold text-yellow-900">
              {filteredStocks.filter((s) => s.status === 'pending').length}
            </div>
          </div>
          <div className="bg-white rounded-lg p-3 sm:p-4 shadow border border-amber-200">
            <div className="text-red-900 text-xs sm:text-sm font-medium">
              Rejected
            </div>
            <div className="text-lg sm:text-xl lg:text-2xl font-bold text-red-900">
              {filteredStocks.filter((s) => s.status === 'rejected').length}
            </div>
          </div>
        </div>

        {/* Submitted Stock Table - Responsive */}
        <div className="bg-white shadow-lg rounded-xl p-2 sm:p-4 lg:p-6 mb-4 sm:mb-6 border border-amber-200">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2 sm:gap-0">
            <h2 className="text-lg sm:text-xl font-semibold text-amber-900">
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
                <span className="text-xs sm:text-sm text-amber-900">
                  Select All
                </span>
              </label>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-amber-900"></div>
              <p className="mt-2 text-amber-900 text-sm">Loading...</p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-2 sm:mx-0">
              <div className="min-w-full inline-block align-middle">
                <table className="min-w-full text-xs sm:text-sm border-collapse border border-gray-300">
                  <thead className="bg-amber-100">
                    <tr>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 border border-gray-300 text-left font-semibold text-amber-900">
                        <span className="sr-only sm:not-sr-only">Select</span>
                        <span className="sm:hidden">✓</span>
                      </th>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 border border-gray-300 text-left font-semibold text-amber-900 min-w-[80px]">
                        Date
                      </th>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 border border-gray-300 text-left font-semibold text-amber-900 min-w-[60px]">
                        Material
                      </th>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 border border-gray-300 text-left font-semibold text-amber-900 min-w-[80px]">
                        Company
                      </th>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 border border-gray-300 text-left font-semibold text-amber-900 min-w-[60px]">
                        Qty
                      </th>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 border border-gray-300 text-left font-semibold text-amber-900 min-w-[50px]">
                        Unit
                      </th>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 border border-gray-300 text-left font-semibold text-amber-900 min-w-[70px]">
                        Status
                      </th>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 border border-gray-300 text-left font-semibold text-amber-900 min-w-[100px]">
                        Worker Name
                      </th>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 border border-gray-300 text-left font-semibold text-amber-900 min-w-[100px]">
                        Phone Number
                      </th>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 border border-gray-300 text-left font-semibold text-amber-900 min-w-[160px]">
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
                        <td className="px-2 sm:px-4 py-2 sm:py-3 border border-gray-300">
                          <input
                            type="checkbox"
                            checked={selectedItems.includes(stock._id)}
                            onChange={() => handleItemSelection(stock._id)}
                            className="rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                          />
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 border border-gray-300">
                          <div className="text-xs sm:text-sm">
                            {format(new Date(stock.date), 'MMM dd')}
                            <div className="text-xs text-gray-500 sm:hidden">
                              {format(new Date(stock.date), 'yyyy')}
                            </div>
                          </div>
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 border border-gray-300 font-medium">
                          <div
                            className="truncate max-w-[60px] sm:max-w-none"
                            title={stock.material}
                          >
                            {stock.material}
                          </div>
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 border border-gray-300 font-medium">
                          <div
                            className="truncate max-w-[80px] sm:max-w-none"
                            title={stock.company}
                          >
                            {stock.company}
                          </div>
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 border border-gray-300 text-right">
                          {stock.quantity}
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 border border-gray-300">
                          {stock.unit}
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 border border-gray-300">
                          <span
                            className={`px-1 sm:px-2 py-1 rounded-full text-xs font-semibold ${
                              stock.status === 'approved'
                                ? 'bg-green-100 text-green-800'
                                : stock.status === 'rejected'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-yellow-100 text-yellow-800'
                            }`}
                          >
                            <span className="sm:hidden">
                              {stock.status.charAt(0).toUpperCase()}
                            </span>
                            <span className="hidden sm:inline">
                              {stock.status.charAt(0).toUpperCase() +
                                stock.status.slice(1)}
                            </span>
                          </span>
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 border border-gray-300">
                          <div
                            className="truncate max-w-[100px] sm:max-w-none"
                            title={stock.workerName}
                          >
                            {stock.workerName}
                          </div>
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 border border-gray-300">
                          <div
                            className="truncate max-w-[100px]"
                            title={stock.workerPhone || 'N/A'}
                          >
                            {stock.workerPhone || 'N/A'}
                          </div>
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 border border-gray-300">
                          <div className="flex flex-col sm:flex-row gap-1 sm:gap-2">
                            {stock.status === 'pending' && (
                              <>
                                <button
                                  onClick={() =>
                                    updateStatus(stock._id, 'approved')
                                  }
                                  disabled={loading}
                                  className="bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700 disabled:opacity-50 text-xs font-medium"
                                >
                                  <FaCheck className="inline sm:hidden" />
                                  <span className="hidden sm:inline">
                                    ✓ Approve
                                  </span>
                                </button>
                                <button
                                  onClick={() =>
                                    updateStatus(stock._id, 'rejected')
                                  }
                                  disabled={loading}
                                  className="bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700 disabled:opacity-50 text-xs font-medium"
                                >
                                  <FaTimes className="inline sm:hidden" />
                                  <span className="hidden sm:inline">
                                    ✗ Reject
                                  </span>
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => generateIndividualStockPDF(stock)}
                              className="bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50 text-xs font-medium"
                              title="Download Individual PDF"
                            >
                              <FaFilePdf className="inline sm:hidden" />
                              <span className="hidden sm:inline">PDF</span>
                            </button>
                            <button
                              onClick={() =>
                                generateWorkerCombinedPDF(stock.workerName)
                              }
                              className="bg-purple-600 text-white px-2 py-1 rounded hover:bg-purple-700 disabled:opacity-50 text-xs font-medium"
                              title="Download Worker Combined PDF"
                            >
                              <FaUser className="inline sm:hidden" />
                              <span className="hidden sm:inline">Worker</span>
                            </button>
                            <button
                              onClick={() => deleteSingleStock(stock)}
                              className="text-red-600 hover:text-red-800 transition-colors p-1"
                              title="Delete Entry"
                            >
                              <FaTrash className="w-3 h-3 sm:w-4 sm:h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {filteredStocks.length === 0 && !loading && (
            <div className="text-center py-12">
              <div className="text-gray-400 mb-4">
                <svg
                  className="mx-auto h-12 w-12 sm:h-16 sm:w-16"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-gray-500 text-sm sm:text-lg">
                No material stock entries found
              </p>
            </div>
          )}
        </div>

        {/* Combined Stock Summary - Responsive */}
        <div className="bg-white shadow-lg rounded-xl p-2 sm:p-4 lg:p-6 border border-amber-200">
          <h2 className="text-lg sm:text-xl font-semibold mb-4 text-amber-900">
            Combined Approved Material Stock
          </h2>
          {Object.keys(combinedStock).length === 0 ? (
            <p className="text-gray-500 text-sm sm:text-base">
              No approved material stock yet.
            </p>
          ) : (
            <div className="overflow-x-auto -mx-2 sm:mx-0">
              <table className="min-w-full text-xs sm:text-sm border-collapse border border-gray-300">
                <thead className="bg-amber-100">
                  <tr>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 border border-gray-300 text-left font-semibold text-amber-900">
                      Material Type
                    </th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 border border-gray-300 text-left font-semibold text-amber-900">
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
                      <td className="px-2 sm:px-4 py-2 sm:py-3 border border-gray-300 font-medium">
                        {material}
                      </td>
                      <td className="px-2 sm:px-4 py-2 sm:py-3 border border-gray-300 font-bold text-green-600">
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
    </div>
  )
}

// Bulk Delete Modal Component - Responsive
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
      <div className="bg-white rounded-2xl max-w-sm sm:max-w-md w-full p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl sm:text-2xl font-bold text-amber-900 mb-4">
          Bulk Delete Options
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-amber-900 mb-1">
              Date Range
            </label>
            <div className="scale-75 sm:scale-100 origin-left">
              <DateRangePicker
                ranges={deleteRange}
                onChange={(ranges) => setDeleteRange([ranges.selection])}
                showSelectionPreview={false}
                months={1}
                direction="vertical"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-amber-900 mb-1">
              Status Filter
            </label>
            <select
              value={deleteStatus}
              onChange={(e) => setDeleteStatus(e.target.value)}
              className="w-full border border-amber-300 px-3 py-2 rounded-lg text-sm"
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
              placeholder="Enter material type..."
              className="w-full border border-amber-300 px-3 py-2 rounded-lg text-sm"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-400 transition text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            className="flex-1 bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition text-sm"
          >
            Delete Items
          </button>
        </div>
      </div>
    </div>
  )
}
