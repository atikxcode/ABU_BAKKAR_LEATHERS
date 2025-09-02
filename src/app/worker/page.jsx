// src/app/worker/page.jsx
'use client'

import { useState, useEffect, useContext } from 'react'
import Link from 'next/link'
import { AuthContext } from '../../../Provider/AuthProvider'
import {
  FaCubes,
  FaUsers,
  FaChartLine,
  FaClipboardCheck,
  FaIndustry,
  FaArrowUp,
  FaExclamationTriangle,
  FaCheckCircle,
  FaClock,
  FaArrowRight,
  FaCalendarAlt,
  FaBell,
  FaBoxOpen,
  FaTasks,
  FaTools,
} from 'react-icons/fa'

export default function WorkerDashboard() {
  const { user } = useContext(AuthContext)

  const [stats, setStats] = useState({
    totalApplications: 0,
    approvedApplications: 0,
    pendingApplications: 0,
    completedProduction: 0,
    leatherSubmissions: 0,
    materialSubmissions: 0,
  })

  const [loading, setLoading] = useState(true)

  // Simulate data fetching - replace with actual API calls
  useEffect(() => {
    // Replace with actual API calls
    setTimeout(() => {
      setStats({
        totalApplications: 15,
        approvedApplications: 12,
        pendingApplications: 3,
        completedProduction: 8,
        leatherSubmissions: 25,
        materialSubmissions: 18,
      })
      setLoading(false)
    }, 1000)
  }, [])

  const quickActions = [
    {
      title: 'Submit Leather',
      icon: FaCubes,
      href: '/worker/LeatherStock',
      description: 'Submit leather stock entries',
      color: 'bg-amber-500',
      hoverColor: 'hover:bg-amber-600',
    },
    {
      title: 'Submit Materials',
      icon: FaIndustry,
      href: '/worker/MaterialStock',
      description: 'Submit material stock entries',
      color: 'bg-green-500',
      hoverColor: 'hover:bg-green-600',
    },
    {
      title: 'Production',
      icon: FaBoxOpen,
      href: '/worker/ProductionStock',
      description: 'View completed production',
      color: 'bg-indigo-500',
      hoverColor: 'hover:bg-indigo-600',
    },
    {
      title: 'Finished',
      icon: FaBoxOpen,
      href: '/worker/WorkerFinishedProduct',
      description: 'Manage your profile',
      color: 'bg-gray-500',
      hoverColor: 'hover:bg-gray-600',
    },
  ]

  const recentActivities = [
    {
      icon: FaCheckCircle,
      text: 'Production application approved',
      time: '2 hours ago',
      color: 'text-green-500',
    },
    {
      icon: FaClock,
      text: 'Leather submission pending review',
      time: '4 hours ago',
      color: 'text-yellow-500',
    },
    {
      icon: FaBoxOpen,
      text: 'Production job completed',
      time: '1 day ago',
      color: 'text-blue-500',
    },
    {
      icon: FaArrowUp,
      text: 'Material submission approved',
      time: '2 days ago',
      color: 'text-green-500',
    },
  ]

  // ✅ FIXED: Corrected StatCard component to avoid hydration error
  const StatCard = ({ title, value, icon: Icon, color, trend }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-xs sm:text-sm font-medium text-gray-600 uppercase tracking-wide">
            {title}
          </p>
          {/* ✅ FIXED: Changed from <p> to <div> to avoid nesting <div> inside <p> */}
          <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 mt-1">
            {loading ? (
              <div className="h-8 bg-gray-200 rounded animate-pulse"></div>
            ) : (
              <span>{value.toLocaleString()}</span>
            )}
          </div>
          {trend && (
            <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
              <FaArrowUp className="text-xs" />
              +8% from last month
            </p>
          )}
        </div>
        <div className={`p-3 rounded-full ${color}`}>
          <Icon className="text-white text-lg sm:text-xl" />
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900">
                Abu Bakkar Leathers
              </h1>
              <p className="text-gray-600 mt-1 text-sm sm:text-base">
                Welcome back. Here's your work overview today.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-sm text-gray-500">Today</p>
                <p className="text-sm font-medium text-gray-900">
                  {new Date().toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
          {/* Quick Actions */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4 sm:mb-6">
                Quick Actions
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {quickActions.map((action) => (
                  <Link
                    key={action.title}
                    href={action.href}
                    className="group block"
                  >
                    <div className="bg-gray-50 rounded-lg p-4 sm:p-6 border border-gray-200 hover:border-gray-300 transition-all duration-200 hover:shadow-md">
                      <div className="flex items-center gap-4">
                        <div
                          className={`p-3 rounded-lg ${action.color} ${action.hoverColor} group-hover:scale-110 transition-all duration-200`}
                        >
                          <action.icon className="text-white text-lg sm:text-xl" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900 text-sm sm:text-base">
                            {action.title}
                          </h3>
                          <p className="text-xs sm:text-sm text-gray-600">
                            {action.description}
                          </p>
                        </div>
                        <FaArrowRight className="text-gray-400 group-hover:text-gray-600 group-hover:translate-x-1 transition-all duration-200" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
