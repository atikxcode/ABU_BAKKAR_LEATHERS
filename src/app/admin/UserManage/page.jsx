'use client'

import { useEffect, useState } from 'react'
import Swal from 'sweetalert2'

export default function ManageUsers() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)

  // Fetch all users
  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/user')
      const data = await res.json()
      setUsers(data)
    } catch (err) {
      console.error(err)
      Swal.fire('Error', 'Failed to fetch users', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  // Update user status
  const updateStatus = async (email, status) => {
    try {
      const res = await fetch('/api/user', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, status }),
      })

      if (!res.ok) throw new Error('Failed to update status')

      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: `Status updated to ${status}`,
        showConfirmButton: false,
        timer: 1500,
      })

      fetchUsers() // refresh users
    } catch (err) {
      console.error(err)
      Swal.fire('Error', 'Could not update user status', 'error')
    }
  }

  if (loading) {
    return <p className="text-center py-10">Loading users...</p>
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Manage Users</h1>
      <table className="min-w-full bg-white border border-gray-200 rounded-lg shadow">
        <thead>
          <tr className="bg-gray-100 text-left">
            <th className="py-2 px-4 border-b">Name</th>
            <th className="py-2 px-4 border-b">Email</th>
            <th className="py-2 px-4 border-b">Role</th>
            <th className="py-2 px-4 border-b">Status</th>
            <th className="py-2 px-4 border-b">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user._id} className="hover:bg-gray-50">
              <td className="py-2 px-4 border-b">{user.name}</td>
              <td className="py-2 px-4 border-b">{user.email}</td>
              <td className="py-2 px-4 border-b">{user.role}</td>
              <td className="py-2 px-4 border-b">
                <span
                  className={`px-2 py-1 text-xs rounded ${
                    user.status === 'approved'
                      ? 'bg-green-100 text-green-600'
                      : 'bg-yellow-100 text-yellow-600'
                  }`}
                >
                  {user.status}
                </span>
              </td>
              <td className="py-2 px-4 border-b">
                {user.status === 'pending' ? (
                  <button
                    onClick={() => updateStatus(user.email, 'approved')}
                    className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600"
                  >
                    Approve
                  </button>
                ) : (
                  <button
                    onClick={() => updateStatus(user.email, 'pending')}
                    className="px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600"
                  >
                    Set Pending
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
