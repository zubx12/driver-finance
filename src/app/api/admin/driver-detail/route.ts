import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { getAppRole } from '@/lib/auth/roles';
import { monthOf, riyadhToday } from '@/lib/dates';

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  const month = request.nextUrl.searchParams.get('month'); // YYYY-MM format
  if (!id) return NextResponse.json({ message: 'Missing id' }, { status: 400 });

  // 1. Verify admin role
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

  // 2. Use service role for data queries (bypasses RLS)
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 3. Fetch driver profile
  const { data: driver, error: driverErr } = await admin
    .from('drivers')
    .select('*')
    .eq('id', id)
    .single();

  if (driverErr || !driver) {
    return NextResponse.json({ message: 'Driver not found' }, { status: 404 });
  }

  // 4. The month (YYYY-MM), in Riyadh time by default
  const { start: startDate, end: endDate } = month && /^\d{4}-\d{2}$/.test(month)
    ? monthOf(`${month}-01`)
    : monthOf(riyadhToday());

  // 5. Vehicle, with the owners and this driver's pay terms for that month
  let vehicle = null;
  let vehiclePartners: unknown[] = [];
  let driverCompensation: unknown = null;
  if (driver.vehicle_id) {
    const { data: vData } = await admin
      .from('vehicles')
      .select('*')
      .eq('id', driver.vehicle_id)
      .single();
    vehicle = vData;

    // Fetch partner equity split for the vehicle
    // Owners during the month (not only today's), with their dates.
    const { data: vpData } = await admin
      .from('vehicle_partners')
      .select('id, percentage, effective_from, effective_to, partners(name)')
      .eq('vehicle_id', driver.vehicle_id)
      .lte('effective_from', endDate)
      .or(`effective_to.is.null,effective_to.gt.${startDate}`)
      .order('effective_from');
    vehiclePartners = vpData ?? [];

    // THIS driver's pay terms on the vehicle during the month (latest first).
    const { data: compData } = await admin
      .from('driver_compensation')
      .select('compensation_type, commission_percentage, fixed_salary_amount, bonus_rate, effective_from, effective_to')
      .eq('driver_id', id)
      .eq('vehicle_id', driver.vehicle_id)
      .lte('effective_from', endDate)
      .or(`effective_to.is.null,effective_to.gt.${startDate}`)
      .order('effective_from', { ascending: false })
      .limit(1);
    driverCompensation = compData?.[0] ?? null;
  }

  // 6. Rides and expenses for the month

  const [ridesRes, expensesRes] = await Promise.all([
    admin.from('rides')
      .select('id, ride_date, amount, payment_method, payment_status, payer_id, reference, notes, payers(name), vehicles(plate_number)')
      .eq('driver_id', id)
      .gte('ride_date', startDate)
      .lte('ride_date', endDate)
      .order('ride_date', { ascending: false }),
    admin.from('expenses')
      .select('id, expense_date, amount, category, description, receipt_image_url, paid_by, payment_method, allocation, review_status, vehicles!expenses_vehicle_id_fkey(plate_number)')
      .eq('driver_id', id)
      .gte('expense_date', startDate)
      .lte('expense_date', endDate)
      .order('expense_date', { ascending: false }),
  ]);

  return NextResponse.json({
    driver,
    vehicle,
    vehiclePartners,
    driverCompensation,
    rides: ridesRes.data ?? [],
    expenses: expensesRes.data ?? [],
    period: { start: startDate, end: endDate },
  });
}
