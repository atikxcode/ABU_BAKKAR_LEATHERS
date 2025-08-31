'use client'

import { useState, useEffect } from 'react'
import { DateRangePicker } from 'react-date-range'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { format } from 'date-fns'
import Swal from 'sweetalert2'
import { 
  FaDownload, 
  FaCalendarAlt, 
  FaUsers, 
  FaCubes, 
  FaIndustry, 
  FaBoxOpen,
  FaFileAlt,
  FaChartLine
} from 'react-icons/fa'
import 'react-date-range/dist/styles.css'
import 'react-date-range/dist/theme/default.css'

export default function AdminReportsPage() {
  const [loading, setLoading] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [reportStats, setReportStats] = useState({
    totalUsers: 0,
    leatherStock: 0,
    materialStock: 0,
    finishedProducts: 0,
    totalReports: 0
  })
  
  const [dateRange, setDateRange] = useState([
    {
      startDate: new Date(new Date().setMonth(new Date().getMonth() - 3)),
      endDate: new Date(),
      key: 'selection',
    },
  ])

  // Fetch report statistics
  const fetchReportStats = async () => {
    setLoading(true)
    try {
      const range = dateRange[0]
      const params = new URLSearchParams({
        startDate: format(range.startDate, 'yyyy-MM-dd'),
        endDate: format(range.endDate, 'yyyy-MM-dd'),
      })

      const [leatherRes, materialRes, finishedRes, usersRes] = await Promise.all([
        fetch(`/api/stock/leather?${params}`),
        fetch(`/api/stock/materials?${params}`),
        fetch(`/api/stock/finished_products?${params}`),
        fetch(`/api/user`)
      ])

      const [leatherData, materialData, finishedData, usersData] = await Promise.all([
        leatherRes.ok ? leatherRes.json() : [],
        materialRes.ok ? materialRes.json() : [],
        finishedRes.ok ? finishedRes.json() : [],
        usersRes.ok ? usersRes.json() : []
      ])

      setReportStats({
        totalUsers: usersData.length,
        leatherStock: leatherData.length,
        materialStock: materialData.length,
        finishedProducts: finishedData.length,
        totalReports: leatherData.length + materialData.length + finishedData.length
      })
    } catch (error) {
      console.error('Error fetching report stats:', error)
      Swal.fire('Error', 'Failed to fetch report statistics', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchReportStats()
  }, [])

  const handleDateRangeChange = (ranges) => {
    setDateRange([ranges.selection])
  }

  const applyDateFilter = () => {
    fetchReportStats()
    setShowDatePicker(false)
  }

  // Download Leather Stock Report
  const downloadLeatherReport = async () => {
    setLoading(true)
    try {
      const range = dateRange[0]
      const params = new URLSearchParams({
        startDate: format(range.startDate, 'yyyy-MM-dd'),
        endDate: format(range.endDate, 'yyyy-MM-dd'),
      })

      const res = await fetch(`/api/stock/leather?${params}`)
      const data = await res.json()

      const doc = new jsPDF()
      
      // Header
      doc.setFontSize(20)
      doc.setFont(undefined, 'bold')
      doc.text('Abu Bakkar Leathers - Leather Stock Report', 14, 15)
      
      doc.setFontSize(12)
      doc.setFont(undefined, 'normal')
      doc.text(`Report Period: ${format(range.startDate, 'MMM dd, yyyy')} - ${format(range.endDate, 'MMM dd, yyyy')}`, 14, 25)
      doc.text(`Generated on: ${format(new Date(), 'MMM dd, yyyy HH:mm:ss')}`, 14, 35)
      doc.text(`Total Entries: ${data.length}`, 14, 45)

      // Summary by Status
      const approvedCount = data.filter(item => item.status === 'approved').length
      const pendingCount = data.filter(item => item.status === 'pending').length
      const rejectedCount = data.filter(item => item.status === 'rejected').length

      doc.setFont(undefined, 'bold')
      doc.text('Status Summary:', 14, 60)
      doc.setFont(undefined, 'normal')
      doc.text(`Approved: ${approvedCount} | Pending: ${pendingCount} | Rejected: ${rejectedCount}`, 14, 70)

      // Worker Contribution Summary
      doc.setFont(undefined, 'bold')
      doc.text('Worker Contribution Summary:', 14, 85)
      doc.setFont(undefined, 'normal')

      const workerSummary = {}
      data.forEach(item => {
        if (!workerSummary[item.workerName]) {
          workerSummary[item.workerName] = {
            total: 0,
            approved: 0,
            pending: 0,
            rejected: 0,
            quantity: 0
          }
        }
        workerSummary[item.workerName].total++
        workerSummary[item.workerName][item.status]++
        workerSummary[item.workerName].quantity += item.quantity || 0
      })

      let yPos = 95
      Object.entries(workerSummary).forEach(([worker, stats]) => {
        doc.text(`${worker}: ${stats.total} reports, ${stats.quantity} total units (A:${stats.approved}, P:${stats.pending}, R:${stats.rejected})`, 20, yPos)
        yPos += 7
      })

      // Detailed Table
      const tableData = data.map(item => [
        format(new Date(item.date), 'dd/MM/yyyy'),
        format(new Date(item.createdAt || item.date), 'HH:mm'),
        item.workerName || 'Unknown',
        item.workerPhone || 'N/A',
        item.type || 'Unknown',
        (item.quantity || 0).toString(),
        item.unit || '',
        item.status || 'pending'
      ])

      autoTable(doc, {
        head: [['Date', 'Time', 'Worker Name', 'Phone', 'Leather Type', 'Quantity', 'Unit', 'Status']],
        body: tableData,
        startY: yPos + 10,
        styles: { 
          fontSize: 8,
          cellPadding: 2
        },
        headStyles: { 
          fillColor: [146, 64, 14],
          textColor: [255, 255, 255],
          fontStyle: 'bold'
        },
        alternateRowStyles: {
          fillColor: [245, 245, 245]
        },
        columnStyles: {
          0: { cellWidth: 20 }, // Date
          1: { cellWidth: 15 }, // Time
          2: { cellWidth: 30 }, // Worker Name
          3: { cellWidth: 25 }, // Phone
          4: { cellWidth: 25 }, // Type
          5: { cellWidth: 20 }, // Quantity
          6: { cellWidth: 15 }, // Unit
          7: { cellWidth: 20 }  // Status
        }
      })

      doc.save(`leather_stock_report_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.pdf`)
      Swal.fire('Success!', 'Leather stock report downloaded successfully', 'success')
    } catch (error) {
      console.error('Error downloading leather report:', error)
      Swal.fire('Error', 'Failed to download leather report', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Download Materials Stock Report
  const downloadMaterialsReport = async () => {
    setLoading(true)
    try {
      const range = dateRange[0]
      const params = new URLSearchParams({
        startDate: format(range.startDate, 'yyyy-MM-dd'),
        endDate: format(range.endDate, 'yyyy-MM-dd'),
      })

      const res = await fetch(`/api/stock/materials?${params}`)
      const data = await res.json()

      const doc = new jsPDF()
      
      // Header
      doc.setFontSize(20)
      doc.setFont(undefined, 'bold')
      doc.text('Abu Bakkar Leathers - Materials Stock Report', 14, 15)
      
      doc.setFontSize(12)
      doc.setFont(undefined, 'normal')
      doc.text(`Report Period: ${format(range.startDate, 'MMM dd, yyyy')} - ${format(range.endDate, 'MMM dd, yyyy')}`, 14, 25)
      doc.text(`Generated on: ${format(new Date(), 'MMM dd, yyyy HH:mm:ss')}`, 14, 35)
      doc.text(`Total Entries: ${data.length}`, 14, 45)

      // Summary by Status and Material Type
      const approvedCount = data.filter(item => item.status === 'approved').length
      const pendingCount = data.filter(item => item.status === 'pending').length
      const rejectedCount = data.filter(item => item.status === 'rejected').length

      doc.setFont(undefined, 'bold')
      doc.text('Status Summary:', 14, 60)
      doc.setFont(undefined, 'normal')
      doc.text(`Approved: ${approvedCount} | Pending: ${pendingCount} | Rejected: ${rejectedCount}`, 14, 70)

      // Material Type Summary
      doc.setFont(undefined, 'bold')
      doc.text('Material Type Summary:', 14, 85)
      doc.setFont(undefined, 'normal')

      const materialSummary = {}
      data.forEach(item => {
        if (!materialSummary[item.material]) {
          materialSummary[item.material] = {
            total: 0,
            approved: 0,
            quantity: 0,
            workers: new Set()
          }
        }
        materialSummary[item.material].total++
        if (item.status === 'approved') {
          materialSummary[item.material].approved++
          materialSummary[item.material].quantity += item.quantity || 0
        }
        materialSummary[item.material].workers.add(item.workerName)
      })

      let yPos = 95
      Object.entries(materialSummary).forEach(([material, stats]) => {
        doc.text(`${material}: ${stats.approved}/${stats.total} approved, ${stats.quantity} units, ${stats.workers.size} workers`, 20, yPos)
        yPos += 7
      })

      // Worker Performance
      doc.setFont(undefined, 'bold')
      doc.text('Worker Performance:', 14, yPos + 10)
      doc.setFont(undefined, 'normal')
      yPos += 20

      const workerPerformance = {}
      data.forEach(item => {
        if (!workerPerformance[item.workerName]) {
          workerPerformance[item.workerName] = {
            total: 0,
            approved: 0,
            materials: new Set()
          }
        }
        workerPerformance[item.workerName].total++
        if (item.status === 'approved') {
          workerPerformance[item.workerName].approved++
        }
        workerPerformance[item.workerName].materials.add(item.material)
      })

      Object.entries(workerPerformance).forEach(([worker, stats]) => {
        doc.text(`${worker}: ${stats.approved}/${stats.total} approved, ${stats.materials.size} material types`, 20, yPos)
        yPos += 7
      })

      // Detailed Table
      const tableData = data.map(item => [
        format(new Date(item.date), 'dd/MM/yyyy'),
        format(new Date(item.createdAt || item.date), 'HH:mm'),
        item.workerName || 'Unknown',
        item.material || 'Unknown',
        (item.quantity || 0).toString(),
        item.unit || '',
        item.status || 'pending'
      ])

      autoTable(doc, {
        head: [['Date', 'Time', 'Worker Name', 'Material', 'Quantity', 'Unit', 'Status']],
        body: tableData,
        startY: yPos + 10,
        styles: { 
          fontSize: 8,
          cellPadding: 2
        },
        headStyles: { 
          fillColor: [34, 197, 94],
          textColor: [255, 255, 255],
          fontStyle: 'bold'
        },
        alternateRowStyles: {
          fillColor: [245, 245, 245]
        }
      })

      doc.save(`materials_stock_report_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.pdf`)
      Swal.fire('Success!', 'Materials stock report downloaded successfully', 'success')
    } catch (error) {
      console.error('Error downloading materials report:', error)
      Swal.fire('Error', 'Failed to download materials report', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Download Finished Products Report
  const downloadFinishedProductsReport = async () => {
    setLoading(true)
    try {
      const range = dateRange[0]
      const params = new URLSearchParams({
        startDate: format(range.startDate, 'yyyy-MM-dd'),
        endDate: format(range.endDate, 'yyyy-MM-dd'),
      })

      const res = await fetch(`/api/stock/finished_products?${params}`)
      const data = await res.json()

      const doc = new jsPDF()
      
      // Header
      doc.setFontSize(20)
      doc.setFont(undefined, 'bold')
      doc.text('Abu Bakkar Leathers - Finished Products Report', 14, 15)
      
      doc.setFontSize(12)
      doc.setFont(undefined, 'normal')
      doc.text(`Report Period: ${format(range.startDate, 'MMM dd, yyyy')} - ${format(range.endDate, 'MMM dd, yyyy')}`, 14, 25)
      doc.text(`Generated on: ${format(new Date(), 'MMM dd, yyyy HH:mm:ss')}`, 14, 35)
      doc.text(`Total Products: ${data.length}`, 14, 45)

      // Summary
      const totalFulfilled = data.reduce((sum, item) => sum + (item.fulfilledQuantity || 0), 0)
      const totalOriginal = data.reduce((sum, item) => sum + (item.originalQuantity || 0), 0)
      const avgFulfillment = data.length > 0 ? ((totalFulfilled / totalOriginal) * 100).toFixed(1) : 0

      doc.setFont(undefined, 'bold')
      doc.text('Production Summary:', 14, 60)
      doc.setFont(undefined, 'normal')
      doc.text(`Total Original Quantity: ${totalOriginal}`, 14, 70)
      doc.text(`Total Fulfilled Quantity: ${totalFulfilled}`, 14, 80)
      doc.text(`Average Fulfillment Rate: ${avgFulfillment}%`, 14, 90)

      // Worker Contributions Summary
      if (data.length > 0 && data[0].workerContributions) {
        doc.setFont(undefined, 'bold')
        doc.text('Worker Contributions Summary:', 14, 105)
        doc.setFont(undefined, 'normal')

        const workerContributions = {}
        data.forEach(product => {
          if (product.workerContributions) {
            product.workerContributions.forEach(contrib => {
              if (!workerContributions[contrib.workerName]) {
                workerContributions[contrib.workerName] = {
                  totalContribution: 0,
                  productsWorked: 0
                }
              }
              workerContributions[contrib.workerName].totalContribution += contrib.deliveredQuantity || contrib.quantity || 0
              workerContributions[contrib.workerName].productsWorked++
            })
          }
        })

        let yPos = 115
        Object.entries(workerContributions).forEach(([worker, stats]) => {
          doc.text(`${worker}: ${stats.totalContribution} pieces across ${stats.productsWorked} products`, 20, yPos)
          yPos += 7
        })

        // Detailed Table with Worker Contributions
        const tableData = []
        data.forEach(item => {
          const baseRow = [
            item.productName || 'Unknown',
            format(new Date(item.finishedAt), 'dd/MM/yyyy'),
            format(new Date(item.finishedAt), 'HH:mm'),
            (item.originalQuantity || 0).toString(),
            (item.fulfilledQuantity || 0).toString(),
            item.status || 'Completed'
          ]
          
          if (item.workerContributions && item.workerContributions.length > 0) {
            item.workerContributions.forEach((contrib, index) => {
              if (index === 0) {
                tableData.push([
                  ...baseRow,
                  contrib.workerName || 'Unknown',
                  (contrib.deliveredQuantity || contrib.quantity || 0).toString(),
                  contrib.note || ''
                ])
              } else {
                tableData.push([
                  '', '', '', '', '', '',
                  contrib.workerName || 'Unknown',
                  (contrib.deliveredQuantity || contrib.quantity || 0).toString(),
                  contrib.note || ''
                ])
              }
            })
          } else {
            tableData.push([...baseRow, 'No contributions', '0', ''])
          }
        })

        autoTable(doc, {
          head: [['Product Name', 'Date', 'Time', 'Original Qty', 'Fulfilled Qty', 'Status', 'Worker', 'Contribution']],
          body: tableData,
          startY: yPos + 10,
          styles: { 
            fontSize: 7,
            cellPadding: 2
          },
          headStyles: { 
            fillColor: [168, 85, 247],
            textColor: [255, 255, 255],
            fontStyle: 'bold'
          },
          alternateRowStyles: {
            fillColor: [245, 245, 245]
          },
          columnStyles: {
            0: { cellWidth: 35 }, // Product Name
            1: { cellWidth: 20 }, // Date
            2: { cellWidth: 15 }, // Time
            3: { cellWidth: 20 }, // Original Qty
            4: { cellWidth: 20 }, // Fulfilled Qty
            5: { cellWidth: 20 }, // Status
            6: { cellWidth: 25 }, // Worker
            7: { cellWidth: 20 }, // Contribution
            
          }
        })
      } else {
        // Simple table if no worker contributions
        const tableData = data.map(item => [
          item.productName || 'Unknown',
          format(new Date(item.finishedAt), 'dd/MM/yyyy'),
          format(new Date(item.finishedAt), 'HH:mm'),
          (item.originalQuantity || 0).toString(),
          (item.fulfilledQuantity || 0).toString(),
          item.status || 'Completed'
        ])

        autoTable(doc, {
          head: [['Product Name', 'Date', 'Time', 'Original Qty', 'Fulfilled Qty', 'Status']],
          body: tableData,
          startY: 105,
          styles: { fontSize: 9 },
          headStyles: { 
            fillColor: [168, 85, 247],
            textColor: [255, 255, 255]
          }
        })
      }

      doc.save(`finished_products_report_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.pdf`)
      Swal.fire('Success!', 'Finished products report downloaded successfully', 'success')
    } catch (error) {
      console.error('Error downloading finished products report:', error)
      Swal.fire('Error', 'Failed to download finished products report', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Download Workers Report
  const downloadWorkersReport = async () => {
    setLoading(true)
    try {
      const range = dateRange[0]
      const params = new URLSearchParams({
        startDate: format(range.startDate, 'yyyy-MM-dd'),
        endDate: format(range.endDate, 'yyyy-MM-dd'),
      })

      const [leatherRes, materialRes, finishedRes, usersRes] = await Promise.all([
        fetch(`/api/stock/leather?${params}`),
        fetch(`/api/stock/materials?${params}`),
        fetch(`/api/stock/finished_products?${params}`),
        fetch(`/api/user`)
      ])

      const [leatherData, materialData, finishedData, usersData] = await Promise.all([
        leatherRes.json(),
        materialRes.json(),
        finishedRes.json(),
        usersRes.json()
      ])

      const doc = new jsPDF()
      
      // Header
      doc.setFontSize(20)
      doc.setFont(undefined, 'bold')
      doc.text('Abu Bakkar Leathers - Workers Performance Report', 14, 15)
      
      doc.setFontSize(12)
      doc.setFont(undefined, 'normal')
      doc.text(`Report Period: ${format(range.startDate, 'MMM dd, yyyy')} - ${format(range.endDate, 'MMM dd, yyyy')}`, 14, 25)
      doc.text(`Generated on: ${format(new Date(), 'MMM dd, yyyy HH:mm:ss')}`, 14, 35)

      // Workers summary with detailed contributions
      const workerStats = usersData.map(user => {
        const leatherEntries = leatherData.filter(item => item.workerEmail === user.email)
        const materialEntries = materialData.filter(item => item.workerEmail === user.email)
        
        const leatherApproved = leatherEntries.filter(item => item.status === 'approved').length
        const materialApproved = materialEntries.filter(item => item.status === 'approved').length
        
        const leatherQuantity = leatherEntries.reduce((sum, item) => sum + (item.quantity || 0), 0)
        const materialQuantity = materialEntries.reduce((sum, item) => sum + (item.quantity || 0), 0)
        
        // Check finished products for worker contributions
        let finishedProductsContribution = 0
        finishedData.forEach(product => {
          if (product.workerContributions) {
            product.workerContributions.forEach(contrib => {
              if (contrib.workerEmail === user.email || contrib.workerName === user.name) {
                finishedProductsContribution += contrib.deliveredQuantity || contrib.quantity || 0
              }
            })
          }
        })
        
        return [
          user.name || 'Unknown',
          user.email || 'N/A',
          user.phone || 'N/A',
          user.status || 'pending',
          `${leatherApproved}/${leatherEntries.length}`,
          `${materialApproved}/${materialEntries.length}`,
          leatherQuantity.toString(),
          materialQuantity.toString(),
          finishedProductsContribution.toString(),
          (leatherEntries.length + materialEntries.length).toString()
        ]
      })

      doc.text(`Total Workers: ${usersData.length}`, 14, 50)
      doc.text(`Active Workers: ${usersData.filter(u => u.status === 'approved').length}`, 14, 60)

      autoTable(doc, {
        head: [['Name', 'Email', 'Phone', 'Status', 'Leather (A/T)', 'Material (A/T)', 'Leather Qty', 'Material Qty', 'Products Qty', 'Total Reports']],
        body: workerStats,
        startY: 70,
        styles: { 
          fontSize: 7,
          cellPadding: 2
        },
        headStyles: { 
          fillColor: [59, 130, 246],
          textColor: [255, 255, 255],
          fontStyle: 'bold'
        },
        alternateRowStyles: {
          fillColor: [245, 245, 245]
        }
      })

      doc.save(`workers_performance_report_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.pdf`)
      Swal.fire('Success!', 'Workers performance report downloaded successfully', 'success')
    } catch (error) {
      console.error('Error downloading workers report:', error)
      Swal.fire('Error', 'Failed to download workers report', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Download Comprehensive Report (All Data Combined)
  const downloadComprehensiveReport = async () => {
    setLoading(true)
    try {
      const range = dateRange[0]
      const params = new URLSearchParams({
        startDate: format(range.startDate, 'yyyy-MM-dd'),
        endDate: format(range.endDate, 'yyyy-MM-dd'),
      })

      // Fetch all data
      const [leatherRes, materialRes, finishedRes, usersRes] = await Promise.all([
        fetch(`/api/stock/leather?${params}`),
        fetch(`/api/stock/materials?${params}`),
        fetch(`/api/stock/finished_products?${params}`),
        fetch(`/api/user`)
      ])

      const [leatherData, materialData, finishedData, usersData] = await Promise.all([
        leatherRes.json(),
        materialRes.json(),
        finishedRes.json(),
        usersRes.json()
      ])

      const doc = new jsPDF()
      
      // Header
      doc.setFontSize(22)
      doc.setFont(undefined, 'bold')
      doc.text('Abu Bakkar Leathers', 14, 15)
      doc.text('Comprehensive Business Report', 14, 25)
      
      doc.setFontSize(12)
      doc.setFont(undefined, 'normal')
      doc.text(`Report Period: ${format(range.startDate, 'MMM dd, yyyy')} - ${format(range.endDate, 'MMM dd, yyyy')}`, 14, 35)
      doc.text(`Generated on: ${format(new Date(), 'MMM dd, yyyy HH:mm:ss')}`, 14, 45)

      let yPosition = 60

      // Executive Summary
      doc.setFontSize(16)
      doc.setFont(undefined, 'bold')
      doc.text('Executive Summary', 14, yPosition)
      yPosition += 15

      doc.setFontSize(12)
      doc.setFont(undefined, 'normal')
      doc.text(`• Total Active Workers: ${usersData.filter(u => u.status === 'approved').length}/${usersData.length}`, 20, yPosition)
      yPosition += 8
      doc.text(`• Leather Stock Entries: ${leatherData.length} (Approved: ${leatherData.filter(l => l.status === 'approved').length})`, 20, yPosition)
      yPosition += 8
      doc.text(`• Material Stock Entries: ${materialData.length} (Approved: ${materialData.filter(m => m.status === 'approved').length})`, 20, yPosition)
      yPosition += 8
      doc.text(`• Finished Products: ${finishedData.length}`, 20, yPosition)
      yPosition += 8
      doc.text(`• Total Business Activities: ${leatherData.length + materialData.length + finishedData.length}`, 20, yPosition)
      yPosition += 20

      // Leather Stock Analysis
      doc.setFontSize(14)
      doc.setFont(undefined, 'bold')
      doc.text('Leather Stock Analysis', 14, yPosition)
      yPosition += 12

      if (leatherData.length > 0) {
        const leatherTypes = [...new Set(leatherData.filter(l => l.status === 'approved').map(item => item.type))]
        const leatherWorkers = [...new Set(leatherData.map(item => item.workerName))]
        
        doc.setFontSize(10)
        doc.setFont(undefined, 'normal')
        doc.text(`Leather Types Processed: ${leatherTypes.length}`, 20, yPosition)
        yPosition += 6
        doc.text(`Workers Involved: ${leatherWorkers.length}`, 20, yPosition)
        yPosition += 6
        
        doc.setFont(undefined, 'bold')
        doc.text('Top Leather Types:', 20, yPosition)
        yPosition += 6
        doc.setFont(undefined, 'normal')
        
        leatherTypes.slice(0, 5).forEach(type => {
          const typeData = leatherData.filter(item => item.type === type && item.status === 'approved')
          const totalQty = typeData.reduce((sum, item) => sum + (item.quantity || 0), 0)
          doc.text(`  • ${type}: ${totalQty} units from ${typeData.length} submissions`, 25, yPosition)
          yPosition += 6
        })
      } else {
        doc.setFontSize(10)
        doc.setFont(undefined, 'normal')
        doc.text('No leather stock data available for this period', 20, yPosition)
        yPosition += 10
      }

      yPosition += 10

      // Material Stock Analysis
      if (yPosition > 250) {
        doc.addPage()
        yPosition = 20
      }

      doc.setFontSize(14)
      doc.setFont(undefined, 'bold')
      doc.text('Material Stock Analysis', 14, yPosition)
      yPosition += 12

      if (materialData.length > 0) {
        const materialTypes = [...new Set(materialData.filter(m => m.status === 'approved').map(item => item.material))]
        const materialWorkers = [...new Set(materialData.map(item => item.workerName))]
        
        doc.setFontSize(10)
        doc.setFont(undefined, 'normal')
        doc.text(`Material Types Processed: ${materialTypes.length}`, 20, yPosition)
        yPosition += 6
        doc.text(`Workers Involved: ${materialWorkers.length}`, 20, yPosition)
        yPosition += 6
        
        doc.setFont(undefined, 'bold')
        doc.text('Top Material Types:', 20, yPosition)
        yPosition += 6
        doc.setFont(undefined, 'normal')
        
        materialTypes.slice(0, 5).forEach(material => {
          const materialDataFiltered = materialData.filter(item => item.material === material && item.status === 'approved')
          const totalQty = materialDataFiltered.reduce((sum, item) => sum + (item.quantity || 0), 0)
          doc.text(`  • ${material}: ${totalQty} units from ${materialDataFiltered.length} submissions`, 25, yPosition)
          yPosition += 6
        })
      } else {
        doc.setFontSize(10)
        doc.setFont(undefined, 'normal')
        doc.text('No material stock data available for this period', 20, yPosition)
        yPosition += 10
      }

      yPosition += 10

      // Finished Products Analysis
      if (yPosition > 220) {
        doc.addPage()
        yPosition = 20
      }

      doc.setFontSize(14)
      doc.setFont(undefined, 'bold')
      doc.text('Production & Finished Products Analysis', 14, yPosition)
      yPosition += 12

      if (finishedData.length > 0) {
        const totalOriginalQty = finishedData.reduce((sum, item) => sum + (item.originalQuantity || 0), 0)
        const totalFulfilledQty = finishedData.reduce((sum, item) => sum + (item.fulfilledQuantity || 0), 0)
        const fulfillmentRate = totalOriginalQty > 0 ? ((totalFulfilledQty / totalOriginalQty) * 100).toFixed(1) : 0

        doc.setFontSize(10)
        doc.setFont(undefined, 'normal')
        doc.text(`Total Products Completed: ${finishedData.length}`, 20, yPosition)
        yPosition += 6
        doc.text(`Total Production Capacity: ${totalOriginalQty} units`, 20, yPosition)
        yPosition += 6
        doc.text(`Total Fulfilled Quantity: ${totalFulfilledQty} units`, 20, yPosition)
        yPosition += 6
        doc.text(`Overall Fulfillment Rate: ${fulfillmentRate}%`, 20, yPosition)
        yPosition += 10

        // Worker contributions in finished products
        const workerContributionSummary = {}
        finishedData.forEach(product => {
          if (product.workerContributions) {
            product.workerContributions.forEach(contrib => {
              if (!workerContributionSummary[contrib.workerName]) {
                workerContributionSummary[contrib.workerName] = {
                  totalContribution: 0,
                  productsCount: 0
                }
              }
              workerContributionSummary[contrib.workerName].totalContribution += contrib.deliveredQuantity || contrib.quantity || 0
              workerContributionSummary[contrib.workerName].productsCount++
            })
          }
        })

        if (Object.keys(workerContributionSummary).length > 0) {
          doc.setFont(undefined, 'bold')
          doc.text('Top Contributing Workers in Production:', 20, yPosition)
          yPosition += 6
          doc.setFont(undefined, 'normal')
          
          Object.entries(workerContributionSummary)
            .sort((a, b) => b[1].totalContribution - a[1].totalContribution)
            .slice(0, 5)
            .forEach(([worker, stats]) => {
              doc.text(`  • ${worker}: ${stats.totalContribution} units across ${stats.productsCount} products`, 25, yPosition)
              yPosition += 6
            })
        }
      } else {
        doc.setFontSize(10)
        doc.setFont(undefined, 'normal')
        doc.text('No finished products data available for this period', 20, yPosition)
        yPosition += 10
      }

      yPosition += 15

      // Worker Performance Summary
      if (yPosition > 200) {
        doc.addPage()
        yPosition = 20
      }

      doc.setFontSize(14)
      doc.setFont(undefined, 'bold')
      doc.text('Worker Performance Summary', 14, yPosition)
      yPosition += 12

      // Top performers
      const workerPerformance = usersData.map(user => {
        const leatherCount = leatherData.filter(item => item.workerEmail === user.email && item.status === 'approved').length
        const materialCount = materialData.filter(item => item.workerEmail === user.email && item.status === 'approved').length
        
        let productionContribution = 0
        finishedData.forEach(product => {
          if (product.workerContributions) {
            product.workerContributions.forEach(contrib => {
              if (contrib.workerEmail === user.email || contrib.workerName === user.name) {
                productionContribution += contrib.deliveredQuantity || contrib.quantity || 0
              }
            })
          }
        })

        return {
          name: user.name,
          email: user.email,
          status: user.status,
          leatherCount,
          materialCount,
          productionContribution,
          totalScore: leatherCount + materialCount + (productionContribution / 10) // Weight production contribution
        }
      }).sort((a, b) => b.totalScore - a.totalScore)

      doc.setFontSize(10)
      doc.setFont(undefined, 'normal')
      doc.text('Top 10 Performing Workers:', 20, yPosition)
      yPosition += 8

      workerPerformance.slice(0, 10).forEach((worker, index) => {
        doc.text(`${index + 1}. ${worker.name} - Leather: ${worker.leatherCount}, Materials: ${worker.materialCount}, Production: ${worker.productionContribution}`, 25, yPosition)
        yPosition += 6
      })

      // Detailed Data Tables on New Pages
      if (leatherData.length > 0) {
        doc.addPage()
        doc.setFontSize(16)
        doc.setFont(undefined, 'bold')
        doc.text('Detailed Leather Stock Data', 14, 20)

        const leatherTableData = leatherData.map(item => [
          format(new Date(item.date), 'dd/MM'),
          item.workerName || 'Unknown',
          item.type || 'Unknown',
          (item.quantity || 0).toString(),
          item.unit || '',
          item.status || 'pending'
        ])

        autoTable(doc, {
          head: [['Date', 'Worker', 'Type', 'Qty', 'Unit', 'Status']],
          body: leatherTableData,
          startY: 35,
          styles: { fontSize: 8 },
          headStyles: { fillColor: [146, 64, 14] }
        })
      }

      if (materialData.length > 0) {
        doc.addPage()
        doc.setFontSize(16)
        doc.setFont(undefined, 'bold')
        doc.text('Detailed Material Stock Data', 14, 20)

        const materialTableData = materialData.map(item => [
          format(new Date(item.date), 'dd/MM'),
          item.workerName || 'Unknown',
          item.material || 'Unknown',
          (item.quantity || 0).toString(),
          item.unit || '',
          item.status || 'pending'
        ])

        autoTable(doc, {
          head: [['Date', 'Worker', 'Material', 'Qty', 'Unit', 'Status']],
          body: materialTableData,
          startY: 35,
          styles: { fontSize: 8 },
          headStyles: { fillColor: [34, 197, 94] }
        })
      }

      if (finishedData.length > 0) {
        doc.addPage()
        doc.setFontSize(16)
        doc.setFont(undefined, 'bold')
        doc.text('Detailed Finished Products Data', 14, 20)

        const finishedTableData = []
        finishedData.forEach(item => {
          const baseRow = [
            item.productName || 'Unknown',
            format(new Date(item.finishedAt), 'dd/MM'),
            (item.originalQuantity || 0).toString(),
            (item.fulfilledQuantity || 0).toString()
          ]
          
          if (item.workerContributions && item.workerContributions.length > 0) {
            item.workerContributions.forEach((contrib, index) => {
              if (index === 0) {
                finishedTableData.push([
                  ...baseRow,
                  contrib.workerName || 'Unknown',
                  (contrib.deliveredQuantity || contrib.quantity || 0).toString()
                ])
              } else {
                finishedTableData.push([
                  '', '', '', '',
                  contrib.workerName || 'Unknown',
                  (contrib.deliveredQuantity || contrib.quantity || 0).toString()
                ])
              }
            })
          } else {
            finishedTableData.push([...baseRow, 'No contributors', '0'])
          }
        })

        autoTable(doc, {
          head: [['Product', 'Date', 'Original', 'Fulfilled', 'Worker', 'Contribution']],
          body: finishedTableData,
          startY: 35,
          styles: { fontSize: 8 },
          headStyles: { fillColor: [168, 85, 247] }
        })
      }

      doc.save(`comprehensive_business_report_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.pdf`)
      Swal.fire('Success!', 'Comprehensive business report downloaded successfully', 'success')
    } catch (error) {
      console.error('Error downloading comprehensive report:', error)
      Swal.fire('Error', 'Failed to download comprehensive report', 'error')
    } finally {
      setLoading(false)
    }
  }

  const reportCategories = [
    {
      title: 'Leather Stock Report',
      description: 'Complete leather inventory with worker contributions and timestamps',
      icon: FaCubes,
      color: 'bg-amber-500',
      hoverColor: 'hover:bg-amber-600',
      downloadFunc: downloadLeatherReport,
      count: reportStats.leatherStock
    },
    {
      title: 'Materials Stock Report', 
      description: 'Raw materials inventory with detailed worker performance analysis',
      icon: FaIndustry,
      color: 'bg-green-500',
      hoverColor: 'hover:bg-green-600',
      downloadFunc: downloadMaterialsReport,
      count: reportStats.materialStock
    },
    {
      title: 'Finished Products Report',
      description: 'Production completion with individual worker contributions',
      icon: FaBoxOpen,
      color: 'bg-purple-500',
      hoverColor: 'hover:bg-purple-600',
      downloadFunc: downloadFinishedProductsReport,
      count: reportStats.finishedProducts
    },
    {
      title: 'Workers Performance Report',
      description: 'Comprehensive worker productivity across all activities',
      icon: FaUsers,
      color: 'bg-blue-500',
      hoverColor: 'hover:bg-blue-600',
      downloadFunc: downloadWorkersReport,
      count: reportStats.totalUsers
    },
    {
      title: 'Comprehensive Business Report',
      description: 'Complete business overview with all data, analytics, and detailed tables',
      icon: FaFileAlt,
      color: 'bg-gray-700',
      hoverColor: 'hover:bg-gray-800',
      downloadFunc: downloadComprehensiveReport,
      count: reportStats.totalReports
    }
  ]

  return (
    <div className="min-h-screen p-2 sm:p-4 lg:p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-4 sm:mb-6 lg:mb-8">
          <h1 className="text-xl sm:text-2xl lg:text-3xl xl:text-4xl font-bold text-gray-900 mb-2">
            Admin Reports Center
          </h1>
          <p className="text-gray-600 text-xs sm:text-sm lg:text-base">
            Generate comprehensive reports with worker details and timestamps for Abu Bakkar Leathers
          </p>
        </div>

        {/* Date Range Selection */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 lg:p-6 mb-4 sm:mb-6 lg:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-1">Report Period</h2>
              <p className="text-xs sm:text-sm text-gray-600">Select date range for all reports</p>
            </div>
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
              <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-600">
                <FaCalendarAlt className="text-xs sm:text-sm" />
                <span className="font-medium">
                  {format(dateRange[0].startDate, 'MMM dd, yyyy')} - {format(dateRange[0].endDate, 'MMM dd, yyyy')}
                </span>
              </div>
              
              <button
                onClick={() => setShowDatePicker(!showDatePicker)}
                className="bg-gray-100 text-gray-700 px-3 sm:px-4 py-2 rounded-lg hover:bg-gray-200 transition text-xs sm:text-sm font-medium"
              >
                Change Period
              </button>
            </div>
          </div>

          {/* Date Range Picker */}
          {showDatePicker && (
            <div className="mt-4 sm:mt-6 flex flex-col items-center">
              <div className="scale-75 sm:scale-90 lg:scale-100 origin-center">
                <DateRangePicker
                  ranges={dateRange}
                  onChange={handleDateRangeChange}
                  showSelectionPreview={true}
                  moveRangeOnFirstSelection={false}
                  months={window.innerWidth < 640 ? 1 : 2}
                  direction={window.innerWidth < 640 ? 'vertical' : 'horizontal'}
                />
              </div>
              <div className="mt-3 sm:mt-4 flex gap-2">
                <button
                  onClick={applyDateFilter}
                  className="bg-blue-600 text-white py-2 px-3 sm:px-4 rounded-lg hover:bg-blue-700 transition text-xs sm:text-sm font-medium"
                >
                  Apply Period
                </button>
                <button
                  onClick={() => setShowDatePicker(false)}
                  className="bg-gray-300 text-gray-700 py-2 px-3 sm:px-4 rounded-lg hover:bg-gray-400 transition text-xs sm:text-sm font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-4 lg:gap-6 mb-4 sm:mb-6 lg:mb-8">
          <div className="bg-white rounded-lg lg:rounded-xl p-3 sm:p-4 lg:p-6 shadow-sm border border-gray-200">
            <div className="flex items-center gap-2 lg:gap-3">
              <div className="p-1.5 sm:p-2 bg-blue-100 rounded-lg">
                <FaUsers className="text-blue-600 text-sm sm:text-base lg:text-lg" />
              </div>
              <div>
                <p className="text-xs sm:text-sm text-gray-600">Workers</p>
                <p className="text-lg sm:text-xl font-bold text-gray-900">{reportStats.totalUsers}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg lg:rounded-xl p-3 sm:p-4 lg:p-6 shadow-sm border border-gray-200">
            <div className="flex items-center gap-2 lg:gap-3">
              <div className="p-1.5 sm:p-2 bg-amber-100 rounded-lg">
                <FaCubes className="text-amber-600 text-sm sm:text-base lg:text-lg" />
              </div>
              <div>
                <p className="text-xs sm:text-sm text-gray-600">Leather</p>
                <p className="text-lg sm:text-xl font-bold text-gray-900">{reportStats.leatherStock}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg lg:rounded-xl p-3 sm:p-4 lg:p-6 shadow-sm border border-gray-200">
            <div className="flex items-center gap-2 lg:gap-3">
              <div className="p-1.5 sm:p-2 bg-green-100 rounded-lg">
                <FaIndustry className="text-green-600 text-sm sm:text-base lg:text-lg" />
              </div>
              <div>
                <p className="text-xs sm:text-sm text-gray-600">Materials</p>
                <p className="text-lg sm:text-xl font-bold text-gray-900">{reportStats.materialStock}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg lg:rounded-xl p-3 sm:p-4 lg:p-6 shadow-sm border border-gray-200">
            <div className="flex items-center gap-2 lg:gap-3">
              <div className="p-1.5 sm:p-2 bg-purple-100 rounded-lg">
                <FaBoxOpen className="text-purple-600 text-sm sm:text-base lg:text-lg" />
              </div>
              <div>
                <p className="text-xs sm:text-sm text-gray-600">Products</p>
                <p className="text-lg sm:text-xl font-bold text-gray-900">{reportStats.finishedProducts}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg lg:rounded-xl p-3 sm:p-4 lg:p-6 shadow-sm border border-gray-200 col-span-2 sm:col-span-3 lg:col-span-1">
            <div className="flex items-center gap-2 lg:gap-3">
              <div className="p-1.5 sm:p-2 bg-gray-100 rounded-lg">
                <FaChartLine className="text-gray-600 text-sm sm:text-base lg:text-lg" />
              </div>
              <div>
                <p className="text-xs sm:text-sm text-gray-600">Total</p>
                <p className="text-lg sm:text-xl font-bold text-gray-900">{reportStats.totalReports}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Report Categories */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
          {reportCategories.map((category) => (
            <div key={category.title} className="bg-white rounded-lg lg:rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5 lg:p-6 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3 sm:mb-4">
                <div className={`p-2 sm:p-3 rounded-lg ${category.color}`}>
                  <category.icon className="text-white text-lg sm:text-xl" />
                </div>
                <div className="text-right">
                  <p className="text-xs sm:text-sm text-gray-500">Entries</p>
                  <p className="text-lg sm:text-xl font-bold text-gray-900">{category.count}</p>
                </div>
              </div>
              
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">
                {category.title}
              </h3>
              <p className="text-gray-600 text-xs sm:text-sm mb-4">
                {category.description}
              </p>
              
              <button
                onClick={category.downloadFunc}
                disabled={loading}
                className={`w-full flex items-center justify-center gap-2 ${category.color} ${category.hoverColor} text-white py-2 sm:py-2.5 px-3 sm:px-4 rounded-lg transition disabled:opacity-50 font-medium text-xs sm:text-sm`}
              >
                <FaDownload className="text-xs sm:text-sm" />
                {loading ? 'Generating...' : 'Download Report'}
              </button>
            </div>
          ))}
        </div>

        {/* Loading Overlay */}
        {loading && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-4 sm:p-6 shadow-xl mx-4">
              <div className="flex items-center gap-3">
                <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-blue-600"></div>
                <p className="text-gray-900 font-medium text-sm sm:text-base">Generating detailed report...</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
