'use client'
import { useState } from 'react'
import WorkerSidebar from '../../../components/WorkerSidebar'
import WorkerHeader from '../../../components/WorkerHeader'
import PrivateRoute from '../../../components/PrivateRoutes'

export default function WorkerLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen)

  return (
    <PrivateRoute>
      <div className="flex h-screen">
        {/* Sidebar */}
        {sidebarOpen && <WorkerSidebar />}

        {/* Main content */}
        <div
          className={`flex-1 flex flex-col transition-all duration-300 ${
            sidebarOpen ? 'ml-24' : 'ml-0' // left margin equals sidebar width
          }`}
        >
          <WorkerHeader toggleSidebar={toggleSidebar} />
          <main className="flex-1 p-6 overflow-y-auto">{children}</main>
        </div>
      </div>
    </PrivateRoute>
  )
}
