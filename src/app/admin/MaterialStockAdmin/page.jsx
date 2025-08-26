'use client'

import { useEffect, useState } from 'react'

export default function AdminMaterialStockPage() {
  const [stocks, setStocks] = useState([])
  const [loading, setLoading] = useState(false)

  // Fetch all material stock reports
  const fetchStocks = async () => {
    try {
      const res = await fetch('/api/stock/materials') // ✅ fixed route
      const data = await res.json()
      setStocks(data)
    } catch (err) {
      console.error('Error fetching stock:', err)
    }
  }

  useEffect(() => {
    fetchStocks()
  }, [])

  // Approve or Reject stock
  const updateStatus = async (id, status) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/stock/materials?id=${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          role: 'admin', // indicate admin
        },
        body: JSON.stringify({ status }),
      })
      if (res.ok) fetchStocks()
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Calculate combined stock per type
  const combinedStock = stocks
    .filter((s) => s.status === 'approved')
    .reduce((acc, curr) => {
      if (!acc[curr.material]) acc[curr.material] = 0
      acc[curr.material] += curr.quantity
      return acc
    }, {})

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Material Stock Management</h1>

      {/* Submitted Stock Table */}
      <div className="bg-white shadow-md rounded-lg p-4 mb-6 overflow-x-auto">
        <h2 className="text-lg font-semibold mb-3">Submitted Stocks</h2>
        <table className="min-w-full text-sm border">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-3 py-2 border">Date</th>
              <th className="px-3 py-2 border">Type</th>
              <th className="px-3 py-2 border">Quantity</th>
              <th className="px-3 py-2 border">Unit</th>
              <th className="px-3 py-2 border">Status</th>
              <th className="px-3 py-2 border">Worker Name</th>
              <th className="px-3 py-2 border">Worker Email</th>
              <th className="px-3 py-2 border">Action</th>
            </tr>
          </thead>
          <tbody>
            {stocks.map((stock) => (
              <tr key={stock._id} className="border-t">
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
                <td className="px-3 py-2 border flex gap-2">
                  {stock.status === 'pending' && (
                    <>
                      <button
                        onClick={() => updateStatus(stock._id, 'approved')}
                        disabled={loading}
                        className="bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700 disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => updateStatus(stock._id, 'rejected')}
                        disabled={loading}
                        className="bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Combined Stock Summary */}
      <div className="bg-white shadow-md rounded-lg p-4">
        <h2 className="text-lg font-semibold mb-3">Combined Approved Stock</h2>
        {Object.keys(combinedStock).length === 0 ? (
          <p className="text-gray-500">No approved stock yet.</p>
        ) : (
          <table className="min-w-full text-sm border">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-3 py-2 border">Material Type</th>
                <th className="px-3 py-2 border">Total Quantity</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(combinedStock).map(([type, quantity]) => (
                <tr key={type} className="border-t">
                  <td className="px-3 py-2 border">{type}</td>
                  <td className="px-3 py-2 border">{quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
