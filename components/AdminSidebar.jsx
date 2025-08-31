'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  FaHome,
  FaUsers,
  FaCubes,
  FaPlus,
  FaPen,
  FaCog,
  FaChartLine,
  FaBars,
  FaTimes,
  FaMoneyBill,
} from 'react-icons/fa'

export default function AdminSidebar() {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  // Detect screen size and set initial state
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024 // lg breakpoint
      setIsMobile(mobile)

      // Auto-open on desktop, closed on mobile
      if (!mobile) {
        setIsOpen(true)
      } else {
        setIsOpen(false)
      }
    }

    handleResize() // Check initial size
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Close sidebar when route changes on mobile
  useEffect(() => {
    if (isMobile) {
      setIsOpen(false)
    }
  }, [pathname, isMobile])

  const sidebarOptions = [
    {
      href: '/admin/LeatherStockAdmin',
      icon: FaCubes,
      label: 'Leather Stock',
    },
    {
      href: '/admin/MaterialStockAdmin',
      icon: FaCubes,
      label: 'Materials Stock',
    },
    {
      href: '/admin/AdminProduction',
      icon: FaCubes,
      label: 'Production',
    },
    {
      href: '/admin/AdminFinishedProduct',
      icon: FaCubes,
      label: 'Finished Products',
    },
    { href: '/admin/UserManage', icon: FaUsers, label: 'Users' },
    { href: '/admin/AdminReport', icon: FaPen, label: 'Reports' },
    { href: '/admin/SalaryManagement', icon: FaMoneyBill, label: 'Salary' },
    { href: '/', icon: FaHome, label: 'Home' },
  ]

  const isActive = (href) => pathname === href

  return (
    <>
      {/* Mobile Menu Button */}
      {isMobile && (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="fixed top-4 left-4 z-50 p-2 bg-amber-800 text-white rounded-md shadow-lg"
          aria-label="Toggle sidebar"
        >
          {isOpen ? <FaTimes size={20} /> : <FaBars size={20} />}
        </button>
      )}

      {/* Overlay for mobile - LOWER z-index than sidebar */}
      {isMobile && isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-20"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar - HIGHER z-index than overlay */}
      <aside
        className={`
          fixed inset-y-0 left-0 h-screen overflow-y-auto bg-amber-800 text-white shadow-lg
          transform transition-transform duration-300 ease-in-out
          ${
            isMobile
              ? isOpen
                ? 'translate-x-0'
                : '-translate-x-full'
              : 'translate-x-0'
          }
          w-64 sm:w-60 md:w-64
          z-30
        `}
      >
        {/* Logo Section */}
        <div className="flex flex-col items-center justify-center p-4 sm:p-5 md:p-6 gap-4">
          <img
            className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-full border-2 border-white"
            src="/Home_Category/Home_img_1.jpg"
            alt="Company Logo"
          />
          <h2>Admin Dashboard</h2>
        </div>

        {/* Navigation */}
        <nav className="mt-4 sm:mt-5 md:mt-6 flex flex-col items-start">
          {sidebarOptions.map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              onClick={() => isMobile && setIsOpen(false)} // Close sidebar on mobile when clicking link
              className={`flex items-center gap-3 sm:gap-4 w-full px-4 sm:px-5 md:px-6 py-2 sm:py-2.5 md:py-3 text-base sm:text-lg font-medium rounded-r-lg transition-colors ${
                isActive(href)
                  ? 'bg-amber-900'
                  : 'hover:bg-amber-700 hover:text-white'
              }`}
            >
              <Icon className="text-sm sm:text-base md:text-lg flex-shrink-0" />
              <span className="truncate">{label}</span>
            </Link>
          ))}
        </nav>
      </aside>

      {/* Spacer for desktop layout */}
      {!isMobile && <div className="w-64 flex-shrink-0" />}
    </>
  )
}
