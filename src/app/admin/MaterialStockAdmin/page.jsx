'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
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
  FaMinus,
  FaExclamationTriangle,
  FaHistory,
  FaInfoCircle,
} from 'react-icons/fa'
import 'react-date-range/dist/styles.css'
import 'react-date-range/dist/theme/default.css'

export default function AdminMaterialStockPage() {
  const [stocks, setStocks] = useState([]) // Original worker submissions
  const [netStock, setNetStock] = useState({}) // Net available stock after removals
  const [stockStatistics, setStockStatistics] = useState(null) // Enhanced statistics
  const [loading, setLoading] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterCompany, setFilterCompany] = useState('all')
  const [selectedItems, setSelectedItems] = useState([])
  const [selectAll, setSelectAll] = useState(false)
  
  // Stock removal state management
  const [stockRemovals, setStockRemovals] = useState({}) // Track removal inputs for each stock type
  const [removingStock, setRemovingStock] = useState(false) // Loading state for stock removal
  
  const [dateRange, setDateRange] = useState([
    {
      startDate: new Date(new Date().setMonth(new Date().getMonth() - 1)),
      endDate: new Date(),
      key: 'selection',
    },
  ])

  // FIXED: Use net stock data for combined stock calculation with stable dependency
  const combinedStock = useMemo(() => {
    console.log('🔄 Recalculating combinedStock...', { 
      netStockKeys: Object.keys(netStock || {}), 
      stocksLength: Array.isArray(stocks) ? stocks.length : 'not array' 
    })
    
    // Use net stock data if available, otherwise fallback to original calculation
    if (netStock && Object.keys(netStock).length > 0) {
      const netStockData = {}
      Object.entries(netStock).forEach(([type, data]) => {
        netStockData[type] = data.netAvailable || 0
      })
      console.log('✅ Using net stock data:', netStockData)
      return netStockData
    }
    
    // Fallback to original calculation (for backward compatibility)
    if (!Array.isArray(stocks)) {
      console.warn('⚠️ stocks is not an array:', stocks)
      return {}
    }
    
    const fallbackStock = stocks
      .filter((s) => s.status === 'approved')
      .reduce((acc, curr) => {
        if (!acc[curr.material]) acc[curr.material] = 0
        acc[curr.material] += curr.quantity
        return acc
      }, {})
      
    console.log('📊 Fallback stock calculation:', fallbackStock)
    return fallbackStock
  }, [stocks, netStock])

  // FIXED: Use useCallback to stabilize the initialization function
  const initializeStockRemovals = useCallback(() => {
    const initialRemovals = {}
    Object.keys(combinedStock).forEach(type => {
      // Only initialize if not already exists to prevent resetting user input
      if (!stockRemovals[type]) {
        initialRemovals[type] = {
          removeQuantity: '',
          purpose: '',
          confirmedBy: ''
        }
      } else {
        initialRemovals[type] = stockRemovals[type]
      }
    })
    return initialRemovals
  }, [combinedStock]) // Remove stockRemovals from dependencies to prevent circular updates

  // FIXED: Use useEffect with proper dependency management and prevent unnecessary updates
  useEffect(() => {
    const newRemovals = initializeStockRemovals()
    
    // Only update if there are actual changes to prevent infinite re-renders
    const hasChanges = Object.keys(newRemovals).some(type => 
      !stockRemovals[type] || 
      Object.keys(newRemovals[type]).some(field => 
        !stockRemovals[type] || stockRemovals[type][field] !== newRemovals[type][field]
      )
    )

    if (hasChanges) {
      setStockRemovals(prevRemovals => {
        // Merge existing user input with new stock types
        const mergedRemovals = { ...prevRemovals }
        Object.keys(newRemovals).forEach(type => {
          if (!mergedRemovals[type]) {
            mergedRemovals[type] = newRemovals[type]
          }
        })
        
        // Remove removals for stock types that no longer exist
        Object.keys(mergedRemovals).forEach(type => {
          if (!combinedStock[type]) {
            delete mergedRemovals[type]
          }
        })
        
        return mergedRemovals
      })
    }
  }, [combinedStock, initializeStockRemovals])

  // Handle stock removal input changes
  const handleRemovalInputChange = useCallback((materialType, field, value) => {
    setStockRemovals(prev => ({
      ...prev,
      [materialType]: {
        ...prev[materialType] || { removeQuantity: '', purpose: '', confirmedBy: '' },
        [field]: value
      }
    }))
  }, [])

  // FIXED: Remove stock functionality with net stock validation
  const removeStock = async (materialType) => {
    const removal = stockRemovals[materialType]
    const availableQuantity = combinedStock[materialType] // This is now net available
    const removeQuantity = parseFloat(removal?.removeQuantity || 0)

    // Validation
    if (!removeQuantity || removeQuantity <= 0) {
      Swal.fire('Invalid Quantity', 'Please enter a valid quantity to remove', 'error')
      return
    }

    if (removeQuantity > availableQuantity) {
      Swal.fire(
        'Quantity Exceeds Available Stock', 
        `You can only remove up to ${availableQuantity} units of ${materialType}. This is the net available after previous removals.`, 
        'error'
      )
      return
    }

    if (!removal?.purpose?.trim()) {
      Swal.fire('Purpose Required', 'Please specify the purpose for stock removal', 'error')
      return
    }

    if (!removal?.confirmedBy?.trim()) {
      Swal.fire('Confirmation Required', 'Please specify who confirmed this removal', 'error')
      return
    }

    // Enhanced confirmation with net stock information
    const netStockInfo = netStock[materialType]
    const result = await Swal.fire({
      title: 'Confirm Material Stock Removal',
      html: `
        <div class="text-left">
          <p><strong>Material Type:</strong> ${materialType}</p>
          <p><strong>Remove Quantity:</strong> ${removeQuantity}</p>
          <p><strong>Net Available:</strong> ${availableQuantity}</p>
          <p><strong>Remaining After Removal:</strong> ${availableQuantity - removeQuantity}</p>
          <p><strong>Purpose:</strong> ${removal.purpose}</p>
          <p><strong>Confirmed By:</strong> ${removal.confirmedBy}</p>
          ${netStockInfo ? `
            <hr class="my-3">
            <p class="text-sm text-gray-600"><strong>Stock Details:</strong></p>
            <p class="text-sm">• Original Total: ${netStockInfo.totalOriginal}</p>
            <p class="text-sm">• Previously Removed: ${netStockInfo.totalRemoved}</p>
            <p class="text-sm">• Worker Submissions: ${netStockInfo.entries?.length || 0}</p>
          ` : ''}
          <p class="text-amber-600 font-semibold mt-3">⚠️ This will log a material stock removal without modifying original worker submissions!</p>
        </div>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Yes, Remove Stock!',
      width: '500px'
    })

    if (!result.isConfirmed) return

    setRemovingStock(true)
    try {
      console.log('🚀 Sending material removal request:', {
        stockType: materialType,
        removeQuantity,
        availableQuantity,
        purpose: removal.purpose.trim(),
        confirmedBy: removal.confirmedBy.trim(),
        category: 'material'
      })
      
      const response = await fetch('/api/stock/removal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'role': 'admin'
        },
        body: JSON.stringify({
          stockType: materialType,
          removeQuantity,
          availableQuantity,
          purpose: removal.purpose.trim(),
          confirmedBy: removal.confirmedBy.trim(),
          removalDate: new Date(),
          category: 'material'
        })
      })

      console.log('📡 Removal API response status:', response.status)
      
      if (response.ok) {
        const result = await response.json()
        console.log('✅ Removal successful:', result)
        
        // Clear the removal inputs for this material type
        handleRemovalInputChange(materialType, 'removeQuantity', '')
        handleRemovalInputChange(materialType, 'purpose', '')
        handleRemovalInputChange(materialType, 'confirmedBy', '')

        // Refresh stocks to get updated net quantities
        await fetchStocks()

        Swal.fire({
          title: 'Material Stock Removal Logged Successfully!',
          html: `
            <div class="text-left">
              <p>${removeQuantity} units of ${materialType} removed from available stock.</p>
              <p>Net remaining: ${availableQuantity - removeQuantity}</p>
              <p class="text-green-600 font-medium mt-2">✓ Original worker submissions preserved</p>
              <p class="text-blue-600 text-sm mt-1">Removal ID: ${result.removalId}</p>
            </div>
          `,
          icon: 'success'
        })
      } else {
        const error = await response.json()
        console.error('❌ Removal API error:', error)
        Swal.fire('Error', error.message || 'Failed to remove material stock', 'error')
      }
    } catch (err) {
      console.error('❌ Material stock removal error:', err)
      Swal.fire('Error', 'Network error occurred while removing material stock', 'error')
    } finally {
      setRemovingStock(false)
    }
  }

  // Handle PDF download from worker's submission
  const downloadWorkerPDF = (stock) => {
    if (!stock.pdfFile?.fileId) {
      Swal.fire('No PDF', 'No PDF file attached to this material stock entry', 'info')
      return
    }

    try {
      console.log('📄 Downloading worker PDF for:', stock.material)
      
      // Open PDF in a new tab for download
      const downloadUrl = `/api/stock/materials?downloadFile=true&fileId=${stock.pdfFile.fileId}`
      window.open(downloadUrl, '_blank')
      
      // Show success message
      Swal.fire({
        title: 'PDF Download',
        text: `Downloading PDF for ${stock.material} from ${stock.workerName}`,
        icon: 'success',
        timer: 2000,
        showConfirmButton: false
      })
    } catch (err) {
      console.error('❌ PDF download error:', err)
      Swal.fire('Error', 'Failed to download PDF file', 'error')
    }
  }

  // ENHANCED: Fetch stocks with net stock calculation and improved error handling
  const fetchStocks = useCallback(async () => {
    console.log('🔍 Fetching material stocks...')
    setLoading(true)
    try {
      const range = dateRange[0]
      const params = new URLSearchParams({
        startDate: format(range.startDate, 'yyyy-MM-dd'),
        endDate: format(range.endDate, 'yyyy-MM-dd'),
        getNetStock: 'true', // NEW: Request net stock calculation
      })

      if (filterStatus !== 'all') {
        params.append('status', filterStatus)
      }

      if (filterCompany !== 'all') {
        params.append('company', filterCompany)
      }

      const url = `/api/stock/materials?${params}`
      console.log('📡 Fetching from:', url)
      
      const res = await fetch(url)
      console.log('📡 Response status:', res.status)
      
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`)
      }
      
      const data = await res.json()
      console.log('📊 Raw API response:', data)
      
      // Enhanced response structure handling with detailed logging
      if (data && typeof data === 'object') {
        // Handle new response structure with net stock
        if (data.items && Array.isArray(data.items)) {
          console.log('✅ Processing structured response with items array')
          setStocks(data.items) // Original submissions - never modified
          setNetStock(data.netStock || {}) // Net available stock
          setStockStatistics(data.statistics || null) // Enhanced statistics
          console.log('✅ Original material submissions loaded:', data.items.length)
          console.log('📊 Net material stock data:', data.netStock)
          console.log('📈 Material statistics:', data.statistics)
        } else if (Array.isArray(data)) {
          console.log('✅ Processing legacy array response')
          // Fallback for old response structure
          setStocks(data)
          setNetStock({})
          setStockStatistics(null)
          console.log('✅ Fallback: loaded', data.length, 'material items')
        } else if (data.netStock || data.statistics) {
          console.log('✅ Processing net stock only response')
          // Handle case where response has net stock but no items
          setStocks([])
          setNetStock(data.netStock || {})
          setStockStatistics(data.statistics || null)
          console.log('✅ Net material stock only response')
        } else {
          // Empty response
          console.warn('⚠️ Empty response from material API')
          setStocks([])
          setNetStock({})
          setStockStatistics(null)
        }
      } else {
        console.error('❌ Invalid response format:', data)
        throw new Error('Invalid response format from server')
      }
    } catch (err) {
      console.error('❌ Error fetching material stock:', err)
      Swal.fire('Error', `Failed to fetch material stock data: ${err.message}`, 'error')
      // Ensure state is reset on error
      setStocks([])
      setNetStock({})
      setStockStatistics(null)
    } finally {
      setLoading(false)
    }
  }, [dateRange, filterStatus, filterCompany])

  // Initial fetch on mount
  useEffect(() => {
    console.log('🚀 Component mounted, fetching initial stocks...')
    fetchStocks()
  }, [fetchStocks])

  // Get unique companies for filter - with safety check
  const uniqueCompanies = useMemo(() => 
    Array.isArray(stocks) 
      ? [...new Set(stocks.map((stock) => stock.company))].sort()
      : []
  , [stocks])

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
        Swal.fire({
          title: 'Success!',
          html: `
            <div class="text-left">
              <p>Material stock ${status} successfully</p>
              <p class="text-green-600 text-sm mt-2">✓ Original submission preserved</p>
              <p class="text-blue-600 text-sm">Net stock calculations updated automatically</p>
            </div>
          `,
          icon: 'success'
        })
      } else {
        Swal.fire('Error', 'Failed to update status', 'error')
      }
    } catch (err) {
      console.error(err)
      Swal.fire('Error', 'Network error occurred', 'error')
    }
  }

  // Generate PDF for individual stock entry (enhanced with net stock info)
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

    const netStockInfo = netStock[stock.material]
    const stockDetails = [
      ['Date', format(new Date(stock.date), 'MMM dd, yyyy')],
      ['Material Type', stock.material || 'N/A'],
      ['Company', stock.company || 'N/A'],
      ['Original Quantity', stock.quantity?.toString() || '0'],
      ['Unit', stock.unit || 'N/A'],
      ['Status', stock.status || 'pending'],
      ['Worker Name', stock.workerName || 'N/A'],
      ['Worker Phone', stock.workerPhone || 'N/A'],
      ['Has PDF Attachment', stock.pdfFile?.fileId ? 'Yes' : 'No'],
      ['Original Submission', stock.isOriginalSubmission ? 'Yes' : 'Legacy'],
      // Add net stock context if available
      ...(netStockInfo ? [
        ['--- NET STOCK INFO ---', '---'],
        ['Total Original Stock', netStockInfo.totalOriginal?.toString() || '0'],
        ['Total Removed', netStockInfo.totalRemoved?.toString() || '0'],
        ['Net Available', netStockInfo.netAvailable?.toString() || '0'],
        ['Consumption %', `${netStockInfo.percentageConsumed || 0}%`],
      ] : []),
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

  // Generate PDF for worker's combined stock (enhanced)
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
    doc.text(`Total Original Quantity: ${totalQuantity}`, 14, 80)
    doc.text('Note: Quantities shown are original submissions (preserved)', 14, 88)

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
    doc.text('Company Breakdown:', 14, 105)
    doc.setFont(undefined, 'normal')

    let yPos = 115
    Object.entries(companies).forEach(([company, stats]) => {
      doc.text(
        `${company}: ${stats.count} entries, ${stats.quantity} total original quantity`,
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
      stock.pdfFile?.fileId ? 'Yes' : 'No',
      stock.isOriginalSubmission ? 'Original' : 'Legacy',
    ])

    autoTable(doc, {
      head: [['Date', 'Material', 'Company', 'Orig. Qty', 'Unit', 'Status', 'PDF', 'Type']],
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
      `worker_${workerName.replace(/\s+/g, '_')}_original_material_submissions_${format(
        new Date(),
        'yyyy-MM-dd'
      )}.pdf`
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

  // Single item delete (enhanced warning)
  const deleteSingleStock = async (stock) => {
    const result = await Swal.fire({
      title: 'Delete Original Worker Submission?',
      html: `
        <div class="text-left">
          <p><strong>Material:</strong> ${stock.material}</p>
          <p><strong>Company:</strong> ${stock.company}</p>
          <p><strong>Original Quantity:</strong> ${stock.quantity} ${stock.unit}</p>
          <p><strong>Worker:</strong> ${stock.workerName}</p>
          <p><strong>Date:</strong> ${format(
            new Date(stock.date),
            'MMM dd, yyyy'
          )}</p>
          ${stock.pdfFile?.fileId ? '<p><strong>Has PDF:</strong> Yes</p>' : ''}
          <p class="text-amber-600 font-semibold mt-3">⚠️ This is an original worker submission!</p>
          <p class="text-red-600 font-semibold">This will permanently delete the historical record and any attached PDF file!</p>
          <p class="text-blue-600 text-sm mt-2">Consider using stock removal system instead for inventory management.</p>
        </div>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Yes, Delete Original Submission!',
      width: '500px'
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
      title: 'Delete Selected Original Submissions?',
      html: `
        <div class="text-left">
          <p><strong>Selected Items:</strong> ${selectedItems.length}</p>
          <p class="text-amber-600 font-semibold mt-3">⚠️ These are original worker submissions!</p>
          <p class="text-red-600 font-semibold">This will permanently delete all selected historical records and their PDF files!</p>
          <p class="text-blue-600 text-sm mt-2">Consider using stock removal system instead for inventory management.</p>
        </div>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Yes, Delete All Selected Originals!',
      width: '500px'
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
          `${deletedCount} original submissions deleted successfully`,
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

  // ENHANCED: Download comprehensive stock report with net stock info
  const downloadStockReport = () => {
    const doc = new jsPDF()

    // Header
    doc.setFontSize(20)
    doc.text('Abu Bakkar Leathers - Enhanced Material Stock Report', 14, 15)

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
    doc.text(`Total Original Submissions: ${filteredStocks.length}`, 14, 50)
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
    doc.text(
      `Entries with PDF: ${filteredStocks.filter(s => s.pdfFile?.fileId).length}`,
      14,
      90
    )

    // Net Stock Table (if available)
    if (Object.keys(netStock).length > 0) {
      doc.setFontSize(14)
      doc.setFont(undefined, 'bold')
      doc.text('Net Available Material Stock (After Removals):', 14, 110)

      const netStockTableData = Object.entries(netStock).map(
        ([type, data]) => [
          type, 
          data.totalOriginal?.toString() || '0',
          data.totalRemoved?.toString() || '0',
          data.netAvailable?.toString() || '0',
          `${data.percentageConsumed || 0}%`
        ]
      )

      autoTable(doc, {
        head: [['Material', 'Original', 'Removed', 'Net Available', 'Consumed %']],
        body: netStockTableData,
        startY: 120,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [146, 64, 14] },
        columnStyles: {
          1: { halign: 'right' },
          2: { halign: 'right' },
          3: { halign: 'right' },
          4: { halign: 'right' },
        }
      })
    }

    // Original Combined Stock Table (for comparison)
    if (Object.keys(combinedStock).length > 0) {
      const currentY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 20 : 140
      
      doc.setFontSize(14)
      doc.setFont(undefined, 'bold')
      doc.text('Original Approved Material Stock Summary:', 14, currentY)

      const stockTableData = Object.entries(combinedStock).map(
        ([material, quantity]) => [material, quantity.toString()]
      )

      autoTable(doc, {
        head: [['Material Type', 'Net Available Quantity']],
        body: stockTableData,
        startY: currentY + 10,
        styles: { fontSize: 10 },
        headStyles: { fillColor: [146, 64, 14] },
      })
    }

    // Detailed Stock Entries
    const currentY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 20 : 180

    doc.setFontSize(14)
    doc.setFont(undefined, 'bold')
    doc.text('Detailed Original Submissions:', 14, currentY)

    const detailTableData = filteredStocks.map((stock) => [
      format(new Date(stock.date), 'MMM dd, yyyy'),
      stock.material,
      stock.company,
      stock.quantity.toString(),
      stock.unit,
      stock.status,
      stock.workerName,
      stock.workerPhone || 'N/A',
      stock.pdfFile?.fileId ? 'Yes' : 'No',
      stock.isOriginalSubmission ? 'Original' : 'Legacy',
    ])

    autoTable(doc, {
      head: [
        [
          'Date',
          'Material',
          'Company',
          'Orig Qty',
          'Unit',
          'Status',
          'Worker',
          'Phone',
          'PDF',
          'Type',
        ],
      ],
      body: detailTableData,
      startY: currentY + 10,
      styles: { fontSize: 7 },
      headStyles: { fillColor: [146, 64, 14] },
      columnStyles: {
        7: { cellWidth: 20 }, // Phone column
        8: { cellWidth: 12 }, // PDF column
        9: { cellWidth: 15 }, // Type column
      },
    })

    // Add footer note
    const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 10 : 250
    doc.setFontSize(8)
    doc.setFont(undefined, 'italic')
    doc.text('Note: Original quantities preserved. Net quantities calculated separately from removal logs.', 14, finalY)

    const fileName = `enhanced_material_stock_report_${format(
      new Date(),
      'yyyy-MM-dd'
    )}.pdf`
    doc.save(fileName)
  }

  // Download detailed report (enhanced)
  const downloadDetailedReport = () => {
    const doc = new jsPDF()

    doc.setFontSize(20)
    doc.text('Detailed Enhanced Material Stock Report', 14, 15)

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
    doc.text(`• Total Original Submissions: ${filteredStocks.length}`, 20, yPosition)
    yPosition += 8
    doc.text(
      `• Approved Entries: ${
        filteredStocks.filter((s) => s.status === 'approved').length
      }`,
      20,
      yPosition
    )
    yPosition += 8
    
    const totalNetAvailable = Object.values(netStock).reduce((sum, data) => sum + (data.netAvailable || 0), 0)
    const totalOriginal = Object.values(netStock).reduce((sum, data) => sum + (data.totalOriginal || 0), 0)
    const totalRemoved = Object.values(netStock).reduce((sum, data) => sum + (data.totalRemoved || 0), 0)
    
    doc.text(
      `• Total Original Quantity: ${totalOriginal}`,
      20,
      yPosition
    )
    yPosition += 8
    doc.text(
      `• Total Removed: ${totalRemoved}`,
      20,
      yPosition
    )
    yPosition += 8
    doc.text(
      `• Net Available: ${totalNetAvailable}`,
      20,
      yPosition
    )
    yPosition += 8
    doc.text(
      `• Entries with PDF: ${filteredStocks.filter(s => s.pdfFile?.fileId).length}`,
      20,
      yPosition
    )
    yPosition += 15

    // Net Stock Details by Material Type
    doc.setFontSize(14)
    doc.setFont(undefined, 'bold')
    doc.text('Net Material Stock Details by Type:', 14, yPosition)
    yPosition += 15

    Object.entries(netStock).forEach(([material, data]) => {
      if (yPosition > 250) {
        doc.addPage()
        yPosition = 20
      }

      doc.setFontSize(12)
      doc.setFont(undefined, 'bold')
      doc.text(`${material}: ${data.netAvailable || 0} units available (${data.percentageConsumed || 0}% consumed)`, 20, yPosition)
      yPosition += 8
      
      doc.setFontSize(10)
      doc.setFont(undefined, 'normal')
      doc.text(`  Original: ${data.totalOriginal || 0} | Removed: ${data.totalRemoved || 0} | Worker Submissions: ${data.entries?.length || 0}`, 25, yPosition)
      yPosition += 10

      const materialEntries = filteredStocks.filter(
        (s) => s.material === material && s.status === 'approved'
      )

      doc.setFontSize(9)
      doc.setFont(undefined, 'normal')
      materialEntries.forEach((entry) => {
        if (yPosition > 270) {
          doc.addPage()
          yPosition = 20
        }
        doc.text(
          `    • ${entry.workerName} (${entry.workerPhone || 'No phone'}): ${
            entry.quantity
          } ${entry.unit} (${format(new Date(entry.date), 'MMM dd')}) - ${
            entry.company
          } ${entry.pdfFile?.fileId ? '[PDF]' : ''} ${entry.isOriginalSubmission ? '[ORIG]' : '[LEG]'}`,
          25,
          yPosition
        )
        yPosition += 5
      })
      yPosition += 10
    })

    // Add footer note
    doc.setFontSize(8)
    doc.setFont(undefined, 'italic')
    doc.text('Legend: [ORIG] = Original Submission (preserved), [LEG] = Legacy Data, [PDF] = Has PDF attachment', 14, yPosition + 5)

    const fileName = `detailed_enhanced_material_report_${format(
      new Date(),
      'yyyy-MM-dd'
    )}.pdf`
    doc.save(fileName)
  }

  // Filter stocks with safety check
  const filteredStocks = useMemo(() => 
    Array.isArray(stocks) ? stocks.filter((stock) => {
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
    }) : []
  , [stocks, searchTerm, filterStatus, filterCompany])

  // Debug information display in development
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 DEBUG INFO:', {
        stocksCount: Array.isArray(stocks) ? stocks.length : 'not array',
        netStockKeys: Object.keys(netStock || {}),
        combinedStockKeys: Object.keys(combinedStock || {}),
        filteredStocksCount: filteredStocks.length,
        statisticsExists: !!stockStatistics,
        loading
      })
    }
  }, [stocks, netStock, combinedStock, filteredStocks.length, stockStatistics, loading])

  return (
    <div className="min-h-screen p-2 sm:p-4 bg-amber-50">
      <div className="max-w-full mx-auto">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-amber-900 mb-4 sm:mb-6 lg:mb-8 text-center px-2">
          Admin Material Stock Management
          <div className="text-sm font-normal text-amber-700 mt-1">
            Enhanced with Original Submission Preservation
          </div>
        </h1>

        {/* Debug Panel - Only show in development */}
        {/* {process.env.NODE_ENV === 'development' && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
            <h3 className="font-semibold text-yellow-800 mb-2">🔧 Debug Info</h3>
            <div className="text-xs text-yellow-700 space-y-1">
              <div>Stocks: {Array.isArray(stocks) ? stocks.length : 'not array'}</div>
              <div>Net Stock Types: {Object.keys(netStock || {}).length}</div>
              <div>Combined Stock Types: {Object.keys(combinedStock || {}).length}</div>
              <div>Filtered Stocks: {filteredStocks.length}</div>
              <div>Loading: {loading.toString()}</div>
            </div>
          </div>
        )} */}

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
                  <span className="inline">📄 Enhanced Report</span>
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
                <span className="hidden sm:inline">🗑️ Delete Originals</span>
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

        {/* NEW: Data Integrity Notice */}
        <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <FaInfoCircle className="text-green-600 mt-1 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-green-800 mb-1">Data Integrity Protected</h3>
              <p className="text-sm text-green-700">
                Original worker material submissions are preserved and never modified. Stock removals are tracked separately, 
                allowing full audit trail while maintaining accurate inventory levels.
              </p>
            </div>
          </div>
        </div>

        {/* Enhanced Statistics Display */}
        {stockStatistics && (
          <div className="bg-white rounded-xl shadow-lg p-4 mb-6 border border-amber-200">
            <h3 className="text-lg font-semibold text-amber-900 mb-3">📊 Enhanced Material Stock Analytics</h3>
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 text-sm">
              <div className="bg-gradient-to-r from-blue-50 to-blue-100 p-3 rounded-lg">
                <span className="text-blue-600 font-medium">Original Submissions:</span>
                <div className="text-xl font-bold text-blue-800">{stockStatistics.totalItems}</div>
              </div>
              <div className="bg-gradient-to-r from-green-50 to-green-100 p-3 rounded-lg">
                <span className="text-green-600 font-medium">Net Available:</span>
                <div className="text-xl font-bold text-green-800">{stockStatistics.totalNetAvailable || 0}</div>
              </div>
              <div className="bg-gradient-to-r from-orange-50 to-orange-100 p-3 rounded-lg">
                <span className="text-orange-600 font-medium">Total Removed:</span>
                <div className="text-xl font-bold text-orange-800">{stockStatistics.totalRemoved || 0}</div>
              </div>
              <div className="bg-gradient-to-r from-purple-50 to-purple-100 p-3 rounded-lg">
                <span className="text-purple-600 font-medium">Material Types:</span>
                <div className="text-xl font-bold text-purple-800">{stockStatistics.stockTypes?.length || 0}</div>
              </div>
              <div className="bg-gradient-to-r from-yellow-50 to-yellow-100 p-3 rounded-lg">
                <span className="text-yellow-600 font-medium">Approved:</span>
                <div className="text-xl font-bold text-yellow-800">{stockStatistics.approvedItems}</div>
              </div>
              <div className="bg-gradient-to-r from-red-50 to-red-100 p-3 rounded-lg">
                <span className="text-red-600 font-medium">Original Qty:</span>
                <div className="text-xl font-bold text-red-800">{stockStatistics.totalOriginalQuantity}</div>
              </div>
            </div>
          </div>
        )}

        {/* Selection Actions */}
        {selectedItems.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 sm:p-4 mb-4 sm:mb-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0">
              <span className="text-red-900 font-medium text-sm">
                {selectedItems.length} original submission(s) selected
              </span>
              <button
                onClick={deleteSelectedItems}
                className="bg-red-600 text-white px-3 sm:px-4 py-2 rounded-lg hover:bg-red-700 transition text-xs sm:text-sm font-medium"
              >
                Delete Selected Originals
              </button>
            </div>
          </div>
        )}

        {/* Stats Cards - Responsive Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 mb-4 sm:mb-6">
          <div className="bg-white rounded-lg p-3 sm:p-4 shadow border border-amber-200">
            <div className="text-amber-900 text-xs sm:text-sm font-medium">
              Original Entries
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

        {/* Submitted Stock Table - Enhanced */}
        <div className="bg-white shadow-lg rounded-xl p-2 sm:p-4 lg:p-6 mb-4 sm:mb-6 border border-amber-200">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2 sm:gap-0">
            <h2 className="text-lg sm:text-xl font-semibold text-amber-900 flex items-center gap-2">
              Original Worker Material Submissions
              <FaHistory className="text-amber-600" />
              <span className="text-sm font-normal text-amber-600">Preserved Forever</span>
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
              <p className="mt-2 text-amber-900 text-sm">Loading original material submissions...</p>
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
                        Orig Qty
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
                      <th className="px-2 sm:px-4 py-2 sm:py-3 border border-gray-300 text-left font-semibold text-amber-900 min-w-[60px]">
                        Net Info
                      </th>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 border border-gray-300 text-left font-semibold text-amber-900 min-w-[180px]">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStocks.map((stock) => {
                      const stockNetInfo = netStock[stock.material]
                      return (
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
                            <span className="font-bold text-blue-600">{stock.quantity}</span>
                            {stock.isOriginalSubmission && (
                              <div className="text-xs text-green-600">ORIG</div>
                            )}
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
                            {stockNetInfo && (
                              <div className="text-xs">
                                <div className="text-green-600 font-bold">
                                  Net: {stockNetInfo.netAvailable}
                                </div>
                                <div className="text-orange-600">
                                  -{stockNetInfo.totalRemoved}
                                </div>
                                <div className="text-gray-500">
                                  {stockNetInfo.percentageConsumed}%
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="px-2 sm:px-4 py-2 sm:py-3 border border-gray-300">
                            <div className="flex flex-col sm:flex-row gap-1 sm:gap-2">
                              {/* Download Worker's PDF Button */}
                              {stock.pdfFile?.fileId && (
                                <button
                                  onClick={() => downloadWorkerPDF(stock)}
                                  className="bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50 text-xs font-medium"
                                  title="Download Worker's PDF"
                                >
                                  <FaDownload className="inline sm:hidden" />
                                  <span className="hidden sm:inline">
                                    📄 PDF
                                  </span>
                                </button>
                              )}
                              
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
                                <span className="hidden sm:inline">Report</span>
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
                                title="Delete Original Submission"
                              >
                                <FaTrash className="w-3 h-3 sm:w-4 sm:h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
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
                No original material submissions found
              </p>
            </div>
          )}
        </div>

        {/* ENHANCED: Combined Stock Summary with Stock Removal Functionality */}
        <div className="bg-white shadow-lg rounded-xl p-2 sm:p-4 lg:p-6 border border-amber-200">
          <h2 className="text-lg sm:text-xl font-semibold mb-4 text-amber-900 flex items-center gap-2">
            Net Available Material Stock (After Removals)
            <FaExclamationTriangle className="text-amber-600" />
            <span className="text-sm font-normal text-amber-600">Stock Removal System</span>
          </h2>
          
          {Object.keys(combinedStock).length === 0 ? (
            <p className="text-gray-500 text-sm sm:text-base">
              No approved material stock available yet.
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
                      Original Total
                    </th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 border border-gray-300 text-left font-semibold text-amber-900">
                      Total Removed
                    </th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 border border-gray-300 text-left font-semibold text-amber-900">
                      Net Available
                    </th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 border border-gray-300 text-left font-semibold text-amber-900">
                      Remove Quantity
                    </th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 border border-gray-300 text-left font-semibold text-amber-900">
                      Purpose
                    </th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 border border-gray-300 text-left font-semibold text-amber-900">
                      Confirmed By
                    </th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 border border-gray-300 text-left font-semibold text-amber-900">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(combinedStock).map(([material, netQuantity]) => {
                    const materialNetInfo = netStock[material]
                    return (
                      <tr
                        key={material}
                        className="hover:bg-amber-50 transition-colors"
                      >
                        <td className="px-2 sm:px-4 py-2 sm:py-3 border border-gray-300 font-medium">
                          {material}
                          {materialNetInfo && (
                            <div className="text-xs text-gray-500">
                              {materialNetInfo.entries?.length || 0} submissions
                            </div>
                          )}
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 border border-gray-300 font-bold text-blue-600">
                          {materialNetInfo?.totalOriginal || netQuantity}
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 border border-gray-300 font-bold text-red-600">
                          {materialNetInfo?.totalRemoved || 0}
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 border border-gray-300 font-bold text-green-600">
                          {netQuantity}
                          {materialNetInfo && (
                            <div className="text-xs text-gray-500">
                              {materialNetInfo.percentageConsumed}% consumed
                            </div>
                          )}
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 border border-gray-300">
                          <input
                            type="number"
                            min="1"
                            max={netQuantity}
                            value={stockRemovals[material]?.removeQuantity || ''}
                            onChange={(e) => handleRemovalInputChange(material, 'removeQuantity', e.target.value)}
                            placeholder="Qty to remove"
                            className="w-full px-2 py-1 border border-amber-300 rounded text-xs focus:ring-2 focus:ring-amber-400 focus:outline-none"
                          />
                          <div className="text-xs text-gray-500 mt-1">
                            Max: {netQuantity}
                          </div>
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 border border-gray-300">
                          <input
                            type="text"
                            value={stockRemovals[material]?.purpose || ''}
                            onChange={(e) => handleRemovalInputChange(material, 'purpose', e.target.value)}
                            placeholder="Purpose for removal"
                            className="w-full px-2 py-1 border border-amber-300 rounded text-xs focus:ring-2 focus:ring-amber-400 focus:outline-none"
                          />
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 border border-gray-300">
                          <input
                            type="text"
                            value={stockRemovals[material]?.confirmedBy || ''}
                            onChange={(e) => handleRemovalInputChange(material, 'confirmedBy', e.target.value)}
                            placeholder="Confirmed by"
                            className="w-full px-2 py-1 border border-amber-300 rounded text-xs focus:ring-2 focus:ring-amber-400 focus:outline-none"
                          />
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 border border-gray-300">
                          <button
                            onClick={() => removeStock(material)}
                            disabled={
                              removingStock || 
                              !stockRemovals[material]?.removeQuantity || 
                              !stockRemovals[material]?.purpose || 
                              !stockRemovals[material]?.confirmedBy ||
                              netQuantity <= 0
                            }
                            className="bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium flex items-center gap-1"
                          >
                            <FaMinus className="w-3 h-3" />
                            {removingStock ? 'Logging...' : 'Log Removal'}
                          </button>
                          {netQuantity <= 0 && (
                            <div className="text-xs text-red-500 mt-1">
                              No stock available
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          
          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-700">
              <strong>Note:</strong> Material stock removal creates a separate log entry without modifying original worker submissions. 
              Net quantities are calculated as: Original Total - Total Removed from all removal logs.
            </p>
          </div>
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

// Enhanced Bulk Delete Modal Component
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
      title: 'Confirm Bulk Delete of Original Submissions',
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
          <p class="text-amber-600 font-semibold mt-3">⚠️ These are original worker submissions!</p>
          <p class="text-red-600 font-semibold">This will permanently delete all matching historical records and their PDF files!</p>
          <p class="text-blue-600 text-sm mt-2">Consider using stock removal system instead for inventory management.</p>
        </div>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      confirmButtonText: 'Yes, Delete All Original Submissions!',
      width: '500px'
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
          Bulk Delete Original Submissions
        </h2>

        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
          <p className="text-sm text-red-700">
            <strong>Warning:</strong> This will delete original worker submission records. 
            Consider using the stock removal system for inventory management instead.
          </p>
        </div>

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
            Delete Original Submissions
          </button>
        </div>
      </div>
    </div>
  )
}
