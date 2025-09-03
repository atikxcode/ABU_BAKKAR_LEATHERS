'use client'

import { useContext, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { AuthContext } from '../Provider/AuthProvider'
import { motion } from 'framer-motion'
import LoadingAnimation from './LoadingAnimation'

export default function PrivateRoute({ children }) {
  const { user, loading } = useContext(AuthContext)
  const router = useRouter()
  const pathname = usePathname()

  // Handle redirect for unauthenticated users
  useEffect(() => {
    if (!loading && !user) {
      router.push(`/RegistrationPage?redirect=${encodeURIComponent(pathname)}`)
    }
  }, [user, loading, router, pathname])

  // Show loading animation while checking auth
  if (loading) {
    return <LoadingAnimation />
  }

  // Return null if user is not logged in (redirect is handled in useEffect)
  if (!user) {
    return null
  }

  return children
}
