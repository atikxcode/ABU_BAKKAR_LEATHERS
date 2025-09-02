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

  // ----------------- Handle image load error -----------------
  const handleImageError = (jobId) => {
    setImageLoadErrors((prev) => ({
      ...prev,
      [jobId]: true,
    }))
  }

  // ----------------- Fetch all production jobs -----------------
  const fetchJobs = async () => {
    try {
      const res = await fetch('/api/stock/production')
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

  // ----------------- Handle apply -----------------
  // ----------------- Handle apply -----------------
  const handleApply = async (job) => {
    const input = formInputs[job._id]

    // ✅ VALIDATE ALL THREE MANDATORY FIELDS
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

    // Check against remaining quantity instead of original quantity
    const availableQuantity =
      job.remainingQuantity !== undefined ? job.remainingQuantity : job.quantity

    if (Number(input.quantity) > availableQuantity) {
      return Swal.fire(
        'Warning',
        `Cannot apply for more than ${availableQuantity} pieces (remaining quantity)`,
        'warning'
      )
    }

    // ✅ SHOW CONFIRMATION DIALOG WITH ALL THREE FIELDS
    const result = await Swal.fire({
      title: 'Confirm Application',
      html: `
      <div class="text-left">
        <p><strong>Job:</strong> ${job.productName}</p>
        <p><strong>Quantity:</strong> ${input.quantity} pieces</p>
        <p><strong>Available:</strong> ${availableQuantity} pieces</p>
        <p><strong>Company:</strong> ${input.company}</p>
        <p><strong>Note:</strong> ${input.note}</p>
      </div>
    `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#92400e',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Submit Application',
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
          company: input.company.trim(), // ✅ SEND COMPANY FIELD
        }),
      })

      const data = await res.json()
      if (res.ok) {
        Swal.fire({
          title: 'Success!',
          text: 'Your application has been submitted successfully',
          icon: 'success',
          confirmButtonColor: '#92400e',
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

  // ----------------- Filter jobs based on selected filter -----------------
  const getFilteredJobs = () => {
    switch (filter) {
      case 'open':
        return jobs.filter(
          (job) =>
            job.status === 'open' &&
            !appliedJobs[job._id] &&
            (job.remainingQuantity === undefined || job.remainingQuantity > 0)
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

  // ----------------- Get compact progress bar component -----------------
  const getCompactProgressBar = (job) => {
    const totalQuantity = job.quantity
    const fulfilledQuantity = job.fulfilledQuantity || 0
    const progressPercentage =
      totalQuantity > 0 ? (fulfilledQuantity / totalQuantity) * 100 : 0

    return (
      <div className="flex items-center gap-2 text-xs">
        <div className="flex-1 bg-gray-200 rounded-full h-1.5">
          <div
            className="bg-green-500 h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${progressPercentage}%` }}
          ></div>
        </div>
        <span className="text-gray-500 min-w-0 whitespace-nowrap">
          {Math.round(progressPercentage)}%
        </span>
      </div>
    )
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
      </div>

      {/* Filter Tabs */}
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
                  !appliedJobs[job._id] &&
                  (job.remainingQuantity === undefined ||
                    job.remainingQuantity > 0)
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
            const remainingQuantity =
              job.remainingQuantity !== undefined
                ? job.remainingQuantity
                : job.quantity
            const fulfilledQuantity = job.fulfilledQuantity || 0
            const hasValidImage =
              job.image && job.image.trim() !== '' && !imageLoadErrors[job._id]

            return (
              <div
                key={job._id}
                className={`bg-white rounded-xl shadow-md border hover:shadow-lg transition overflow-hidden ${
                  appliedJobs[job._id]
                    ? 'border-amber-300 ring-1 ring-amber-200'
                    : 'border-amber-200'
                }`}
              >
                {/* Compact Image Section */}
                {hasValidImage ? (
                  <div className="relative h-64">
                    <img
                      src={job.image}
                      alt={job.productName}
                      className="w-full h-full object-cover bg-gray-50"
                      onError={() => handleImageError(job._id)}
                    />
                    {/* Badges */}
                    <div className="absolute top-1 right-1 flex gap-1">
                      {appliedJobs[job._id] &&
                        getApplicationStatusBadge(job._id)}
                    </div>
                    <div className="absolute top-1 left-1">
                      {job.status === 'open' &&
                        remainingQuantity !== undefined && (
                          <span
                            className={`px-1.5 py-0.5 rounded-full text-xs font-semibold ${
                              remainingQuantity > 0
                                ? 'bg-green-500 text-white'
                                : 'bg-red-500 text-white'
                            }`}
                          >
                            {remainingQuantity} left
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
                    </div>

                    {/* Badges */}
                    <div className="absolute top-1 right-1 flex gap-1">
                      {appliedJobs[job._id] &&
                        getApplicationStatusBadge(job._id)}
                    </div>
                    <div className="absolute top-1 left-1">
                      {job.status === 'open' &&
                        remainingQuantity !== undefined && (
                          <span
                            className={`px-1.5 py-0.5 rounded-full text-xs font-semibold ${
                              remainingQuantity > 0
                                ? 'bg-green-500 text-white'
                                : 'bg-red-500 text-white'
                            }`}
                          >
                            {remainingQuantity} left
                          </span>
                        )}
                    </div>
                  </div>
                )}

                <div className="p-3">
                  {/* Job Info */}
                  <h3 className="font-bold text-amber-900 text-sm mb-1 truncate">
                    {job.productName}
                  </h3>

                  <p className="text-gray-600 text-xs mb-2 line-clamp-2">
                    {job.description || 'No description available'}
                  </p>

                  {/* Compact Quantity Grid */}
                  <div className="bg-gray-50 rounded-lg p-2 mb-2">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="text-center">
                        <span className="text-gray-500 block">Total</span>
                        <span className="font-bold text-gray-900">
                          {job.quantity}
                        </span>
                      </div>
                      <div className="text-center">
                        <span className="text-gray-500 block">Left</span>
                        <span
                          className={`font-bold ${
                            remainingQuantity > 0
                              ? 'text-green-600'
                              : 'text-red-600'
                          }`}
                        >
                          {remainingQuantity}
                        </span>
                      </div>
                    </div>

                    {/* Compact Progress Bar */}
                    <div className="mt-2">{getCompactProgressBar(job)}</div>
                  </div>

                  {/* Status and Date */}
                  <div className="flex justify-between items-center text-xs mb-2">
                    <span
                      className={`font-semibold ${
                        job.status === 'open'
                          ? 'text-green-600'
                          : job.status === 'pending'
                          ? 'text-yellow-600'
                          : 'text-red-600'
                      }`}
                    >
                      {job.status.toUpperCase()}
                    </span>
                    <span className="text-gray-500">
                      {new Date(job.date).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Application Form */}
                  {job.status === 'open' &&
                    !appliedJobs[job._id] &&
                    remainingQuantity > 0 && (
                      <div className="border-t border-amber-200 pt-2 space-y-2">
                        {/* Quantity Input */}
                        <input
                          type="number"
                          name="quantity"
                          value={formInputs[job._id]?.quantity || ''}
                          onChange={(e) => handleChange(job._id, e)}
                          placeholder={`Max ${remainingQuantity}`}
                          className="w-full border border-amber-300 px-2 py-1 rounded-lg focus:ring-1 focus:ring-amber-400 focus:outline-none transition text-xs"
                          min="1"
                          max={remainingQuantity}
                          required
                        />

                        {/* ✅ NEW: Company Input */}
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
                          placeholder="Enter your note *"
                          className="w-full border border-amber-300 px-2 py-1 rounded-lg focus:ring-1 focus:ring-amber-400 focus:outline-none transition text-xs resize-none"
                          required
                        />

                        <button
                          onClick={() => handleApply(job)}
                          disabled={loading}
                          className="w-full bg-amber-900 text-white font-semibold py-2 px-3 rounded-lg hover:bg-amber-800 transition disabled:opacity-50 disabled:cursor-not-allowed text-xs"
                        >
                          {loading ? 'Applying...' : 'Apply'}
                        </button>
                      </div>
                    )}

                  {/* No Remaining Quantity */}
                  {job.status === 'open' &&
                    !appliedJobs[job._id] &&
                    remainingQuantity <= 0 && (
                      <div className="border-t border-amber-200 pt-2">
                        <div className="bg-red-50 rounded-lg p-2 text-center">
                          <p className="text-red-600 text-xs font-semibold">
                            Fully allocated
                          </p>
                        </div>
                      </div>
                    )}

                  {/* Applied Status */}
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
                            </span>
                          </div>
                          {/* ✅ NEW: Show Company */}
                          <div className="flex justify-between">
                            <span className="text-gray-600">Company:</span>
                            <span className="font-semibold text-amber-900 truncate">
                              {appliedJobs[job._id].workerCompany || 'N/A'}
                            </span>
                          </div>
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
