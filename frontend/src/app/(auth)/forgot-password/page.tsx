import { AuthShell } from '@/features/auth/components/AuthShell'
import { ForgotPasswordForm } from '@/features/auth/components/ForgotPasswordForm'

export default function ForgotPasswordPage() {
  return (
    <AuthShell active="login">
      <ForgotPasswordForm />
    </AuthShell>
  )
}