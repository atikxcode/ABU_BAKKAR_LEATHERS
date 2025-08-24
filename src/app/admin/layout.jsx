'use client'
import { useState } from 'react'
import AdminRoute from '../../../components/AdminRoute'
import PrivateRoute from '../../../components/PrivateRoutes'
import AdminSidebar from '../../../components/AdminSidebar'
import AdminHeader from '../../../components/AdminHeader'

export default function AdminLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen)

  return (
    // <AdminRoute>
    //   <PrivateRoute>

    //   </PrivateRoute>
    // </AdminRoute>
    <div className="flex h-screen">
      {/* Sidebar */}
      {sidebarOpen && <AdminSidebar />}

      {/* Main content */}
      <div
        className={`flex-1 flex flex-col transition-all duration-300 ${
          sidebarOpen ? 'ml-24' : 'ml-0' // <-- add left margin equal to sidebar width
        }`}
      >
        <AdminHeader toggleSidebar={toggleSidebar} />
        <main className="flex-1 p-6 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
