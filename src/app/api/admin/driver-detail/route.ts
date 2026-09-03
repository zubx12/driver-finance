import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

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
  if (!user || user.user_metadata?.role !== 'admin') {
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

  // 4. Fetch vehicle if assigned
  let vehicle = null;
  if (driver.vehicle_id) {
    const { data: vData } = await admin
      .from('vehicles')
      .select('*')
      .eq('id', driver.vehicle_id)
      .single();
    vehicle = vData;
  }

  // 5. Fetch rides and expenses for the requested month
  let startDate: string;
  let endDate: string;

  if (month) {
    const [year, mon] = month.split('-').map(Number);
    startDate = `${year}-${String(mon).padStart(2, '0')}-01`;
    const lastDay = new Date(year, mon, 0).getDate();
    endDate = `${year}-${String(mon).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  } else {
    const now = new Date();
    const year = now.getFullYear();
    const mon = now.getMonth() + 1;
    startDate = `${year}-${String(mon).padStart(2, '0')}-01`;
    const lastDay = new Date(year, mon, 0).getDate();
    endDate = `${year}-${String(mon).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  }

  const [ridesRes, expensesRes] = await Promise.all([
    admin.from('rides')
      .select('id, ride_date, amount, payment_method, payment_status, notes')
      .eq('driver_id', id)
      .gte('ride_date', startDate)
      .lte('ride_date', endDate)
      .order('ride_date', { ascending: false }),
    admin.from('expenses')
      .select('id, expense_date, amount, category, description, receipt_image_url')
      .eq('driver_id', id)
      .gte('expense_date', startDate)
      .lte('expense_date', endDate)
      .order('expense_date', { ascending: false }),
  ]);

  return NextResponse.json({
    driver,
    vehicle,
    rides: ridesRes.data ?? [],
    expenses: expensesRes.data ?? [],
    period: { start: startDate, end: endDate },
  });
}
