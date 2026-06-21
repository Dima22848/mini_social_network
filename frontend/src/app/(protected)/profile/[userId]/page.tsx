import { PublicProfilePageContent } from '@/features/profile/components/PublicProfilePageContent'

type PublicProfilePageProps = {
  params: Promise<{
    userId: string
  }>
}

export default async function PublicProfilePage({ params }: PublicProfilePageProps) {
  const { userId } = await params

  return <PublicProfilePageContent userId={userId} />
}