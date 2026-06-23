import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import ExpenseAnalysis from '@/components/ExpenseAnalysis';

export default async function ExpenseAnalysisPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect('/login');
  }

  return <ExpenseAnalysis displayName={session.user.name || session.user.username} />;
}
