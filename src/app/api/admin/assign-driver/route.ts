import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAppRole } from '@/lib/auth/roles';
import { rpcErrorResponse } from '@/lib/supabase/rpc-error';

/**
 * Assign a driver to a vehicle (driver_id null = leave the vehicle without a
 * driver). assign_driver also closes the pay terms of anyone who leaves a
 * vehicle, so the old vehicle stops paying them from today.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || getAppRole(user) !== 'admin') {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  const { vehicle_id, driver_id } = await request.json();
  if (!vehicle_id) return NextResponse.json({ message: 'Missing vehicle_id' }, { status: 400 });

  const { error } = await supabase.rpc('assign_driver', {
    p_vehicle_id: vehicle_id,
    p_driver_id: driver_id || null,
  });
  if (error) return rpcErrorResponse(error);

  return NextResponse.json({ success: true });
}
