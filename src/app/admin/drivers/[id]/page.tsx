'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Car, User, CheckCircle, AtSign } from 'lucide-react';

interface Vehicle { id: string; make: string; model: string; plate_number: string; }
interface Driver { id: string; name: string; username: string | null; status: string; vehicle_id: string | null; }

export default function EditDriverPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [driver, setDriver] = useState<Driver | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [status, setStatus] = useState('Active');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/drivers-list-full').then(r => r.json()),
      fetch('/api/admin/vehicles-list').then(r => r.json()),
    ]).then(([drivers, vList]) => {
      const d = Array.isArray(drivers) ? drivers.find((d: any) => d.id === id) : null;
      if (d) {
        setDriver(d);
        setSelectedVehicle(d.vehicle_id ?? '');
        setStatus(d.status);
      }
      if (Array.isArray(vList)) setVehicles(vList);
    }).finally(() => setLoading(false));
  }, [id]);

  const handleSave = async () => {
    setSaving(true); setError(null);
    const res = await fetch('/api/admin/update-driver', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driverId: id, vehicleId: selectedVehicle || null, status }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { setError(json.message); return; }
    setSaved(true);
    setTimeout(() => router.push('/admin/drivers'), 1200);
  };

  const currentVehicle = vehicles.find(v => v.id === selectedVehicle);

  if (loading) return <div className="p-8 text-zinc-400 text-sm">Loading driver...</div>;
  if (!driver) return <div className="p-8 text-zinc-500">Driver not found.</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="flex items-center gap-4">
        <Link href="/admin/drivers">
          <button className="h-9 w-9 flex items-center justify-center rounded-lg border border-line text-ink hover:bg-paper transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
        </Link>
        <div>
          <h1 className="font-heading text-3xl font-bold text-ink">Edit Driver</h1>
          <p className="text-ink-soft">Update assignment and account status.</p>
        </div>
      </div>

      <div className="bg-paper-raised border border-line rounded-xl shadow-sm overflow-hidden">
        {/* Driver Identity */}
        <div className="p-6 border-b border-line bg-paper/50">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-bold text-lg">
              {driver.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h2 className="font-bold text-xl text-ink">{driver.name}</h2>
              <p className="text-sm text-ink-soft font-mono flex items-center gap-1">
                <AtSign className="h-3.5 w-3.5" />{driver.username ?? 'no username'}
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Account Status */}
          <div className="space-y-3">
            <h3 className="font-semibold text-ink">Account Status</h3>
            <div className="flex gap-2">
              {['Active', 'Inactive', 'Suspended'].map(s => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    status === s
                      ? s === 'Active' ? 'bg-emerald-600 text-white border-emerald-600'
                        : s === 'Suspended' ? 'bg-rose-600 text-white border-rose-600'
                        : 'bg-zinc-600 text-white border-zinc-600'
                      : 'bg-paper text-ink-soft border-line hover:border-ink/30'
                  }`}
                >{s}</button>
              ))}
            </div>
          </div>

          <div className="h-px bg-line" />

          {/* Vehicle Assignment */}
          <div className="space-y-3">
            <div>
              <h3 className="font-semibold text-ink">Vehicle Assignment</h3>
              <p className="text-sm text-ink-soft">Assign this driver to a vehicle. The driver will see their vehicle on login.</p>
            </div>

            <div className="relative">
              <Car className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-soft" />
              <select
                value={selectedVehicle}
                onChange={e => setSelectedVehicle(e.target.value)}
                className="w-full h-11 pl-10 pr-4 bg-paper border border-line rounded-lg text-ink focus:outline-none focus:ring-2 focus:ring-ink/20 appearance-none"
              >
                <option value="">— Unassigned —</option>
                {vehicles.map(v => (
                  <option key={v.id} value={v.id}>{v.make} {v.model} — {v.plate_number}</option>
                ))}
              </select>
            </div>

            {currentVehicle && (
              <div className="flex items-center gap-3 p-3 bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800 rounded-lg">
                <Car className="h-4 w-4 text-indigo-600 shrink-0" />
                <div className="text-sm">
                  <span className="font-medium text-indigo-900 dark:text-indigo-100">{currentVehicle.make} {currentVehicle.model}</span>
                  <span className="text-indigo-500 font-mono ml-2">· {currentVehicle.plate_number}</span>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 dark:bg-red-950/20 dark:border-red-800 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {saved && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800 rounded-lg text-sm text-emerald-700 flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />Saved! Redirecting...
            </div>
          )}
        </div>

        <div className="bg-paper px-6 py-4 border-t border-line flex justify-end gap-3">
          <Link href="/admin/drivers">
            <button type="button" className="h-10 px-4 rounded-lg font-medium text-ink-soft hover:text-ink hover:bg-line/50 transition-colors">Cancel</button>
          </Link>
          <button
            onClick={handleSave}
            disabled={saving || saved}
            className={`h-10 px-6 rounded-lg font-medium transition-colors ${saving || saved ? 'bg-line text-ink-soft cursor-not-allowed' : 'bg-ink text-paper-raised hover:bg-ink-soft'}`}
          >
            {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}