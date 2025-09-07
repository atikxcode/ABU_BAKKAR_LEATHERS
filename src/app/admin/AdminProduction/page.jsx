'use client'

import { useState, useEffect } from 'react'
import Swal from 'sweetalert2'

export default function AdminProductionPage() {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(false)
  const [imageFile, setImageFile] = useState(null)
  const [pdfFile, setPdfFile] = useState(null) // Added pdfFile state
  const [showModal, setShowModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedJobApplications, setSelectedJobApplications] = useState([])
  const [selectedJobId, setSelectedJobId] = useState(null)
  const [selectedJobName, setSelectedJobName] = useState('')
  const [jobToDelete, setJobToDelete] = useState(null)
  const [jobToEdit, setJobToEdit] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [editLoading, setEditLoading] = useState(false)
  const [imageLoadErrors, setImageLoadErrors] = useState({})
  const [deliveryInputs, setDeliveryInputs] = useState({})

  // Materials modal state
  const [showMaterialsModal, setShowMaterialsModal] = useState(false)
  const [selectedJobMaterials, setSelectedJobMaterials] = useState(null)

  // Form state with materials
  const [formData, setFormData] = useState({
    product: '',
    description: '',
    quantity: '',
    materials: [{ name: '', price: '' }],
  })

  // Edit form state with materials
  const [editFormData, setEditFormData] = useState({
    productName: '',
    description: '',
    quantity: '',
    materials: [{ name: '', price: '' }],
  })

  // Material count selector state
  const [materialCount, setMaterialCount] = useState(1)

  // Handle image load error
  const handleImageError = (jobId) => {
    setImageLoadErrors((prev) => ({
      ...prev,
      [jobId]: true,
    }))
  }

  const fetchJobs = async () => {
    console.log('📡 Fetching jobs...')
    try {
      const res = await fetch('/api/stock/production')
      console.log('📡 Jobs fetch response status:', res.status)

      if (res.ok) {
        const data = await res.json()
        console.log('📡 Jobs data received:', data.length, 'jobs')
        setJobs(data)
      } else {
        const errorData = await res.json()
        console.error('❌ Failed to fetch jobs:', errorData)
        Swal.fire('Error', 'Failed to fetch jobs', 'error')
      }
    } catch (err) {
      console.error('❌ Network error fetching jobs:', err)
      Swal.fire('Error', 'Network error occurred', 'error')
    }
  }

  useEffect(() => {
    fetchJobs()
  }, [])

  // Show detailed materials modal
  const showDetailedMaterials = (job) => {
    setSelectedJobMaterials(job)
    setShowMaterialsModal(true)
  }

  // Handle basic form changes
  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const handleEditChange = (e) => {
    setEditFormData({ ...editFormData, [e.target.name]: e.target.value })
  }

  // Handle material count selection
  const handleMaterialCountChange = (count) => {
    setMaterialCount(count)
    const newMaterials = Array(count)
      .fill()
      .map((_, index) => ({
        name: formData.materials[index]?.name || '',
        price: formData.materials[index]?.price || '',
      }))
    setFormData({ ...formData, materials: newMaterials })
  }

  // Handle individual material changes
  const handleMaterialChange = (index, field, value) => {
    const newMaterials = [...formData.materials]
    newMaterials[index] = { ...newMaterials[index], [field]: value }
    setFormData({ ...formData, materials: newMaterials })
  }

  // Handle edit material changes
  const handleEditMaterialChange = (index, field, value) => {
    const newMaterials = [...editFormData.materials]
    newMaterials[index] = { ...newMaterials[index], [field]: value }
    setEditFormData({ ...editFormData, materials: newMaterials })
  }

  // Add new material field
  const addMaterialField = () => {
    setFormData({
      ...formData,
      materials: [...formData.materials, { name: '', price: '' }],
    })
  }

  // Add new material field for edit form
  const addEditMaterialField = () => {
    setEditFormData({
      ...editFormData,
      materials: [...editFormData.materials, { name: '', price: '' }],
    })
  }

  // Remove material field
  const removeMaterialField = (index) => {
    if (formData.materials.length > 1) {
      const newMaterials = formData.materials.filter((_, i) => i !== index)
      setFormData({ ...formData, materials: newMaterials })
    }
  }

  // Remove edit material field
  const removeEditMaterialField = (index) => {
    if (editFormData.materials.length > 1) {
      const newMaterials = editFormData.materials.filter((_, i) => i !== index)
      setEditFormData({ ...editFormData, materials: newMaterials })
    }
  }

  const handleImageChange = (e) => {
    const file = e.target.files[0]
    console.log('📷 Image selected:', file?.name, file?.size)
    setImageFile(file)
  }

  // Added handler for PDF file
  const handlePdfChange = (e) => {
    const file = e.target.files[0]
    console.log('📄 PDF selected:', file?.name, file?.size)
    
    // Validate PDF file
    if (file && file.type !== 'application/pdf') {
      Swal.fire('Error', 'Please select a valid PDF file', 'error')
      return
    }
    
    // Check file size (5MB limit)
    if (file && file.size > 5 * 1024 * 1024) {
      Swal.fire('Error', 'PDF file size must be less than 5MB', 'error')
      return
    }
    
    setPdfFile(file)
  }

  // Convert file to Base64
  const fileToBase64 = (file) =>
    new Promise((resolve, reject) => {
      console.log('📄 Converting file to base64...')
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = () => {
        const base64 = reader.result.split(',')[1]
        console.log('📄 Base64 conversion complete, length:', base64.length)
        resolve(base64)
      }
      reader.onerror = (error) => {
        console.error('❌ Base64 conversion failed:', error)
        reject(error)
      }
    })

  const handleSubmit = async (e) => {
    e.preventDefault()
    console.log('🚀 Form submission started')
    console.log('📝 Form data:', formData)

    if (!formData.product || !formData.quantity) {
      console.error('❌ Missing required fields')
      Swal.fire('Warning', 'Please fill in all required fields', 'warning')
      return
    }

    setLoading(true)

    try {
      // Use FormData for file uploads instead of JSON
      const formDataToSend = new FormData()
      
      formDataToSend.append('productName', formData.product)
      formDataToSend.append('description', formData.description)
      formDataToSend.append('quantity', formData.quantity)
      
      // Filter out empty materials and stringify for FormData
      const validMaterials = formData.materials.filter(
        (material) => material.name.trim() !== ''
      )
      formDataToSend.append('materials', JSON.stringify(validMaterials))

      // Handle image file (convert to base64 for IMGBB compatibility)
      if (imageFile) {
        console.log('📷 Processing image file...')
        const imageBase64 = await fileToBase64(imageFile)
        formDataToSend.append('image', imageBase64)
      }

      // Handle PDF file (send as file object)
      if (pdfFile) {
        console.log('📄 Adding PDF file...')
        formDataToSend.append('pdfFile', pdfFile)
      }

      console.log('📡 Sending request to API with FormData')

      const response = await fetch('/api/stock/production', {
        method: 'POST',
        headers: {
          role: 'admin',
        },
        body: formDataToSend,
      })

      console.log('📡 API response status:', response.status)
      const responseData = await response.json()
      console.log('📡 API response data:', responseData)

      if (response.ok) {
        console.log('✅ Job created successfully')
        Swal.fire('Success!', responseData.message || 'Job created successfully', 'success')
        setFormData({
          product: '',
          description: '',
          quantity: '',
          materials: [{ name: '', price: '' }],
        })
        setMaterialCount(1)
        setImageFile(null)
        setPdfFile(null) // Reset PDF file
        
        // Reset file inputs
        const imageInput = document.querySelector('input[type="file"][accept*="image"]')
        if (imageInput) imageInput.value = ''
        const pdfInput = document.querySelector('input[type="file"][accept="application/pdf"]')
        if (pdfInput) pdfInput.value = ''
        
        fetchJobs()
      } else {
        console.error('❌ API error:', responseData)
        Swal.fire(
          'Error',
          responseData.error || 'Failed to create job',
          'error'
        )
      }
    } catch (err) {
      console.error('❌ Submit error:', err)
      Swal.fire('Error', 'An error occurred while creating the job', 'error')
    } finally {
      setLoading(false)
    }
  }

  // PATCH status update function - THIS WAS MISSING!
  const handleStatusChange = async (jobId, newStatus) => {
    console.log('🔄 Updating job status:', { jobId, newStatus })
    try {
      const response = await fetch(`/api/stock/production?id=${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', role: 'admin' },
        body: JSON.stringify({ status: newStatus }),
      })

      if (response.ok) {
        console.log('✅ Status updated successfully')
        fetchJobs()
        Swal.fire('Updated!', `Job status changed to ${newStatus}`, 'success')
      } else {
        const errorData = await response.json()
        console.error('❌ Status update failed:', errorData)
        Swal.fire('Error', 'Failed to update status', 'error')
      }
    } catch (err) {
      console.error('❌ Status update error:', err)
      Swal.fire('Error', 'Failed to update status', 'error')
    }
  }

  // Mark as finished function
  const handleMarkAsFinished = async (job) => {
    console.log('🏁 Marking job as finished:', job.productName)

    // Fetch applications to show company info in confirmation
    let companyInfo = ''
    try {
      const res = await fetch(`/api/stock/production_apply?jobId=${job._id}`)
      if (res.ok) {
        const applications = await res.json()
        const approvedApps = applications.filter(
          (app) => app.status === 'approved'
        )
        const companies = [
          ...new Set(
            approvedApps.map((app) => app.workerCompany).filter(Boolean)
          ),
        ]
        if (companies.length > 0) {
          companyInfo = `<p><strong>Worker Companies:</strong> ${companies.join(
            ', '
          )}</p>`
        }
      }
    } catch (err) {
      console.log('Could not fetch company info:', err)
    }

    const result = await Swal.fire({
      title: 'Mark Job as Finished?',
      html: `
      <div class="text-left">
        <p><strong>Job:</strong> ${job.productName}</p>
        <p><strong>Original Quantity:</strong> ${job.quantity}</p>
        <p><strong>Fulfilled:</strong> ${job.fulfilledQuantity || 0}</p>
        ${companyInfo}
        <p><strong>Status:</strong> This job will be moved to finished products</p>
      </div>
    `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#059669',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Mark as Finished',
    })

    if (result.isConfirmed) {
      try {
        const response = await fetch('/api/stock/finished_products', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            role: 'admin',
          },
          body: JSON.stringify({
            productionJobId: job._id,
            finishedBy: 'Admin',
          }),
        })

        if (response.ok) {
          console.log('✅ Job marked as finished successfully')
          Swal.fire(
            'Success!',
            'Job marked as finished successfully',
            'success'
          )
          fetchJobs()
        } else {
          const error = await response.json()
          console.error('❌ Failed to mark as finished:', error)
          Swal.fire(
            'Error',
            error.message || 'Failed to mark job as finished',
            'error'
          )
        }
      } catch (err) {
        console.error('❌ Mark as finished error:', err)
        Swal.fire('Error', 'An error occurred', 'error')
      }
    }
  }

  // Edit job functions
  const handleEditConfirm = (job) => {
    console.log('✏️ Editing job:', job.productName)
    setJobToEdit(job)
    setEditFormData({
      productName: job.productName,
      description: job.description,
      quantity: job.quantity.toString(),
      materials:
        job.materials && job.materials.length > 0
          ? job.materials
          : [{ name: '', price: '' }],
    })
    setShowEditModal(true)
  }

  const handleEditSubmit = async (e) => {
    e.preventDefault()
    if (!editFormData.productName || !editFormData.quantity) return
    setEditLoading(true)

    console.log('📝 Updating job:', editFormData)

    try {
      // Filter out empty materials
      const validMaterials = editFormData.materials.filter(
        (material) => material.name.trim() !== ''
      )

      const response = await fetch(
        `/api/stock/production?id=${jobToEdit._id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            role: 'admin',
          },
          body: JSON.stringify({
            productName: editFormData.productName,
            description: editFormData.description,
            quantity: parseInt(editFormData.quantity),
            materials: validMaterials,
          }),
        }
      )

      if (response.ok) {
        console.log('✅ Job updated successfully')
        Swal.fire(
          'Success!',
          `Job "${editFormData.productName}" updated successfully!`,
          'success'
        )
        fetchJobs()
        setShowEditModal(false)
        setJobToEdit(null)
      } else {
        const error = await response.json()
        console.error('❌ Job update failed:', error)
        Swal.fire('Error', `Failed to update job: ${error.message}`, 'error')
      }
    } catch (err) {
      console.error('❌ Edit submit error:', err)
      Swal.fire('Error', 'Failed to update job. Please try again.', 'error')
    } finally {
      setEditLoading(false)
    }
  }

  // Delete job confirmation
  const handleDeleteConfirm = (job) => {
    console.log('🗑️ Preparing to delete job:', job.productName)
    setJobToDelete(job)
    setShowDeleteModal(true)
  }

  // Delete job
  const handleDelete = async () => {
    if (!jobToDelete) return
    setDeleteLoading(true)

    console.log('🗑️ Deleting job:', jobToDelete.productName)

    try {
      const response = await fetch(
        `/api/stock/production?id=${jobToDelete._id}`,
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
        console.log('✅ Job deleted successfully:', result)
        Swal.fire(
          'Deleted!',
          `Job "${jobToDelete.productName}" deleted successfully!`,
          'success'
        )
        fetchJobs()
        setShowDeleteModal(false)
        setJobToDelete(null)
      } else {
        const error = await response.json()
        console.error('❌ Delete failed:', error)
        Swal.fire('Error', `Failed to delete job: ${error.message}`, 'error')
      }
    } catch (err) {
      console.error('❌ Delete job error:', err)
      Swal.fire('Error', 'Failed to delete job. Please try again.', 'error')
    } finally {
      setDeleteLoading(false)
    }
  }

  // Enhanced function to view applications with delivery tracking
  const viewApplications = async (jobId, jobName) => {
    console.log('👥 Fetching applications for job:', jobName)
    try {
      const res = await fetch(`/api/stock/production_apply?jobId=${jobId}`)
      if (res.ok) {
        const applications = await res.json()
        console.log('👥 Applications received:', applications.length)
        setSelectedJobApplications(applications)
        setSelectedJobId(jobId)
        setSelectedJobName(jobName)
        setShowModal(true)

        // Initialize delivery inputs
        const inputs = {}
        applications.forEach((app) => {
          inputs[app._id] = app.deliveredQuantity || 0
        })
        setDeliveryInputs(inputs)
      } else {
        const errorData = await res.json()
        console.error('❌ Failed to fetch applications:', errorData)
        Swal.fire('Error', 'Failed to fetch applications', 'error')
      }
    } catch (err) {
      console.error('❌ Error fetching applications:', err)
      Swal.fire('Error', 'Failed to fetch applications', 'error')
    }
  }

  // Enhanced function to update application status
  const updateApplicationStatus = async (applicationId, status) => {
    console.log('🔄 Updating application status:', { applicationId, status })
    try {
      const response = await fetch(
        `/api/stock/production_apply?id=${applicationId}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            role: 'admin',
          },
          body: JSON.stringify({ status }),
        }
      )

      if (response.ok) {
        console.log('✅ Application status updated')
        viewApplications(selectedJobId, selectedJobName)
        fetchJobs()
        Swal.fire('Updated!', `Application ${status} successfully`, 'success')
      } else {
        const errorData = await response.json()
        console.error('❌ Status update failed:', errorData)
        Swal.fire('Error', 'Failed to update application status', 'error')
      }
    } catch (err) {
      console.error('❌ Update application status error:', err)
      Swal.fire('Error', 'Failed to update application status', 'error')
    }
  }

  // Handle delivery quantity input change
  const handleDeliveryInputChange = (applicationId, value) => {
    setDeliveryInputs((prev) => ({
      ...prev,
      [applicationId]: Number(value) || 0,
    }))
  }

  // Confirm delivery function
  const confirmDelivery = async (application) => {
    const deliveredQty = deliveryInputs[application._id] || 0

    console.log('📦 Confirming delivery:', {
      worker: application.workerName,
      quantity: deliveredQty,
    })

    if (deliveredQty <= 0) {
      Swal.fire('Warning', 'Please enter a valid delivered quantity', 'warning')
      return
    }

    if (deliveredQty > application.quantity) {
      Swal.fire(
        'Warning',
        'Delivered quantity cannot exceed approved quantity',
        'warning'
      )
      return
    }

    try {
      const response = await fetch(
        `/api/stock/production_apply?id=${application._id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            role: 'admin',
          },
          body: JSON.stringify({
            deliveredQuantity: deliveredQty,
            deliveredAt: new Date(),
            deliveredBy: 'Admin',
          }),
        }
      )

      if (response.ok) {
        console.log('✅ Delivery confirmed successfully')
        Swal.fire(
          'Success!',
          `Delivery of ${deliveredQty} pieces confirmed for ${application.workerName}`,
          'success'
        )
        viewApplications(selectedJobId, selectedJobName)
        fetchJobs()
      } else {
        const errorData = await response.json()
        console.error('❌ Delivery confirmation failed:', errorData)
        Swal.fire('Error', 'Failed to confirm delivery', 'error')
      }
    } catch (err) {
      console.error('❌ Confirm delivery error:', err)
      Swal.fire('Error', 'Failed to confirm delivery', 'error')
    }
  }

  // Get compact progress bar
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

  return (
    <div className="min-h-screen p-4 bg-amber-50">
      <h1 className="text-2xl font-bold text-amber-900 mb-6 text-center">
        Admin Production Jobs
      </h1>

      {/* Enhanced Form with Materials */}
      <form
        onSubmit={handleSubmit}
        className="bg-white p-6 rounded-xl shadow-lg max-w-2xl mx-auto mb-8 border border-amber-200"
      >
        {/* Basic Product Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block font-medium text-amber-900 mb-2 text-sm">
              Product Name *
            </label>
            <input
              type="text"
              name="product"
              value={formData.product}
              onChange={handleChange}
              className="w-full border border-amber-300 px-3 py-2 rounded-lg focus:ring-1 focus:ring-amber-400 focus:outline-none transition text-sm"
              placeholder="Moneybag, Wallet..."
              required
            />
          </div>
          <div>
            <label className="block font-medium text-amber-900 mb-2 text-sm">
              Quantity Needed *
            </label>
            <input
              type="number"
              name="quantity"
              value={formData.quantity}
              onChange={handleChange}
              className="w-full border border-amber-300 px-3 py-2 rounded-lg focus:ring-1 focus:ring-amber-400 focus:outline-none transition text-sm"
              placeholder="500"
              min="1"
              required
            />
          </div>
        </div>

        <div className="mb-4">
          <label className="block font-medium text-amber-900 mb-2 text-sm">
            Description
          </label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            rows={2}
            placeholder="Details about the product"
            className="w-full border border-amber-300 px-3 py-2 rounded-lg focus:ring-1 focus:ring-amber-400 focus:outline-none transition text-sm"
          />
        </div>

        {/* Materials Section */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <label className="block font-medium text-amber-900 text-sm">
              Materials Required
            </label>

            {/* Quick Material Count Selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-600">Quick add:</span>
              {[1, 2, 3, 4, 5].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => handleMaterialCountChange(num)}
                  className={`w-8 h-8 rounded-full text-xs font-medium transition ${
                    materialCount === num
                      ? 'bg-amber-600 text-white'
                      : 'bg-amber-200 text-amber-900 hover:bg-amber-300'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          {/* Materials Input Fields */}
          <div className="space-y-3">
            {formData.materials.map((material, index) => (
              <div
                key={index}
                className="flex gap-3 items-center bg-gray-50 p-3 rounded-lg"
              >
                <div className="flex-1">
                  <input
                    type="text"
                    placeholder="Material name (e.g., Leather, Thread)"
                    value={material.name}
                    onChange={(e) =>
                      handleMaterialChange(index, 'name', e.target.value)
                    }
                    className="w-full border border-gray-300 px-3 py-2 rounded focus:ring-1 focus:ring-amber-400 focus:outline-none text-sm"
                  />
                </div>
                <div className="w-32">
                  <input
                    type="number"
                    placeholder="Price"
                    value={material.price}
                    onChange={(e) =>
                      handleMaterialChange(index, 'price', e.target.value)
                    }
                    className="w-full border border-gray-300 px-3 py-2 rounded focus:ring-1 focus:ring-amber-400 focus:outline-none text-sm"
                    min="0"
                    step="0.01"
                  />
                </div>

                {/* Remove button (only show if more than 1 material) */}
                {formData.materials.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeMaterialField(index)}
                    className="text-red-600 hover:text-red-800 transition-colors p-1"
                    title="Remove material"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                )}
              </div>
            ))}

            {/* Add Material Button */}
            <button
              type="button"
              onClick={addMaterialField}
              className="flex items-center justify-center w-full py-2 px-3 border-2 border-dashed border-amber-300 text-amber-600 rounded-lg hover:border-amber-400 hover:text-amber-700 transition text-sm font-medium"
            >
              <svg
                className="w-4 h-4 mr-1"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                  clipRule="evenodd"
                />
              </svg>
              Add Another Material
            </button>

            {/* Total Materials Cost Display */}
            {formData.materials.some((m) => m.price) && (
              <div className="bg-amber-50 p-2 rounded text-sm">
                <span className="font-medium text-amber-900">
                  Total Material Cost: ৳
                  {formData.materials
                    .reduce(
                      (sum, material) =>
                        sum + (parseFloat(material.price) || 0),
                      0
                    )
                    .toFixed(2)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* PDF Upload */}
        <div className="mb-4">
          <label className="block font-medium text-amber-900 mb-2 text-sm">
            Product PDF
          </label>
          <label className="cursor-pointer flex justify-center items-center w-full h-12 bg-blue-200 text-blue-900 font-medium rounded-lg hover:bg-blue-300 transition text-sm">
            {pdfFile ? (
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm0 2h12v10H4V5z"/>
                </svg>
                {pdfFile.name}
              </span>
            ) : (
              'Choose PDF File'
            )}
            <input
              type="file"
              onChange={handlePdfChange}
              className="hidden"
              accept="application/pdf"
            />
          </label>
          <p className="text-xs text-gray-500 mt-1">Max file size: 5MB</p>
        </div>

        {/* Image Upload */}
        <div className="mb-4">
          <label className="block font-medium text-amber-900 mb-2 text-sm">
            Product Image
          </label>
          <label className="cursor-pointer flex justify-center items-center w-full h-12 bg-amber-200 text-amber-900 font-medium rounded-lg hover:bg-amber-300 transition text-sm">
            {imageFile ? imageFile.name : 'Choose Image File'}
            <input
              type="file"
              onChange={handleImageChange}
              className="hidden"
              accept="image/*"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-amber-900 text-white font-semibold py-3 rounded-lg hover:bg-amber-800 transition disabled:opacity-50 text-sm"
        >
          {loading ? 'Creating...' : 'Create Job'}
        </button>
      </form>

      {/* Compact Job List with Enhanced Materials Display */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {jobs.map((job) => {
          const hasValidImage =
            job.image && job.image.trim() !== '' && !imageLoadErrors[job._id]
          const remainingQuantity = job.remainingQuantity || 0
          const fulfilledQuantity = job.fulfilledQuantity || 0

          return (
            <div
              key={job._id}
              className="bg-white rounded-xl shadow-md border border-amber-200 hover:shadow-lg transition overflow-hidden"
            >
              {/* Compact Image */}
              {hasValidImage ? (
                <div className="relative h-64">
                  <img
                    src={job.image}
                    alt={job.productName}
                    className="w-full h-full object-cover bg-gray-50"
                    onError={() => handleImageError(job._id)}
                  />
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
                </div>
              )}

              <div className="p-3">
                {/* Header with Action Buttons */}
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-amber-900 text-sm truncate flex-1">
                    {job.productName}
                  </h3>
                  <div className="flex gap-1 ml-2">
                    {/* PDF Download Button */}
                    {job.pdfFile?.fileId && (
                      <button
                        onClick={() => window.open(`/api/stock/production?downloadFile=true&fileId=${job.pdfFile.fileId}`, '_blank')}
                        className="text-blue-600 hover:text-blue-800 transition-colors p-1"
                        title="Download PDF"
                      >
                        <svg
                          className="w-3 h-3"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm0 2h12v10H4V5z"/>
                        </svg>
                      </button>
                    )}
                    {/* Edit Button */}
                    <button
                      onClick={() => handleEditConfirm(job)}
                      className="text-blue-600 hover:text-blue-800 transition-colors p-1"
                      title="Edit Job"
                    >
                      <svg
                        className="w-3 h-3"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                      </svg>
                    </button>
                    {/* Delete Button */}
                    <button
                      onClick={() => handleDeleteConfirm(job)}
                      className="text-red-600 hover:text-red-800 transition-colors p-1"
                      title="Delete Job"
                    >
                      <svg
                        className="w-3 h-3"
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

                <p className="text-gray-600 text-xs mb-2 line-clamp-2">
                  {job.description || 'No description'}
                </p>

                {/* Enhanced Materials Display */}
                {job.materials && job.materials.length > 0 && (
                  <div className="bg-blue-50 rounded-lg p-3 mb-2 border border-blue-200">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs text-blue-900 font-semibold">
                        Materials (per unit):
                      </div>
                      {job.totalMaterialCost && (
                        <div className="text-xs font-bold text-blue-800">
                          ৳{job.totalMaterialCost.toFixed(2)}
                        </div>
                      )}
                    </div>
                    <div className="space-y-1">
                      {job.materials.slice(0, 3).map((material, index) => (
                        <div
                          key={index}
                          className="flex justify-between text-xs text-blue-800"
                        >
                          <span className="truncate flex-1 mr-2">
                            {material.name}
                          </span>
                          <span className="font-medium">৳{material.price}</span>
                        </div>
                      ))}
                      {job.materials.length > 3 && (
                        <button
                          onClick={() => showDetailedMaterials(job)}
                          className="text-xs text-blue-600 hover:text-blue-800 transition mt-1 w-full text-center py-1"
                        >
                          View all {job.materials.length} materials →
                        </button>
                      )}
                    </div>

                    {/* Total Production Cost Estimate */}
                    {job.totalMaterialCost && fulfilledQuantity > 0 && (
                      <div className="border-t border-blue-200 pt-2 mt-2">
                        <div className="text-xs text-blue-700">
                          <div className="flex justify-between">
                            <span>Total production cost:</span>
                            <span className="font-bold">
                              ৳
                              {(
                                job.totalMaterialCost * fulfilledQuantity
                              ).toFixed(2)}
                            </span>
                          </div>
                          <div className="text-blue-600 mt-1">
                            ({fulfilledQuantity} units × ৳
                            {job.totalMaterialCost.toFixed(2)})
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Compact Stats */}
                <div className="bg-gray-50 rounded-lg p-2 mb-2">
                  <div className="grid grid-cols-3 gap-2 text-xs text-center">
                    <div>
                      <span className="text-gray-500 block">Total</span>
                      <span className="font-bold text-gray-900">
                        {job.quantity}
                      </span>
                    </div>
                    <div>
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
                    <div>
                      <span className="text-gray-500 block">Done</span>
                      <span className="font-bold text-blue-600">
                        {fulfilledQuantity}
                      </span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-2">{getCompactProgressBar(job)}</div>
                </div>

                {/* Status and Date */}
                <div className="flex justify-between items-center text-xs mb-2">
                  <select
                    value={job.status}
                    onChange={(e) =>
                      handleStatusChange(job._id, e.target.value)
                    }
                    className={`border rounded px-1 py-0.5 text-xs font-semibold ${
                      job.status === 'open'
                        ? 'text-green-600 border-green-300'
                        : job.status === 'pending'
                        ? 'text-yellow-600 border-yellow-300'
                        : job.status === 'closed'
                        ? 'text-red-600 border-red-300'
                        : 'text-purple-600 border-purple-300'
                    }`}
                  >
                    <option value="pending">Pending</option>
                    <option value="open">Open</option>
                    <option value="closed">Closed</option>
                    <option value="finished">Finished</option>
                  </select>
                  <span className="text-gray-500">
                    {new Date(job.date).toLocaleDateString()}
                  </span>
                </div>

                {/* Action Buttons */}
                <div className="space-y-1">
                  <button
                    onClick={() => viewApplications(job._id, job.productName)}
                    className="w-full bg-amber-200 text-amber-900 py-1.5 px-3 rounded-lg hover:bg-amber-300 transition flex items-center justify-center gap-2 text-xs font-medium"
                  >
                    <span>Applications</span>
                    <span className="bg-amber-900 text-white px-1.5 py-0.5 rounded-full text-xs">
                      {job.applicationCount || 0}
                    </span>
                  </button>

                  {/* Mark as Finished Button */}
                  {job.status !== 'finished' && (
                    <button
                      onClick={() => handleMarkAsFinished(job)}
                      className="w-full bg-amber-900 text-white py-1.5 px-3 rounded-lg hover:bg-green-700 transition text-xs font-medium"
                    >
                      ✓ Mark as Finished
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Detailed Materials Modal */}
      {showMaterialsModal && selectedJobMaterials && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            {/* Modal Header */}
            <div className="bg-blue-100 p-6 border-b border-blue-200">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold text-blue-900">
                    Materials for {selectedJobMaterials.productName}
                  </h2>
                  <p className="text-blue-700 text-sm">
                    Complete material breakdown and costing
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
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {selectedJobMaterials.materials &&
              selectedJobMaterials.materials.length > 0 ? (
                <div className="space-y-4">
                  {/* Individual Materials */}
                  <div className="grid gap-3">
                    {selectedJobMaterials.materials.map((material, index) => (
                      <div
                        key={index}
                        className="flex justify-between items-center p-4 bg-gray-50 rounded-lg border"
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
                  </div>

                  {/* Cost Summary */}
                  <div className="border-t border-gray-200 pt-4 mt-6">
                    <div className="bg-blue-50 rounded-lg p-4">
                      <h3 className="font-bold text-blue-900 mb-3">
                        Cost Summary
                      </h3>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-blue-800">Cost per unit:</span>
                          <span className="font-bold text-blue-900">
                            ৳
                            {selectedJobMaterials.totalMaterialCost?.toFixed(
                              2
                            ) || '0.00'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-blue-800">Total quantity:</span>
                          <span className="font-bold text-blue-900">
                            {selectedJobMaterials.quantity} units
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-blue-800">
                            Fulfilled quantity:
                          </span>
                          <span className="font-bold text-blue-900">
                            {selectedJobMaterials.fulfilledQuantity || 0} units
                          </span>
                        </div>
                        <div className="border-t border-blue-200 pt-2 mt-2">
                          <div className="flex justify-between text-lg">
                            <span className="text-blue-900 font-bold">
                              Total material cost:
                            </span>
                            <span className="font-bold text-blue-800">
                              ৳
                              {(
                                selectedJobMaterials.totalMaterialCost *
                                (selectedJobMaterials.fulfilledQuantity || 0)
                              ).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Production Examples */}
                  <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                    <h4 className="font-semibold text-green-900 mb-2">
                      Production Cost Examples
                    </h4>
                    <div className="text-sm text-green-800 space-y-1">
                      <p>
                        For 100 units: ৳
                        {(selectedJobMaterials.totalMaterialCost * 100).toFixed(
                          2
                        )}
                      </p>
                      <p>
                        For 500 units: ৳
                        {(selectedJobMaterials.totalMaterialCost * 500).toFixed(
                          2
                        )}
                      </p>
                      <p>
                        For 1000 units: ৳
                        {(
                          selectedJobMaterials.totalMaterialCost * 1000
                        ).toFixed(2)}
                      </p>
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
            <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
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

      {/* Applications Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-7xl w-full max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="bg-amber-100 p-6 border-b border-amber-200">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold text-amber-900">
                    Applications for: {selectedJobName}
                  </h2>
                  <p className="text-amber-700 mt-1">
                    Total Applications: {selectedJobApplications.length}
                  </p>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-amber-900 hover:text-amber-700 text-3xl font-bold leading-none"
                >
                  ×
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto max-h-[70vh]">
              {selectedJobApplications.length === 0 ? (
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
                  <p className="text-gray-500 text-lg">
                    No applications yet for this job
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {selectedJobApplications.map((application) => (
                    <div
                      key={application._id}
                      className="bg-gray-50 border border-gray-200 rounded-xl p-6 hover:shadow-md transition-shadow"
                    >
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Worker Info */}
                        <div className="lg:col-span-2">
                          <div className="flex items-start justify-between mb-3">
                            <h3 className="text-xl font-semibold text-gray-900">
                              {application.workerName}
                            </h3>
                            <span
                              className={`px-3 py-1 rounded-full text-sm font-medium ${
                                application.status === 'approved'
                                  ? 'bg-green-100 text-green-800'
                                  : application.status === 'rejected'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-yellow-100 text-yellow-800'
                              }`}
                            >
                              {application.status.charAt(0).toUpperCase() +
                                application.status.slice(1)}
                            </span>
                          </div>

                          <div className="space-y-2 text-gray-600">
                            <div className="flex items-center gap-2">
                              <span className="font-medium min-w-[100px]">
                                Company:
                              </span>
                              <span>{application.workerCompany}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium min-w-[100px]">
                                Phone:
                              </span>
                              <span>{application.workerPhone}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium min-w-[100px]">
                                Approved:
                              </span>
                              <span className="font-semibold text-blue-600">
                                {application.quantity} pieces
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium min-w-[100px]">
                                Delivered:
                              </span>
                              <span
                                className={`font-semibold ${
                                  (application.deliveredQuantity || 0) > 0
                                    ? 'text-green-600'
                                    : 'text-gray-400'
                                }`}
                              >
                                {application.deliveredQuantity || 0} pieces
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium min-w-[100px]">
                                Remaining:
                              </span>
                              <span className="font-semibold text-orange-600">
                                {application.quantity -
                                  (application.deliveredQuantity || 0)}{' '}
                                pieces
                              </span>
                            </div>
                            {application.note && (
                              <div className="flex items-start gap-2">
                                <span className="font-medium min-w-[100px]">
                                  Notes:
                                </span>
                                <span className="text-gray-700">
                                  {application.note}
                                </span>
                              </div>
                            )}
                            {application.deliveredAt && (
                              <div className="flex items-center gap-2 text-sm text-gray-500">
                                <span className="font-medium">
                                  Last Delivery:
                                </span>
                                <span>
                                  {new Date(
                                    application.deliveredAt
                                  ).toLocaleDateString('en-US', {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Action Buttons and Delivery Controls */}
                        <div className="flex flex-col justify-center space-y-3">
                          {application.status === 'pending' && (
                            <>
                              <button
                                onClick={() =>
                                  updateApplicationStatus(
                                    application._id,
                                    'approved'
                                  )
                                }
                                className="w-full bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 transition font-medium text-sm"
                              >
                                ✓ Approve
                              </button>
                              <button
                                onClick={() =>
                                  updateApplicationStatus(
                                    application._id,
                                    'rejected'
                                  )
                                }
                                className="w-full bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition font-medium text-sm"
                              >
                                ✗ Reject
                              </button>
                            </>
                          )}

                          {application.status === 'approved' && (
                            <>
                              {/* Delivery Quantity Input */}
                              <div className="bg-blue-50 p-3 rounded-lg">
                                <label className="block text-xs font-medium text-blue-900 mb-1">
                                  Set Delivered Quantity:
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  max={application.quantity}
                                  value={deliveryInputs[application._id] || 0}
                                  onChange={(e) =>
                                    handleDeliveryInputChange(
                                      application._id,
                                      e.target.value
                                    )
                                  }
                                  className="w-full border border-blue-300 px-2 py-1 rounded text-sm"
                                  placeholder="Enter delivered amount"
                                />
                                <button
                                  onClick={() => confirmDelivery(application)}
                                  className="w-full mt-2 bg-blue-600 text-white py-1.5 px-3 rounded hover:bg-blue-700 transition font-medium text-sm"
                                >
                                  Confirm Delivery
                                </button>
                              </div>

                              <button
                                onClick={() =>
                                  updateApplicationStatus(
                                    application._id,
                                    'pending'
                                  )
                                }
                                className="w-full bg-yellow-600 text-white py-2 px-4 rounded-lg hover:bg-yellow-700 transition font-medium text-sm"
                              >
                                ↺ Reset to Pending
                              </button>
                            </>
                          )}

                          {application.status === 'rejected' && (
                            <button
                              onClick={() =>
                                updateApplicationStatus(
                                  application._id,
                                  'pending'
                                )
                              }
                              className="w-full bg-yellow-600 text-white py-2 px-4 rounded-lg hover:bg-yellow-700 transition font-medium text-sm"
                            >
                              ↺ Reset to Pending
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Enhanced Modal Footer */}
            <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
              <div className="flex justify-between items-center">
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Summary:</span>
                  {selectedJobApplications.length > 0 && (
                    <>
                      <span className="ml-2">
                        Pending:{' '}
                        {
                          selectedJobApplications.filter(
                            (app) => app.status === 'pending'
                          ).length
                        }
                      </span>
                      <span className="ml-4">
                        Approved:{' '}
                        {
                          selectedJobApplications.filter(
                            (app) => app.status === 'approved'
                          ).length
                        }
                      </span>
                      <span className="ml-4">
                        Total Delivered:{' '}
                        {selectedJobApplications.reduce(
                          (sum, app) => sum + (app.deliveredQuantity || 0),
                          0
                        )}{' '}
                        pieces
                      </span>
                    </>
                  )}
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="px-6 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Job Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-2xl font-bold text-amber-900 mb-6">Edit Job</h2>

            <form onSubmit={handleEditSubmit}>
              <div className="mb-4">
                <label className="block font-medium text-amber-900 mb-1">
                  Product Name
                </label>
                <input
                  type="text"
                  name="productName"
                  value={editFormData.productName}
                  onChange={handleEditChange}
                  className="w-full border border-amber-300 px-4 py-2 rounded-xl focus:ring-2 focus:ring-amber-400 focus:outline-none transition"
                  required
                />
              </div>

              <div className="mb-4">
                <label className="block font-medium text-amber-900 mb-1">
                  Description
                </label>
                <textarea
                  name="description"
                  value={editFormData.description}
                  onChange={handleEditChange}
                  rows={4}
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
                  value={editFormData.quantity}
                  onChange={handleEditChange}
                  className="w-full border border-amber-300 px-4 py-2 rounded-xl focus:ring-2 focus:ring-amber-400 focus:outline-none transition"
                  required
                  min="1"
                />
                {jobToEdit && (
                  <p className="text-sm text-gray-600 mt-1">
                    Current fulfilled: {jobToEdit.fulfilledQuantity || 0} pieces
                  </p>
                )}
              </div>

              {/* Edit Materials Section */}
              <div className="mb-6">
                <label className="block font-medium text-amber-900 mb-3">
                  Materials Required
                </label>

                <div className="space-y-3">
                  {editFormData.materials.map((material, index) => (
                    <div
                      key={index}
                      className="flex gap-3 items-center bg-gray-50 p-3 rounded-lg"
                    >
                      <div className="flex-1">
                        <input
                          type="text"
                          placeholder="Material name"
                          value={material.name}
                          onChange={(e) =>
                            handleEditMaterialChange(
                              index,
                              'name',
                              e.target.value
                            )
                          }
                          className="w-full border border-gray-300 px-3 py-2 rounded focus:ring-1 focus:ring-amber-400 focus:outline-none text-sm"
                        />
                      </div>
                      <div className="w-32">
                        <input
                          type="number"
                          placeholder="Price"
                          value={material.price}
                          onChange={(e) =>
                            handleEditMaterialChange(
                              index,
                              'price',
                              e.target.value
                            )
                          }
                          className="w-full border border-gray-300 px-3 py-2 rounded focus:ring-1 focus:ring-amber-400 focus:outline-none text-sm"
                          min="0"
                          step="0.01"
                        />
                      </div>

                      {editFormData.materials.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeEditMaterialField(index)}
                          className="text-red-600 hover:text-red-800 transition-colors p-1"
                          title="Remove material"
                        >
                          <svg
                            className="w-5 h-5"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={addEditMaterialField}
                    className="flex items-center justify-center w-full py-2 px-3 border-2 border-dashed border-amber-300 text-amber-600 rounded-lg hover:border-amber-400 hover:text-amber-700 transition text-sm font-medium"
                  >
                    <svg
                      className="w-4 h-4 mr-1"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Add Material
                  </button>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false)
                    setJobToEdit(null)
                  }}
                  className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-400 transition"
                  disabled={editLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="flex-1 bg-amber-600 text-white py-2 px-4 rounded-lg hover:bg-amber-700 transition disabled:opacity-50"
                >
                  {editLoading ? 'Updating...' : 'Update Job'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                <svg
                  className="h-6 w-6 text-red-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Delete Job
              </h3>
              <p className="text-sm text-gray-500 mb-6">
                Are you sure you want to delete{' '}
                <span className="font-semibold">
                  "{jobToDelete?.productName}"
                </span>
                ? This will permanently remove the job, all applications, and
                the associated image and PDF files. This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowDeleteModal(false)
                    setJobToDelete(null)
                  }}
                  className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-400 transition"
                  disabled={deleteLoading}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleteLoading}
                  className="flex-1 bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition disabled:opacity-50"
                >
                  {deleteLoading ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
