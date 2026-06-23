import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import LoanTracker from '@/components/LoanTracker';

export default async function LoansPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  return <LoanTracker displayName={session.user.name || session.user.username} />;
}
