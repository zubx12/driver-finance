import { riyadhToday } from '@/lib/dates';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getAppRole } from '@/lib/auth/roles';

interface ExportRow {
  period_start: string; status: string;
  total_revenue: number; total_expenses: number; company_expenses: number; charged_expenses: number; adjustments_total: number; net_revenue: number;
  company_retained: number; loss_brought_forward: number; loss_carried_forward: number;
  vehicles: { make: string; model: string; plate_number: string } | null;
  salary_calculation_shares: { ownership_percentage: number; share_amount: number; partners: { name: string } | null }[];
  driver_pay_calculations: { compensation_type: string; driver_pay_amount: number; drivers: { name: string } | null }[];
}

export async function GET() {
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
  if (!user || getAppRole(user) !== 'admin') {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  
  const { data, error } = await admin
    .from('salary_calculations')
    .select(`period_start, total_revenue, total_expenses, company_expenses, charged_expenses, adjustments_total, net_revenue, driver_pay_total,
             company_retained, loss_brought_forward, loss_carried_forward, status,
             vehicles(make, model, plate_number),
             salary_calculation_shares(ownership_percentage, share_amount, partners(name)),
             driver_pay_calculations(compensation_type, driver_pay_amount, drivers(name))`)
    .order('period_start', { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ message: error.message }, { status: 500 });

  // Quote every text cell; neutralise spreadsheet formulas in names.
  const q = (value: unknown) => {
    const s = String(value ?? '');
    return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
  };

  // One row per payout line; a period's Amount column adds up exactly to its
  // Net Revenue (driver pay + shares + retained + loss brought - loss carried).
  let csv = 'Vehicle,Plate,Period,Status,Revenue,Vehicle Expenses,Company Expenses,Charged Expenses,Adjustments,Net Revenue,Line,Name,Share %,Amount\n';
  for (const calc of (data ?? []) as unknown as ExportRow[]) {
    const v = calc.vehicles;
    const head = [
      q(v ? `${v.make} ${v.model}` : 'Unknown'), q(v?.plate_number ?? ''), calc.period_start, calc.status,
      calc.total_revenue, calc.total_expenses, calc.company_expenses, calc.charged_expenses, calc.adjustments_total, calc.net_revenue,
    ].join(',');
    for (const d of calc.driver_pay_calculations ?? []) {
      csv += `${head},Driver pay,${q(d.drivers?.name ?? 'Unknown')},,${d.driver_pay_amount}\n`;
    }
    for (const s of calc.salary_calculation_shares ?? []) {
      csv += `${head},Partner share,${q(s.partners?.name ?? 'Unknown')},${s.ownership_percentage},${s.share_amount}\n`;
    }
    if (Number(calc.company_retained) !== 0) csv += `${head},Company retained,,,${calc.company_retained}\n`;
    if (Number(calc.loss_brought_forward) !== 0) csv += `${head},Loss brought forward,,,${calc.loss_brought_forward}\n`;
    if (Number(calc.loss_carried_forward) !== 0) csv += `${head},Loss carried forward,,,-${calc.loss_carried_forward}\n`;
  }

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="salary-export-${riyadhToday()}.csv"`,
    },
  });
}
