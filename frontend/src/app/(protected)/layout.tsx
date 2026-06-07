import { ReactNode } from 'react'
import { ProtectedRoute } from '@/features/auth/components/ProtectedRoute'

export default function ProtectedLayout({
  children,
}: {
  children: ReactNode
}) {
  return <ProtectedRoute>{children}</ProtectedRoute>
}