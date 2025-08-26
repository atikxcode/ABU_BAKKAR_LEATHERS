'use client'

import { useState, useEffect } from 'react'

export default function AdminProductionPage() {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(false)
  const [imageFile, setImageFile] = useState(null)
  const [formData, setFormData] = useState({
    product: '',
    description: '',
    quantity: '',
  })

  const fetchJobs = async () => {
    try {
      const res = await fetch('/api/stock/production')
      if (res.ok) setJobs(await res.json())
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    fetchJobs()
  }, [])

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const handleImageChange = (e) => {
    setImageFile(e.target.files[0])
  }

  // Convert file to Base64
  const fileToBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = () => {
        // remove prefix like "data:image/png;base64,"
        const base64 = reader.result.split(',')[1]
        resolve(base64)
      }
      reader.onerror = (error) => reject(error)
    })

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.product || !formData.quantity) return
    setLoading(true)

    try {
      let imageBase64 = null

      if (imageFile) {
        imageBase64 = await fileToBase64(imageFile)
      }

      // Send Base64 string to your backend
      await fetch('/api/stock/production', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          role: 'admin',
        },
        body: JSON.stringify({
          productName: formData.product,
          description: formData.description,
          quantity: formData.quantity,
          image: imageBase64, // send Base64
        }),
      })

      setFormData({ product: '', description: '', quantity: '' })
      setImageFile(null)
      fetchJobs()
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen p-6 bg-amber-50">
      <h1 className="text-3xl font-bold text-amber-900 mb-8 text-center">
        Admin Production Jobs
      </h1>

      {/* Form */}
      <form
        onSubmit={handleSubmit}
        className="bg-white p-6 rounded-2xl shadow-lg max-w-xl mx-auto mb-12 border border-amber-200"
      >
        <div className="mb-4">
          <label className="block font-medium text-amber-900 mb-1">
            Product Name
          </label>
          <input
            type="text"
            name="product"
            value={formData.product}
            onChange={handleChange}
            className="w-full border border-amber-300 px-4 py-2 rounded-xl focus:ring-2 focus:ring-amber-400 focus:outline-none transition"
            placeholder="Moneybag, Wallet..."
          />
        </div>

        <div className="mb-4">
          <label className="block font-medium text-amber-900 mb-1">
            Description
          </label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            rows={4}
            placeholder="Details about the product"
            className="w-full border border-amber-300 px-4 py-2 rounded-xl focus:ring-2 focus:ring-amber-400 focus:outline-none transition"
          />
        </div>

        <div className="mb-4">
          <label className="block font-medium text-amber-900 mb-1">
            Quantity Needed
          </label>
          <input
            type="number"
            name="quantity"
            value={formData.quantity}
            onChange={handleChange}
            className="w-full border border-amber-300 px-4 py-2 rounded-xl focus:ring-2 focus:ring-amber-400 focus:outline-none transition"
            placeholder="500"
          />
        </div>

        <div className="mb-6">
          <label className="block font-medium text-amber-900 mb-2">
            Product Image
          </label>
          <label className="cursor-pointer flex justify-center items-center w-full h-12 bg-amber-200 text-amber-900 font-medium rounded-xl hover:bg-amber-300 transition">
            {imageFile ? imageFile.name : 'Choose File'}
            <input
              type="file"
              onChange={handleImageChange}
              className="hidden"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-amber-900 text-white font-semibold py-3 rounded-xl hover:bg-amber-800 transition disabled:opacity-50"
        >
          {loading ? 'Submitting...' : 'Create Job'}
        </button>
      </form>

      {/* Job List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {jobs.map((job) => (
          <div
            key={job._id}
            className="bg-white rounded-2xl shadow-lg overflow-hidden border border-amber-200 hover:shadow-2xl transition"
          >
            {job.image && (
              <img
                src={job.image}
                alt={job.product}
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
              <p>
                <span className="font-semibold">Status: </span>
                <span
                  className={`font-semibold ${
                    job.status === 'approved'
                      ? 'text-green-600'
                      : job.status === 'rejected'
                      ? 'text-red-600'
                      : 'text-yellow-600'
                  }`}
                >
                  {job.status}
                </span>
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
