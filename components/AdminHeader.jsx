import { useContext } from 'react'
import { AuthContext } from '../Provider/AuthProvider'

export default function AdminHeader() {
  const { logOut } = useContext(AuthContext)

  // SignOut
  const handleSignOut = () => {
    logOut().then().catch()
  }
  return (
    <header className="w-full bg-white shadow p-2 sm:p-3 md:p-4">
      <div className="flex justify-end">
        <button
          onClick={handleSignOut}
          className="px-3 py-2 bg-amber-800 text-white rounded-2xl shadow-md hover:bg-amber-700 transition"
        >
          <span className="hidden sm:inline ">Log Out</span>
          <span className="sm:hidden">Log Out</span>
        </button>
      </div>
    </header>
  )
}
