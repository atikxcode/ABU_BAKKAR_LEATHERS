'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  FaHome,
  FaUsers,
  FaCubes,
  FaPlus,
  FaPen,
  FaCog,
  FaChartLine,
} from 'react-icons/fa'

export default function AdminSidebar() {
  const pathname = usePathname()

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
      href: '/admin/finishedProductManage',
      icon: FaCubes,
      label: 'Finished Products',
    },
    { href: '/admin/statsManage', icon: FaChartLine, label: 'Stats' },
    { href: '/admin/UserManage', icon: FaUsers, label: 'Users' },
    { href: '/admin/addProducts', icon: FaPlus, label: 'Add Product' },
    { href: '/admin/reports', icon: FaPen, label: 'Reports' },
    { href: '/admin/settings', icon: FaCog, label: 'Settings' },
    { href: '/', icon: FaHome, label: 'Home' },
  ]

  const isActive = (href) => pathname === href

  return (
    <aside className="fixed inset-y-0 left-0 z-30 w-64 h-screen overflow-y-auto bg-amber-800 text-white shadow-lg">
      <div className="flex items-center justify-center p-6">
        <img
          className="w-14 h-14 rounded-full border-2 border-white"
          src="/Home_Category/company_logo.png"
          alt="Company Logo"
        />
      </div>

      <nav className="mt-6 flex flex-col items-start">
        {sidebarOptions.map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-4 w-full px-6 py-3 text-lg font-medium rounded-r-lg transition-colors ${
              isActive(href)
                ? 'bg-amber-900'
                : 'hover:bg-amber-700 hover:text-white'
            }`}
          >
            <Icon />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </aside>
  )
}
