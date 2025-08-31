'use client'

import { useState, useEffect, useContext } from 'react'
import { DateRangePicker } from 'react-date-range'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { format } from 'date-fns'
import Swal from 'sweetalert2'
import { AuthContext } from '../../../../Provider/AuthProvider'
import { 
  FaDownload, 
  FaCalendarAlt, 
  FaCubes, 
  FaIndustry, 
  FaBoxOpen,
  FaFileAlt,
  FaChartLine
} from 'react-icons/fa'
import 'react-date-range/dist/styles.css'
import 'react-date-range/dist/theme/default.css'

export default function WorkerReportsPage() {
  const { user } = useContext(AuthContext)
  const userEmail = user?.email
  const userName = user?.name || user?.displayName || 'Worker'

  const [loading, setLoading] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [reportStats, setReportStats] = useState({
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

  // Fetch worker's report statistics
  const fetchReportStats = async () => {
    if (!userEmail) {
      console.log('No user email available')
      return
    }

    setLoading(true)
    try {
      const range = dateRange[0]
      const params = new URLSearchParams({
        startDate: format(range.startDate, 'yyyy-MM-dd'),
        endDate: format(range.endDate, 'yyyy-MM-dd'),
        workerEmail: userEmail,
      })

      const [leatherRes, materialRes, finishedRes] = await Promise.all([
        fetch(`/api/stock/leather?${params}`),
        fetch(`/api/stock/materials?${params}`),
        fetch(`/api/stock/finished_products?${params}`)
      ])

      const [leatherData, materialData, finishedData] = await Promise.all([
        leatherRes.ok ? leatherRes.json() : [],
        materialRes.ok ? materialRes.json() : [],
        finishedRes.ok ? finishedRes.json() : []
      ])

      // Filter data for current worker only
      const myLeatherData = leatherData.filter(item => item.workerEmail === userEmail)
      const myMaterialData = materialData.filter(item => item.workerEmail === userEmail)
      
      // For finished products, filter by worker contributions
      const myFinishedData = finishedData.filter(product => {
        if (product.workerContributions) {
          return product.workerContributions.some(contrib => 
            contrib.workerEmail === userEmail || contrib.workerName === userName
          )
        }
        return false
      })

      setReportStats({
        leatherStock: myLeatherData.length,
        materialStock: myMaterialData.length,
        finishedProducts: myFinishedData.length,
        totalReports: myLeatherData.length + myMaterialData.length
      })
    } catch (error) {
      console.error('Error fetching report stats:', error)
      Swal.fire('Error', 'Failed to fetch report statistics', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (userEmail) {
      fetchReportStats()
    }
  }, [userEmail])

  const handleDateRangeChange = (ranges) => {
    setDateRange([ranges.selection])
  }

  const applyDateFilter = () => {
    fetchReportStats()
    setShowDatePicker(false)
  }

  // Download My Leather Stock Report
  const downloadMyLeatherReport = async () => {
    if (!userEmail) {
      Swal.fire('Error', 'User not logged in', 'error')
      return
    }

    setLoading(true)
    try {
      const range = dateRange[0]
      const params = new URLSearchParams({
        startDate: format(range.startDate, 'yyyy-MM-dd'),
        endDate: format(range.endDate, 'yyyy-MM-dd'),
        workerEmail: userEmail,
      })

      const res = await fetch(`/api/stock/leather?${params}`)
      const allData = await res.json()
      const myData = allData.filter(item => item.workerEmail === userEmail)

      const doc = new jsPDF()
      
      // Header
      doc.setFontSize(20)
      doc.setFont(undefined, 'bold')
      doc.text('My Leather Stock Report - Abu Bakkar Leathers', 14, 15)
      
      doc.setFontSize(12)
      doc.setFont(undefined, 'normal')
      doc.text(`Worker: ${userName}`, 14, 25)
      doc.text(`Email: ${userEmail}`, 14, 35)
      doc.text(`Report Period: ${format(range.startDate, 'MMM dd, yyyy')} - ${format(range.endDate, 'MMM dd, yyyy')}`, 14, 45)
      doc.text(`Generated on: ${format(new Date(), 'MMM dd, yyyy HH:mm:ss')}`, 14, 55)
      doc.text(`Total Entries: ${myData.length}`, 14, 65)

      // My Performance Summary
      const approvedCount = myData.filter(item => item.status === 'approved').length
      const pendingCount = myData.filter(item => item.status === 'pending').length
      const rejectedCount = myData.filter(item => item.status === 'rejected').length
      const totalQuantity = myData.reduce((sum, item) => sum + (item.quantity || 0), 0)

      doc.setFont(undefined, 'bold')
      doc.text('My Performance Summary:', 14, 80)
      doc.setFont(undefined, 'normal')
      doc.text(`Approved: ${approvedCount} | Pending: ${pendingCount} | Rejected: ${rejectedCount}`, 14, 90)
      doc.text(`Total Quantity Submitted: ${totalQuantity} units`, 14, 100)

      // Leather Types I Submitted
      const myLeatherTypes = {}
      myData.forEach(item => {
        if (item.status === 'approved') {
          if (!myLeatherTypes[item.type]) {
            myLeatherTypes[item.type] = { count: 0, quantity: 0 }
          }
          myLeatherTypes[item.type].count++
          myLeatherTypes[item.type].quantity += item.quantity || 0
        }
      })

      doc.setFont(undefined, 'bold')
      doc.text('My Approved Leather Types:', 14, 115)
      doc.setFont(undefined, 'normal')

      let yPos = 125
      Object.entries(myLeatherTypes).forEach(([type, stats]) => {
        doc.text(`${type}: ${stats.quantity} units from ${stats.count} submissions`, 20, yPos)
        yPos += 7
      })

      // Detailed Table
      const tableData = myData.map(item => [
        format(new Date(item.date), 'dd/MM/yyyy'),
        format(new Date(item.createdAt || item.date), 'HH:mm'),
        item.type || 'Unknown',
        (item.quantity || 0).toString(),
        item.unit || '',
        item.status || 'pending'
      ])

      autoTable(doc, {
        head: [['Date', 'Time', 'Leather Type', 'Quantity', 'Unit', 'Status']],
        body: tableData,
        startY: yPos + 10,
        styles: { 
          fontSize: 9,
          cellPadding: 3
        },
        headStyles: { 
          fillColor: [146, 64, 14],
          textColor: [255, 255, 255],
          fontStyle: 'bold'
        },
        alternateRowStyles: {
          fillColor: [245, 245, 245]
        }
      })

      doc.save(`my_leather_stock_report_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.pdf`)
      Swal.fire('Success!', 'Your leather stock report downloaded successfully', 'success')
    } catch (error) {
      console.error('Error downloading leather report:', error)
      Swal.fire('Error', 'Failed to download leather report', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Download My Materials Stock Report
  const downloadMyMaterialsReport = async () => {
    if (!userEmail) {
      Swal.fire('Error', 'User not logged in', 'error')
      return
    }

    setLoading(true)
    try {
      const range = dateRange[0]
      const params = new URLSearchParams({
        startDate: format(range.startDate, 'yyyy-MM-dd'),
        endDate: format(range.endDate, 'yyyy-MM-dd'),
        workerEmail: userEmail,
      })

      const res = await fetch(`/api/stock/materials?${params}`)
      const allData = await res.json()
      const myData = allData.filter(item => item.workerEmail === userEmail)

      const doc = new jsPDF()
      
      // Header
      doc.setFontSize(20)
      doc.setFont(undefined, 'bold')
      doc.text('My Materials Stock Report - Abu Bakkar Leathers', 14, 15)
      
      doc.setFontSize(12)
      doc.setFont(undefined, 'normal')
      doc.text(`Worker: ${userName}`, 14, 25)
      doc.text(`Email: ${userEmail}`, 14, 35)
      doc.text(`Report Period: ${format(range.startDate, 'MMM dd, yyyy')} - ${format(range.endDate, 'MMM dd, yyyy')}`, 14, 45)
      doc.text(`Generated on: ${format(new Date(), 'MMM dd, yyyy HH:mm:ss')}`, 14, 55)
      doc.text(`Total Entries: ${myData.length}`, 14, 65)

      // My Performance Summary
      const approvedCount = myData.filter(item => item.status === 'approved').length
      const pendingCount = myData.filter(item => item.status === 'pending').length
      const totalQuantity = myData.reduce((sum, item) => sum + (item.quantity || 0), 0)

      doc.setFont(undefined, 'bold')
      doc.text('My Performance Summary:', 14, 80)
      doc.setFont(undefined, 'normal')
      doc.text(`Approved: ${approvedCount} | Pending: ${pendingCount}`, 14, 90)
      doc.text(`Total Quantity Submitted: ${totalQuantity} units`, 14, 100)

      // Materials I Submitted
      const myMaterials = {}
      myData.forEach(item => {
        if (item.status === 'approved') {
          if (!myMaterials[item.material]) {
            myMaterials[item.material] = { count: 0, quantity: 0 }
          }
          myMaterials[item.material].count++
          myMaterials[item.material].quantity += item.quantity || 0
        }
      })

      doc.setFont(undefined, 'bold')
      doc.text('My Approved Materials:', 14, 115)
      doc.setFont(undefined, 'normal')

      let yPos = 125
      Object.entries(myMaterials).forEach(([material, stats]) => {
        doc.text(`${material}: ${stats.quantity} units from ${stats.count} submissions`, 20, yPos)
        yPos += 7
      })

      // Detailed Table
      const tableData = myData.map(item => [
        format(new Date(item.date), 'dd/MM/yyyy'),
        format(new Date(item.createdAt || item.date), 'HH:mm'),
        item.material || 'Unknown',
        (item.quantity || 0).toString(),
        item.unit || '',
        item.status || 'pending'
      ])

      autoTable(doc, {
        head: [['Date', 'Time', 'Material', 'Quantity', 'Unit', 'Status']],
        body: tableData,
        startY: yPos + 10,
        styles: { 
          fontSize: 9,
          cellPadding: 3
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

      doc.save(`my_materials_stock_report_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.pdf`)
      Swal.fire('Success!', 'Your materials stock report downloaded successfully', 'success')
    } catch (error) {
      console.error('Error downloading materials report:', error)
      Swal.fire('Error', 'Failed to download materials report', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Download My Finished Products Report
  const downloadMyFinishedProductsReport = async () => {
    if (!userEmail) {
      Swal.fire('Error', 'User not logged in', 'error')
      return
    }

    setLoading(true)
    try {
      const range = dateRange[0]
      const params = new URLSearchParams({
        startDate: format(range.startDate, 'yyyy-MM-dd'),
        endDate: format(range.endDate, 'yyyy-MM-dd'),
      })

      const res = await fetch(`/api/stock/finished_products?${params}`)
      const allData = await res.json()
      
      // Filter products where I contributed
      const myData = allData.filter(product => {
        if (product.workerContributions) {
          return product.workerContributions.some(contrib => 
            contrib.workerEmail === userEmail || contrib.workerName === userName
          )
        }
        return false
      })

      const doc = new jsPDF()
      
      // Header
      doc.setFontSize(20)
      doc.setFont(undefined, 'bold')
      doc.text('My Production Report - Abu Bakkar Leathers', 14, 15)
      
      doc.setFontSize(12)
      doc.setFont(undefined, 'normal')
      doc.text(`Worker: ${userName}`, 14, 25)
      doc.text(`Email: ${userEmail}`, 14, 35)
      doc.text(`Report Period: ${format(range.startDate, 'MMM dd, yyyy')} - ${format(range.endDate, 'MMM dd, yyyy')}`, 14, 45)
      doc.text(`Generated on: ${format(new Date(), 'MMM dd, yyyy HH:mm:ss')}`, 14, 55)
      doc.text(`Products I Contributed To: ${myData.length}`, 14, 65)

      // My Contribution Summary
      let totalMyContribution = 0
      myData.forEach(product => {
        if (product.workerContributions) {
          product.workerContributions.forEach(contrib => {
            if (contrib.workerEmail === userEmail || contrib.workerName === userName) {
              totalMyContribution += contrib.deliveredQuantity || contrib.quantity || 0
            }
          })
        }
      })

      doc.setFont(undefined, 'bold')
      doc.text('My Production Summary:', 14, 80)
      doc.setFont(undefined, 'normal')
      doc.text(`Total Pieces I Produced: ${totalMyContribution}`, 14, 90)
      doc.text(`Average per Product: ${myData.length > 0 ? Math.round(totalMyContribution / myData.length) : 0}`, 14, 100)

      // Detailed Table with My Contributions
      const tableData = []
      myData.forEach(product => {
        if (product.workerContributions) {
          product.workerContributions.forEach(contrib => {
            if (contrib.workerEmail === userEmail || contrib.workerName === userName) {
              tableData.push([
                product.productName || 'Unknown',
                format(new Date(product.finishedAt), 'dd/MM/yyyy'),
                format(new Date(product.finishedAt), 'HH:mm'),
                (product.originalQuantity || 0).toString(),
                (contrib.deliveredQuantity || contrib.quantity || 0).toString(),
                contrib.note || 'No notes'
              ])
            }
          })
        }
      })

      autoTable(doc, {
        head: [['Product Name', 'Date', 'Time', 'Total Quantity', 'My Contribution', 'My Notes']],
        body: tableData,
        startY: 115,
        styles: { 
          fontSize: 8,
          cellPadding: 3
        },
        headStyles: { 
          fillColor: [168, 85, 247],
          textColor: [255, 255, 255],
          fontStyle: 'bold'
        },
        alternateRowStyles: {
          fillColor: [245, 245, 245]
        }
      })

      doc.save(`my_production_report_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.pdf`)
      Swal.fire('Success!', 'Your production report downloaded successfully', 'success')
    } catch (error) {
      console.error('Error downloading production report:', error)
      Swal.fire('Error', 'Failed to download production report', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Download My Comprehensive Report
  const downloadMyComprehensiveReport = async () => {
    if (!userEmail) {
      Swal.fire('Error', 'User not logged in', 'error')
      return
    }

    setLoading(true)
    try {
      const range = dateRange[0]
      const params = new URLSearchParams({
        startDate: format(range.startDate, 'yyyy-MM-dd'),
        endDate: format(range.endDate, 'yyyy-MM-dd'),
        workerEmail: userEmail,
      })

      // Fetch all my data
      const [leatherRes, materialRes, finishedRes] = await Promise.all([
        fetch(`/api/stock/leather?${params}`),
        fetch(`/api/stock/materials?${params}`),
        fetch(`/api/stock/finished_products?${params}`)
      ])

      const [allLeatherData, allMaterialData, allFinishedData] = await Promise.all([
        leatherRes.json(),
        materialRes.json(),
        finishedRes.json()
      ])

      const myLeatherData = allLeatherData.filter(item => item.workerEmail === userEmail)
      const myMaterialData = allMaterialData.filter(item => item.workerEmail === userEmail)
      const myFinishedData = allFinishedData.filter(product => {
        if (product.workerContributions) {
          return product.workerContributions.some(contrib => 
            contrib.workerEmail === userEmail || contrib.workerName === userName
          )
        }
        return false
      })

      const doc = new jsPDF()
      
      // Header
      doc.setFontSize(22)
      doc.setFont(undefined, 'bold')
      doc.text('My Comprehensive Performance Report', 14, 15)
      doc.text('Abu Bakkar Leathers', 14, 25)
      
      doc.setFontSize(12)
      doc.setFont(undefined, 'normal')
      doc.text(`Worker: ${userName}`, 14, 35)
      doc.text(`Email: ${userEmail}`, 14, 45)
      doc.text(`Report Period: ${format(range.startDate, 'MMM dd, yyyy')} - ${format(range.endDate, 'MMM dd, yyyy')}`, 14, 55)
      doc.text(`Generated on: ${format(new Date(), 'MMM dd, yyyy HH:mm:ss')}`, 14, 65)

      let yPosition = 80

      // Executive Summary
      doc.setFontSize(16)
      doc.setFont(undefined, 'bold')
      doc.text('My Performance Summary', 14, yPosition)
      yPosition += 15

      doc.setFontSize(12)
      doc.setFont(undefined, 'normal')
      doc.text(`• Leather Stock Entries: ${myLeatherData.length} (Approved: ${myLeatherData.filter(l => l.status === 'approved').length})`, 20, yPosition)
      yPosition += 8
      doc.text(`• Material Stock Entries: ${myMaterialData.length} (Approved: ${myMaterialData.filter(m => m.status === 'approved').length})`, 20, yPosition)
      yPosition += 8
      doc.text(`• Products I Contributed To: ${myFinishedData.length}`, 20, yPosition)
      yPosition += 8
      doc.text(`• Total Activities: ${myLeatherData.length + myMaterialData.length + myFinishedData.length}`, 20, yPosition)
      yPosition += 20

      // My Leather Contributions
      if (myLeatherData.length > 0) {
        doc.setFontSize(14)
        doc.setFont(undefined, 'bold')
        doc.text('My Leather Stock Contributions', 14, yPosition)
        yPosition += 12

        const leatherQuantity = myLeatherData.reduce((sum, item) => sum + (item.quantity || 0), 0)
        const approvedLeather = myLeatherData.filter(item => item.status === 'approved')
        
        doc.setFontSize(10)
        doc.setFont(undefined, 'normal')
        doc.text(`Total Quantity Submitted: ${leatherQuantity} units`, 20, yPosition)
        yPosition += 6
        doc.text(`Approved Submissions: ${approvedLeather.length}/${myLeatherData.length}`, 20, yPosition)
        yPosition += 10
      }

      // My Material Contributions
      if (myMaterialData.length > 0) {
        doc.setFontSize(14)
        doc.setFont(undefined, 'bold')
        doc.text('My Material Stock Contributions', 14, yPosition)
        yPosition += 12

        const materialQuantity = myMaterialData.reduce((sum, item) => sum + (item.quantity || 0), 0)
        const approvedMaterial = myMaterialData.filter(item => item.status === 'approved')
        
        doc.setFontSize(10)
        doc.setFont(undefined, 'normal')
        doc.text(`Total Quantity Submitted: ${materialQuantity} units`, 20, yPosition)
        yPosition += 6
        doc.text(`Approved Submissions: ${approvedMaterial.length}/${myMaterialData.length}`, 20, yPosition)
        yPosition += 10
      }

      // My Production Contributions
      if (myFinishedData.length > 0) {
        doc.setFontSize(14)
        doc.setFont(undefined, 'bold')
        doc.text('My Production Contributions', 14, yPosition)
        yPosition += 12

        let totalProduction = 0
        myFinishedData.forEach(product => {
          if (product.workerContributions) {
            product.workerContributions.forEach(contrib => {
              if (contrib.workerEmail === userEmail || contrib.workerName === userName) {
                totalProduction += contrib.deliveredQuantity || contrib.quantity || 0
              }
            })
          }
        })

        doc.setFontSize(10)
        doc.setFont(undefined, 'normal')
        doc.text(`Total Pieces Produced: ${totalProduction}`, 20, yPosition)
        yPosition += 6
        doc.text(`Products Worked On: ${myFinishedData.length}`, 20, yPosition)
        yPosition += 6
        doc.text(`Average per Product: ${myFinishedData.length > 0 ? Math.round(totalProduction / myFinishedData.length) : 0}`, 20, yPosition)
        yPosition += 15
      }

      // Add detailed data tables on new pages
      if (myLeatherData.length > 0) {
        doc.addPage()
        doc.setFontSize(16)
        doc.setFont(undefined, 'bold')
        doc.text('My Detailed Leather Stock Data', 14, 20)

        const leatherTableData = myLeatherData.map(item => [
          format(new Date(item.date), 'dd/MM'),
          item.type || 'Unknown',
          (item.quantity || 0).toString(),
          item.unit || '',
          item.status || 'pending'
        ])

        autoTable(doc, {
          head: [['Date', 'Type', 'Quantity', 'Unit', 'Status']],
          body: leatherTableData,
          startY: 35,
          styles: { fontSize: 9 },
          headStyles: { fillColor: [146, 64, 14] }
        })
      }

      if (myMaterialData.length > 0) {
        doc.addPage()
        doc.setFontSize(16)
        doc.setFont(undefined, 'bold')
        doc.text('My Detailed Material Stock Data', 14, 20)

        const materialTableData = myMaterialData.map(item => [
          format(new Date(item.date), 'dd/MM'),
          item.material || 'Unknown',
          (item.quantity || 0).toString(),
          item.unit || '',
          item.status || 'pending'
        ])

        autoTable(doc, {
          head: [['Date', 'Material', 'Quantity', 'Unit', 'Status']],
          body: materialTableData,
          startY: 35,
          styles: { fontSize: 9 },
          headStyles: { fillColor: [34, 197, 94] }
        })
      }

      if (myFinishedData.length > 0) {
        doc.addPage()
        doc.setFontSize(16)
        doc.setFont(undefined, 'bold')
        doc.text('My Detailed Production Data', 14, 20)

        const productionTableData = []
        myFinishedData.forEach(product => {
          if (product.workerContributions) {
            product.workerContributions.forEach(contrib => {
              if (contrib.workerEmail === userEmail || contrib.workerName === userName) {
                productionTableData.push([
                  product.productName || 'Unknown',
                  format(new Date(product.finishedAt), 'dd/MM'),
                  (product.originalQuantity || 0).toString(),
                  (contrib.deliveredQuantity || contrib.quantity || 0).toString(),
                  contrib.note || ''
                ])
              }
            })
          }
        })

        autoTable(doc, {
          head: [['Product', 'Date', 'Total Qty', 'My Contribution', 'Notes']],
          body: productionTableData,
          startY: 35,
          styles: { fontSize: 9 },
          headStyles: { fillColor: [168, 85, 247] }
        })
      }

      doc.save(`my_comprehensive_report_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.pdf`)
      Swal.fire('Success!', 'Your comprehensive report downloaded successfully', 'success')
    } catch (error) {
      console.error('Error downloading comprehensive report:', error)
      Swal.fire('Error', 'Failed to download comprehensive report', 'error')
    } finally {
      setLoading(false)
    }
  }

  const reportCategories = [
    {
      title: 'My Leather Stock Report',
      description: 'My leather inventory submissions with timestamps and approval status',
      icon: FaCubes,
      color: 'bg-amber-500',
      hoverColor: 'hover:bg-amber-600',
      downloadFunc: downloadMyLeatherReport,
      count: reportStats.leatherStock
    },
    {
      title: 'My Materials Stock Report', 
      description: 'My material submissions with quantities and approval tracking',
      icon: FaIndustry,
      color: 'bg-green-500',
      hoverColor: 'hover:bg-green-600',
      downloadFunc: downloadMyMaterialsReport,
      count: reportStats.materialStock
    },
    {
      title: 'My Production Report',
      description: 'Products I contributed to with my individual contributions',
      icon: FaBoxOpen,
      color: 'bg-purple-500',
      hoverColor: 'hover:bg-purple-600',
      downloadFunc: downloadMyFinishedProductsReport,
      count: reportStats.finishedProducts
    },
    {
      title: 'My Comprehensive Report',
      description: 'Complete overview of all my activities with detailed performance analysis',
      icon: FaFileAlt,
      color: 'bg-gray-700',
      hoverColor: 'hover:bg-gray-800',
      downloadFunc: downloadMyComprehensiveReport,
      count: reportStats.totalReports
    }
  ]

  if (!userEmail) {
    return (
      <div className="min-h-screen p-2 sm:p-4 lg:p-8 bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
          <p className="text-gray-600">Please log in to view your reports</p>
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
            My Reports Center
          </h1>
          <p className="text-gray-600 text-xs sm:text-sm lg:text-base">
            Download your personal performance reports for Abu Bakkar Leathers
          </p>
        </div>

        {/* Date Range Selection */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 lg:p-6 mb-4 sm:mb-6 lg:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-1">Report Period</h2>
              <p className="text-xs sm:text-sm text-gray-600">Select date range for your reports</p>
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 lg:gap-6 mb-4 sm:mb-6 lg:mb-8">
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

          <div className="bg-white rounded-lg lg:rounded-xl p-3 sm:p-4 lg:p-6 shadow-sm border border-gray-200">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
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
                <p className="text-gray-900 font-medium text-sm sm:text-base">Generating your report...</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
