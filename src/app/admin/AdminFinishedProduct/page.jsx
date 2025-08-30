'use client'

import { useState, useEffect } from 'react'
import { DateRangePicker } from 'react-date-range'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { format } from 'date-fns'
import Swal from 'sweetalert2'
import 'react-date-range/dist/styles.css'
import 'react-date-range/dist/theme/default.css'

export default function AdminFinishedProductsPage() {
  const [finishedProducts, setFinishedProducts] = useState([])
  const [loading, setLoading] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [dateRange, setDateRange] = useState([
    {
      startDate: new Date(new Date().setMonth(new Date().getMonth() - 1)),
      endDate: new Date(),
      key: 'selection',
    },
  ])

  const fetchFinishedProducts = async (customRange = null) => {
    setLoading(true)
    try {
      const range = customRange || dateRange[0]
      const params = new URLSearchParams({
        startDate: format(range.startDate, 'yyyy-MM-dd'),
        endDate: format(range.endDate, 'yyyy-MM-dd'),
      })

      const res = await fetch(`/api/stock/finished_products?${params}`)
      if (res.ok) {
        const data = await res.json()
        setFinishedProducts(data)
      } else {
        Swal.fire('Error', 'Failed to fetch finished products', 'error')
      }
    } catch (err) {
      console.error(err)
      Swal.fire('Error', 'An error occurred', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchFinishedProducts()
  }, [])

  const handleDateRangeChange = (ranges) => {
    setDateRange([ranges.selection])
  }

  const applyDateFilter = () => {
    fetchFinishedProducts()
    setShowDatePicker(false)
  }

  // Delete finished product function
  const deleteFinishedProduct = async (product) => {
    const result = await Swal.fire({
      title: 'Delete Finished Product?',
      html: `
        <div class="text-left">
          <p><strong>Product:</strong> ${product.productName}</p>
          <p><strong>Finished Date:</strong> ${format(
            new Date(product.finishedAt),
            'MMM dd, yyyy'
          )}</p>
          <p><strong>Fulfilled Quantity:</strong> ${
            product.fulfilledQuantity || 0
          }</p>
          <p class="text-red-600 font-semibold mt-3">⚠️ This will permanently delete this finished product record!</p>
          <p class="text-sm text-gray-600 mt-2">Note: This will NOT affect the original production job.</p>
        </div>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Yes, Delete It!',
      cancelButtonText: 'Cancel',
    })

    if (result.isConfirmed) {
      try {
        const response = await fetch(
          `/api/stock/finished_products?id=${product._id}`,
          {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
              role: 'admin',
            },
          }
        )

        if (response.ok) {
          Swal.fire(
            'Deleted!',
            `"${product.productName}" has been deleted successfully.`,
            'success'
          )
          fetchFinishedProducts() // Refresh the list
        } else {
          const error = await response.json()
          Swal.fire(
            'Error',
            error.message || 'Failed to delete finished product',
            'error'
          )
        }
      } catch (err) {
        console.error('Error deleting finished product:', err)
        Swal.fire('Error', 'An error occurred while deleting', 'error')
      }
    }
  }

  const downloadAllProductsReport = () => {
    const doc = new jsPDF()

    // Title
    doc.setFontSize(20)
    doc.text('Finished Products Report', 14, 15)

    // Date range
    doc.setFontSize(12)
    doc.text(
      `Period: ${format(dateRange[0].startDate, 'MMM dd, yyyy')} - ${format(
        dateRange[0].endDate,
        'MMM dd, yyyy'
      )}`,
      14,
      25
    )

    // Summary
    doc.text(`Total Products: ${filteredProducts.length}`, 14, 35)
    doc.text(
      `Total Fulfilled Quantity: ${filteredProducts.reduce(
        (sum, p) => sum + (p.fulfilledQuantity || 0),
        0
      )}`,
      14,
      45
    )

    // Table data
    const tableData = filteredProducts.map((product) => [
      product.productName,
      product.originalQuantity?.toString() || '0',
      product.fulfilledQuantity?.toString() || '0',
      format(new Date(product.finishedAt), 'MMM dd, yyyy'),
      product.status || 'Completed',
    ])

    autoTable(doc, {
      head: [
        [
          'Product Name',
          'Original Qty',
          'Fulfilled Qty',
          'Finished Date',
          'Status',
        ],
      ],
      body: tableData,
      startY: 55,
      styles: { fontSize: 10 },
      headStyles: { fillColor: [146, 64, 14] },
    })

    const fileName = `finished_products_report_${format(
      new Date(),
      'yyyy-MM-dd'
    )}.pdf`
    doc.save(fileName)
  }

  const downloadDetailedReport = () => {
    const doc = new jsPDF()

    doc.setFontSize(20)
    doc.text('Detailed Finished Products Report', 14, 15)

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

    filteredProducts.forEach((product, index) => {
      if (yPosition > 250) {
        doc.addPage()
        yPosition = 20
      }

      // Product header
      doc.setFontSize(14)
      doc.setFont(undefined, 'bold')
      doc.text(`${index + 1}. ${product.productName}`, 14, yPosition)
      yPosition += 10

      doc.setFontSize(10)
      doc.setFont(undefined, 'normal')

      // Product details
      doc.text(
        `Original Quantity: ${product.originalQuantity || 0}`,
        20,
        yPosition
      )
      yPosition += 5
      doc.text(
        `Fulfilled Quantity: ${product.fulfilledQuantity || 0}`,
        20,
        yPosition
      )
      yPosition += 5
      doc.text(
        `Finished Date: ${format(
          new Date(product.finishedAt),
          'MMM dd, yyyy HH:mm'
        )}`,
        20,
        yPosition
      )
      yPosition += 5

      if (product.description) {
        doc.text(`Description: ${product.description}`, 20, yPosition)
        yPosition += 5
      }

      // Worker contributions
      if (
        product.workerContributions &&
        product.workerContributions.length > 0
      ) {
        doc.text('Worker Contributions:', 20, yPosition)
        yPosition += 5

        product.workerContributions.forEach((contrib) => {
          doc.text(
            `  • ${contrib.workerName}: ${
              contrib.deliveredQuantity || contrib.quantity
            } pieces`,
            25,
            yPosition
          )
          yPosition += 4
          if (contrib.note) {
            doc.text(`    Note: ${contrib.note}`, 25, yPosition)
            yPosition += 4
          }
        })
      }

      yPosition += 10
    })

    const fileName = `detailed_finished_products_report_${format(
      new Date(),
      'yyyy-MM-dd'
    )}.pdf`
    doc.save(fileName)
  }

  // Filter products based on search term
  const filteredProducts = finishedProducts.filter(
    (product) =>
      product.productName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.description?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="min-h-screen p-4 bg-amber-50">
      <h1 className="text-2xl font-bold text-amber-900 mb-6 text-center">
        Finished Products
      </h1>

      {/* Controls */}
      <div className="bg-white rounded-xl shadow-lg p-4 mb-6 border border-amber-200">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-amber-900 mb-1">
              Search Products
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Product name..."
              className="w-full border border-amber-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-amber-400 focus:outline-none text-sm"
            />
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
              onClick={downloadAllProductsReport}
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

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg p-4 shadow border border-amber-200">
          <div className="text-amber-900 text-sm font-medium">
            Total Products
          </div>
          <div className="text-2xl font-bold text-amber-900">
            {filteredProducts.length}
          </div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow border border-amber-200">
          <div className="text-blue-900 text-sm font-medium">
            Total Fulfilled
          </div>
          <div className="text-2xl font-bold text-blue-900">
            {filteredProducts.reduce(
              (sum, p) => sum + (p.fulfilledQuantity || 0),
              0
            )}
          </div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow border border-amber-200">
          <div className="text-green-900 text-sm font-medium">This Month</div>
          <div className="text-2xl font-bold text-green-900">
            {
              finishedProducts.filter(
                (p) =>
                  new Date(p.finishedAt).getMonth() === new Date().getMonth()
              ).length
            }
          </div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow border border-amber-200">
          <div className="text-purple-900 text-sm font-medium">
            Avg per Product
          </div>
          <div className="text-2xl font-bold text-purple-900">
            {filteredProducts.length > 0
              ? Math.round(
                  filteredProducts.reduce(
                    (sum, p) => sum + (p.fulfilledQuantity || 0),
                    0
                  ) / filteredProducts.length
                )
              : 0}
          </div>
        </div>
      </div>

      {/* Products List */}
      {loading ? (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-amber-900"></div>
          <p className="mt-2 text-amber-900">Loading...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProducts.map((product) => (
            <div
              key={product._id}
              className="bg-white rounded-xl shadow-md border border-amber-200 hover:shadow-lg transition overflow-hidden"
            >
              {product.image && (
                <img
                  src={product.image}
                  alt={product.productName}
                  className="w-full h-64 object-cover bg-gray-50"
                />
              )}

              <div className="p-4">
                {/* Header with Delete Button */}
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-amber-900 text-lg flex-1">
                    {product.productName}
                  </h3>
                  <button
                    onClick={() => deleteFinishedProduct(product)}
                    className="text-red-600 hover:text-red-800 transition-colors p-1"
                    title="Delete Finished Product"
                  >
                    <svg
                      className="w-5 h-5"
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

                {product.description && (
                  <p className="text-gray-600 text-sm mb-3 line-clamp-2">
                    {product.description}
                  </p>
                )}

                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Original Qty:</span>
                    <span className="font-semibold">
                      {product.originalQuantity}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Fulfilled:</span>
                    <span className="font-semibold text-green-600">
                      {product.fulfilledQuantity}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Finished:</span>
                    <span className="text-amber-900 font-medium">
                      {format(new Date(product.finishedAt), 'MMM dd, yyyy')}
                    </span>
                  </div>
                </div>

                {/* Worker Contributions */}
                {product.workerContributions &&
                  product.workerContributions.length > 0 && (
                    <div className="border-t pt-3">
                      <p className="text-xs font-semibold text-gray-700 mb-2">
                        Worker Contributions:
                      </p>
                      <div className="space-y-1">
                        {product.workerContributions.map((contrib, index) => (
                          <div key={index} className="text-xs text-gray-600">
                            <span className="font-medium">
                              {contrib.workerName}:
                            </span>{' '}
                            {contrib.deliveredQuantity || contrib.quantity} pcs
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
              </div>
            </div>
          ))}
        </div>
      )}

      {filteredProducts.length === 0 && !loading && (
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
          <p className="text-gray-500 text-lg">No finished products found</p>
        </div>
      )}
    </div>
  )
}
