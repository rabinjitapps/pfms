import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import GoalTracker from '@/components/GoalTracker';

export default async function GoalsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  return <GoalTracker displayName={session.user.name || session.user.username} />;
}
