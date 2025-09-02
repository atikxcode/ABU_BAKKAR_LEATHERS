'use client'

import { useState, useEffect, useContext } from 'react'
import { DateRangePicker } from 'react-date-range'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { format } from 'date-fns'
import Swal from 'sweetalert2'
import { AuthContext } from '../../../../Provider/AuthProvider'
import 'react-date-range/dist/styles.css'
import 'react-date-range/dist/theme/default.css'

export default function WorkerFinishedProductsPage() {
  const { user } = useContext(AuthContext)
  const userEmail = user?.email

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
    if (!userEmail) {
      console.log('❌ No userEmail found:', userEmail)
      return
    }

    console.log('🔍 Fetching finished products for user:', userEmail)
    setLoading(true)
    try {
      const range = customRange || dateRange[0]
      const params = new URLSearchParams({
        startDate: format(range.startDate, 'yyyy-MM-dd'),
        endDate: format(range.endDate, 'yyyy-MM-dd'),
        workerEmail: userEmail,
        workerOnly: 'true',
      })

      console.log(
        '📡 API Request URL:',
        `/api/stock/finished_products?${params}`
      )

      const res = await fetch(`/api/stock/finished_products?${params}`)
      console.log('📡 Response status:', res.status)

      if (res.ok) {
        const data = await res.json()
        console.log('✅ Raw API data:', data)
        console.log('📊 Items count:', data.length)

        data.forEach((item, index) => {
          console.log(`📦 Item ${index + 1}:`, {
            productName: item.productName,
            workerContribution: item.workerContribution,
            workerNotes: item.workerNotes,
            finishedAt: item.finishedAt,
          })
        })

        setFinishedProducts(data)
      } else {
        const errorText = await res.text()
        console.log('❌ API Error Response:', errorText)
        Swal.fire('Error', 'Failed to fetch finished products', 'error')
      }
    } catch (err) {
      console.error('💥 Network Error:', err)
      Swal.fire('Error', 'An error occurred', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    console.log('👤 Current user:', user)
    console.log('📧 User email:', userEmail)
    if (userEmail) {
      fetchFinishedProducts()
    }
  }, [userEmail])

  const handleDateRangeChange = (ranges) => {
    setDateRange([ranges.selection])
  }

  const applyDateFilter = () => {
    fetchFinishedProducts()
    setShowDatePicker(false)
  }

  // ✅ UPDATED: Summary Report with Company instead of Notes
  const downloadWorkerReport = () => {
    const doc = new jsPDF()

    // Header
    doc.setFontSize(20)
    doc.text('My Production Report', 14, 15)

    doc.setFontSize(12)
    doc.text(`Worker: ${user?.name || userEmail}`, 14, 25)
    doc.text(
      `Period: ${format(dateRange[0].startDate, 'MMM dd, yyyy')} - ${format(
        dateRange[0].endDate,
        'MMM dd, yyyy'
      )}`,
      14,
      35
    )

    // Summary
    const totalContribution = filteredProducts.reduce(
      (sum, p) => sum + (p.workerContribution || 0),
      0
    )
    const totalProducts = filteredProducts.length

    doc.setFontSize(14)
    doc.setFont(undefined, 'bold')
    doc.text('Summary:', 14, 50)

    doc.setFontSize(12)
    doc.setFont(undefined, 'normal')
    doc.text(`Products Contributed To: ${totalProducts}`, 14, 60)
    doc.text(`Total Pieces Produced: ${totalContribution}`, 14, 70)
    doc.text(
      `Average per Product: ${
        totalProducts > 0 ? Math.round(totalContribution / totalProducts) : 0
      }`,
      14,
      80
    )

    // ✅ UPDATED: Table data with Company instead of Notes
    const tableData = filteredProducts.map((product) => [
      product.productName,
      product.originalQuantity?.toString() || '0',
      product.workerContribution?.toString() || '0',
      format(new Date(product.finishedAt), 'MMM dd, yyyy'),
      product.workerCompany || 'N/A', // ✅ CHANGED: Company instead of Notes
    ])

    autoTable(doc, {
      head: [
        [
          'Product Name',
          'Total Qty',
          'My Contribution',
          'Finished Date',
          'Company', // ✅ CHANGED: Company header instead of "My Notes"
        ],
      ],
      body: tableData,
      startY: 90,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [146, 64, 14] },
      columnStyles: {
        4: { cellWidth: 40 },
      },
    })

    const fileName = `my_production_report_${format(
      new Date(),
      'yyyy-MM-dd'
    )}.pdf`
    doc.save(fileName)
  }

  // ✅ UPDATED: Detailed Report with Company added in contributions
  const downloadDetailedWorkerReport = () => {
    const doc = new jsPDF()

    doc.setFontSize(20)
    doc.text('Detailed Production Report', 14, 15)

    doc.setFontSize(12)
    doc.text(`Worker: ${user?.name || userEmail}`, 14, 25)
    doc.text(
      `Period: ${format(dateRange[0].startDate, 'MMM dd, yyyy')} - ${format(
        dateRange[0].endDate,
        'MMM dd, yyyy'
      )}`,
      14,
      35
    )

    let yPosition = 50
    const totalContribution = filteredProducts.reduce(
      (sum, p) => sum + (p.workerContribution || 0),
      0
    )

    // Summary section
    doc.setFontSize(14)
    doc.setFont(undefined, 'bold')
    doc.text('Performance Summary:', 14, yPosition)
    yPosition += 15

    doc.setFontSize(11)
    doc.setFont(undefined, 'normal')
    doc.text(
      `• Total Products Worked On: ${filteredProducts.length}`,
      20,
      yPosition
    )
    yPosition += 8
    doc.text(`• Total Pieces Produced: ${totalContribution}`, 20, yPosition)
    yPosition += 8
    doc.text(
      `• Average Production per Job: ${
        filteredProducts.length > 0
          ? Math.round(totalContribution / filteredProducts.length)
          : 0
      }`,
      20,
      yPosition
    )
    yPosition += 15

    // Detailed breakdown
    doc.setFontSize(14)
    doc.setFont(undefined, 'bold')
    doc.text('Production Details:', 14, yPosition)
    yPosition += 15

    filteredProducts.forEach((product, index) => {
      if (yPosition > 250) {
        doc.addPage()
        yPosition = 20
      }

      doc.setFontSize(12)
      doc.setFont(undefined, 'bold')
      doc.text(`${index + 1}. ${product.productName}`, 20, yPosition)
      yPosition += 8

      doc.setFontSize(10)
      doc.setFont(undefined, 'normal')

      doc.text(
        `Project Total Quantity: ${product.originalQuantity || 0}`,
        25,
        yPosition
      )
      yPosition += 6
      doc.text(
        `My Contribution: ${product.workerContribution || 0} pieces`,
        25,
        yPosition
      )
      yPosition += 6
      doc.text(
        `Completion Date: ${format(
          new Date(product.finishedAt),
          'MMM dd, yyyy'
        )}`,
        25,
        yPosition
      )
      yPosition += 6

      const contributionPercent =
        product.originalQuantity > 0
          ? Math.round(
              (product.workerContribution / product.originalQuantity) * 100
            )
          : 0
      doc.text(`My Share: ${contributionPercent}%`, 25, yPosition)
      yPosition += 6

      // ✅ ADDED: Company information
      if (product.workerCompany) {
        doc.text(`Company: ${product.workerCompany}`, 25, yPosition)
        yPosition += 6
      }

      if (product.workerNotes) {
        doc.text(`Notes: ${product.workerNotes}`, 25, yPosition)
        yPosition += 6
      }

      if (product.description) {
        doc.text(`Description: ${product.description}`, 25, yPosition)
        yPosition += 6
      }

      yPosition += 8
    })

    const fileName = `detailed_production_report_${format(
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
        My Finished Products
      </h1>

      {/* Controls - Same as Admin */}
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
              onClick={downloadWorkerReport}
              className="w-full bg-blue-600 text-white py-2 px-3 rounded-lg hover:bg-blue-700 transition text-sm font-medium"
            >
              📄 My Report
            </button>
          </div>

          <div>
            <button
              onClick={downloadDetailedWorkerReport}
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

      {/* Worker Stats - Same layout as Admin */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg p-4 shadow border border-amber-200">
          <div className="text-amber-900 text-sm font-medium">
            Products Worked
          </div>
          <div className="text-2xl font-bold text-amber-900">
            {filteredProducts.length}
          </div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow border border-amber-200">
          <div className="text-blue-900 text-sm font-medium">
            Total Produced
          </div>
          <div className="text-2xl font-bold text-blue-900">
            {filteredProducts.reduce(
              (sum, p) => sum + (p.workerContribution || 0),
              0
            )}
          </div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow border border-amber-200">
          <div className="text-green-900 text-sm font-medium">This Month</div>
          <div className="text-2xl font-bold text-green-900">
            {
              filteredProducts.filter(
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
                    (sum, p) => sum + (p.workerContribution || 0),
                    0
                  ) / filteredProducts.length
                )
              : 0}
          </div>
        </div>
      </div>

      {/* Products List - Same grid system as Admin */}
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
                <h3 className="font-bold text-amber-900 text-lg mb-2">
                  {product.productName}
                </h3>

                {product.description && (
                  <p className="text-gray-600 text-sm mb-3 line-clamp-2">
                    {product.description}
                  </p>
                )}

                {/* My Contribution Section */}
                <div className="bg-amber-50 rounded-lg p-3 mb-4">
                  <h4 className="font-semibold text-amber-900 text-sm mb-2">
                    My Contribution
                  </h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Pieces Produced:</span>
                      <span className="font-bold text-green-600">
                        {product.workerContribution || 0}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Project Total:</span>
                      <span className="font-semibold">
                        {product.originalQuantity || 0}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">My Share:</span>
                      <span className="font-semibold text-blue-600">
                        {product.originalQuantity > 0
                          ? Math.round(
                              ((product.workerContribution || 0) /
                                product.originalQuantity) *
                                100
                            )
                          : 0}
                        %
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Finished:</span>
                    <span className="text-amber-900 font-medium">
                      {format(new Date(product.finishedAt), 'MMM dd, yyyy')}
                    </span>
                  </div>

                  {/* ✅ ADDED: Show Company in UI */}
                  {product.workerCompany && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Company:</span>
                      <span className="text-blue-900 font-medium">
                        {product.workerCompany}
                      </span>
                    </div>
                  )}

                  {product.workerNotes && (
                    <div className="text-sm">
                      <span className="text-gray-600">My Notes:</span>
                      <p className="text-gray-700 italic mt-1">
                        "{product.workerNotes}"
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State - Same as Admin */}
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
          <p className="text-gray-400 text-sm mt-2">
            Products you contributed to will appear here once marked as finished
          </p>
        </div>
      )}
    </div>
  )
}
