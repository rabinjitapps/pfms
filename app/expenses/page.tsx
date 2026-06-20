import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import ExpenseTracker from '@/components/ExpenseTracker';

export default async function ExpensesPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect('/login');
  }

  return <ExpenseTracker displayName={session.user.name || session.user.username} />;
}
