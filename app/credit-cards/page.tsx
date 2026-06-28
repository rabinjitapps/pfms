import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import CreditCardTracker from '@/components/CreditCardTracker';

export default async function CreditCardsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  return <CreditCardTracker displayName={session.user.name || session.user.username} />;
}
