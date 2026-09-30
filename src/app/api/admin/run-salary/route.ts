import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAppRole } from '@/lib/auth/roles';
import { rpcErrorResponse } from '@/lib/supabase/rpc-error';

/**
 * Draft payouts for every vehicle for one calendar month.
 * Body: { month: 'YYYY-MM' }. The maths lives in the database
 * (run_salary_month, see docs/payout-rules.md); this route only forwards.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || getAppRole(user) !== 'admin') {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  const { month } = await request.json();
  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return NextResponse.json({ message: 'month must be in YYYY-MM format' }, { status: 400 });
  }

  // Called with the admin's session (not the service role) so the database's
  // own admin check applies.
  const { data, error } = await supabase.rpc('run_salary_month', { p_month: `${month}-01` });
  if (error) return rpcErrorResponse(error);

  return NextResponse.json({ results: data ?? [] });
}
