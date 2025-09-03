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
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [sortBy, setSortBy] = useState('finishedAt')
  const [sortOrder, setSortOrder] = useState('desc')
  const [filterBy, setFilterBy] = useState('all')

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

  // Show product details modal
  const showProductDetails = (product) => {
    setSelectedProduct(product)
    setShowDetailModal(true)
  }

  // Enhanced Summary Report with Complete Information
  const downloadSummaryReport = () => {
    const doc = new jsPDF('landscape', 'mm', 'a4')

    // Header
    doc.setFontSize(20)
    doc.setFont(undefined, 'bold')
    doc.text('ABU BAKKAR LEATHERS - FINISHED PRODUCTS SUMMARY', 148, 20, {
      align: 'center',
    })

    // Report metadata
    doc.setFontSize(10)
    doc.setFont(undefined, 'normal')
    doc.text(`Generated: ${format(new Date(), 'MMMM dd, yyyy HH:mm')}`, 20, 30)
    doc.text(
      `Period: ${format(dateRange[0].startDate, 'MMMM dd, yyyy')} - ${format(
        dateRange[0].endDate,
        'MMMM dd, yyyy'
      )}`,
      20,
      35
    )
    doc.text(`Total Products: ${filteredProducts.length}`, 20, 40)

    // Summary statistics
    const totalFulfilled = filteredProducts.reduce(
      (sum, p) => sum + (p.fulfilledQuantity || 0),
      0
    )
    const totalMaterialCost = filteredProducts.reduce((sum, p) => {
      const cost =
        p.materialCostBreakdown?.totalForProduction ||
        parseFloat(p.totalProductionMaterialCost) ||
        0
      return sum + cost
    }, 0)
    const uniqueCompanies = [
      ...new Set(filteredProducts.map((p) => p.workerCompany).filter(Boolean)),
    ].length

    doc.text(
      `Total Units Produced: ${totalFulfilled.toLocaleString()}`,
      150,
      30
    )
    doc.text(
      `Total Material Investment: ${totalMaterialCost.toLocaleString()}`,
      150,
      35
    )
    doc.text(`Worker Companies: ${uniqueCompanies}`, 150, 40)

    // Enhanced table data with all important information
    const tableData = filteredProducts.map((product) => {
      const materialCostPerUnit =
        product.materialCostBreakdown?.perUnit || product.materialCost || 0
      const totalProductionCost =
        product.materialCostBreakdown?.totalForProduction ||
        parseFloat(product.totalProductionMaterialCost) ||
        0
      const materialsCount = product.materials?.length || 0

      return [
        product.productName || 'N/A',
        product.originalQuantity?.toString() || '0',
        product.fulfilledQuantity?.toString() || '0',
        product.remainingQuantity?.toString() || '0',
        `${materialCostPerUnit.toFixed(2)}`,
        `${totalProductionCost.toFixed(2)}`,
        materialsCount.toString(),
        product.workerCompany || 'N/A',
        format(new Date(product.finishedAt), 'dd/MM/yy'),
      ]
    })

    autoTable(doc, {
      head: [
        [
          'Product Name',
          'Original',
          'Fulfilled',
          'Remaining',
          'Unit Cost',
          'Total Cost',
          'Materials',
          'Company',
          'Date',
        ],
      ],
      body: tableData,
      startY: 50,
      styles: {
        fontSize: 8,
        cellPadding: 2,
      },
      headStyles: {
        fillColor: [146, 64, 14],
        textColor: [255, 255, 255],
        fontSize: 9,
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 40 },
        1: { cellWidth: 20, halign: 'center' },
        2: { cellWidth: 20, halign: 'center' },
        3: { cellWidth: 20, halign: 'center' },
        4: { cellWidth: 25, halign: 'right' },
        5: { cellWidth: 30, halign: 'right' },
        6: { cellWidth: 20, halign: 'center' },
        7: { cellWidth: 35 },
        8: { cellWidth: 20, halign: 'center' },
      },
      alternateRowStyles: { fillColor: [252, 245, 227] },
    })

    // Footer
    const pageCount = doc.internal.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(8)
      doc.text(
        `Abu Bakkar Leathers - Summary Report | Page ${i} of ${pageCount}`,
        148,
        200,
        { align: 'center' }
      )
    }

    doc.save(
      `finished_products_summary_${format(new Date(), 'yyyy-MM-dd')}.pdf`
    )
  }

  // Comprehensive Detailed Report with ALL Information
  const downloadDetailedReport = () => {
    if (filteredProducts.length === 0) {
      Swal.fire('Warning', 'No products to include in the report', 'warning')
      return
    }

    const doc = new jsPDF()

    // Title page
    doc.setFontSize(24)
    doc.setFont(undefined, 'bold')
    doc.text('ABU BAKKAR LEATHERS', 105, 40, { align: 'center' })

    doc.setFontSize(18)
    doc.text('FINISHED PRODUCTS - DETAILED REPORT', 105, 55, {
      align: 'center',
    })

    doc.setFontSize(12)
    doc.setFont(undefined, 'normal')
    doc.text(
      `Report Generated: ${format(new Date(), 'MMMM dd, yyyy HH:mm')}`,
      105,
      70,
      { align: 'center' }
    )
    doc.text(
      `Period: ${format(dateRange[0].startDate, 'MMMM dd, yyyy')} - ${format(
        dateRange[0].endDate,
        'MMMM dd, yyyy'
      )}`,
      105,
      80,
      { align: 'center' }
    )

    // Executive Summary
    const totalProducts = filteredProducts.length
    const totalFulfilled = filteredProducts.reduce(
      (sum, p) => sum + (p.fulfilledQuantity || 0),
      0
    )
    const totalMaterialCost = filteredProducts.reduce((sum, p) => {
      const cost =
        p.materialCostBreakdown?.totalForProduction ||
        parseFloat(p.totalProductionMaterialCost) ||
        0
      return sum + cost
    }, 0)
    const uniqueCompanies = [
      ...new Set(filteredProducts.map((p) => p.workerCompany).filter(Boolean)),
    ]

    let yPos = 100
    doc.setFontSize(16)
    doc.setFont(undefined, 'bold')
    doc.text('EXECUTIVE SUMMARY', 20, yPos)
    yPos += 15

    doc.setFontSize(11)
    doc.setFont(undefined, 'normal')
    doc.text(`• Total Products Completed: ${totalProducts}`, 25, yPos)
    yPos += 8
    doc.text(
      `• Total Units Produced: ${totalFulfilled.toLocaleString()} pieces`,
      25,
      yPos
    )
    yPos += 8
    doc.text(
      `• Total Material Investment: ${totalMaterialCost.toLocaleString()}`,
      25,
      yPos
    )
    yPos += 8
    doc.text(
      `• Average Material Cost per Unit: ${
        totalProducts > 0
          ? (totalMaterialCost / totalFulfilled).toFixed(2)
          : '0'
      }`,
      25,
      yPos
    )
    yPos += 8
    doc.text(`• Worker Companies Involved: ${uniqueCompanies.length}`, 25, yPos)
    yPos += 8
    doc.text(`  Companies: ${uniqueCompanies.join(', ')}`, 25, yPos)

    doc.addPage()

    // Detailed product breakdown
    yPos = 20
    filteredProducts.forEach((product, index) => {
      // Check if we need a new page
      if (yPos > 240) {
        doc.addPage()
        yPos = 20
      }

      // Product header
      doc.setFontSize(16)
      doc.setFont(undefined, 'bold')
      doc.text(`${index + 1}. ${product.productName}`, 20, yPos)
      yPos += 15

      // Basic product information table
      const productInfoData = [
        ['Description', product.description || 'No description available'],
        ['Original Quantity', (product.originalQuantity || 0).toString()],
        ['Fulfilled Quantity', (product.fulfilledQuantity || 0).toString()],
        ['Remaining Quantity', (product.remainingQuantity || 0).toString()],
        [
          'Finished Date',
          format(new Date(product.finishedAt), 'MMMM dd, yyyy HH:mm'),
        ],
        ['Main Company', product.workerCompany || 'N/A'],
      ]

      autoTable(doc, {
        body: productInfoData,
        startY: yPos,
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 3 },
        columnStyles: {
          0: { cellWidth: 40, fontStyle: 'bold', fillColor: [245, 245, 245] },
          1: { cellWidth: 130 },
        },
        margin: { left: 25 },
      })

      yPos = doc.lastAutoTable.finalY + 10

      // Materials breakdown
      if (product.materials && product.materials.length > 0) {
        if (yPos > 220) {
          doc.addPage()
          yPos = 20
        }

        doc.setFontSize(12)
        doc.setFont(undefined, 'bold')
        doc.text('MATERIALS USED:', 25, yPos)
        yPos += 8

        // Materials table
        const materialsData = product.materials.map((material) => [
          material.name,
          `${material.price.toFixed(2)}`,
        ])

        // Calculate total from materials
        const calculatedTotal = product.materials.reduce(
          (sum, material) => sum + (parseFloat(material.price) || 0),
          0
        )
        const actualPerUnitCost =
          product.materialCostBreakdown?.perUnit || calculatedTotal
        const totalProductionCost =
          product.materialCostBreakdown?.totalForProduction ||
          actualPerUnitCost * product.fulfilledQuantity

        // Add total rows
        materialsData.push(['', '']) // Empty row
        materialsData.push([
          'TOTAL COST PER UNIT:',
          `${actualPerUnitCost.toFixed(2)}`,
        ])
        materialsData.push([
          'TOTAL PRODUCTION COST:',
          `${totalProductionCost.toFixed(2)}`,
        ])

        autoTable(doc, {
          head: [['Material Name', 'Price per Unit']],
          body: materialsData,
          startY: yPos,
          theme: 'striped',
          styles: { fontSize: 9, cellPadding: 3 },
          headStyles: { fillColor: [52, 152, 219], textColor: [255, 255, 255] },
          columnStyles: {
            0: { cellWidth: 100 },
            1: { cellWidth: 40, halign: 'right' },
          },
          margin: { left: 30 },
          didParseCell: function (data) {
            // Style the total rows
            if (
              data.row.index >= materialsData.length - 2 &&
              data.row.index < materialsData.length
            ) {
              data.cell.styles.fontStyle = 'bold'
              data.cell.styles.fillColor =
                data.row.index === materialsData.length - 1
                  ? [46, 125, 50]
                  : [255, 235, 59]
              if (data.row.index === materialsData.length - 1) {
                data.cell.styles.textColor = [255, 255, 255]
              }
            }
          },
        })

        yPos = doc.lastAutoTable.finalY + 10
      }

      // Worker contributions
      if (
        product.workerContributions &&
        product.workerContributions.length > 0
      ) {
        if (yPos > 200) {
          doc.addPage()
          yPos = 20
        }

        doc.setFontSize(12)
        doc.setFont(undefined, 'bold')
        doc.text('WORKER CONTRIBUTIONS:', 25, yPos)
        yPos += 8

        const workerData = product.workerContributions.map((contrib) => [
          contrib.workerName || 'N/A',
          contrib.workerCompany || 'N/A',
          (contrib.deliveredQuantity || contrib.quantity || 0).toString(),
          contrib.materialCostForWorker
            ? `${contrib.materialCostForWorker}`
            : 'N/A',
          contrib.note || 'No notes',
        ])

        autoTable(doc, {
          head: [
            ['Worker Name', 'Company', 'Quantity', 'Material Cost', 'Notes'],
          ],
          body: workerData,
          startY: yPos,
          theme: 'striped',
          styles: { fontSize: 8, cellPadding: 2 },
          headStyles: { fillColor: [155, 89, 182], textColor: [255, 255, 255] },
          columnStyles: {
            0: { cellWidth: 35 },
            1: { cellWidth: 30 },
            2: { cellWidth: 20, halign: 'center' },
            3: { cellWidth: 25, halign: 'right' },
            4: { cellWidth: 60 },
          },
          margin: { left: 30 },
        })

        yPos = doc.lastAutoTable.finalY + 15
      } else {
        doc.setFontSize(10)
        doc.setFont(undefined, 'italic')
        doc.text('No worker contribution details available', 30, yPos)
        yPos += 15
      }

      // Separator line
      doc.setDrawColor(200, 200, 200)
      doc.setLineWidth(0.5)
      doc.line(20, yPos, 190, yPos)
      yPos += 10
    })

    // Add page numbers
    const pageCount = doc.internal.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(8)
      doc.setTextColor(100)
      doc.text(
        `Abu Bakkar Leathers - Detailed Report | Page ${i} of ${pageCount}`,
        105,
        285,
        { align: 'center' }
      )
    }

    doc.save(
      `finished_products_detailed_${format(new Date(), 'yyyy-MM-dd')}.pdf`
    )
  }

  // Delete finished product function
  const deleteFinishedProduct = async (product) => {
    const materialCost =
      product.materialCostBreakdown?.totalForProduction ||
      parseFloat(product.totalProductionMaterialCost) ||
      0

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
          <p><strong>Material Investment:</strong> ৳${materialCost.toFixed(
            2
          )}</p>
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
          fetchFinishedProducts()
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

  // Enhanced filtering and sorting
  const getFilteredAndSortedProducts = () => {
    let filtered = finishedProducts.filter((product) => {
      const matchesSearch =
        product.productName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.workerCompany?.toLowerCase().includes(searchTerm.toLowerCase())

      if (filterBy === 'all') return matchesSearch
      if (filterBy === 'high-volume')
        return matchesSearch && (product.fulfilledQuantity || 0) >= 100
      if (filterBy === 'low-volume')
        return matchesSearch && (product.fulfilledQuantity || 0) < 100

      const materialCost =
        product.materialCostBreakdown?.totalForProduction ||
        parseFloat(product.totalProductionMaterialCost) ||
        0
      if (filterBy === 'high-cost')
        return matchesSearch && materialCost >= 10000
      if (filterBy === 'recent')
        return (
          matchesSearch &&
          new Date(product.finishedAt) >
            new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        )

      return matchesSearch
    })

    return filtered.sort((a, b) => {
      let aVal, bVal

      switch (sortBy) {
        case 'productName':
          aVal = a.productName || ''
          bVal = b.productName || ''
          break
        case 'fulfilledQuantity':
          aVal = a.fulfilledQuantity || 0
          bVal = b.fulfilledQuantity || 0
          break
        case 'materialCost':
          aVal =
            a.materialCostBreakdown?.totalForProduction ||
            parseFloat(a.totalProductionMaterialCost) ||
            0
          bVal =
            b.materialCostBreakdown?.totalForProduction ||
            parseFloat(b.totalProductionMaterialCost) ||
            0
          break
        case 'finishedAt':
        default:
          aVal = new Date(a.finishedAt)
          bVal = new Date(b.finishedAt)
          break
      }

      if (sortOrder === 'asc') {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0
      } else {
        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0
      }
    })
  }

  const filteredProducts = getFilteredAndSortedProducts()

  // Calculate enhanced statistics
  const totalMaterialCost = filteredProducts.reduce((sum, p) => {
    const cost =
      p.materialCostBreakdown?.totalForProduction ||
      parseFloat(p.totalProductionMaterialCost) ||
      0
    return sum + cost
  }, 0)
  const uniqueCompanies = [
    ...new Set(filteredProducts.map((p) => p.workerCompany).filter(Boolean)),
  ]
  const totalMaterialsUsed = filteredProducts.reduce(
    (sum, p) => sum + (p.materials?.length || 0),
    0
  )

  return (
    <div className="min-h-screen p-4 bg-amber-50">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-amber-900 mb-6 text-center">
          📋 Finished Products Dashboard
        </h1>

        {/* Enhanced Controls Panel */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6 border border-amber-200">
          <div className="grid grid-cols-1 lg:grid-cols-6 gap-4 items-end">
            {/* Search */}
            <div className="lg:col-span-2">
              <label className="block text-sm font-medium text-amber-900 mb-1">
                🔍 Search Products
              </label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Product, company, or description..."
                className="w-full border border-amber-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-amber-400 focus:outline-none text-sm"
              />
            </div>

            {/* Filter */}
            <div>
              <label className="block text-sm font-medium text-amber-900 mb-1">
                🎯 Filter
              </label>
              <select
                value={filterBy}
                onChange={(e) => setFilterBy(e.target.value)}
                className="w-full border border-amber-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-amber-400 focus:outline-none text-sm"
              >
                <option value="all">All Products</option>
                <option value="high-volume">High Volume (≥100)</option>
                <option value="low-volume">Low Volume (&lt;100)</option>
                <option value="high-cost">High Cost (≥৳10k)</option>
                <option value="recent">Recent (7 days)</option>
              </select>
            </div>

            {/* Sort */}
            <div>
              <label className="block text-sm font-medium text-amber-900 mb-1">
                📊 Sort By
              </label>
              <select
                value={`${sortBy}-${sortOrder}`}
                onChange={(e) => {
                  const [field, order] = e.target.value.split('-')
                  setSortBy(field)
                  setSortOrder(order)
                }}
                className="w-full border border-amber-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-amber-400 focus:outline-none text-sm"
              >
                <option value="finishedAt-desc">Newest First</option>
                <option value="finishedAt-asc">Oldest First</option>
                <option value="productName-asc">Name A-Z</option>
                <option value="productName-desc">Name Z-A</option>
                <option value="fulfilledQuantity-desc">Highest Volume</option>
                <option value="materialCost-desc">Highest Cost</option>
              </select>
            </div>

            {/* Date Range */}
            <div>
              <label className="block text-sm font-medium text-amber-900 mb-1">
                📅 Date Range
              </label>
              <button
                onClick={() => setShowDatePicker(!showDatePicker)}
                className="w-full border border-amber-300 px-3 py-2 rounded-lg text-left text-sm hover:bg-amber-50 transition"
              >
                {format(dateRange[0].startDate, 'MMM dd')} -{' '}
                {format(dateRange[0].endDate, 'MMM dd')}
              </button>
            </div>

            {/* Export Buttons */}
            <div className="flex gap-2">
              <button
                onClick={downloadSummaryReport}
                className="flex-1 bg-blue-600 text-white py-2 px-3 rounded-lg hover:bg-blue-700 transition text-sm font-medium"
                title="Download Summary Report"
              >
                📄 Summary
              </button>
              <button
                onClick={downloadDetailedReport}
                className="flex-1 bg-green-600 text-white py-2 px-3 rounded-lg hover:bg-green-700 transition text-sm font-medium"
                title="Download Detailed Report"
              >
                📋 Detailed
              </button>
            </div>
          </div>

          {/* Date Range Picker */}
          {showDatePicker && (
            <div className="mt-6 flex flex-col items-center bg-gray-50 rounded-lg p-4">
              <DateRangePicker
                ranges={dateRange}
                onChange={handleDateRangeChange}
                showSelectionPreview={true}
                moveRangeOnFirstSelection={false}
                months={2}
                direction="horizontal"
              />
              <div className="mt-4 flex gap-3">
                <button
                  onClick={applyDateFilter}
                  className="bg-amber-600 text-white py-2 px-6 rounded-lg hover:bg-amber-700 transition font-medium"
                >
                  Apply Filter
                </button>
                <button
                  onClick={() => setShowDatePicker(false)}
                  className="bg-gray-300 text-gray-700 py-2 px-6 rounded-lg hover:bg-gray-400 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Enhanced Stats Dashboard */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200 text-center">
            <div className="text-2xl mb-1">📦</div>
            <div className="text-amber-900 text-xs font-medium">
              Total Products
            </div>
            <div className="text-xl font-bold text-amber-900">
              {filteredProducts.length}
            </div>
          </div>

          <div className="bg-white rounded-lg p-4 shadow-md border border-blue-200 text-center">
            <div className="text-2xl mb-1">🏭</div>
            <div className="text-blue-900 text-xs font-medium">
              Units Produced
            </div>
            <div className="text-xl font-bold text-blue-900">
              {filteredProducts
                .reduce((sum, p) => sum + (p.fulfilledQuantity || 0), 0)
                .toLocaleString()}
            </div>
          </div>

          <div className="bg-white rounded-lg p-4 shadow-md border border-green-200 text-center">
            <div className="text-2xl mb-1">💰</div>
            <div className="text-green-900 text-xs font-medium">
              Material Cost
            </div>
            <div className="text-xl font-bold text-green-900">
              ৳{totalMaterialCost.toLocaleString()}
            </div>
          </div>

          <div className="bg-white rounded-lg p-4 shadow-md border border-purple-200 text-center">
            <div className="text-2xl mb-1">🏢</div>
            <div className="text-purple-900 text-xs font-medium">Companies</div>
            <div className="text-xl font-bold text-purple-900">
              {uniqueCompanies.length}
            </div>
          </div>

          <div className="bg-white rounded-lg p-4 shadow-md border border-orange-200 text-center">
            <div className="text-2xl mb-1">🧱</div>
            <div className="text-orange-900 text-xs font-medium">
              Materials Used
            </div>
            <div className="text-xl font-bold text-orange-900">
              {totalMaterialsUsed}
            </div>
          </div>

          <div className="bg-white rounded-lg p-4 shadow-md border border-red-200 text-center">
            <div className="text-2xl mb-1">📊</div>
            <div className="text-red-900 text-xs font-medium">
              Avg per Product
            </div>
            <div className="text-xl font-bold text-red-900">
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

        {/* Products Grid */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-amber-900 mb-4"></div>
            <p className="text-amber-900 font-medium">
              Loading finished products...
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProducts.map((product) => {
              // Calculate correct material costs
              const materialCostPerUnit =
                product.materialCostBreakdown?.perUnit ||
                product.materials?.reduce(
                  (sum, m) => sum + (parseFloat(m.price) || 0),
                  0
                ) ||
                0
              const totalProductionCost =
                product.materialCostBreakdown?.totalForProduction ||
                materialCostPerUnit * (product.fulfilledQuantity || 0)

              return (
                <div
                  key={product._id}
                  className="bg-white rounded-xl shadow-md border border-amber-200 hover:shadow-xl transition-all duration-300 overflow-hidden"
                >
                  {/* Product Image */}
                  {product.image && (
                    <div className="relative">
                      <img
                        src={product.image}
                        alt={product.productName}
                        className="w-full h-48 object-cover"
                      />
                      <div className="absolute top-2 right-2 flex gap-1">
                        <button
                          onClick={() => showProductDetails(product)}
                          className="bg-blue-600 text-white p-2 rounded-full hover:bg-blue-700 transition"
                          title="View Details"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                            <path
                              fillRule="evenodd"
                              d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </button>
                        <button
                          onClick={() => deleteFinishedProduct(product)}
                          className="bg-red-600 text-white p-2 rounded-full hover:bg-red-700 transition"
                          title="Delete Product"
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
                    </div>
                  )}

                  <div className="p-5">
                    {/* Product Header */}
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="font-bold text-amber-900 text-lg flex-1 leading-tight">
                        {product.productName}
                      </h3>
                      {!product.image && (
                        <div className="flex gap-1 ml-2">
                          <button
                            onClick={() => showProductDetails(product)}
                            className="text-blue-600 hover:text-blue-800 transition-colors p-1"
                            title="View Details"
                          >
                            <svg
                              className="w-5 h-5"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                              <path
                                fillRule="evenodd"
                                d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </button>
                          <button
                            onClick={() => deleteFinishedProduct(product)}
                            className="text-red-600 hover:text-red-800 transition-colors p-1"
                            title="Delete Product"
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
                      )}
                    </div>

                    {product.description && (
                      <p className="text-gray-600 text-sm mb-3 line-clamp-2">
                        {product.description}
                      </p>
                    )}

                    {/* Key Metrics */}
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="bg-amber-50 rounded-lg p-3 text-center">
                        <div className="text-xs text-amber-700 font-medium">
                          Original
                        </div>
                        <div className="text-lg font-bold text-amber-900">
                          {product.originalQuantity}
                        </div>
                      </div>
                      <div className="bg-green-50 rounded-lg p-3 text-center">
                        <div className="text-xs text-green-700 font-medium">
                          Fulfilled
                        </div>
                        <div className="text-lg font-bold text-green-900">
                          {product.fulfilledQuantity}
                        </div>
                      </div>
                    </div>

                    {/* Cost Information - FIXED */}
                    {(materialCostPerUnit > 0 || totalProductionCost > 0) && (
                      <div className="bg-blue-50 rounded-lg p-3 mb-3">
                        <div className="text-xs text-blue-700 font-medium mb-1">
                          💰 Material Costs
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Per Unit:</span>
                          <span className="font-semibold">
                            ৳{materialCostPerUnit.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Total:</span>
                          <span className="font-bold text-blue-900">
                            ৳{totalProductionCost.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Additional Info */}
                    <div className="space-y-2 text-sm">
                      {product.workerCompany && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">🏢 Company:</span>
                          <span className="font-semibold text-blue-600">
                            {product.workerCompany}
                          </span>
                        </div>
                      )}

                      {product.materials && product.materials.length > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">🧱 Materials:</span>
                          <span className="font-semibold">
                            {product.materials.length} types
                          </span>
                        </div>
                      )}

                      <div className="flex justify-between">
                        <span className="text-gray-600">📅 Finished:</span>
                        <span className="font-medium text-amber-900">
                          {format(new Date(product.finishedAt), 'MMM dd, yyyy')}
                        </span>
                      </div>
                    </div>

                    {/* Worker Contributions Preview */}
                    {product.workerContributions &&
                      product.workerContributions.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-gray-200">
                          <div className="text-xs font-medium text-gray-700 mb-2">
                            👥 {product.workerContributions.length} Worker
                            {product.workerContributions.length !== 1
                              ? 's'
                              : ''}
                          </div>
                          <div className="space-y-1">
                            {product.workerContributions
                              .slice(0, 2)
                              .map((contrib, index) => (
                                <div
                                  key={index}
                                  className="text-xs text-gray-600"
                                >
                                  <span className="font-medium">
                                    {contrib.workerName}
                                  </span>
                                  {contrib.workerCompany && (
                                    <span> ({contrib.workerCompany})</span>
                                  )}
                                  :{' '}
                                  {contrib.deliveredQuantity ||
                                    contrib.quantity}{' '}
                                  pcs
                                </div>
                              ))}
                            {product.workerContributions.length > 2 && (
                              <div
                                className="text-xs text-blue-600 cursor-pointer"
                                onClick={() => showProductDetails(product)}
                              >
                                +{product.workerContributions.length - 2} more
                                workers...
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Enhanced Product Detail Modal */}
        {showDetailModal && selectedProduct && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              {/* Modal Header */}
              <div className="bg-amber-100 p-6 border-b border-amber-200">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-2xl font-bold text-amber-900">
                      {selectedProduct.productName}
                    </h2>
                    <p className="text-amber-700 text-sm">
                      Finished on{' '}
                      {format(
                        new Date(selectedProduct.finishedAt),
                        'MMMM dd, yyyy HH:mm'
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowDetailModal(false)}
                    className="text-amber-900 hover:text-amber-700 text-3xl font-bold leading-none"
                  >
                    ×
                  </button>
                </div>
              </div>

              {/* Modal Content */}
              <div className="p-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Left Column - Product Info */}
                  <div className="space-y-4">
                    {selectedProduct.image && (
                      <img
                        src={selectedProduct.image}
                        alt={selectedProduct.productName}
                        className="w-full h-64 object-cover rounded-lg"
                      />
                    )}

                    {selectedProduct.description && (
                      <div>
                        <h3 className="font-semibold text-gray-900 mb-2">
                          Description
                        </h3>
                        <p className="text-gray-700">
                          {selectedProduct.description}
                        </p>
                      </div>
                    )}

                    {/* Production Summary */}
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h3 className="font-semibold text-gray-900 mb-3">
                        Production Summary
                      </h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm text-gray-600">
                            Original Quantity
                          </div>
                          <div className="text-lg font-bold">
                            {selectedProduct.originalQuantity}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-600">
                            Fulfilled Quantity
                          </div>
                          <div className="text-lg font-bold text-green-600">
                            {selectedProduct.fulfilledQuantity}
                          </div>
                        </div>
                        {selectedProduct.workerCompany && (
                          <div className="col-span-2">
                            <div className="text-sm text-gray-600">
                              Main Company
                            </div>
                            <div className="text-lg font-bold text-blue-600">
                              {selectedProduct.workerCompany}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Materials Used - FIXED */}
                    {selectedProduct.materials &&
                      selectedProduct.materials.length > 0 && (
                        <div>
                          <h3 className="font-semibold text-gray-900 mb-3">
                            Materials Used
                          </h3>
                          <div className="space-y-2">
                            {selectedProduct.materials.map(
                              (material, index) => (
                                <div
                                  key={index}
                                  className="flex justify-between items-center p-3 bg-blue-50 rounded-lg"
                                >
                                  <span className="font-medium">
                                    {material.name}
                                  </span>
                                  <span className="font-bold text-blue-700">
                                    ৳{material.price}/unit
                                  </span>
                                </div>
                              )
                            )}

                            {/* Corrected cost calculations */}
                            <div className="flex justify-between items-center p-3 bg-blue-100 rounded-lg border-2 border-blue-200">
                              <span className="font-bold">
                                Total Cost per Unit:
                              </span>
                              <span className="font-bold text-blue-800">
                                ৳
                                {(
                                  selectedProduct.materialCostBreakdown
                                    ?.perUnit ||
                                  selectedProduct.materials.reduce(
                                    (sum, m) =>
                                      sum + (parseFloat(m.price) || 0),
                                    0
                                  )
                                ).toFixed(2)}
                              </span>
                            </div>
                            <div className="flex justify-between items-center p-3 bg-green-100 rounded-lg border-2 border-green-200">
                              <span className="font-bold">
                                Total Production Cost:
                              </span>
                              <span className="font-bold text-green-800">
                                ৳
                                {(
                                  selectedProduct.materialCostBreakdown
                                    ?.totalForProduction ||
                                  (selectedProduct.materialCostBreakdown
                                    ?.perUnit ||
                                    selectedProduct.materials.reduce(
                                      (sum, m) =>
                                        sum + (parseFloat(m.price) || 0),
                                      0
                                    )) * selectedProduct.fulfilledQuantity
                                ).toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                  </div>

                  {/* Right Column - Worker Contributions */}
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-3">
                      Worker Contributions
                    </h3>
                    {selectedProduct.workerContributions &&
                    selectedProduct.workerContributions.length > 0 ? (
                      <div className="space-y-3">
                        {selectedProduct.workerContributions.map(
                          (contrib, index) => (
                            <div
                              key={index}
                              className="bg-gray-50 rounded-lg p-4 border border-gray-200"
                            >
                              <div className="flex justify-between items-start mb-2">
                                <div>
                                  <h4 className="font-semibold text-gray-900">
                                    {contrib.workerName}
                                  </h4>
                                  {contrib.workerCompany && (
                                    <p className="text-sm text-blue-600">
                                      {contrib.workerCompany}
                                    </p>
                                  )}
                                </div>
                                <div className="text-right">
                                  <div className="text-lg font-bold text-green-600">
                                    {contrib.deliveredQuantity ||
                                      contrib.quantity}{' '}
                                    units
                                  </div>
                                  {contrib.materialCostForWorker && (
                                    <div className="text-sm text-gray-600">
                                      ৳{contrib.materialCostForWorker} materials
                                    </div>
                                  )}
                                </div>
                              </div>
                              {contrib.note && (
                                <div className="mt-2 p-2 bg-white rounded text-sm text-gray-700 italic border-l-3 border-blue-300">
                                  "{contrib.note}"
                                </div>
                              )}
                            </div>
                          )
                        )}
                      </div>
                    ) : (
                      <p className="text-gray-500 italic">
                        No worker contribution details available
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
                <div className="flex justify-end">
                  <button
                    onClick={() => setShowDetailModal(false)}
                    className="px-6 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {filteredProducts.length === 0 && !loading && (
          <div className="text-center py-16">
            <div className="text-gray-400 mb-6">
              <svg
                className="mx-auto h-24 w-24"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-xl font-medium text-gray-900 mb-2">
              No finished products found
            </h3>
            <p className="text-gray-500">
              Try adjusting your search criteria or date range
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
