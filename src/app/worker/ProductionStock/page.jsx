'use client'

import { useState, useEffect, useContext } from 'react'
import Swal from 'sweetalert2'
import { AuthContext } from '../../../../Provider/AuthProvider'

export default function WorkerProductionPage() {
  const { user } = useContext(AuthContext)
  const userEmail = user?.email

  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(false)
  const [appliedJobs, setAppliedJobs] = useState({})
  const [formInputs, setFormInputs] = useState({})
  const [filter, setFilter] = useState('all') // all, open, applied
  const [imageLoadErrors, setImageLoadErrors] = useState({}) // Track failed image loads

  // ✅ NEW: Check if job is assigned to current worker
  const isAssignedToMe = (job) => {
    return job.assignedWorker && job.assignedWorker.email === userEmail
  }

  // ----------------- Handle image load error -----------------
  const handleImageError = (jobId) => {
    setImageLoadErrors((prev) => ({
      ...prev,
      [jobId]: true,
    }))
  }

  // ----------------- Handle PDF download -----------------
  const handlePdfDownload = async (job) => {
    if (!job.pdfFile?.fileId) {
      Swal.fire('Error', 'No PDF file available for this job', 'error')
      return
    }

    try {
      console.log('📄 Downloading PDF for job:', job.productName)
      
      // Open PDF in a new tab for download
      const downloadUrl = `/api/stock/production?downloadFile=true&fileId=${job.pdfFile.fileId}`
      window.open(downloadUrl, '_blank')
      
      // Show success message
      Swal.fire({
        title: 'PDF Download',
        text: `Downloading PDF for ${job.productName}`,
        icon: 'success',
        timer: 2000,
        showConfirmButton: false
      })
    } catch (err) {
      console.error('❌ PDF download error:', err)
      Swal.fire('Error', 'Failed to download PDF file', 'error')
    }
  }

  // ✅ UPDATED: Fetch jobs with worker authentication
  const fetchJobs = async () => {
    try {
      const res = await fetch('/api/stock/production', {
        headers: {
          'role': 'worker',
          'worker-email': userEmail,
          'user-email': userEmail
        }
      })
      if (!res.ok) throw new Error('Failed to fetch jobs')
      const jobsData = await res.json()
      setJobs(jobsData)
    } catch (err) {
      Swal.fire('Error', err.message, 'error')
    }
  }

  // ----------------- Fetch worker's applications -----------------
  const fetchAppliedJobs = async () => {
    if (!userEmail) return
    try {
      const res = await fetch('/api/stock/production_apply')
      if (!res.ok) throw new Error('Failed to fetch applications')
      const data = await res.json()
      const applied = {}
      data.forEach((app) => {
        // Find applications by email since workerId might be stored differently
        const userApps = data.filter(
          (application) =>
            application.workerEmail === userEmail ||
            application.workerId === userEmail
        )
        userApps.forEach((app) => {
          applied[app.jobId] = app
        })
      })
      setAppliedJobs(applied)
    } catch (err) {
      console.error('Error fetching applications:', err)
    }
  }

  // ----------------- Load jobs and applications when userEmail is ready -----------------
  useEffect(() => {
    if (userEmail) {
      fetchJobs()
      fetchAppliedJobs()
    }
  }, [userEmail])

  // ----------------- Handle input change -----------------
  const handleChange = (jobId, e) => {
    setFormInputs({
      ...formInputs,
      [jobId]: {
        ...formInputs[jobId],
        [e.target.name]: e.target.value,
      },
    })
  }

  // ✅ NEW: Handle direct contribution for assigned workers
  const handleDirectContribution = async (job) => {
    const input = formInputs[job._id]

    if (!input || !input.quantity) {
      return Swal.fire('Warning', 'Please enter quantity to contribute', 'warning')
    }

    if (Number(input.quantity) <= 0) {
      return Swal.fire('Warning', 'Quantity must be greater than 0', 'warning')
    }

    const result = await Swal.fire({
      title: 'Confirm Direct Contribution',
      html: `
        <div class="text-left space-y-2">
          <p><strong>Job:</strong> ${job.productName}</p>
          ${job.productCode ? `<p><strong>Product Code:</strong> ${job.productCode}</p>` : ''}
          <p><strong>Your Contribution:</strong> ${input.quantity} pieces</p>
          <p><strong>Status:</strong> Directly assigned to you</p>
          ${input.note ? `<p><strong>Note:</strong> ${input.note}</p>` : ''}
        </div>
      `,
      icon: 'info',
      showCancelButton: true,
      confirmButtonColor: '#7c3aed',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Contribute Now'
    })

    if (!result.isConfirmed) return

    setLoading(true)
    try {
      // Use the same API but with different status/flow for assigned workers
      const res = await fetch('/api/stock/production_apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          role: 'worker',
          email: userEmail,
        },
        body: JSON.stringify({
          jobId: job._id,
          quantity: Number(input.quantity),
          note: input.note?.trim() || 'Direct contribution from assigned worker',
          company: 'Assigned Worker', // Or get from user profile
          isDirectContribution: true, // Flag for assigned workers
          autoApprove: true // Could auto-approve since they're assigned
        }),
      })

      const data = await res.json()
      if (res.ok) {
        Swal.fire({
          title: 'Contribution Recorded!',
          text: `Your contribution of ${input.quantity} pieces has been recorded directly.`,
          icon: 'success',
          confirmButtonColor: '#7c3aed',
          timer: 3000,
        })
        fetchAppliedJobs()
        fetchJobs()
        setFormInputs({ ...formInputs, [job._id]: {} })
      } else {
        Swal.fire('Error', data.error || 'Failed to record contribution', 'error')
      }
    } catch (err) {
      Swal.fire('Error', err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  // ✅ UPDATED: Handle apply with unlimited quantity support
  const handleApply = async (job) => {
    const input = formInputs[job._id]

    // ✅ UPDATED: Enhanced validation for unlimited applications
    if (!input || !input.quantity) {
      return Swal.fire('Warning', 'Please enter quantity', 'warning')
    }

    if (!input.note || input.note.trim() === '') {
      return Swal.fire('Warning', 'Please enter a note', 'warning')
    }

    if (!input.company || input.company.trim() === '') {
      return Swal.fire('Warning', 'Please enter your company name', 'warning')
    }

    if (Number(input.quantity) <= 0) {
      return Swal.fire('Warning', 'Quantity must be greater than 0', 'warning')
    }

    // ✅ NEW: Add reasonable upper limit to prevent abuse
    if (Number(input.quantity) > 50000) {
      return Swal.fire('Warning', 'Quantity cannot exceed 50,000 pieces for practical reasons', 'warning')
    }

    // ✅ REMOVED: Quantity limit validation - workers can now apply for unlimited quantities
    // ✅ NEW: Enhanced confirmation dialog for unlimited applications
    const targetQuantity = job.quantity
    const requestedQuantity = Number(input.quantity)
    const exceedsTarget = requestedQuantity > targetQuantity
    const exceedanceAmount = Math.max(0, requestedQuantity - targetQuantity)
    const exceedancePercentage = targetQuantity > 0 ? ((exceedanceAmount / targetQuantity) * 100).toFixed(1) : 0

    const result = await Swal.fire({
      title: 'Confirm Application',
      html: `
      <div class="text-left space-y-2">
        <p><strong>Job:</strong> ${job.productName}</p>
        ${job.productCode ? `<p><strong>Product Code:</strong> ${job.productCode}</p>` : ''}
        <p><strong>Your Quantity:</strong> ${input.quantity} pieces</p>
        <p><strong>Original Target:</strong> ${targetQuantity} pieces</p>
        ${exceedsTarget ? `
          <div class="bg-orange-50 border-l-4 border-orange-400 p-2 my-2">
            <p class="text-orange-800"><strong>⚠️ Exceeds Target by:</strong> ${exceedanceAmount} pieces (${exceedancePercentage}%)</p>
            <p class="text-orange-700 text-sm mt-1">Admin will decide if they can accommodate this quantity</p>
          </div>
        ` : `
          <div class="bg-green-50 border-l-4 border-green-400 p-2 my-2">
            <p class="text-green-800">✅ Within original target range</p>
          </div>
        `}
        <p><strong>Company:</strong> ${input.company}</p>
        <p><strong>Note:</strong> ${input.note}</p>
        ${job.totalMaterialCost ? `
          <div class="bg-blue-50 border-l-4 border-blue-400 p-2 my-2">
            <p class="text-blue-800"><strong>Est. Material Cost:</strong> ৳${(job.totalMaterialCost * requestedQuantity).toFixed(2)}</p>
            <p class="text-blue-700 text-sm">(৳${job.totalMaterialCost.toFixed(2)} × ${requestedQuantity} units)</p>
          </div>
        ` : ''}
      </div>
    `,
      icon: exceedsTarget ? 'question' : 'info',
      showCancelButton: true,
      confirmButtonColor: exceedsTarget ? '#f59e0b' : '#92400e',
      cancelButtonColor: '#6b7280',
      confirmButtonText: exceedsTarget ? 'Apply Anyway' : 'Submit Application',
      width: '500px'
    })

    if (!result.isConfirmed) return

    setLoading(true)
    try {
      const res = await fetch('/api/stock/production_apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          role: 'worker',
          email: userEmail,
        },
        body: JSON.stringify({
          jobId: job._id,
          quantity: Number(input.quantity),
          note: input.note.trim(),
          company: input.company.trim(),
        }),
      })

      const data = await res.json()
      if (res.ok) {
        // ✅ UPDATED: Enhanced success message for unlimited applications
        const successTitle = exceedsTarget ? 'Application Submitted!' : 'Success!'
        const successText = exceedsTarget 
          ? `Your application for ${input.quantity} pieces has been submitted. Since this exceeds the original target by ${exceedanceAmount} pieces, the admin will review and decide.`
          : 'Your application has been submitted successfully'

        Swal.fire({
          title: successTitle,
          text: successText,
          icon: 'success',
          confirmButtonColor: '#92400e',
          timer: exceedsTarget ? 6000 : 3000,
        })
        fetchAppliedJobs()
        fetchJobs() // Refresh jobs to get updated quantities
        setFormInputs({ ...formInputs, [job._id]: {} }) // Clear form
      } else {
        Swal.fire('Error', data.error || 'Failed to apply', 'error')
      }
    } catch (err) {
      Swal.fire('Error', err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  // ✅ UPDATED: Filter jobs for unlimited applications
  const getFilteredJobs = () => {
    switch (filter) {
      case 'open':
        // ✅ UPDATED: No longer check remainingQuantity > 0 since unlimited applications are allowed
        return jobs.filter(
          (job) =>
            job.status === 'open' &&
            !appliedJobs[job._id]
        )
      case 'applied':
        return jobs.filter((job) => appliedJobs[job._id])
      default:
        return jobs
    }
  }

  // ----------------- Get application status badge -----------------
  const getApplicationStatusBadge = (jobId) => {
    const application = appliedJobs[jobId]
    if (!application) return null

    const statusColors = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
    }

    return (
      <span
        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
          statusColors[application.status]
        }`}
      >
        {application.status.toUpperCase()}
      </span>
    )
  }

  // ✅ UPDATED: Enhanced progress bar for unlimited applications
  const getCompactProgressBar = (job) => {
    const targetQuantity = job.quantity
    const fulfilledQuantity = job.fulfilledQuantity || 0
    const approvedQuantity = job.approvedQuantity || fulfilledQuantity
    
    // ✅ NEW: Handle cases where approved quantity exceeds target
    const progressPercentage = targetQuantity > 0 ? (fulfilledQuantity / targetQuantity) * 100 : 0
    const approvalPercentage = targetQuantity > 0 ? (approvedQuantity / targetQuantity) * 100 : 0
    
    const exceededTarget = approvedQuantity > targetQuantity

    return (
      <div className="flex items-center gap-2 text-xs">
        <div className="flex-1 bg-gray-200 rounded-full h-1.5 relative">
          {/* Delivered progress */}
          <div
            className="bg-green-500 h-1.5 rounded-full transition-all duration-300 absolute"
            style={{ width: `${Math.min(progressPercentage, 100)}%` }}
          ></div>
          {/* Approved but not delivered (if exceeds target, show as orange) */}
          {approvalPercentage > progressPercentage && (
            <div
              className={`h-1.5 rounded-full transition-all duration-300 absolute ${
                exceededTarget ? 'bg-orange-300' : 'bg-blue-300'
              }`}
              style={{ 
                width: `${Math.min(approvalPercentage, 100)}%`,
                left: `${Math.min(progressPercentage, 100)}%`
              }}
            ></div>
          )}
        </div>
        <span className={`min-w-0 whitespace-nowrap ${exceededTarget ? 'text-orange-600' : 'text-gray-500'}`}>
          {Math.round(progressPercentage)}%
        </span>
        {exceededTarget && (
          <span className="text-orange-500 text-xs">🔥</span>
        )}
      </div>
    )
  }

  // 🆕 NEW: Materials Display Component
  const MaterialsDisplay = ({ materials, totalMaterialCost }) => {
    if (!materials || materials.length === 0) {
      return null
    }

    return (
      <div className="bg-blue-50 rounded-lg p-2 mb-2 border border-blue-200">
        <div className="flex items-center justify-between mb-1">
          <h4 className="text-xs font-semibold text-blue-900">
            Materials (per unit):
          </h4>
          {totalMaterialCost && (
            <span className="text-xs font-bold text-blue-800">
              Total: ৳{totalMaterialCost.toFixed(2)}
            </span>
          )}
        </div>

        <div className="space-y-1">
          {materials.slice(0, 3).map((material, index) => (
            <div
              key={index}
              className="flex justify-between items-center text-xs"
            >
              <span className="text-blue-800 truncate flex-1 mr-2">
                {material.name}
              </span>
              <span className="text-blue-700 font-medium">
                ৳{material.price}
              </span>
            </div>
          ))}

          {materials.length > 3 && (
            <div className="text-xs text-blue-600 text-center pt-1 border-t border-blue-200">
              +{materials.length - 3} more materials
            </div>
          )}
        </div>

        {/* Cost Calculator for Applied Quantity */}
        {materials.length > 0 && (
          <div className="mt-2 pt-2 border-t border-blue-200">
            <div className="text-xs text-blue-700">
              <span className="font-medium">
                Per unit cost: ৳{totalMaterialCost?.toFixed(2) || '0.00'}
              </span>
            </div>
          </div>
        )}
      </div>
    )
  }

  // 🆕 NEW: Enhanced Materials Modal for Detailed View
  const [showMaterialsModal, setShowMaterialsModal] = useState(false)
  const [selectedJobMaterials, setSelectedJobMaterials] = useState(null)

  const showDetailedMaterials = (job) => {
    setSelectedJobMaterials(job)
    setShowMaterialsModal(true)
  }

  // ✅ NEW: Get quantity display info for unlimited applications
  const getQuantityDisplayInfo = (job) => {
    const targetQuantity = job.quantity
    const approvedQuantity = job.approvedQuantity || job.fulfilledQuantity || 0
    const fulfilledQuantity = job.fulfilledQuantity || 0
    const remainingFromApproved = Math.max(0, approvedQuantity - fulfilledQuantity)
    const exceededTarget = approvedQuantity > targetQuantity

    return {
      targetQuantity,
      approvedQuantity,
      fulfilledQuantity,
      remainingFromApproved,
      exceededTarget,
      exceedanceAmount: Math.max(0, approvedQuantity - targetQuantity)
    }
  }

  // ----------------- Render -----------------
  const filteredJobs = getFilteredJobs()
  const totalApplications = Object.keys(appliedJobs).length
  const approvedApplications = Object.values(appliedJobs).filter(
    (app) => app.status === 'approved'
  ).length
  const pendingApplications = Object.values(appliedJobs).filter(
    (app) => app.status === 'pending'
  ).length

  return (
    <div className="min-h-screen p-4 bg-amber-50">
      {/* Header */}
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-amber-900 mb-3">
          Production Jobs
        </h1>
        <div className="flex justify-center gap-3 text-sm text-amber-800">
          <div className="bg-white px-2 py-1 rounded-lg shadow text-xs">
            <span className="font-semibold">Total:</span> {totalApplications}
          </div>
          <div className="bg-white px-2 py-1 rounded-lg shadow text-xs">
            <span className="font-semibold">Approved:</span>{' '}
            {approvedApplications}
          </div>
          <div className="bg-white px-2 py-1 rounded-lg shadow text-xs">
            <span className="font-semibold">Pending:</span>{' '}
            {pendingApplications}
          </div>
        </div>
        {/* ✅ NEW: Unlimited applications notice */}
        <div className="mt-2 text-center">
          <span className="bg-orange-100 text-orange-800 px-3 py-1 rounded-full text-xs font-medium">
            🔥 Unlimited Applications Enabled - Apply for any quantity!
          </span>
        </div>
      </div>

      {/* ✅ UPDATED: Filter Tabs with updated counts */}
      <div className="flex justify-center mb-6">
        <div className="bg-white rounded-xl p-1 shadow-lg border border-amber-200">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-1.5 rounded-lg font-medium transition text-sm ${
              filter === 'all'
                ? 'bg-amber-900 text-white'
                : 'text-amber-900 hover:bg-amber-100'
            }`}
          >
            All ({jobs.length})
          </button>
          <button
            onClick={() => setFilter('open')}
            className={`px-4 py-1.5 rounded-lg font-medium transition text-sm ${
              filter === 'open'
                ? 'bg-amber-900 text-white'
                : 'text-amber-900 hover:bg-amber-100'
            }`}
          >
            Available (
            {
              jobs.filter(
                (job) =>
                  job.status === 'open' &&
                  !appliedJobs[job._id]
              ).length
            }
            )
          </button>
          <button
            onClick={() => setFilter('applied')}
            className={`px-4 py-1.5 rounded-lg font-medium transition text-sm ${
              filter === 'applied'
                ? 'bg-amber-900 text-white'
                : 'text-amber-900 hover:bg-amber-100'
            }`}
          >
            My Applications ({totalApplications})
          </button>
        </div>
      </div>

      {/* Jobs Grid */}
      {filteredJobs.length === 0 ? (
        <div className="text-center py-8">
          <div className="text-gray-400 mb-4">
            <svg
              className="mx-auto h-12 w-12"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-gray-500">
            {filter === 'open'
              ? 'No available jobs to apply for'
              : filter === 'applied'
              ? "You haven't applied to any jobs yet"
              : 'No jobs available'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredJobs.map((job) => {
            const quantityInfo = getQuantityDisplayInfo(job)
            // ✅ UPDATED: Handle multiple images
            const hasValidImages = job.images && job.images.length > 0 && !imageLoadErrors[job._id]

            return (
              <div
                key={job._id}
                className={`bg-white rounded-xl shadow-md border hover:shadow-lg transition overflow-hidden ${
                  appliedJobs[job._id]
                    ? 'border-amber-300 ring-1 ring-amber-200'
                    : 'border-amber-200'
                }`}
              >
                {/* ✅ UPDATED: Multiple Images Section */}
                {hasValidImages ? (
                  <div className="relative h-64">
                    {job.images.length === 1 ? (
                      <img
                        src={job.images[0]}
                        alt={job.productName}
                        className="w-full h-full object-cover bg-gray-50"
                        onError={() => handleImageError(job._id)}
                      />
                    ) : (
                      <div className="grid grid-cols-2 gap-1 h-full">
                        {job.images.slice(0, 4).map((image, index) => (
                          <img
                            key={index}
                            src={image}
                            alt={`${job.productName} ${index + 1}`}
                            className="w-full h-full object-cover bg-gray-50"
                            onError={() => handleImageError(job._id)}
                          />
                        ))}
                      </div>
                    )}
                    {job.images.length > 4 && (
                      <div className="absolute bottom-2 right-2 bg-black bg-opacity-70 text-white px-2 py-1 rounded text-xs">
                        +{job.images.length - 4} more
                      </div>
                    )}
                    {/* Badges */}
                    <div className="absolute top-1 right-1 flex gap-1">
                      {appliedJobs[job._id] &&
                        getApplicationStatusBadge(job._id)}
                    </div>
                    <div className="absolute top-1 left-1 flex flex-col gap-1">
                      {/* ✅ UPDATED: Target quantity badge */}
                      {job.status === 'open' && (
                        <span className="bg-blue-500 text-white px-1.5 py-0.5 rounded-full text-xs font-semibold">
                          Target: {quantityInfo.targetQuantity}
                        </span>
                      )}
                      {/* ✅ NEW: Exceeded target badge */}
                      {quantityInfo.exceededTarget && (
                        <span className="bg-orange-500 text-white px-1.5 py-0.5 rounded-full text-xs font-semibold">
                          🔥 +{quantityInfo.exceedanceAmount}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="relative h-32 bg-gradient-to-br from-amber-100 to-amber-200 flex items-center justify-center">
                    <div className="text-center">
                      <svg
                        className="mx-auto h-8 w-8 text-amber-400 mb-1"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <p className="text-amber-700 text-xs font-medium truncate px-2">
                        {job.productName}
                      </p>
                      {/* ✅ NEW: Product code display */}
                      {job.productCode && (
                        <p className="text-blue-600 text-xs font-medium truncate px-2">
                          {job.productCode}
                        </p>
                      )}
                      {/* ✅ NEW: VAT display */}
                      {job.vatPercentage && (
                        <p className="text-green-600 text-xs font-medium truncate px-2">
                          VAT: {job.vatPercentage}%
                        </p>
                      )}
                    </div>

                    {/* Badges */}
                    <div className="absolute top-1 right-1 flex gap-1">
                      {appliedJobs[job._id] &&
                        getApplicationStatusBadge(job._id)}
                    </div>
                    <div className="absolute top-1 left-1 flex flex-col gap-1">
                      {/* ✅ UPDATED: Target quantity badge */}
                      {job.status === 'open' && (
                        <span className="bg-blue-500 text-white px-1.5 py-0.5 rounded-full text-xs font-semibold">
                          Target: {quantityInfo.targetQuantity}
                        </span>
                      )}
                      {/* ✅ NEW: Exceeded target badge */}
                      {quantityInfo.exceededTarget && (
                        <span className="bg-orange-500 text-white px-1.5 py-0.5 rounded-full text-xs font-semibold">
                          🔥 +{quantityInfo.exceedanceAmount}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <div className="p-3">
                  {/* ✅ UPDATED: Job Info Header with Assignment Status */}
                  <div className="flex justify-between items-start mb-1">
                    <div className="flex-1">
                      <h3 className="font-bold text-amber-900 text-sm truncate">
                        {job.productName}
                      </h3>
                      {/* ✅ NEW: Product code display */}
                      {job.productCode && (
                        <p className="text-blue-600 text-xs font-medium truncate">
                          Code: {job.productCode}
                        </p>
                      )}
                      {/* ✅ NEW: VAT display */}
                      {job.vatPercentage && (
                        <p className="text-green-600 text-xs font-medium truncate">
                          VAT: {job.vatPercentage}%
                        </p>
                      )}
                      {/* ✅ NEW: Assignment indicator */}
                      {isAssignedToMe(job) && (
                        <div className="flex items-center gap-1 mt-1">
                          <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                          <span className="text-purple-600 text-xs font-semibold">
                            Assigned to You
                          </span>
                        </div>
                      )}
                    </div>
                    {/* PDF Download Button */}
                    {job.pdfFile?.fileId && (
                      <button
                        onClick={() => handlePdfDownload(job)}
                        className="text-blue-600 hover:text-blue-800 transition-colors p-1 ml-2"
                        title="Download PDF"
                      >
                        <div className='flex gap-2 items-center'>
                          <p className='text-[12px]'>PDF</p>
                          <svg
                          className="w-4 h-4"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path 
                            fillRule="evenodd" 
                            d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" 
                            clipRule="evenodd" 
                          />
                          </svg>
                        </div>
                      </button>
                    )}
                  </div>

                  <p className="text-gray-600 text-xs mb-2 line-clamp-2">
                    {job.description || 'No description available'}
                  </p>

                  {/* Materials Display */}
                  <MaterialsDisplay
                    materials={job.materials}
                    totalMaterialCost={job.totalMaterialCost}
                  />

                  {/* Show detailed materials button if materials exist */}
                  {job.materials && job.materials.length > 3 && (
                    <button
                      onClick={() => showDetailedMaterials(job)}
                      className="w-full text-xs text-blue-600 hover:text-blue-800 transition mb-2 py-1"
                    >
                      View all {job.materials.length} materials →
                    </button>
                  )}

                  {/* ✅ UPDATED: Enhanced Quantity Grid for Unlimited Applications */}
                  <div className="bg-gray-50 rounded-lg p-2 mb-2">
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="text-center">
                        <span className="text-gray-500 block">Target</span>
                        <span className="font-bold text-blue-600">
                          {quantityInfo.targetQuantity}
                        </span>
                      </div>
                      <div className="text-center">
                        <span className="text-gray-500 block">Approved</span>
                        <span className={`font-bold ${
                          quantityInfo.exceededTarget 
                            ? 'text-orange-600' 
                            : 'text-green-600'
                        }`}>
                          {quantityInfo.approvedQuantity}
                        </span>
                      </div>
                      <div className="text-center">
                        <span className="text-gray-500 block">Done</span>
                        <span className="font-bold text-purple-600">
                          {quantityInfo.fulfilledQuantity}
                        </span>
                      </div>
                    </div>

                    {/* Enhanced Progress Bar */}
                    <div className="mt-2">{getCompactProgressBar(job)}</div>
                    
                    {/* ✅ NEW: Exceeded target indicator */}
                    {quantityInfo.exceededTarget && (
                      <div className="mt-1 text-center">
                        <span className="text-orange-600 text-xs font-medium">
                          🔥 Exceeded by {quantityInfo.exceedanceAmount}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Status and Date */}
                  <div className="flex justify-between items-center text-xs mb-2">
                    <span
                      className={`font-semibold ${
                        job.status === 'open'
                          ? 'text-green-600'
                          : job.status === 'pending'
                          ? 'text-yellow-600'
                          : job.status === 'assigned'
                          ? 'text-purple-600'
                          : 'text-red-600'
                      }`}
                    >
                      {job.status.toUpperCase()}
                    </span>
                    <span className="text-gray-500">
                      {new Date(job.date).toLocaleDateString()}
                    </span>
                  </div>

                  {/* ✅ UPDATED: Different behavior for assigned vs non-assigned jobs */}
                  {job.status === 'open' && !appliedJobs[job._id] && (
                    <div className="border-t border-amber-200 pt-2 space-y-2">
                      {/* ✅ NEW: Show assigned job contribution form */}
                      {isAssignedToMe(job) ? (
                        <div className="bg-purple-50 rounded-lg p-2 mb-2">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                            <span className="text-purple-700 text-xs font-semibold">
                              Assigned to You - Direct Contribution
                            </span>
                          </div>
                          
                          {/* Direct contribution form (simplified) */}
                          <input
                            type="number"
                            name="quantity"
                            value={formInputs[job._id]?.quantity || ''}
                            onChange={(e) => handleChange(job._id, e)}
                            placeholder="Enter quantity to contribute"
                            className="w-full border border-purple-300 px-2 py-1 rounded-lg focus:ring-1 focus:ring-purple-400 focus:outline-none transition text-xs"
                            min="1"
                            required
                          />
                          
                          <textarea
                            name="note"
                            value={formInputs[job._id]?.note || ''}
                            onChange={(e) => handleChange(job._id, e)}
                            rows={2}
                            placeholder="Progress note (optional)"
                            className="w-full mt-2 border border-purple-300 px-2 py-1 rounded-lg focus:ring-1 focus:ring-purple-400 focus:outline-none transition text-xs resize-none"
                          />
                          
                          <button
                            onClick={() => handleDirectContribution(job)}
                            disabled={loading}
                            className="w-full mt-2 bg-purple-600 text-white font-semibold py-2 px-3 rounded-lg hover:bg-purple-700 transition disabled:opacity-50 text-xs"
                          >
                            {loading ? 'Contributing...' : 'Contribute Directly'}
                          </button>
                        </div>
                      ) : (
                        // ✅ EXISTING: Regular application form for non-assigned jobs
                        <>
                          {/* ✅ UPDATED: Enhanced cost calculator */}
                          {job.totalMaterialCost && (
                            <div className="bg-green-50 rounded p-2 text-xs">
                              <div className="flex justify-between items-center">
                                <span className="text-green-700">
                                  Est. material cost:
                                </span>
                                <span className="font-semibold text-green-800">
                                  ৳
                                  {(
                                    job.totalMaterialCost *
                                    (Number(formInputs[job._id]?.quantity) || 1)
                                  ).toFixed(2)}
                                </span>
                              </div>
                              <div className="text-green-600 text-xs mt-1">
                                ({job.totalMaterialCost.toFixed(2)} ×{' '}
                                {formInputs[job._id]?.quantity || 1} units)
                              </div>
                            </div>
                          )}

                          {/* ✅ UPDATED: Quantity Input with unlimited support */}
                          <div className="relative">
                            <input
                              type="number"
                              name="quantity"
                              value={formInputs[job._id]?.quantity || ''}
                              onChange={(e) => handleChange(job._id, e)}
                              placeholder="Enter any quantity (e.g., 1000)"
                              className="w-full border border-amber-300 px-2 py-1 rounded-lg focus:ring-1 focus:ring-amber-400 focus:outline-none transition text-xs"
                              min="1"
                              max="50000" // Reasonable upper limit
                              required
                            />
                            {/* ✅ NEW: Quantity guidance */}
                            {formInputs[job._id]?.quantity && Number(formInputs[job._id]?.quantity) > quantityInfo.targetQuantity && (
                              <div className="mt-1 text-orange-600 text-xs">
                                ⚠️ Exceeds target by {Number(formInputs[job._id]?.quantity) - quantityInfo.targetQuantity}
                              </div>
                            )}
                          </div>

                          {/* Company Input */}
                          <input
                            type="text"
                            name="company"
                            value={formInputs[job._id]?.company || ''}
                            onChange={(e) => handleChange(job._id, e)}
                            placeholder="Enter your company name *"
                            className="w-full border border-amber-300 px-2 py-1 rounded-lg focus:ring-1 focus:ring-amber-400 focus:outline-none transition text-xs"
                            required
                          />

                          {/* Note Input */}
                          <textarea
                            name="note"
                            value={formInputs[job._id]?.note || ''}
                            onChange={(e) => handleChange(job._id, e)}
                            rows={2}
                            placeholder="Enter your note (required) *"
                            className="w-full border border-amber-300 px-2 py-1 rounded-lg focus:ring-1 focus:ring-amber-400 focus:outline-none transition text-xs resize-none"
                            required
                          />

                          <button
                            onClick={() => handleApply(job)}
                            disabled={loading}
                            className="w-full bg-amber-900 text-white font-semibold py-2 px-3 rounded-lg hover:bg-amber-800 transition disabled:opacity-50 disabled:cursor-not-allowed text-xs"
                          >
                            {loading ? 'Applying...' : 'Apply (Unlimited)'}
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {/* ✅ UPDATED: Applied Status with enhanced info */}
                  {appliedJobs[job._id] && (
                    <div className="border-t border-amber-200 pt-2">
                      <div className="bg-amber-50 rounded-lg p-2">
                        <h4 className="font-semibold text-amber-900 text-xs mb-1">
                          Your Application:
                        </h4>
                        <div className="text-xs space-y-1">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Quantity:</span>
                            <span className="font-semibold text-amber-900">
                              {appliedJobs[job._id].quantity}
                              {/* ✅ NEW: Show if application exceeded target */}
                              {appliedJobs[job._id].exceedsOriginalTarget && (
                                <span className="text-orange-600 ml-1">🔥</span>
                              )}
                            </span>
                          </div>
                          {/* Show Company */}
                          <div className="flex justify-between">
                            <span className="text-gray-600">Company:</span>
                            <span className="font-semibold text-amber-900 truncate">
                              {appliedJobs[job._id].workerCompany || 'N/A'}
                            </span>
                          </div>
                          {/* Show estimated material cost for applied quantity */}
                          {job.totalMaterialCost && (
                            <div className="flex justify-between">
                              <span className="text-gray-600">
                                Est. materials:
                              </span>
                              <span className="font-semibold text-green-700">
                                ৳
                                {(
                                  job.totalMaterialCost *
                                  appliedJobs[job._id].quantity
                                ).toFixed(2)}
                              </span>
                            </div>
                          )}
                          {/* ✅ NEW: Show target comparison */}
                          {appliedJobs[job._id].exceedsOriginalTarget && (
                            <div className="flex justify-between">
                              <span className="text-gray-600">Exceeds by:</span>
                              <span className="font-semibold text-orange-600">
                                +{appliedJobs[job._id].exceedanceAmount || 0}
                              </span>
                            </div>
                          )}
                          {appliedJobs[job._id].note && (
                            <p className="text-gray-700 italic truncate">
                              "{appliedJobs[job._id].note}"
                            </p>
                          )}
                          <div className="flex justify-between items-center">
                            <span className="text-gray-600">Status:</span>
                            {getApplicationStatusBadge(job._id)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Closed Job Message */}
                  {job.status !== 'open' && !appliedJobs[job._id] && (
                    <div className="border-t border-amber-200 pt-2">
                      <div className="bg-gray-100 rounded-lg p-2 text-center">
                        <p className="text-gray-600 text-xs">
                          Job{' '}
                          <span className="font-semibold">{job.status}</span>
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Materials Modal - Keep existing */}
      {showMaterialsModal && selectedJobMaterials && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[80vh] overflow-hidden">
            {/* Modal Header */}
            <div className="bg-blue-100 p-4 border-b border-blue-200">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-lg font-bold text-blue-900">
                    Materials for {selectedJobMaterials.productName}
                  </h2>
                  {/* ✅ NEW: Show product code in modal */}
                  {selectedJobMaterials.productCode && (
                    <p className="text-blue-600 text-sm font-medium">
                      Code: {selectedJobMaterials.productCode}
                    </p>
                  )}
                  {/* ✅ NEW: Show VAT in modal */}
                  {selectedJobMaterials.vatPercentage && (
                    <p className="text-green-600 text-sm font-medium">
                      VAT: {selectedJobMaterials.vatPercentage}%
                    </p>
                  )}
                  <p className="text-blue-700 text-sm">
                    Cost breakdown per unit
                  </p>
                </div>
                <button
                  onClick={() => setShowMaterialsModal(false)}
                  className="text-blue-900 hover:text-blue-700 text-2xl font-bold"
                >
                  ×
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {selectedJobMaterials.materials &&
              selectedJobMaterials.materials.length > 0 ? (
                <div className="space-y-3">
                  {selectedJobMaterials.materials.map((material, index) => (
                    <div
                      key={index}
                      className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border"
                    >
                      <div>
                        <h3 className="font-semibold text-gray-900">
                          {material.name}
                        </h3>
                        <p className="text-sm text-gray-600">
                          Material #{index + 1}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-lg font-bold text-blue-700">
                          ৳{material.price}
                        </span>
                        <p className="text-xs text-gray-500">per unit</p>
                      </div>
                    </div>
                  ))}

                  {/* Total Cost */}
                  <div className="border-t border-gray-200 pt-3 mt-4">
                    <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                      <div>
                        <h3 className="font-bold text-blue-900">
                          Total Material Cost
                        </h3>
                        <p className="text-sm text-blue-700">
                          Per unit production cost
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-xl font-bold text-blue-800">
                          ৳
                          {selectedJobMaterials.totalMaterialCost?.toFixed(2) ||
                            '0.00'}
                        </span>
                        <p className="text-xs text-blue-600">per unit</p>
                      </div>
                    </div>
                  </div>

                  {/* ✅ UPDATED: Enhanced Cost Calculator for Unlimited Applications */}
                  <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                    <h4 className="font-semibold text-green-900 mb-2">
                      Cost Calculator (Unlimited)
                    </h4>
                    <div className="text-sm text-green-800 space-y-2">
                      <div>
                        <p>If you produce 100 units:</p>
                        <p className="font-bold">
                          ৳{(selectedJobMaterials.totalMaterialCost * 100).toFixed(2)} in materials
                        </p>
                      </div>
                      <div>
                        <p>If you produce 500 units:</p>
                        <p className="font-bold">
                          ৳{(selectedJobMaterials.totalMaterialCost * 500).toFixed(2)} in materials
                        </p>
                      </div>
                      <div>
                        <p>If you produce 1000 units:</p>
                        <p className="font-bold">
                          ৳{(selectedJobMaterials.totalMaterialCost * 1000).toFixed(2)} in materials
                        </p>
                      </div>
                      <div className="border-t border-green-300 pt-2 mt-2">
                        <p className="text-green-700 text-xs">
                          💡 You can apply for any quantity - admin will decide based on capacity and materials availability!
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500">
                    No materials specified for this job
                  </p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-gray-50 px-4 py-3 border-t border-gray-200">
              <button
                onClick={() => setShowMaterialsModal(false)}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Compact Refresh Button */}
      <div className="text-center mt-6">
        <button
          onClick={() => {
            fetchJobs()
            fetchAppliedJobs()
          }}
          className="bg-white text-amber-900 px-4 py-2 rounded-lg shadow-md hover:shadow-lg transition border border-amber-200 text-sm"
        >
          <svg
            className="inline w-4 h-4 mr-1"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
              clipRule="evenodd"
            />
          </svg>
          Refresh
        </button>
      </div>
    </div>
  )
}
