'use client'
import { useState, useEffect } from 'react'
import PrivateRoute from '../../../components/PrivateRoutes'
import WorkerSidebar from '../../../components/WorkerSidebar'
import WorkerHeader from '../../../components/WorkerHeader'

export default function WorkerLayout({ children }) {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024)
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <PrivateRoute>
      <div className="min-h-screen bg-gray-50">
        {/* Sidebar */}
        <WorkerSidebar />

        {/* Main content wrapper */}
        <div
          className={`
          transition-all duration-300 ease-in-out
          ${isMobile ? 'ml-0' : 'lg:ml-64'}
          min-h-screen
        `}
        >
          {/* Header */}
          <WorkerHeader />

          {/* Main content */}
          <main className="bg-white">
            <div className="p-4 sm:p-6 lg:p-8 w-full">{children}</div>
          </main>
        </div>
      </div>
    </PrivateRoute>
  )
}
