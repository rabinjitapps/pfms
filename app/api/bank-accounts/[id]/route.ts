import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/session';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const { data: existing } = await supabaseAdmin
    .from('bank_accounts')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const { name, bank_name, account_type, account_number_last4, opening_balance, opening_date } = body;

  if (name != null && !String(name).trim()) {
    return NextResponse.json({ error: 'Account name cannot be empty' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    name: name != null ? String(name).trim() : existing.name,
    bank_name: bank_name !== undefined ? (bank_name ? String(bank_name).trim() : null) : existing.bank_name,
    account_type:
      account_type !== undefined ? (account_type ? String(account_type).trim() : null) : existing.account_type,
    account_number_last4:
      account_number_last4 !== undefined
        ? account_number_last4
          ? String(account_number_last4).trim().slice(-4)
          : null
        : existing.account_number_last4,
    opening_balance:
      opening_balance != null ? Math.round(Number(opening_balance) * 100) / 100 : existing.opening_balance,
    opening_date: opening_date || existing.opening_date,
    updated_at: new Date().toISOString(),
  };

  const { data: account, error } = await supabaseAdmin
    .from('bank_accounts')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();

  if (error || !account) {
    console.error('Failed to update bank account:', error);
    return NextResponse.json({ error: 'Failed to update bank account' }, { status: 500 });
  }

  return NextResponse.json({ account });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const { data: account } = await supabaseAdmin
    .from('bank_accounts')
    .select('id, user_id')
    .eq('id', id)
    .maybeSingle();

  if (!account || account.user_id !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Transactions reference bank_accounts with ON DELETE CASCADE, so deleting
  // the account also removes its own transactions. If any of those were one
  // leg of a transfer, this deliberately leaves the other leg in place
  // (rather than cascading a delete into a different account's ledger) —
  // it just becomes a plain credit/debit with a transfer_id that no longer
  // resolves to a second row.
  const { error } = await supabaseAdmin.from('bank_accounts').delete().eq('id', id);
  if (error) {
    console.error('Failed to delete bank account:', error);
    return NextResponse.json({ error: 'Failed to delete bank account' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
