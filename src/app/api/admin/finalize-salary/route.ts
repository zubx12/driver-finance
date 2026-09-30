import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAppRole } from '@/lib/auth/roles';
import { rpcErrorResponse } from '@/lib/supabase/rpc-error';

/**
 * Finalize a draft payout and create partner settlements.
 * finalize_salary runs as one locked transaction: it refuses stale drafts,
 * out-of-order months and repeat calls, so a double click is harmless.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || getAppRole(user) !== 'admin') {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  const { calcId } = await request.json();
  if (!calcId) {
    return NextResponse.json({ message: 'Missing calcId' }, { status: 400 });
  }

  const { error } = await supabase.rpc('finalize_salary', { p_calc_id: calcId });
  if (error) return rpcErrorResponse(error);

  return NextResponse.json({ success: true });
}
