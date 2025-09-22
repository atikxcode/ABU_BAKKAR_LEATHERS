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
  FaChartLine,
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
    totalReports: 0,
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

      const [leatherRes, materialRes, finishedRes, usersRes] =
        await Promise.all([
          fetch(`/api/stock/leather?${params}`),
          fetch(`/api/stock/materials?${params}`),
          fetch(`/api/stock/finished_products?${params}`),
          fetch(`/api/user`),
        ])

      const [leatherData, materialData, finishedData, usersData] =
        await Promise.all([
          leatherRes.ok ? leatherRes.json() : [],
          materialRes.ok ? materialRes.json() : [],
          finishedRes.ok ? finishedRes.json() : [],
          usersRes.ok ? usersRes.json() : [],
        ])

      setReportStats({
        totalUsers: usersData.length,
        leatherStock: leatherData.length,
        materialStock: materialData.length,
        finishedProducts: finishedData.length,
        totalReports:
          leatherData.length + materialData.length + finishedData.length,
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

  // ✅ FIXED: Updated function to use correct field names
  const enrichDataWithCompanyInfo = async (data, usersData) => {
    return data.map((item) => {
      const worker = usersData.find(
        (user) =>
          user.email === item.workerEmail ||
          user.name === item.workerName ||
          user._id?.toString() === item.workerId
      )

      return {
        ...item,
        // ✅ FIXED: Use 'company' field directly from item (as it exists in MongoDB)
        // Fall back to user company, then 'N/A'
        workerCompany: item.company || worker?.company || 'N/A',
      }
    })
  }

  // ✅ FIXED: Download Leather Stock Report with proper company data
  const downloadLeatherReport = async () => {
    setLoading(true)
    try {
      const range = dateRange[0]
      const params = new URLSearchParams({
        startDate: format(range.startDate, 'yyyy-MM-dd'),
        endDate: format(range.endDate, 'yyyy-MM-dd'),
      })

      // Fetch both leather data and users data
      const [leatherRes, usersRes] = await Promise.all([
        fetch(`/api/stock/leather?${params}`),
        fetch(`/api/user`),
      ])

      const [leatherData, usersData] = await Promise.all([
        leatherRes.json(),
        usersRes.json(),
      ])

      // ✅ FIXED: Enrich leather data with company information
      const enrichedData = await enrichDataWithCompanyInfo(
        leatherData,
        usersData
      )

      const doc = new jsPDF()

      // Header
      doc.setFontSize(20)
      doc.setFont(undefined, 'bold')
      doc.text('Abu Bakkar Leathers - Leather Stock Report', 14, 15)

      doc.setFontSize(12)
      doc.setFont(undefined, 'normal')
      doc.text(
        `Report Period: ${format(range.startDate, 'MMM dd, yyyy')} - ${format(
          range.endDate,
          'MMM dd, yyyy'
        )}`,
        14,
        25
      )
      doc.text(
        `Generated on: ${format(new Date(), 'MMM dd, yyyy HH:mm:ss')}`,
        14,
        35
      )
      doc.text(`Total Entries: ${enrichedData.length}`, 14, 45)

      // Summary by Status
      const approvedCount = enrichedData.filter(
        (item) => item.status === 'approved'
      ).length
      const pendingCount = enrichedData.filter(
        (item) => item.status === 'pending'
      ).length
      const rejectedCount = enrichedData.filter(
        (item) => item.status === 'rejected'
      ).length

      doc.setFont(undefined, 'bold')
      doc.text('Status Summary:', 14, 60)
      doc.setFont(undefined, 'normal')
      doc.text(
        `Approved: ${approvedCount} | Pending: ${pendingCount} | Rejected: ${rejectedCount}`,
        14,
        70
      )

      // ✅ FIXED: Worker Contribution Summary with Company
      doc.setFont(undefined, 'bold')
      doc.text('Worker Contribution Summary:', 14, 85)
      doc.setFont(undefined, 'normal')

      const workerSummary = {}
      enrichedData.forEach((item) => {
        const workerKey = `${item.workerName} (${item.workerCompany})`
        if (!workerSummary[workerKey]) {
          workerSummary[workerKey] = {
            total: 0,
            approved: 0,
            pending: 0,
            rejected: 0,
            quantity: 0,
          }
        }
        workerSummary[workerKey].total++
        workerSummary[workerKey][item.status]++
        workerSummary[workerKey].quantity += item.quantity || 0
      })

      let yPos = 95
      Object.entries(workerSummary).forEach(([worker, stats]) => {
        doc.text(
          `${worker}: ${stats.total} reports, ${stats.quantity} total units (A:${stats.approved}, P:${stats.pending}, R:${stats.rejected})`,
          20,
          yPos
        )
        yPos += 7
      })

      // ✅ FIXED: Detailed Table with Company column
      const tableData = enrichedData.map((item) => [
        format(new Date(item.date), 'dd/MM/yyyy'),
        format(new Date(item.createdAt || item.date), 'HH:mm'),
        item.workerName || 'Unknown',
        item.workerCompany || 'N/A', // ✅ FIXED: Now properly populated from 'company' field
        item.workerPhone || 'N/A',
        item.type || 'Unknown',
        (item.quantity || 0).toString(),
        item.unit || '',
        item.status || 'pending',
      ])

      autoTable(doc, {
        head: [
          [
            'Date',
            'Time',
            'Worker Name',
            'Company',
            'Phone',
            'Leather Type',
            'Quantity',
            'Unit',
            'Status',
          ],
        ],
        body: tableData,
        startY: yPos + 10,
        styles: {
          fontSize: 7,
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
        columnStyles: {
          0: { cellWidth: 18 }, // Date
          1: { cellWidth: 12 }, // Time
          2: { cellWidth: 25 }, // Worker Name
          3: { cellWidth: 20 }, // Company
          4: { cellWidth: 20 }, // Phone
          5: { cellWidth: 22 }, // Type
          6: { cellWidth: 15 }, // Quantity
          7: { cellWidth: 12 }, // Unit
          8: { cellWidth: 16 }, // Status
        },
      })

      doc.save(
        `leather_stock_report_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.pdf`
      )
      Swal.fire(
        'Success!',
        'Leather stock report downloaded successfully',
        'success'
      )
    } catch (error) {
      console.error('Error downloading leather report:', error)
      Swal.fire('Error', 'Failed to download leather report', 'error')
    } finally {
      setLoading(false)
    }
  }

  // ✅ FIXED: Download Materials Stock Report with proper company data
  const downloadMaterialsReport = async () => {
    setLoading(true)
    try {
      const range = dateRange[0]
      const params = new URLSearchParams({
        startDate: format(range.startDate, 'yyyy-MM-dd'),
        endDate: format(range.endDate, 'yyyy-MM-dd'),
      })

      // Fetch both material data and users data
      const [materialRes, usersRes] = await Promise.all([
        fetch(`/api/stock/materials?${params}`),
        fetch(`/api/user`),
      ])

      const [materialData, usersData] = await Promise.all([
        materialRes.json(),
        usersRes.json(),
      ])

      // ✅ FIXED: Enrich material data with company information
      const enrichedData = await enrichDataWithCompanyInfo(
        materialData,
        usersData
      )

      const doc = new jsPDF()

      // Header
      doc.setFontSize(20)
      doc.setFont(undefined, 'bold')
      doc.text('Abu Bakkar Leathers - Materials Stock Report', 14, 15)

      doc.setFontSize(12)
      doc.setFont(undefined, 'normal')
      doc.text(
        `Report Period: ${format(range.startDate, 'MMM dd, yyyy')} - ${format(
          range.endDate,
          'MMM dd, yyyy'
        )}`,
        14,
        25
      )
      doc.text(
        `Generated on: ${format(new Date(), 'MMM dd, yyyy HH:mm:ss')}`,
        14,
        35
      )
      doc.text(`Total Entries: ${enrichedData.length}`, 14, 45)

      // Summary by Status and Material Type
      const approvedCount = enrichedData.filter(
        (item) => item.status === 'approved'
      ).length
      const pendingCount = enrichedData.filter(
        (item) => item.status === 'pending'
      ).length
      const rejectedCount = enrichedData.filter(
        (item) => item.status === 'rejected'
      ).length

      doc.setFont(undefined, 'bold')
      doc.text('Status Summary:', 14, 60)
      doc.setFont(undefined, 'normal')
      doc.text(
        `Approved: ${approvedCount} | Pending: ${pendingCount} | Rejected: ${rejectedCount}`,
        14,
        70
      )

      // Material Type Summary with Company
      doc.setFont(undefined, 'bold')
      doc.text('Material Type Summary:', 14, 85)
      doc.setFont(undefined, 'normal')

      const materialSummary = {}
      enrichedData.forEach((item) => {
        if (!materialSummary[item.material]) {
          materialSummary[item.material] = {
            total: 0,
            approved: 0,
            quantity: 0,
            workers: new Set(),
            companies: new Set(),
          }
        }
        materialSummary[item.material].total++
        if (item.status === 'approved') {
          materialSummary[item.material].approved++
          materialSummary[item.material].quantity += item.quantity || 0
        }
        materialSummary[item.material].workers.add(item.workerName)
        materialSummary[item.material].companies.add(item.workerCompany)
      })

      let yPos = 95
      Object.entries(materialSummary).forEach(([material, stats]) => {
        doc.text(
          `${material}: ${stats.approved}/${stats.total} approved, ${stats.quantity} units, ${stats.workers.size} workers, ${stats.companies.size} companies`,
          20,
          yPos
        )
        yPos += 7
      })

      // ✅ FIXED: Worker Performance with Company
      doc.setFont(undefined, 'bold')
      doc.text('Worker Performance by Company:', 14, yPos + 10)
      doc.setFont(undefined, 'normal')
      yPos += 20

      const workerPerformance = {}
      enrichedData.forEach((item) => {
        const workerKey = `${item.workerName} (${item.workerCompany})`
        if (!workerPerformance[workerKey]) {
          workerPerformance[workerKey] = {
            total: 0,
            approved: 0,
            materials: new Set(),
          }
        }
        workerPerformance[workerKey].total++
        if (item.status === 'approved') {
          workerPerformance[workerKey].approved++
        }
        workerPerformance[workerKey].materials.add(item.material)
      })

      Object.entries(workerPerformance).forEach(([worker, stats]) => {
        doc.text(
          `${worker}: ${stats.approved}/${stats.total} approved, ${stats.materials.size} material types`,
          20,
          yPos
        )
        yPos += 7
      })

      // ✅ FIXED: Detailed Table with Company
      const tableData = enrichedData.map((item) => [
        format(new Date(item.date), 'dd/MM/yyyy'),
        format(new Date(item.createdAt || item.date), 'HH:mm'),
        item.workerName || 'Unknown',
        item.workerCompany || 'N/A', // ✅ FIXED: Now properly populated from 'company' field
        item.material || 'Unknown',
        (item.quantity || 0).toString(),
        item.unit || '',
        item.status || 'pending',
      ])

      autoTable(doc, {
        head: [
          [
            'Date',
            'Time',
            'Worker Name',
            'Company',
            'Material',
            'Quantity',
            'Unit',
            'Status',
          ],
        ],
        body: tableData,
        startY: yPos + 10,
        styles: {
          fontSize: 7,
          cellPadding: 2,
        },
        headStyles: {
          fillColor: [34, 197, 94],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
        },
        alternateRowStyles: {
          fillColor: [245, 245, 245],
        },
        columnStyles: {
          0: { cellWidth: 20 }, // Date
          1: { cellWidth: 15 }, // Time
          2: { cellWidth: 30 }, // Worker Name
          3: { cellWidth: 25 }, // Company
          4: { cellWidth: 25 }, // Material
          5: { cellWidth: 20 }, // Quantity
          6: { cellWidth: 15 }, // Unit
          7: { cellWidth: 20 }, // Status
        },
      })

      doc.save(
        `materials_stock_report_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.pdf`
      )
      Swal.fire(
        'Success!',
        'Materials stock report downloaded successfully',
        'success'
      )
    } catch (error) {
      console.error('Error downloading materials report:', error)
      Swal.fire('Error', 'Failed to download materials report', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Download Finished Products Report (unchanged as it already works)
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
      doc.text(
        `Report Period: ${format(range.startDate, 'MMM dd, yyyy')} - ${format(
          range.endDate,
          'MMM dd, yyyy'
        )}`,
        14,
        25
      )
      doc.text(
        `Generated on: ${format(new Date(), 'MMM dd, yyyy HH:mm:ss')}`,
        14,
        35
      )
      doc.text(`Total Products: ${data.length}`, 14, 45)

      // Summary
      const totalFulfilled = data.reduce(
        (sum, item) => sum + (item.fulfilledQuantity || 0),
        0
      )
      const totalOriginal = data.reduce(
        (sum, item) => sum + (item.originalQuantity || 0),
        0
      )
      const avgFulfillment =
        data.length > 0
          ? ((totalFulfilled / totalOriginal) * 100).toFixed(1)
          : 0

      doc.setFont(undefined, 'bold')
      doc.text('Production Summary:', 14, 60)
      doc.setFont(undefined, 'normal')
      doc.text(`Total Original Quantity: ${totalOriginal}`, 14, 70)
      doc.text(`Total Fulfilled Quantity: ${totalFulfilled}`, 14, 80)
      doc.text(`Average Fulfillment Rate: ${avgFulfillment}%`, 14, 90)

      // Worker Contributions Summary with Company
      if (data.length > 0 && data[0].workerContributions) {
        doc.setFont(undefined, 'bold')
        doc.text('Worker Contributions by Company:', 14, 105)
        doc.setFont(undefined, 'normal')

        const workerContributions = {}
        data.forEach((product) => {
          if (product.workerContributions) {
            product.workerContributions.forEach((contrib) => {
              const workerKey = `${contrib.workerName} (${
                contrib.workerCompany || 'N/A'
              })`
              if (!workerContributions[workerKey]) {
                workerContributions[workerKey] = {
                  totalContribution: 0,
                  productsWorked: 0,
                }
              }
              workerContributions[workerKey].totalContribution +=
                contrib.deliveredQuantity || contrib.quantity || 0
              workerContributions[workerKey].productsWorked++
            })
          }
        })

        let yPos = 115
        Object.entries(workerContributions).forEach(([worker, stats]) => {
          doc.text(
            `${worker}: ${stats.totalContribution} pieces across ${stats.productsWorked} products`,
            20,
            yPos
          )
          yPos += 7
        })

        // Detailed Table with Worker Company
        const tableData = []
        data.forEach((item) => {
          const baseRow = [
            item.productName || 'Unknown',
            format(new Date(item.finishedAt), 'dd/MM/yyyy'),
            format(new Date(item.finishedAt), 'HH:mm'),
            (item.originalQuantity || 0).toString(),
            (item.fulfilledQuantity || 0).toString(),
            item.status || 'Completed',
          ]

          if (item.workerContributions && item.workerContributions.length > 0) {
            item.workerContributions.forEach((contrib, index) => {
              if (index === 0) {
                tableData.push([
                  ...baseRow,
                  contrib.workerName || 'Unknown',
                  contrib.workerCompany || 'N/A',
                  (
                    contrib.deliveredQuantity ||
                    contrib.quantity ||
                    0
                  ).toString(),
                ])
              } else {
                tableData.push([
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  contrib.workerName || 'Unknown',
                  contrib.workerCompany || 'N/A',
                  (
                    contrib.deliveredQuantity ||
                    contrib.quantity ||
                    0
                  ).toString(),
                ])
              }
            })
          } else {
            tableData.push([...baseRow, 'No contributions', 'N/A', '0'])
          }
        })

        autoTable(doc, {
          head: [
            [
              'Product Name',
              'Date',
              'Time',
              'Original Qty',
              'Fulfilled Qty',
              'Status',
              'Worker',
              'Company',
              'Contribution',
            ],
          ],
          body: tableData,
          startY: yPos + 10,
          styles: {
            fontSize: 6,
            cellPadding: 2,
          },
          headStyles: {
            fillColor: [168, 85, 247],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
          },
          alternateRowStyles: {
            fillColor: [245, 245, 245],
          },
          columnStyles: {
            0: { cellWidth: 30 }, // Product Name
            1: { cellWidth: 18 }, // Date
            2: { cellWidth: 12 }, // Time
            3: { cellWidth: 18 }, // Original Qty
            4: { cellWidth: 18 }, // Fulfilled Qty
            5: { cellWidth: 18 }, // Status
            6: { cellWidth: 22 }, // Worker
            7: { cellWidth: 20 }, // Company
            8: { cellWidth: 18 }, // Contribution
          },
        })
      } else {
        // Simple table with Company if no worker contributions
        const tableData = data.map((item) => [
          item.productName || 'Unknown',
          format(new Date(item.finishedAt), 'dd/MM/yyyy'),
          format(new Date(item.finishedAt), 'HH:mm'),
          (item.originalQuantity || 0).toString(),
          (item.fulfilledQuantity || 0).toString(),
          item.workerCompany || 'N/A',
          item.status || 'Completed',
        ])

        autoTable(doc, {
          head: [
            [
              'Product Name',
              'Date',
              'Time',
              'Original Qty',
              'Fulfilled Qty',
              'Company',
              'Status',
            ],
          ],
          body: tableData,
          startY: 105,
          styles: { fontSize: 8 },
          headStyles: {
            fillColor: [168, 85, 247],
            textColor: [255, 255, 255],
          },
        })
      }

      doc.save(
        `finished_products_report_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.pdf`
      )
      Swal.fire(
        'Success!',
        'Finished products report downloaded successfully',
        'success'
      )
    } catch (error) {
      console.error('Error downloading finished products report:', error)
      Swal.fire('Error', 'Failed to download finished products report', 'error')
    } finally {
      setLoading(false)
    }
  }

  // ✅ FIXED: Download Workers Report with proper company data
  const downloadWorkersReport = async () => {
    setLoading(true)
    try {
      const range = dateRange[0]
      const params = new URLSearchParams({
        startDate: format(range.startDate, 'yyyy-MM-dd'),
        endDate: format(range.endDate, 'yyyy-MM-dd'),
      })

      const [leatherRes, materialRes, finishedRes, usersRes] =
        await Promise.all([
          fetch(`/api/stock/leather?${params}`),
          fetch(`/api/stock/materials?${params}`),
          fetch(`/api/stock/finished_products?${params}`),
          fetch(`/api/user`),
        ])

      const [leatherData, materialData, finishedData, usersData] =
        await Promise.all([
          leatherRes.json(),
          materialRes.json(),
          finishedRes.json(),
          usersRes.json(),
        ])

      // ✅ FIXED: Enrich data with company information
      const enrichedLeatherData = await enrichDataWithCompanyInfo(
        leatherData,
        usersData
      )
      const enrichedMaterialData = await enrichDataWithCompanyInfo(
        materialData,
        usersData
      )

      const doc = new jsPDF()

      // Header
      doc.setFontSize(20)
      doc.setFont(undefined, 'bold')
      doc.text('Abu Bakkar Leathers - Workers Performance Report', 14, 15)

      doc.setFontSize(12)
      doc.setFont(undefined, 'normal')
      doc.text(
        `Report Period: ${format(range.startDate, 'MMM dd, yyyy')} - ${format(
          range.endDate,
          'MMM dd, yyyy'
        )}`,
        14,
        25
      )
      doc.text(
        `Generated on: ${format(new Date(), 'MMM dd, yyyy HH:mm:ss')}`,
        14,
        35
      )

      // ✅ FIXED: Workers summary with company information
      const workerStats = usersData.map((user) => {
        const leatherEntries = enrichedLeatherData.filter(
          (item) => item.workerEmail === user.email
        )
        const materialEntries = enrichedMaterialData.filter(
          (item) => item.workerEmail === user.email
        )

        const leatherApproved = leatherEntries.filter(
          (item) => item.status === 'approved'
        ).length
        const materialApproved = materialEntries.filter(
          (item) => item.status === 'approved'
        ).length

        const leatherQuantity = leatherEntries.reduce(
          (sum, item) => sum + (item.quantity || 0),
          0
        )
        const materialQuantity = materialEntries.reduce(
          (sum, item) => sum + (item.quantity || 0),
          0
        )

        // Check finished products for worker contributions
        let finishedProductsContribution = 0
        finishedData.forEach((product) => {
          if (product.workerContributions) {
            product.workerContributions.forEach((contrib) => {
              if (
                contrib.workerEmail === user.email ||
                contrib.workerName === user.name
              ) {
                finishedProductsContribution +=
                  contrib.deliveredQuantity || contrib.quantity || 0
              }
            })
          }
        })

        return [
          user.name || 'Unknown',
          user.company || 'N/A', // ✅ FIXED: Company now properly included from user collection
          user.email || 'N/A',
          user.phone || 'N/A',
          user.status || 'pending',
          `${leatherApproved}/${leatherEntries.length}`,
          `${materialApproved}/${materialEntries.length}`,
          leatherQuantity.toString(),
          materialQuantity.toString(),
          finishedProductsContribution.toString(),
          (leatherEntries.length + materialEntries.length).toString(),
        ]
      })

      doc.text(`Total Workers: ${usersData.length}`, 14, 50)
      doc.text(
        `Active Workers: ${
          usersData.filter((u) => u.status === 'approved').length
        }`,
        14,
        60
      )

      autoTable(doc, {
        head: [
          [
            'Name',
            'Company',
            'Email',
            'Phone',
            'Status',
            'Leather (A/T)',
            'Material (A/T)',
            'Leather Qty',
            'Material Qty',
            'Products Qty',
            'Total Reports',
          ],
        ],
        body: workerStats,
        startY: 70,
        styles: {
          fontSize: 6,
          cellPadding: 2,
        },
        headStyles: {
          fillColor: [59, 130, 246],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
        },
        alternateRowStyles: {
          fillColor: [245, 245, 245],
        },
        columnStyles: {
          0: { cellWidth: 20 }, // Name
          1: { cellWidth: 18 }, // Company
          2: { cellWidth: 25 }, // Email
          3: { cellWidth: 18 }, // Phone
          4: { cellWidth: 15 }, // Status
          5: { cellWidth: 15 }, // Leather (A/T)
          6: { cellWidth: 15 }, // Material (A/T)
          7: { cellWidth: 15 }, // Leather Qty
          8: { cellWidth: 15 }, // Material Qty
          9: { cellWidth: 15 }, // Products Qty
          10: { cellWidth: 15 }, // Total Reports
        },
      })

      doc.save(
        `workers_performance_report_${format(
          new Date(),
          'yyyy-MM-dd_HH-mm'
        )}.pdf`
      )
      Swal.fire(
        'Success!',
        'Workers performance report downloaded successfully',
        'success'
      )
    } catch (error) {
      console.error('Error downloading workers report:', error)
      Swal.fire('Error', 'Failed to download workers report', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Download Comprehensive Report with fixed company field names
  const downloadComprehensiveReport = async () => {
    setLoading(true)
    try {
      const range = dateRange[0]
      const params = new URLSearchParams({
        startDate: format(range.startDate, 'yyyy-MM-dd'),
        endDate: format(range.endDate, 'yyyy-MM-dd'),
      })

      // Fetch all data
      const [leatherRes, materialRes, finishedRes, usersRes] =
        await Promise.all([
          fetch(`/api/stock/leather?${params}`),
          fetch(`/api/stock/materials?${params}`),
          fetch(`/api/stock/finished_products?${params}`),
          fetch(`/api/user`),
        ])

      const [leatherData, materialData, finishedData, usersData] =
        await Promise.all([
          leatherRes.json(),
          materialRes.json(),
          finishedRes.json(),
          usersRes.json(),
        ])

      // Enrich data with company information
      const enrichedLeatherData = await enrichDataWithCompanyInfo(
        leatherData,
        usersData
      )
      const enrichedMaterialData = await enrichDataWithCompanyInfo(
        materialData,
        usersData
      )

      const doc = new jsPDF()

      // Header
      doc.setFontSize(22)
      doc.setFont(undefined, 'bold')
      doc.text('Abu Bakkar Leathers', 14, 15)
      doc.text('Comprehensive Business Report', 14, 25)

      doc.setFontSize(12)
      doc.setFont(undefined, 'normal')
      doc.text(
        `Report Period: ${format(range.startDate, 'MMM dd, yyyy')} - ${format(
          range.endDate,
          'MMM dd, yyyy'
        )}`,
        14,
        35
      )
      doc.text(
        `Generated on: ${format(new Date(), 'MMM dd, yyyy HH:mm:ss')}`,
        14,
        45
      )

      let yPosition = 60

      // Executive Summary
      doc.setFontSize(16)
      doc.setFont(undefined, 'bold')
      doc.text('Executive Summary', 14, yPosition)
      yPosition += 15

      doc.setFontSize(12)
      doc.setFont(undefined, 'normal')
      doc.text(
        `• Total Active Workers: ${
          usersData.filter((u) => u.status === 'approved').length
        }/${usersData.length}`,
        20,
        yPosition
      )
      yPosition += 8
      doc.text(
        `• Leather Stock Entries: ${enrichedLeatherData.length} (Approved: ${
          enrichedLeatherData.filter((l) => l.status === 'approved').length
        })`,
        20,
        yPosition
      )
      yPosition += 8
      doc.text(
        `• Material Stock Entries: ${enrichedMaterialData.length} (Approved: ${
          enrichedMaterialData.filter((m) => m.status === 'approved').length
        })`,
        20,
        yPosition
      )
      yPosition += 8
      doc.text(`• Finished Products: ${finishedData.length}`, 20, yPosition)
      yPosition += 8
      doc.text(
        `• Total Business Activities: ${
          enrichedLeatherData.length +
          enrichedMaterialData.length +
          finishedData.length
        }`,
        20,
        yPosition
      )
      yPosition += 20

      // Company Analysis Section
      doc.setFontSize(14)
      doc.setFont(undefined, 'bold')
      doc.text('Company Participation Analysis', 14, yPosition)
      yPosition += 12

      // Get unique companies from all data sources
      const allCompanies = new Set()
      enrichedLeatherData.forEach((item) =>
        allCompanies.add(item.workerCompany)
      )
      enrichedMaterialData.forEach((item) =>
        allCompanies.add(item.workerCompany)
      )
      finishedData.forEach((product) => {
        if (product.workerContributions) {
          product.workerContributions.forEach((contrib) => {
            allCompanies.add(contrib.workerCompany || 'N/A')
          })
        }
      })

      doc.setFontSize(10)
      doc.setFont(undefined, 'normal')
      doc.text(`Total Companies Involved: ${allCompanies.size}`, 20, yPosition)
      yPosition += 8

      // Enhanced Detailed Data Tables with Company Information
      if (enrichedLeatherData.length > 0) {
        doc.addPage()
        doc.setFontSize(16)
        doc.setFont(undefined, 'bold')
        doc.text('Detailed Leather Stock Data with Company Information', 14, 20)

        const leatherTableData = enrichedLeatherData.map((item) => [
          format(new Date(item.date), 'dd/MM'),
          item.workerName || 'Unknown',
          item.workerCompany || 'N/A',
          item.type || 'Unknown',
          (item.quantity || 0).toString(),
          item.unit || '',
          item.status || 'pending',
        ])

        autoTable(doc, {
          head: [
            ['Date', 'Worker', 'Company', 'Type', 'Qty', 'Unit', 'Status'],
          ],
          body: leatherTableData,
          startY: 35,
          styles: { fontSize: 7 },
          headStyles: { fillColor: [146, 64, 14] },
        })
      }

      if (enrichedMaterialData.length > 0) {
        doc.addPage()
        doc.setFontSize(16)
        doc.setFont(undefined, 'bold')
        doc.text(
          'Detailed Material Stock Data with Company Information',
          14,
          20
        )

        const materialTableData = enrichedMaterialData.map((item) => [
          format(new Date(item.date), 'dd/MM'),
          item.workerName || 'Unknown',
          item.workerCompany || 'N/A',
          item.material || 'Unknown',
          (item.quantity || 0).toString(),
          item.unit || '',
          item.status || 'pending',
        ])

        autoTable(doc, {
          head: [
            ['Date', 'Worker', 'Company', 'Material', 'Qty', 'Unit', 'Status'],
          ],
          body: materialTableData,
          startY: 35,
          styles: { fontSize: 7 },
          headStyles: { fillColor: [34, 197, 94] },
        })
      }

      if (finishedData.length > 0) {
        doc.addPage()
        doc.setFontSize(16)
        doc.setFont(undefined, 'bold')
        doc.text(
          'Detailed Finished Products Data with Company Information',
          14,
          20
        )

        const finishedTableData = []
        finishedData.forEach((item) => {
          const baseRow = [
            item.productName || 'Unknown',
            format(new Date(item.finishedAt), 'dd/MM'),
            (item.originalQuantity || 0).toString(),
            (item.fulfilledQuantity || 0).toString(),
          ]

          if (item.workerContributions && item.workerContributions.length > 0) {
            item.workerContributions.forEach((contrib, index) => {
              if (index === 0) {
                finishedTableData.push([
                  ...baseRow,
                  contrib.workerName || 'Unknown',
                  contrib.workerCompany || 'N/A',
                  (
                    contrib.deliveredQuantity ||
                    contrib.quantity ||
                    0
                  ).toString(),
                ])
              } else {
                finishedTableData.push([
                  '',
                  '',
                  '',
                  '',
                  contrib.workerName || 'Unknown',
                  contrib.workerCompany || 'N/A',
                  (
                    contrib.deliveredQuantity ||
                    contrib.quantity ||
                    0
                  ).toString(),
                ])
              }
            })
          } else {
            finishedTableData.push([...baseRow, 'No contributors', 'N/A', '0'])
          }
        })

        autoTable(doc, {
          head: [
            [
              'Product',
              'Date',
              'Original',
              'Fulfilled',
              'Worker',
              'Company',
              'Contribution',
            ],
          ],
          body: finishedTableData,
          startY: 35,
          styles: { fontSize: 7 },
          headStyles: { fillColor: [168, 85, 247] },
        })
      }

      doc.save(
        `comprehensive_business_report_${format(
          new Date(),
          'yyyy-MM-dd_HH-mm'
        )}.pdf`
      )
      Swal.fire(
        'Success!',
        'Comprehensive business report downloaded successfully',
        'success'
      )
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
      description:
        'Complete leather inventory with worker and company contributions',
      icon: FaCubes,
      color: 'bg-amber-500',
      hoverColor: 'hover:bg-amber-600',
      downloadFunc: downloadLeatherReport,
      count: reportStats.leatherStock,
    },
    {
      title: 'Materials Stock Report',
      description:
        'Raw materials inventory with detailed company performance analysis',
      icon: FaIndustry,
      color: 'bg-green-500',
      hoverColor: 'hover:bg-green-600',
      downloadFunc: downloadMaterialsReport,
      count: reportStats.materialStock,
    },
    {
      title: 'Finished Products Report',
      description:
        'Production completion with individual worker and company contributions',
      icon: FaBoxOpen,
      color: 'bg-purple-500',
      hoverColor: 'hover:bg-purple-600',
      downloadFunc: downloadFinishedProductsReport,
      count: reportStats.finishedProducts,
    },
    {
      title: 'Workers Performance Report',
      description:
        'Comprehensive worker and company productivity across all activities',
      icon: FaUsers,
      color: 'bg-blue-500',
      hoverColor: 'hover:bg-blue-600',
      downloadFunc: downloadWorkersReport,
      count: reportStats.totalUsers,
    },
    {
      title: 'Comprehensive Business Report',
      description:
        'Complete business overview with company analytics and detailed data tables',
      icon: FaFileAlt,
      color: 'bg-gray-700',
      hoverColor: 'hover:bg-gray-800',
      downloadFunc: downloadComprehensiveReport,
      count: reportStats.totalReports,
    },
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
            Generate comprehensive reports with worker details, company
            information and timestamps for Abu Bakkar Leathers
          </p>
        </div>

        {/* Date Range Selection */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 lg:p-6 mb-4 sm:mb-6 lg:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-1">
                Report Period
              </h2>
              <p className="text-xs sm:text-sm text-gray-600">
                Select date range for all reports
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
              <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-600">
                <FaCalendarAlt className="text-xs sm:text-sm" />
                <span className="font-medium">
                  {format(dateRange[0].startDate, 'MMM dd, yyyy')} -{' '}
                  {format(dateRange[0].endDate, 'MMM dd, yyyy')}
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
                  direction={
                    window.innerWidth < 640 ? 'vertical' : 'horizontal'
                  }
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
                <p className="text-lg sm:text-xl font-bold text-gray-900">
                  {reportStats.totalUsers}
                </p>
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
                <p className="text-lg sm:text-xl font-bold text-gray-900">
                  {reportStats.leatherStock}
                </p>
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
                <p className="text-lg sm:text-xl font-bold text-gray-900">
                  {reportStats.materialStock}
                </p>
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
                <p className="text-lg sm:text-xl font-bold text-gray-900">
                  {reportStats.finishedProducts}
                </p>
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
                <p className="text-lg sm:text-xl font-bold text-gray-900">
                  {reportStats?.totalReports}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Report Categories */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
          {reportCategories.map((category) => (
            <div
              key={category.title}
              className="bg-white rounded-lg lg:rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5 lg:p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3 sm:mb-4">
                <div className={`p-2 sm:p-3 rounded-lg ${category.color}`}>
                  <category.icon className="text-white text-lg sm:text-xl" />
                </div>
                <div className="text-right">
                  <p className="text-xs sm:text-sm text-gray-500">Entries</p>
                  <p className="text-lg sm:text-xl font-bold text-gray-900">
                    {category.count}
                  </p>
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
                <p className="text-gray-900 font-medium text-sm sm:text-base">
                  Generating detailed report...
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
