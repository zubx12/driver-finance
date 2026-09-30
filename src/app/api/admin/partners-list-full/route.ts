import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (s) => s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } }
  );
  
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') {
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

  // Fetch partners and their active vehicle_partners count
  let query = admin
    .from('partners')
    .select('id, name, username, status, vehicle_partners(id)', { count: 'exact' })
    .is('vehicle_partners.effective_to', null);

  if (search) {
    query = query.or(`name.ilike.%${search}%,username.ilike.%${search}%`);
  }

  const from = (page - 1) * limit;
  const to = page * limit - 1;

  const { data, error, count } = await query
    .order('name')
    .range(from, to);

  if (error) return NextResponse.json({ message: error.message }, { status: 500 });

  // Transform to get the count of vehicles
  const formattedData = data?.map((p: any) => ({
    id: p.id,
    name: p.name,
    username: p.username,
    status: p.status,
    active_vehicles_count: p.vehicle_partners ? p.vehicle_partners.length : 0
  })) ?? [];

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return NextResponse.json({ data: formattedData, total, page, totalPages });
}