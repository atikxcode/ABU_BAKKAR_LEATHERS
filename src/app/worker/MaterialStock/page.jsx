'use client'

import { useContext, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { AuthContext } from '../../../../Provider/AuthProvider'

export default function MaterialStockPage() {
  const [stocks, setStocks] = useState([])
  const [currentUser, setCurrentUser] = useState(null)
  const [loading, setLoading] = useState(false)
  const { user } = useContext(AuthContext) // logged-in user from context

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    defaultValues: {
      date: '',
      material: '',
      quantity: '',
      unit: 'kg',
    },
  })

  // Fetch all material stocks
  const fetchStocks = async () => {
    try {
      const res = await fetch('/api/stock/materials') // ✅ fixed endpoint
      if (res.ok) {
        const data = await res.json()
        setStocks(data)
      }
    } catch (err) {
      console.error('Error fetching material stock:', err)
    }
  }

  // Fetch logged-in user from DB
  const fetchCurrentUser = async () => {
    if (!user?.email) return
    try {
      const res = await fetch(`/api/user?email=${user.email}`)
      if (res.ok) {
        const { user: userFromDB } = await res.json()
        setCurrentUser(userFromDB)
      }
    } catch (err) {
      console.error('Error fetching current user:', err)
    }
  }

  useEffect(() => {
    fetchStocks()
    fetchCurrentUser()
  }, [user])

  // Submit material stock report
  const onSubmit = async (data) => {
    if (!currentUser) return

    const normalizedMaterial = data.material.trim().toLowerCase()

    setLoading(true)
    try {
      await fetch('/api/stock/materials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          material: normalizedMaterial,
          status: 'pending',
          workerName: currentUser.name,
          workerEmail: currentUser.email,
        }),
      })
      reset()
      fetchStocks()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-amber-50 p-6">
      <h1 className="text-3xl font-bold mb-6 text-amber-800">
        Material Stock (Daily Report)
      </h1>

      {/* Form */}
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="bg-white shadow-lg rounded-xl p-6 w-full max-w-lg border border-amber-200"
      >
        <div className="mb-4">
          <label className="block text-sm font-medium text-amber-900">
            Date
          </label>
          <input
            type="date"
            {...register('date', { required: 'Date is required' })}
            className="mt-1 block w-full border border-amber-300 rounded-md px-3 py-2 focus:ring-amber-500 focus:border-amber-500"
          />
          {errors.date && (
            <p className="text-red-500 text-sm">{errors.date.message}</p>
          )}
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-amber-900">
            Material Name
          </label>
          <input
            type="text"
            placeholder="Example: Thread, Glue, Dye..."
            {...register('material', { required: 'Material is required' })}
            className="mt-1 block w-full border border-amber-300 rounded-md px-3 py-2 focus:ring-amber-500 focus:border-amber-500"
          />
          {errors.material && (
            <p className="text-red-500 text-sm">{errors.material.message}</p>
          )}
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-amber-900">
            Quantity
          </label>
          <input
            type="number"
            placeholder="Enter quantity"
            {...register('quantity', {
              required: 'Quantity is required',
              valueAsNumber: true,
            })}
            className="mt-1 block w-full border border-amber-300 rounded-md px-3 py-2 focus:ring-amber-500 focus:border-amber-500"
          />
          {errors.quantity && (
            <p className="text-red-500 text-sm">{errors.quantity.message}</p>
          )}
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-amber-900">
            Unit
          </label>
          <select
            {...register('unit', { required: 'Unit is required' })}
            className="mt-1 block w-full border border-amber-300 rounded-md px-3 py-2 focus:ring-amber-500 focus:border-amber-500"
          >
            <option value="kg">Kilogram</option>
            <option value="liter">Liter</option>
            <option value="piece">Piece</option>
            <option value="roll">Roll</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="bg-amber-800 text-white px-4 py-2 rounded-md hover:bg-amber-900 transition disabled:opacity-50 w-full"
        >
          {loading ? 'Submitting...' : 'Submit Material'}
        </button>
      </form>

      {/* Stock List */}
      <div className="bg-white shadow-md rounded-xl p-6 mt-8 w-full max-w-3xl border border-amber-200">
        <h2 className="text-lg font-semibold mb-4 text-amber-800">
          Submitted Material Stocks
        </h2>
        {stocks.length === 0 ? (
          <p className="text-gray-500">No records yet.</p>
        ) : (
          <table className="min-w-full text-sm border border-amber-200">
            <thead className="bg-amber-100">
              <tr>
                <th className="px-3 py-2 border border-amber-200">Date</th>
                <th className="px-3 py-2 border border-amber-200">Material</th>
                <th className="px-3 py-2 border border-amber-200">Quantity</th>
                <th className="px-3 py-2 border border-amber-200">Unit</th>
                <th className="px-3 py-2 border border-amber-200">Status</th>
                <th className="px-3 py-2 border border-amber-200">
                  Worker Name
                </th>
                <th className="px-3 py-2 border border-amber-200">
                  Worker Email
                </th>
              </tr>
            </thead>
            <tbody>
              {stocks.map((stock) => (
                <tr key={stock._id} className="border-t border-amber-200">
                  <td className="px-3 py-2 border">
                    {new Date(stock.date).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2 border">{stock.material}</td>
                  <td className="px-3 py-2 border">{stock.quantity}</td>
                  <td className="px-3 py-2 border">{stock.unit}</td>
                  <td
                    className={`px-3 py-2 border font-semibold ${
                      stock.status === 'approved'
                        ? 'text-green-600'
                        : stock.status === 'rejected'
                        ? 'text-red-600'
                        : 'text-yellow-600'
                    }`}
                  >
                    {stock.status}
                  </td>
                  <td className="px-3 py-2 border">{stock.workerName}</td>
                  <td className="px-3 py-2 border">{stock.workerEmail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
