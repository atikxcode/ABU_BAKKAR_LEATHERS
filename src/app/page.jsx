// app/page.jsx
'use client'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import React, { useContext, useEffect, useState } from 'react'
import { AuthContext } from '../../Provider/AuthProvider'
import LoadingAnimation from '../../components/LoadingAnimation'

export default function Home() {
  const { user, logOut } = useContext(AuthContext)
  const router = useRouter()
  const [dbUser, setDbUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Fetch user role from DB if logged in
  useEffect(() => {
    if (!user) {
      setDbUser(null)
      setLoading(false)
      return
    }

    const fetchUserData = async () => {
      try {
        const res = await fetch(`/api/user?email=${user.email}`)
        const data = await res.json()
        if (data.exists) setDbUser(data.user)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchUserData()
  }, [user])

  // SignOut
  const handleSignOut = () => {
    logOut().then().catch()
  }

  // Redirect functions
  const redirectToLoginSignup = () => {
    router.push('/RegistrationPage')
  }

  const redirectToWorkerDashboard = () => {
    router.push('/WorkerDashboard')
  }

  const redirectToAdminDashboard = () => {
    router.push('/admin')
  }

  if (loading) {
    return <LoadingAnimation />
  }
  return (
    <div className="min-h-screen bg-[#fdfcf9] text-gray-900">
      {/* Hero Section */}
      <section className="relative flex flex-col md:flex-row items-center justify-between px-8 md:px-16 py-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="max-w-lg"
        >
          <h2 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
            Timeless <span className="text-amber-800">Leather</span> for Modern
            Life
          </h2>
          <p className="text-lg text-gray-600 mb-8">
            Handcrafted leather goods designed to last a lifetime. From wallets
            to bags, every piece tells a story.
          </p>

          {/* LOGIN BUTTON */}

          <div className="flex gap-8">
            <button
              className="px-6 py-3 bg-amber-800 text-white rounded-2xl shadow-md hover:bg-amber-700 transition"
              onClick={() => {
                if (!user) redirectToLoginSignup()
                else if (dbUser?.role === 'worker') redirectToWorkerDashboard()
                else if (dbUser?.role === 'admin') redirectToAdminDashboard()
              }}
            >
              {!user
                ? 'LOGIN / SIGNUP'
                : dbUser?.role === 'worker'
                ? 'Worker Dashboard'
                : dbUser?.role === 'admin'
                ? 'Admin Dashboard'
                : 'Dashboard'}
            </button>

            {user && (
              <button
                className="px-6 py-3 bg-amber-800 text-white rounded-2xl shadow-md hover:bg-amber-700 transition"
                onClick={handleSignOut}
              >
                Sign Out
              </button>
            )}
          </div>
        </motion.div>

        <motion.img
          src="/Home_Category/Home_img_1.jpg"
          alt="Leather Bag"
          className="w-full md:w-1/2 rounded-2xl shadow-lg mt-10 md:mt-0"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
        />
      </section>

      {/* About Section */}
      <section id="about" className="px-8 md:px-16 py-20 bg-white">
        <div className="max-w-4xl mx-auto text-center">
          <h3 className="text-3xl font-bold mb-6">Our Story</h3>
          <p className="text-gray-600 leading-relaxed">
            For over two decades, LeatherCraft has been dedicated to the art of
            handcrafting premium leather goods. Our artisans combine traditional
            techniques with modern design to create timeless pieces that embody
            durability and style.
          </p>
        </div>
      </section>

      {/* Products Section */}
      {/* <section id="products" className="px-8 md:px-16 py-20 bg-[#f9f7f3]">
        <h3 className="text-3xl font-bold text-center mb-12">
          Featured Products
        </h3>
        <div className="grid md:grid-cols-3 gap-8">
          {[
            { name: 'Classic Wallet', img: '/wallet.jpg' },
            { name: 'Leather Backpack', img: '/backpack.jpg' },
            { name: 'Travel Journal', img: '/journal.jpg' },
          ].map((item, i) => (
            <motion.div
              key={i}
              whileHover={{ scale: 1.05 }}
              className="bg-white rounded-2xl shadow-md overflow-hidden"
            >
              <img
                src={item.img}
                alt={item.name}
                className="w-full h-64 object-cover"
              />
              <div className="p-4">
                <h4 className="text-xl font-semibold">{item.name}</h4>
              </div>
            </motion.div>
          ))}
        </div>
      </section> */}

      {/* Contact Section */}
      <section id="contact" className="px-8 md:px-16 py-20 bg-white">
        <div className="max-w-2xl mx-auto text-center">
          <h3 className="text-3xl font-bold mb-6">Get in Touch</h3>
          <p className="text-gray-600 mb-8">
            Have questions about our products or wholesale inquiries? We’d love
            to hear from you.
          </p>
          <form className="space-y-4">
            <input
              type="text"
              placeholder="Your Name"
              className="w-full border rounded-lg px-4 py-3"
            />
            <input
              type="email"
              placeholder="Your Email"
              className="w-full border rounded-lg px-4 py-3"
            />
            <textarea
              placeholder="Message"
              rows="4"
              className="w-full border rounded-lg px-4 py-3"
            />
            <button className="w-full py-3 bg-amber-800 text-white rounded-2xl shadow-md hover:bg-amber-700 transition">
              Send Message
            </button>
          </form>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-8 md:px-16 py-6 text-center border-t text-gray-500">
        © {new Date().getFullYear()} LeatherCraft. All rights reserved.
      </footer>
    </div>
  )
}
