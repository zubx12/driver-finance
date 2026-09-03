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

  const { data, error } = await admin
    .from('vehicles')
    .select('id, make, model, year, plate_number, status, drivers(id, name, username), vehicle_partners(id, percentage, partners(name))')
    .is('vehicle_partners.effective_to', null)
    .order('make');

  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}