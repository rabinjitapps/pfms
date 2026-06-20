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

  const { data: category } = await supabaseAdmin
    .from('expense_categories')
    .select('id, user_id')
    .eq('id', id)
    .maybeSingle();

  if (!category || category.user_id !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { count, error: countErr } = await supabaseAdmin
    .from('expense_entries')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', id);

  if (countErr) {
    console.error('Failed to check entries for category delete:', countErr);
    return NextResponse.json({ error: 'Could not verify this deletion' }, { status: 500 });
  }

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: `This head has ${count} entr${count === 1 ? 'y' : 'ies'} against it — delete those first.` },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin.from('expense_categories').delete().eq('id', id);

  if (error) {
    console.error('Failed to delete expense category:', error);
    return NextResponse.json({ error: 'Failed to delete head' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
