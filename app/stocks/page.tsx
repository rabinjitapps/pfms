import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import StockTracker from '@/components/StockTracker';

export default async function StocksPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect('/login');
  }

  return <StockTracker displayName={session.user.name || session.user.username} />;
}
