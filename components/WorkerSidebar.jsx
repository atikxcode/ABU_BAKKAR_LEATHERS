'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  FaHome,
  FaUser,
  FaChartLine,
  FaCubes,
  FaCube,
  FaBoxOpen,
  FaClipboardList,
} from 'react-icons/fa'

export default function WorkerSidebar() {
  const pathname = usePathname()

  const sidebarOptions = [
    { href: '/worker/LeatherStock', icon: FaCubes, label: 'Leather Stock' },
    { href: '/worker/MaterialStock', icon: FaCube, label: 'Materials' },
    { href: '/worker/production', icon: FaBoxOpen, label: 'Productions' },
    {
      href: '/worker/finished-goods',
      icon: FaBoxOpen,
      label: 'Finished',
    },
    { href: '/worker/reports', icon: FaClipboardList, label: 'Reports' },
    { href: '/worker/profile', icon: FaUser, label: 'Profile' },
    { href: '/', icon: FaHome, label: 'Home' },
  ]

  const isActive = (href) => pathname === href

  return (
    <aside className="fixed inset-y-0 left-0 z-30 w-24 h-screen overflow-y-auto bg-white border-r border-gray-200">
      <div className="flex items-center justify-center p-4">
        <img
          className="w-[50px] h-[50px]"
          src="/Home_Category/Home_img_1.jpg"
          alt="Company Logo"
        />
      </div>

      <nav className="flex flex-col mt-6 items-center space-y-4">
        {sidebarOptions.map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            href={href}
            className={`flex flex-col items-center text-sm font-medium px-2 py-2 rounded-lg transition-colors ${
              isActive(href)
                ? 'text-black font-bold'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon className="text-xl mb-1" />
            <span className="text-xs">{label}</span>
          </Link>
        ))}
      </nav>
    </aside>
  )
}
