'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronLeft, Key, User, AtSign, CheckCircle, Copy, Search, Briefcase, Car } from 'lucide-react';

interface DriverOption { id: string; name: string; username: string; }

export default function AddPartnerPage() {
  const [isDriver, setIsDriver] = useState<boolean | null>(null);

  // New Investor fields
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Existing Driver linking
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDriver, setSelectedDriver] = useState<DriverOption | null>(null);
  const [drivers, setDrivers] = useState<DriverOption[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/drivers-list')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setDrivers(d); })
      .catch(() => {});
  }, []);

  const cleanUsername = username.trim().toLowerCase().replace(/\s+/g, '_');

  const filteredDrivers = drivers.filter(d =>
    d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (d.username ?? '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isValid = isDriver === false
    ? (name.trim().length > 0 && cleanUsername.length >= 3 && password.length >= 6)
    : (isDriver === true && selectedDriver !== null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const body = isDriver
        ? { existingDriverId: selectedDriver!.id }
        : { name: name.trim(), username: cleanUsername, password };

      const res = await fetch('/api/admin/create-partner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to create partner');
      setIsSuccess(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(`Username: ${cleanUsername}\nPassword: ${password}`);
    alert('Credentials copied to clipboard!');
  };

  // ── Success Screen ──────────────────────────────────────────────────────────
  if (isSuccess) {
    return (
      <div className="max-w-xl mx-auto mt-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="bg-paper-raised border border-line rounded-xl p-8 shadow-sm text-center">
          <div className="mx-auto w-12 h-12 bg-route/10 rounded-full flex items-center justify-center mb-6">
            <CheckCircle className="h-6 w-6 text-route" />
          </div>
          <h2 className="font-heading text-2xl font-bold text-ink mb-2">Partner Account Created</h2>

          {isDriver === false ? (
            <>
              <p className="text-ink-soft mb-8">
                The investor account for <strong className="text-ink">{name}</strong> is active.
                Share these credentials so they can log in to the Partner Portal.
              </p>
              <div className="bg-paper border border-line rounded-lg p-6 text-left relative">
                <button
                  onClick={handleCopy}
                  className="absolute top-4 right-4 p-2 text-ink-soft hover:text-ink hover:bg-line/50 rounded-md transition-colors"
                  title="Copy credentials"
                >
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
                </div>
              </div>
            </>
          ) : (
            <p className="text-ink-soft mb-8">
              Partner access has been granted to <strong className="text-ink">{selectedDriver?.name}</strong>.
              They can log in to the Partner Portal using their existing Driver App credentials.
            </p>
          )}

          <div className="mt-8 pt-6 border-t border-line flex gap-4">
            <Link href="/admin/vehicles" className="flex-1">
              <button className="w-full h-11 bg-paper hover:bg-line/50 text-ink font-medium rounded-lg border border-line transition-colors">
                Back to Vehicles
              </button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Form ────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="flex items-center gap-4">
        <Link href="/admin/vehicles">
          <button className="h-9 w-9 flex items-center justify-center rounded-lg border border-line text-ink hover:bg-paper transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
        </Link>
        <div>
          <h1 className="font-heading text-3xl font-bold text-ink">Add Partner</h1>
          <p className="text-ink-soft">Create a new partner entity to receive revenue shares.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-paper-raised border border-line rounded-xl shadow-sm overflow-hidden">
        <div className="p-6 space-y-8">

          {/* Partner type selection */}
          <div className="space-y-4">
            <h3 className="font-heading text-lg font-bold text-ink">Is this partner also a driver?</h3>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => { setIsDriver(true); setName(''); setUsername(''); setPassword(''); }}
                className={`p-4 border rounded-xl flex flex-col items-center text-center transition-all ${
                  isDriver === true
                    ? 'border-ink bg-ink text-paper-raised ring-2 ring-ink/20 ring-offset-2'
                    : 'border-line bg-paper text-ink hover:border-ink/30'
                }`}
              >
                <Car className="h-6 w-6 mb-2 opacity-80" />
                <span className="font-bold">Yes, Existing Driver</span>
                <span className={`text-xs mt-1 ${isDriver === true ? 'text-paper-raised/70' : 'text-ink-soft'}`}>
                  Link a current driver account
                </span>
              </button>

              <button
                type="button"
                onClick={() => { setIsDriver(false); setSelectedDriver(null); }}
                className={`p-4 border rounded-xl flex flex-col items-center text-center transition-all ${
                  isDriver === false
                    ? 'border-ink bg-ink text-paper-raised ring-2 ring-ink/20 ring-offset-2'
                    : 'border-line bg-paper text-ink hover:border-ink/30'
                }`}
              >
                <Briefcase className="h-6 w-6 mb-2 opacity-80" />
                <span className="font-bold">No, New Investor</span>
                <span className={`text-xs mt-1 ${isDriver === false ? 'text-paper-raised/70' : 'text-ink-soft'}`}>
                  Create a fresh partner account
                </span>
              </button>
            </div>
          </div>

          {/* Existing driver search */}
          {isDriver === true && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300 border-t border-line pt-6">
              <h3 className="font-heading text-lg font-bold text-ink">Select Existing Driver</h3>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-soft" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-11 pl-10 pr-4 bg-paper border border-line rounded-lg text-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
                  placeholder="Search by name or username..."
                />
              </div>
              <div className="border border-line rounded-lg bg-paper max-h-60 overflow-y-auto divide-y divide-line">
                {filteredDrivers.length === 0 ? (
                  <div className="p-4 text-sm text-ink-soft text-center">No drivers found.</div>
                ) : filteredDrivers.map(driver => (
                  <button
                    key={driver.id}
                    type="button"
                    onClick={() => setSelectedDriver(driver)}
                    className={`w-full flex items-center justify-between p-3 text-left transition-colors ${
                      selectedDriver?.id === driver.id ? 'bg-route/10' : 'hover:bg-line/30'
                    }`}
                  >
                    <div>
                      <div className="font-medium text-ink">{driver.name}</div>
                      <div className="text-xs text-ink-soft font-mono">@{driver.username}</div>
                    </div>
                    {selectedDriver?.id === driver.id && <CheckCircle className="h-5 w-5 text-route" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* New investor form */}
          {isDriver === false && (
            <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300 border-t border-line pt-6">
              <h3 className="font-heading text-lg font-bold text-ink">Investor Details</h3>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-ink">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-soft" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      className="w-full h-11 pl-10 pr-4 bg-paper border border-line rounded-lg text-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
                      placeholder="e.g. Khalid Al-Rashid"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-ink">Username (Login ID)</label>
                  <div className="relative">
                    <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-soft" />
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      autoComplete="username"
                      className="w-full h-11 pl-10 pr-4 bg-paper border border-line rounded-lg text-ink font-mono focus:outline-none focus:ring-2 focus:ring-ink/20"
                      placeholder="e.g. khalid_investor"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2 max-w-sm">
                <label className="text-sm font-medium text-ink flex items-center justify-between">
                  Password
                  <button
                    type="button"
                    onClick={() => setPassword(Math.random().toString(36).slice(-10))}
                    className="text-xs text-ink-soft hover:text-ink underline"
                  >
                    Auto-generate
                  </button>
                </label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-soft" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    placeholder="Set a password (min. 6 characters)"
                    className="w-full h-11 pl-10 pr-14 bg-paper border border-line rounded-lg text-ink font-mono focus:outline-none focus:ring-2 focus:ring-ink/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-soft hover:text-ink font-medium"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <p className="text-xs text-ink-soft">
                  You set this password — share it with the investor so they can log in to the Partner Portal.
                </p>
              </div>
            </div>
          )}

          {/* Ready banner */}
          {isValid && (
            <div className="mt-2 p-4 bg-paper border border-line rounded-lg flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-route shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-ink">Ready to create partner entity</p>
                {isDriver ? (
                  <p className="text-xs text-ink-soft mt-1">
                    Granting partner access to driver <strong className="text-ink">{selectedDriver?.name}</strong>.
                    They will use their existing credentials.
                  </p>
                ) : (
                  <p className="text-xs text-ink-soft mt-1">
                    Creating investor account for <strong className="text-ink">{name}</strong> (@{cleanUsername}).
                    A credentials card will appear after creation.
                  </p>
                )}
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
          <Link href="/admin/vehicles">
            <button type="button" className="h-10 px-4 rounded-lg font-medium text-ink-soft hover:text-ink hover:bg-line/50 transition-colors">
              Cancel
            </button>
          </Link>
          <button
            type="submit"
            disabled={!isValid || isSubmitting}
            className={`h-10 px-6 rounded-lg font-medium transition-colors ${
              isValid && !isSubmitting
                ? 'bg-ink text-paper-raised hover:bg-ink-soft'
                : 'bg-line text-ink-soft cursor-not-allowed'
            }`}
          >
            {isSubmitting ? 'Processing...' : 'Create Partner Account'}
          </button>
        </div>
      </form>
    </div>
  );
}