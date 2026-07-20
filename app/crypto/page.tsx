import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import CryptoTracker from '@/components/CryptoTracker';

export default async function CryptoPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect('/login');
  }

  return <CryptoTracker displayName={session.user.name || session.user.username} />;
}
