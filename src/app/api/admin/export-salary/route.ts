import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  // Auth check (same pattern as other admin routes)
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );
  
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  
  const { data } = await admin
    .from('salary_calculations')
    .select(`vehicle_id, period_start, total_revenue, total_expenses, company_expenses, net_revenue, status,
             vehicles(make, model, plate_number),
             salary_calculation_shares(ownership_percentage, share_amount, partners(name))`)
    .order('period_start', { ascending: false })
    .limit(500);

  // Build CSV
  let csv = 'Vehicle,Plate,Period,Revenue,Expenses,Company Expenses,Net Revenue,Status,Partner,Share %,Share Amount\n';
  for (const calc of data ?? []) {
    const v = (calc as any).vehicles;
    const vehicleName = v ? `${v.make} ${v.model}` : 'Unknown';
    const plate = v?.plate_number ?? '';
    const period = calc.period_start;
    const shares = (calc as any).salary_calculation_shares ?? [];
    if (shares.length === 0) {
      csv += `"${vehicleName}","${plate}",${period},${calc.total_revenue},${calc.total_expenses},${calc.company_expenses},${calc.net_revenue},${calc.status},,, \n`;
    } else {
      for (const s of shares) {
        csv += `"${vehicleName}","${plate}",${period},${calc.total_revenue},${calc.total_expenses},${calc.company_expenses},${calc.net_revenue},${calc.status},"${s.partners?.name ?? 'Unknown'}",${s.ownership_percentage},${s.share_amount}\n`;
      }
    }
  }

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="salary-export-${new Date().toISOString().split('T')[0]}.csv"`,
    },
  });
}
