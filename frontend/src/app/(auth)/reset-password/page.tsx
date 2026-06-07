import { AuthShell } from '@/features/auth/components/AuthShell'
import { ResetPasswordForm } from '@/features/auth/components/ResetPasswordForm'

export default function ResetPasswordPage() {
  return (
    <AuthShell active="login">
      <ResetPasswordForm />
    </AuthShell>
  )
}