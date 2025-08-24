'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Cloud, ArrowLeft } from 'lucide-react' // use Cloud instead of Smoke

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-[80vh] bg-amber-100 text-gray-800 px-6">
      {/* Animated Cloud Icon */}
      <motion.div
        initial={{ opacity: 0, y: -40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="mb-6"
      >
        <Cloud size={80} className="text-amber-600 drop-shadow-lg" />
      </motion.div>

      {/* 404 Text */}
      <motion.h1
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="text-7xl font-extrabold text-amber-800 drop-shadow-md"
      >
        404
      </motion.h1>

      {/* Subtext */}
      <p className="mt-4 text-lg md:text-xl text-gray-600 text-center max-w-md">
        Looks like you puffed into the wrong cloud ☁️ The page you’re looking
        for doesn’t exist.
      </p>

      {/* Button Back to Home */}
      <Link href="/" className="mt-8">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-amber-800 text-white font-semibold shadow-lg hover:bg-amber-700 transition-all"
        >
          <ArrowLeft size={20} /> Back to Shop
        </motion.button>
      </Link>
    </div>
  )
}
