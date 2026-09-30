import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAppRole } from '@/lib/auth/roles';
import { rpcErrorResponse } from '@/lib/supabase/rpc-error';

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || getAppRole(user) !== 'admin') {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  const { driverId, vehicleId, status } = await request.json();
  if (!driverId) return NextResponse.json({ message: 'driverId required' }, { status: 400 });

  // Vehicle changes go through assign/unassign so pay terms follow the driver.
  if (vehicleId !== undefined) {
    const { error } = vehicleId
      ? await supabase.rpc('assign_driver', { p_vehicle_id: vehicleId, p_driver_id: driverId })
      : await supabase.rpc('unassign_driver', { p_driver_id: driverId });
    if (error) return rpcErrorResponse(error);
  }

  if (status !== undefined) {
    const { error } = await supabase
      .from('drivers')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', driverId);
    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
