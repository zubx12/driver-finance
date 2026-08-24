'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronLeft, Key, User, AtSign, CheckCircle, Copy, Car } from 'lucide-react';

interface Vehicle { id: string; make: string; model: string; plate_number: string; }

export default function AddDriverPage() {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState(true);
  const [vehicleId, setVehicleId] = useState('');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/vehicles-list')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setVehicles(d); })
      .catch(() => {});
  }, []);

  const cleanUsername = username.trim().toLowerCase().replace(/\s+/g, '_');
  const isValid = name.trim().length > 0 && cleanUsername.length >= 3 && password.length >= 6;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/create-driver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          username: cleanUsername,
          password,
          status: status ? 'Active' : 'Inactive',
          vehicleId: vehicleId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to create driver');
      setIsSuccess(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(`Username: ${cleanUsername}\nPassword: ${password}`);
    alert('Credentials copied!');
  };

  const selectedVehicle = vehicles.find(v => v.id === vehicleId);

  // ── Success Screen ─────────────────────────────────────────────────────────
  if (isSuccess) {
    return (
      <div className="max-w-xl mx-auto mt-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="bg-paper-raised border border-line rounded-xl p-8 shadow-sm text-center">
          <div className="mx-auto w-12 h-12 bg-route/10 rounded-full flex items-center justify-center mb-6">
            <CheckCircle className="h-6 w-6 text-route" />
          </div>
          <h2 className="font-heading text-2xl font-bold text-ink mb-2">Driver Account Created</h2>
          <p className="text-ink-soft mb-8">
            The account for <strong className="text-ink">{name}</strong> is active.
            Share these credentials so they can log in to the Driver App.
          </p>

          <div className="bg-paper border border-line rounded-lg p-6 text-left relative">
            <button onClick={handleCopy} className="absolute top-4 right-4 p-2 text-ink-soft hover:text-ink hover:bg-line/50 rounded-md transition-colors" title="Copy">
              <Copy className="h-4 w-4" />
            </button>
            <div className="space-y-4 font-mono text-sm">
              <div>
                <span className="text-ink-soft text-xs uppercase tracking-wider block mb-1">Username</span>
                <span className="text-ink font-semibold text-lg">{cleanUsername}</span>
              </div>
              <div>
                <span className="text-ink-soft text-xs uppercase tracking-wider block mb-1">Password</span>
                <span className="text-ink font-semibold text-lg">{password}</span>
              </div>
              {selectedVehicle && (
                <div>
                  <span className="text-ink-soft text-xs uppercase tracking-wider block mb-1">Assigned Vehicle</span>
                  <span className="text-ink font-semibold">{selectedVehicle.make} {selectedVehicle.model} — {selectedVehicle.plate_number}</span>
                </div>
              )}
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-line flex gap-4">
            <Link href="/admin/drivers" className="flex-1">
              <button className="w-full h-11 bg-paper hover:bg-line/50 text-ink font-medium rounded-lg border border-line transition-colors">
                Back to Drivers
              </button>
            </Link>
            <button
              onClick={() => { setName(''); setUsername(''); setPassword(''); setVehicleId(''); setShowPassword(false); setIsSuccess(false); }}
              className="flex-1 h-11 bg-ink hover:bg-ink-soft text-paper-raised font-medium rounded-lg transition-colors"
            >
              Add Another Driver
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="flex items-center gap-4">
        <Link href="/admin/drivers">
          <button className="h-9 w-9 flex items-center justify-center rounded-lg border border-line text-ink hover:bg-paper transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
        </Link>
        <div>
          <h1 className="font-heading text-3xl font-bold text-ink">Add Driver</h1>
          <p className="text-ink-soft">Create a new driver account and generate credentials.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-paper-raised border border-line rounded-xl shadow-sm overflow-hidden">
        <div className="p-6 space-y-6">

          {/* Personal Information */}
          <div className="space-y-4">
            <h3 className="font-heading text-lg font-bold text-ink">Personal Information</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-ink">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-soft" />
                  <input
                    type="text" value={name} onChange={(e) => setName(e.target.value)} required
                    className="w-full h-11 pl-10 pr-4 bg-paper border border-line rounded-lg text-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
                    placeholder="e.g. Ahmed Al-Farsi"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-ink">Username (Login ID)</label>
                <div className="relative">
                  <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-soft" />
                  <input
                    type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                    required autoComplete="username"
                    className="w-full h-11 pl-10 pr-4 bg-paper border border-line rounded-lg text-ink font-mono focus:outline-none focus:ring-2 focus:ring-ink/20"
                    placeholder="e.g. ahmed_driver"
                  />
                </div>
                {cleanUsername && <p className="text-xs text-ink-soft">Login ID: @{cleanUsername}</p>}
              </div>
            </div>
          </div>

          <div className="h-px bg-line" />

          {/* Vehicle Assignment */}
          <div className="space-y-4">
            <div>
              <h3 className="font-heading text-lg font-bold text-ink">Vehicle Assignment</h3>
              <p className="text-sm text-ink-soft">Optional — can also be assigned later from the Vehicles page.</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-ink">Assign Vehicle</label>
              <div className="relative">
                <Car className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-soft" />
                <select
                  value={vehicleId}
                  onChange={(e) => setVehicleId(e.target.value)}
                  className="w-full h-11 pl-10 pr-4 bg-paper border border-line rounded-lg text-ink focus:outline-none focus:ring-2 focus:ring-ink/20 appearance-none"
                >
                  <option value="">— No vehicle assigned yet —</option>
                  {vehicles.map(v => (
                    <option key={v.id} value={v.id}>{v.make} {v.model} — {v.plate_number}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="h-px bg-line" />

          {/* Account Security */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-lg font-bold text-ink">Account Security</h3>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-ink-soft">Account Status</span>
                <button
                  type="button" onClick={() => setStatus(!status)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${status ? 'bg-route' : 'bg-line'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-paper-raised transition-transform ${status ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>

            <div className="space-y-2 max-w-sm">
              <label className="text-sm font-medium text-ink flex items-center justify-between">
                Password
                <button type="button" onClick={() => setPassword(Math.random().toString(36).slice(-10))} className="text-xs text-ink-soft hover:text-ink underline">
                  Auto-generate
                </button>
              </label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-soft" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  required minLength={6} placeholder="Set a password (min. 6 characters)"
                  className="w-full h-11 pl-10 pr-14 bg-paper border border-line rounded-lg text-ink font-mono focus:outline-none focus:ring-2 focus:ring-ink/20"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-soft hover:text-ink font-medium">
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <p className="text-xs text-ink-soft">You set this password — share it with the driver so they can log in.</p>
            </div>
          </div>

          {/* Ready Banner */}
          {isValid && (
            <div className="p-4 bg-paper border border-line rounded-lg flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-route shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-ink">Ready to create account</p>
                <p className="text-xs text-ink-soft mt-1">
                  Creating {status ? 'Active' : 'Inactive'} account for <strong className="text-ink">{name}</strong> (@{cleanUsername})
                  {selectedVehicle ? `, assigned to ${selectedVehicle.make} ${selectedVehicle.model}` : ', no vehicle assigned yet'}.
                </p>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 dark:bg-red-950/20 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
              <strong>Error:</strong> {error}
            </div>
          )}
        </div>

        <div className="bg-paper px-6 py-4 border-t border-line flex justify-end gap-3">
          <Link href="/admin/drivers">
            <button type="button" className="h-10 px-4 rounded-lg font-medium text-ink-soft hover:text-ink hover:bg-line/50 transition-colors">Cancel</button>
          </Link>
          <button
            type="submit" disabled={!isValid || isSubmitting}
            className={`h-10 px-6 rounded-lg font-medium transition-colors ${isValid && !isSubmitting ? 'bg-ink text-paper-raised hover:bg-ink-soft' : 'bg-line text-ink-soft cursor-not-allowed'}`}
          >
            {isSubmitting ? 'Creating...' : 'Create Driver Account'}
          </button>
        </div>
      </form>
    </div>
  );
}