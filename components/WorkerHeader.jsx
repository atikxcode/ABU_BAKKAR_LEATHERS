// src/components/AdminHeader.jsx
export default function WorkerHeader() {
  return (
    <header className="w-full bg-white shadow p-2 sm:p-3 md:p-4">
      <div className="flex justify-end">
        <button className="px-2 py-1 sm:px-3 sm:py-1 bg-blue-500 text-white rounded text-sm sm:text-base">
          <span className="hidden sm:inline">Add User</span>
          <span className="sm:hidden">Add</span>
        </button>
      </div>
    </header>
  )
}
