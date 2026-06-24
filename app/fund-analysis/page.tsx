import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import MutualFundAnalysis from '@/components/MutualFundAnalysis';

export default async function FundAnalysisPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect('/login');
  }

  return <MutualFundAnalysis displayName={session.user.name || session.user.username} />;
}
