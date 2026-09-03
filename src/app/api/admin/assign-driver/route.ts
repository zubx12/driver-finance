import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  // 1. Verify admin role
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

  const { vehicle_id, driver_id } = await request.json();
  if (!vehicle_id) return NextResponse.json({ message: 'Missing vehicle_id' }, { status: 400 });

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 2. Unassign any driver currently on this vehicle
  await admin.from('drivers')
    .update({ vehicle_id: null })
    .eq('vehicle_id', vehicle_id);

  // 3. If a new driver is specified, assign them
  if (driver_id) {
    // First unassign this driver from any other vehicle
    await admin.from('drivers')
      .update({ vehicle_id: null })
      .eq('id', driver_id);

    // Then assign to the new vehicle
    const { error } = await admin.from('drivers')
      .update({ vehicle_id })
      .eq('id', driver_id);

    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
