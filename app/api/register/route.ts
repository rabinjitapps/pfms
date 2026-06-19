import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { username, password, displayName } = body;

  if (!username || !password) {
    return NextResponse.json({ error: 'Username and password are required' }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  const normalizedUsername = username.trim().toLowerCase();

  const { data: existing } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('username', normalizedUsername)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: 'Username is already taken' }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const { error } = await supabaseAdmin.from('users').insert({
    username: normalizedUsername,
    password_hash: passwordHash,
    display_name: displayName || normalizedUsername,
  });

  if (error) {
    console.error('Failed to create user:', error);
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
