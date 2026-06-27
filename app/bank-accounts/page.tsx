import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import BankAccountTracker from '@/components/BankAccountTracker';

export default async function BankAccountsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  return <BankAccountTracker displayName={session.user.name || session.user.username} />;
}
