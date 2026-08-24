import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET() {
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

  // Fetch partners and their active vehicle_partners count
  const { data, error } = await admin
    .from('partners')
    .select('id, name, username, status, vehicle_partners(id)')
    .is('vehicle_partners.effective_to', null)
    .order('name');

  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  
  // Transform to get the count of vehicles
  const formattedData = data?.map((p: any) => ({
    id: p.id,
    name: p.name,
    username: p.username,
    status: p.status,
    active_vehicles_count: p.vehicle_partners ? p.vehicle_partners.length : 0
  })) ?? [];

  return NextResponse.json(formattedData);
}