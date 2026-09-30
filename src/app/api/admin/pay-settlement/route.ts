import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getAppRole } from '@/lib/auth/roles';

export async function PATCH(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (cookiesToSet) => {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user || getAppRole(user) !== 'admin') {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { settlementId, paymentReference, notes } = body;

    if (!settlementId || !paymentReference) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Only a pending settlement can be paid: never re-pay, never pay a voided duplicate.
    const { data: updated, error } = await supabase
      .from('settlements')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        payment_reference: paymentReference,
        notes: notes || null
      })
      .eq('id', settlementId)
      .eq('status', 'pending')
      .select('id');

    if (error) throw error;
    if (!updated || updated.length === 0) {
      return NextResponse.json({ error: 'This settlement is not pending (already paid or void).' }, { status: 409 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Pay settlement error:', error);
    const message = error instanceof Error ? error.message : (error as { message?: string })?.message ?? 'Failed to record payment';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}