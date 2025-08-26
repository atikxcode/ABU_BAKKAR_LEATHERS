'use client'

import { useState, useEffect, useContext } from 'react'
import Swal from 'sweetalert2'
import { AuthContext } from '../../../../Provider/AuthProvider' // adjust path if needed

export default function WorkerProductionPage() {
  const { user } = useContext(AuthContext)
  const userEmail = user?.email

  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(false)
  const [appliedJobs, setAppliedJobs] = useState({})
  const [formInputs, setFormInputs] = useState({})

  // ----------------- Fetch all production jobs -----------------
  const fetchJobs = async () => {
    try {
      const res = await fetch('/api/stock/production')
      if (!res.ok) throw new Error('Failed to fetch jobs')
      setJobs(await res.json())
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
        if (app.workerId === userEmail) applied[app.jobId] = app
      })
      setAppliedJobs(applied)
    } catch (err) {
      Swal.fire('Error', err.message, 'error')
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
  const handleApply = async (job) => {
    const input = formInputs[job._id]
    if (!input || !input.quantity)
      return Swal.fire('Warning', 'Enter quantity', 'warning')

    if (Number(input.quantity) > Number(job.quantity)) {
      return Swal.fire(
        'Warning',
        `Cannot apply for more than ${job.quantity}`,
        'warning'
      )
    }

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
          note: input.note || '',
        }),
      })

      const data = await res.json()
      if (res.ok) {
        Swal.fire('Success', 'Application submitted!', 'success')
        fetchAppliedJobs()
        setFormInputs({ ...formInputs, [job._id]: {} })
      } else {
        Swal.fire('Error', data.error || 'Failed to apply', 'error')
      }
    } catch (err) {
      Swal.fire('Error', err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  // ----------------- Render -----------------
  return (
    <div className="min-h-screen p-6 bg-amber-50">
      <h1 className="text-3xl font-bold text-amber-900 mb-8 text-center">
        Production Jobs
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {jobs.map((job) => (
          <div
            key={job._id}
            className="bg-white rounded-2xl shadow-lg border border-amber-200 hover:shadow-2xl transition overflow-hidden"
          >
            {job.image && (
              <img
                src={job.image}
                alt={job.productName}
                className="w-full h-48 object-cover"
              />
            )}
            <div className="p-4">
              <h2 className="text-xl font-bold text-amber-900 mb-2">
                {job.productName}
              </h2>
              <p className="text-gray-700 mb-2">{job.description}</p>
              <p className="mb-1">
                <span className="font-semibold">Quantity Needed: </span>
                {job.quantity}
              </p>
              <p className="mb-2">
                <span className="font-semibold">Status: </span>
                <span
                  className={
                    job.status === 'open'
                      ? 'text-green-600 font-semibold'
                      : 'text-red-600 font-semibold'
                  }
                >
                  {job.status.toUpperCase()}
                </span>
              </p>

              {job.status === 'open' && !appliedJobs[job._id] && (
                <div className="mt-2">
                  <input
                    type="number"
                    name="quantity"
                    value={formInputs[job._id]?.quantity || ''}
                    onChange={(e) => handleChange(job._id, e)}
                    placeholder={`Quantity (max ${job.quantity})`}
                    className="w-full mb-2 border border-amber-300 px-3 py-2 rounded-xl focus:ring-2 focus:ring-amber-400 focus:outline-none transition"
                  />
                  <textarea
                    name="note"
                    value={formInputs[job._id]?.note || ''}
                    onChange={(e) => handleChange(job._id, e)}
                    rows={2}
                    placeholder="Optional note..."
                    className="w-full mb-2 border border-amber-300 px-3 py-2 rounded-xl focus:ring-2 focus:ring-amber-400 focus:outline-none transition"
                  />
                  <button
                    onClick={() => handleApply(job)}
                    disabled={loading}
                    className="w-full bg-amber-900 text-white font-semibold py-2 rounded-xl hover:bg-amber-800 transition disabled:opacity-50"
                  >
                    {loading ? 'Applying...' : 'Apply'}
                  </button>
                </div>
              )}

              {appliedJobs[job._id] && (
                <p className="text-green-600 font-semibold mt-2">
                  You applied for {appliedJobs[job._id].quantity} pcs
                  {appliedJobs[job._id].note
                    ? ` with note: "${appliedJobs[job._id].note}"`
                    : ''}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
