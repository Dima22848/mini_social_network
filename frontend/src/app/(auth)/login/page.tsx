import { AuthShell } from '@/features/auth/components/AuthShell'
import { LoginForm } from '@/features/auth/components/LoginForm'

export default function LoginPage() {
  return (
    <AuthShell active="login">
      <LoginForm />
    </AuthShell>
  )
}