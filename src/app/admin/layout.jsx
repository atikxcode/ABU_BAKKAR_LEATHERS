'use client'
import { useState } from 'react'
import AdminRoute from '../../../components/AdminRoute'
import AdminSidebar from '../../../components/AdminSidebar'
import AdminHeader from '../../../components/AdminHeader'

export default function AdminLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const SIDEBAR_WIDTH = 256 // in px, same as AdminSidebar w-64

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen)

  return (
    <AdminRoute>
      <div className="flex h-screen overflow-hidden">
        {/* Sidebar */}
        {sidebarOpen && <AdminSidebar />}

        {/* Main content */}
        <div
          className={`flex-1 flex flex-col transition-all duration-300`}
          style={{
            marginLeft: sidebarOpen ? `${SIDEBAR_WIDTH}px` : '0px',
          }}
        >
          <AdminHeader toggleSidebar={toggleSidebar} />
          <main className="flex-1 p-6 overflow-y-auto">{children}</main>
        </div>
      </div>
    </AdminRoute>
  )
}
