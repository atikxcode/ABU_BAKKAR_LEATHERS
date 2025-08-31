// src/app/admin/page.jsx
'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  FaCubes,
  FaUsers,
  FaChartLine,
  FaClipboardCheck,
  FaIndustry,
  FaArrowUp, // Changed from FaTrendingUp
  FaExclamationTriangle,
  FaCheckCircle,
  FaClock,
  FaArrowRight,
  FaCalendarAlt,
  FaBell,
} from 'react-icons/fa'

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    totalUsers: 0,
    leatherStock: 0,
    materialStock: 0,
    pendingApprovals: 0,
    production: 0,
    finishedProducts: 0,
  })

  const [loading, setLoading] = useState(true)

  // Simulate data fetching
  useEffect(() => {
    // Replace with actual API calls
    setTimeout(() => {
      setStats({
        totalUsers: 24,
        leatherStock: 1250,
        materialStock: 890,
        pendingApprovals: 12,
        production: 156,
        finishedProducts: 342,
      })
      setLoading(false)
    }, 1000)
  }, [])

  const quickActions = [
    {
      title: 'Leather Stock',
      icon: FaCubes,
      href: '/admin/LeatherStockAdmin',
      description: 'Manage leather inventory',
      color: 'bg-amber-500',
      hoverColor: 'hover:bg-amber-600',
    },
    {
      title: 'Materials',
      icon: FaIndustry,
      href: '/admin/MaterialStockAdmin',
      description: 'Track material supplies',
      color: 'bg-green-500',
      hoverColor: 'hover:bg-green-600',
    },
    {
      title: 'Users',
      icon: FaUsers,
      href: '/admin/UserManage',
      description: 'Manage user accounts',
      color: 'bg-blue-500',
      hoverColor: 'hover:bg-blue-600',
    },
    {
      title: 'Production',
      icon: FaClipboardCheck,
      href: '/admin/AdminProduction',
      description: 'Monitor production',
      color: 'bg-purple-500',
      hoverColor: 'hover:bg-purple-600',
    },
  ]

  const recentActivities = [
    {
      icon: FaCheckCircle,
      text: 'New leather stock approved',
      time: '2 hours ago',
      color: 'text-green-500',
    },
    {
      icon: FaClock,
      text: '5 material requests pending',
      time: '3 hours ago',
      color: 'text-yellow-500',
    },
    {
      icon: FaUsers,
      text: 'New user registered',
      time: '5 hours ago',
      color: 'text-blue-500',
    },
    {
      icon: FaArrowUp,
      text: 'Production target achieved',
      time: '1 day ago',
      color: 'text-green-500',
    },
  ]

  const StatCard = ({ title, value, icon: Icon, color, trend }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-xs sm:text-sm font-medium text-gray-600 uppercase tracking-wide">
            {title}
          </p>
          <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 mt-1">
            {loading ? (
              <div className="h-8 bg-gray-200 rounded animate-pulse"></div>
            ) : (
              value.toLocaleString()
            )}
          </p>
          {trend && (
            <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
              <FaArrowUp className="text-xs" />
              +12% from last month
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
                Welcome back! Here's what's happening with your business today.
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
