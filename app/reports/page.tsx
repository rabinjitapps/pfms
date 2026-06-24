import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import ReportsPage from '@/components/ReportsPage';

export default async function Reports() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  return <ReportsPage displayName={session.user.name || session.user.username} />;
}
