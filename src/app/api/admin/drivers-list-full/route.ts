import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { getAppRole } from '@/lib/auth/roles';

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (s) => s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } }
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user || getAppRole(user) !== 'admin') {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { searchParams } = request.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') ?? '50', 10)));
  // Strip characters that have meaning inside a PostgREST .or() filter
  const search = (searchParams.get('search') ?? '').replace(/[,()*\\]/g, ' ').trim();
  const status = searchParams.get('status')?.trim() ?? '';

  let query = admin
    .from('drivers')
    .select('id, name, username, status, vehicle_id, vehicles(make, model, plate_number)', { count: 'exact' });

  if (search) {
    query = query.or(`name.ilike.%${search}%,username.ilike.%${search}%`);
  }

  if (status) {
    query = query.eq('status', status);
  }

  const from = (page - 1) * limit;
  const to = page * limit - 1;

  const { data, error, count } = await query
    .order('name')
    .range(from, to);

  if (error) return NextResponse.json({ message: error.message }, { status: 500 });

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return NextResponse.json({ data: data ?? [], total, page, totalPages });
}