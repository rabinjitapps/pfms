import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/session';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const { data: holding } = await supabaseAdmin
    .from('stock_holdings')
    .select('id, user_id')
    .eq('id', id)
    .maybeSingle();

  if (!holding || holding.user_id !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { error } = await supabaseAdmin.from('stock_holdings').delete().eq('id', id);

  if (error) {
    console.error('Failed to delete stock holding:', error);
    return NextResponse.json({ error: 'Failed to delete holding' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
