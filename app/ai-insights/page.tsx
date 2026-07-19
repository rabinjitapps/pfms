import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import AIInsights from '@/components/AIInsights';

export default async function AIInsightsPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect('/login');
  }

  return <AIInsights displayName={session.user.name || session.user.username} />;
}
