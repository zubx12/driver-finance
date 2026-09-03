import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET() {
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

  // 2. Use service role for data queries
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 3. Fetch all outstanding rides with payer, driver, vehicle info
  const { data: rides, error } = await admin
    .from('rides')
    .select('id, ride_date, amount, reference, payer_id, driver_id, vehicle_id, drivers(name), vehicles(plate_number, make, model), payers(name)')
    .eq('payment_status', 'Outstanding')
    .order('ride_date', { ascending: true });

  if (error) return NextResponse.json({ message: error.message }, { status: 500 });

  // 4. Transform and group data
  const items = (rides || []).map((r: any) => ({
    id: r.id,
    ride_date: r.ride_date,
    amount: r.amount,
    reference: r.reference,
    payer_id: r.payer_id,
    payer_name: r.payers?.name ?? 'Unknown Payer',
    driver_id: r.driver_id,
    driver_name: r.drivers?.name ?? 'Unknown',
    vehicle_id: r.vehicle_id,
    vehicle_plate: r.vehicles?.plate_number ?? '',
    vehicle_make: r.vehicles?.make ?? '',
    vehicle_model: r.vehicles?.model ?? '',
  }));

  // Group by payer
  const byPayer: Record<string, { payer_id: string; payer_name: string; total: number; count: number; rides: typeof items }> = {};
  for (const item of items) {
    const key = item.payer_id || 'no-payer';
    if (!byPayer[key]) {
      byPayer[key] = { payer_id: key, payer_name: item.payer_name, total: 0, count: 0, rides: [] };
    }
    byPayer[key].total += item.amount;
    byPayer[key].count += 1;
    byPayer[key].rides.push(item);
  }

  // Group by vehicle
  const byVehicle: Record<string, { vehicle_id: string; vehicle_plate: string; vehicle_name: string; total: number; count: number; driver_name: string }> = {};
  for (const item of items) {
    const key = item.vehicle_id;
    if (!byVehicle[key]) {
      byVehicle[key] = {
        vehicle_id: key,
        vehicle_plate: item.vehicle_plate,
        vehicle_name: `${item.vehicle_make} ${item.vehicle_model}`,
        total: 0, count: 0,
        driver_name: item.driver_name,
      };
    }
    byVehicle[key].total += item.amount;
    byVehicle[key].count += 1;
  }

  return NextResponse.json({
    rides: items,
    byPayer: Object.values(byPayer).sort((a, b) => b.total - a.total),
    byVehicle: Object.values(byVehicle).sort((a, b) => b.total - a.total),
    total: items.reduce((s, r) => s + r.amount, 0),
    count: items.length,
  });
}
