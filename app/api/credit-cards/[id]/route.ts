import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/session';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const {
    name,
    bank_name,
    card_network,
    card_number_last4,
    credit_limit,
    statement_day,
    due_day,
    opening_balance,
    opening_date,
    current_statement_balance,
    current_minimum_due,
    notes,
  } = body;

  if (!name || !String(name).trim()) {
    return NextResponse.json({ error: 'Card name is required' }, { status: 400 });
  }

  const { data: existing } = await supabaseAdmin
    .from('credit_cards')
    .select('id, user_id')
    .eq('id', id)
    .maybeSingle();

  if (!existing || existing.user_id !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const statementDay = Math.min(31, Math.max(1, Number(statement_day) || 1));
  const dueDay = Math.min(31, Math.max(1, Number(due_day) || 1));
  const last4 = card_number_last4 ? String(card_number_last4).trim().slice(-4) : null;

  const { data: card, error } = await supabaseAdmin
    .from('credit_cards')
    .update({
      name: String(name).trim(),
      bank_name: bank_name ? String(bank_name).trim() : null,
      card_network: card_network ? String(card_network).trim() : null,
      card_number_last4: last4,
      credit_limit: credit_limit != null ? Math.round(Number(credit_limit) * 100) / 100 : 0,
      statement_day: statementDay,
      due_day: dueDay,
      opening_balance: opening_balance != null ? Math.round(Number(opening_balance) * 100) / 100 : 0,
      opening_date: opening_date || new Date().toISOString().slice(0, 10),
      current_statement_balance:
        current_statement_balance != null && current_statement_balance !== ''
          ? Math.round(Number(current_statement_balance) * 100) / 100
          : null,
      current_minimum_due:
        current_minimum_due != null && current_minimum_due !== ''
          ? Math.round(Number(current_minimum_due) * 100) / 100
          : null,
      notes: notes ? String(notes).trim() : null,
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error || !card) {
    console.error('Failed to update credit card:', error);
    return NextResponse.json({ error: 'Failed to update credit card' }, { status: 500 });
  }

  return NextResponse.json({ card });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const { data: existing } = await supabaseAdmin
    .from('credit_cards')
    .select('id, user_id')
    .eq('id', id)
    .maybeSingle();

  if (!existing || existing.user_id !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // This card's spends/payments may be linked outward in two ways that
  // won't clean themselves up via this card's own cascade:
  //   - a spend mirrored as an expense_entries row (the FK only cascades
  //     from expense_entries -> here, not the other direction)
  //   - a payment mirrored as a bank_transactions row (no FK at all, by
  //     design — see the schema note on bank_transaction_id)
  // Gather both before deleting the card so nothing is left dangling.
  const { data: cardTxns } = await supabaseAdmin
    .from('credit_card_transactions')
    .select('expense_entry_id, bank_transaction_id')
    .eq('card_id', id);

  const linkedExpenseEntryIds = (cardTxns ?? [])
    .map((t) => t.expense_entry_id)
    .filter((v): v is string => !!v);
  const linkedBankTxnIds = (cardTxns ?? [])
    .map((t) => t.bank_transaction_id)
    .filter((v): v is string => !!v);

  if (linkedBankTxnIds.length > 0) {
    await supabaseAdmin.from('bank_transactions').delete().in('id', linkedBankTxnIds);
  }
  if (linkedExpenseEntryIds.length > 0) {
    await supabaseAdmin.from('expense_entries').delete().in('id', linkedExpenseEntryIds);
  }

  // credit_card_transactions rows for this card cascade-delete via the
  // card_id FK once the card itself is removed.
  const { error } = await supabaseAdmin.from('credit_cards').delete().eq('id', id);

  if (error) {
    console.error('Failed to delete credit card:', error);
    return NextResponse.json({ error: 'Failed to delete credit card' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
