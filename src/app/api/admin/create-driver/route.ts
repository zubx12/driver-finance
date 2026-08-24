import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  // 1. Verify the calling user is an admin
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
  if (!user || user.user_metadata?.role !== 'admin') {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  // 2. Parse request body
  const { name, phone, password, status = 'Active' } = await request.json();
  if (!name || !phone || !password) {
    return NextResponse.json({ message: 'name, phone, and password are required' }, { status: 400 });
  }

  // 3. Use service-role client to create the Auth user and DB record
  // Service-role key is ONLY available server-side — never exposed to the browser
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Normalize phone to E.164 format
  const normalizedPhone = phone.startsWith('+') ? phone : `+966${phone.replace(/^0/, '')}`;

  // Create Auth user with role embedded in user_metadata
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    phone: normalizedPhone,
    password,
    phone_confirm: true, // Skip OTP verification — admin is setting the account up
    user_metadata: { role: 'driver', name },
  });

  if (authError) {
    return NextResponse.json({ message: authError.message }, { status: 400 });
  }

  // Insert into drivers table, linking to the Auth user
  const { data: driverData, error: dbError } = await adminClient
    .from('drivers')
    .insert({
      name,
      phone: normalizedPhone,
      linked_auth_id: authData.user.id,
      status,
    })
    .select('id')
    .single();

  if (dbError) {
    // Rollback: delete the auth user if DB insert fails
    await adminClient.auth.admin.deleteUser(authData.user.id);
    return NextResponse.json({ message: dbError.message }, { status: 500 });
  }

  return NextResponse.json({ driverId: driverData.id }, { status: 201 });
}
