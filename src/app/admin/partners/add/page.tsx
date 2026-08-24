'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Key, User, Phone, CheckCircle, Copy, Search, Briefcase, Car } from 'lucide-react';

export default function AddPartnerPage() {
  const [isDriver, setIsDriver] = useState<boolean | null>(null);
  
  // For New Investor
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState(Math.random().toString(36).slice(-8));
  
  // For Existing Driver
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDriver, setSelectedDriver] = useState<{ id: string, name: string, phone: string } | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drivers, setDrivers] = useState<{ id: string; name: string; phone: string }[]>([]);

  // Load real driver list on mount
  useState(() => {
    fetch('/api/admin/drivers-list')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setDrivers(d); })
      .catch(() => {}); // silently fallback to empty
  });

  const filteredDrivers = drivers.filter(d =>
    d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.phone.includes(searchQuery)
  );

  const isValid = isDriver === false
    ? (name.trim().length > 0 && phone.trim().length > 0 && password.length >= 6)
    : (isDriver === true && selectedDriver !== null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const body = isDriver
        ? { existingDriverId: selectedDriver!.id }
        : { name: name.trim(), phone: phone.trim(), password };

      const res = await fetch('/api/admin/create-partner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create partner');

      setIsSuccess(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(`Login: ${phone}\nPassword: ${password}`);
    alert('Credentials copied to clipboard!');
  };

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
                The investor account for {name} is active. Share these exact credentials with them to log in to the Partner Portal.
              </p>
              
              <div className="bg-paper border border-line rounded-lg p-6 text-left relative group">
                <button 
                  onClick={handleCopy}
                  className="absolute top-4 right-4 p-2 text-ink-soft hover:text-ink hover:bg-line/50 rounded-md transition-colors"
                  title="Copy credentials"
                >
                  <Copy className="h-4 w-4" />
                </button>
                <div className="space-y-4 font-mono text-sm">
                  <div>
                    <span className="text-ink-soft text-xs uppercase tracking-wider block mb-1">Login (Phone Number)</span>
                    <span className="text-ink font-semibold text-lg">{phone}</span>
                  </div>
                  <div>
                    <span className="text-ink-soft text-xs uppercase tracking-wider block mb-1">Temporary Password</span>
                    <span className="text-ink font-semibold text-lg">{password}</span>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <p className="text-ink-soft mb-8">
              Partner access has been granted to <strong className="text-ink">{selectedDriver?.name}</strong>. They can now log in to the Partner Portal using their existing Driver App credentials. No new password needed.
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
          
          {/* Initial Decision */}
          <div className="space-y-4">
            <h3 className="font-heading text-lg font-bold text-ink">Is this partner also a driver?</h3>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => { setIsDriver(true); setName(''); setPhone(''); }}
                className={`p-4 border rounded-xl flex flex-col items-center text-center transition-all ${
                  isDriver === true 
                    ? 'border-ink bg-ink text-paper-raised ring-2 ring-ink/20 ring-offset-2' 
                    : 'border-line bg-paper text-ink hover:border-ink/30'
                }`}
              >
                <Car className="h-6 w-6 mb-2 opacity-80" />
                <span className="font-bold">Yes, Existing Driver</span>
                <span className={`text-xs mt-1 ${isDriver === true ? 'text-paper-raised/70' : 'text-ink-soft'}`}>Link a current driver account</span>
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
                <span className={`text-xs mt-1 ${isDriver === false ? 'text-paper-raised/70' : 'text-ink-soft'}`}>Create a fresh partner account</span>
              </button>
            </div>
          </div>

          {/* Dynamic Form Sections */}
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
                  placeholder="Search by name or phone..."
                />
              </div>
              <div className="border border-line rounded-lg bg-paper max-h-60 overflow-y-auto divide-y divide-line">
                {filteredDrivers.map(driver => (
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
                      <div className="text-xs text-ink-soft font-mono">{driver.phone}</div>
                    </div>
                    {selectedDriver?.id === driver.id && <CheckCircle className="h-5 w-5 text-route" />}
                  </button>
                ))}
              </div>
            </div>
          )}

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
                      placeholder="e.g. Khalid Investor"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium text-ink">Phone Number (Login ID)</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-soft" />
                    <input 
                      type="tel" 
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                      className="w-full h-11 pl-10 pr-4 bg-paper border border-line rounded-lg text-ink font-mono focus:outline-none focus:ring-2 focus:ring-ink/20"
                    placeholder="e.g. 0501234567"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2 max-w-sm">
                <label className="text-sm font-medium text-ink flex items-center justify-between">
                  Temporary Password
                  <button type="button" onClick={() => setPassword(Math.random().toString(36).slice(-8))} className="text-xs text-ink-soft hover:text-ink underline">Generate New</button>
                </label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-soft" />
                  <input 
                    type="text" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full h-11 pl-10 pr-4 bg-paper border border-line rounded-lg text-ink font-mono font-medium focus:outline-none focus:ring-2 focus:ring-ink/20"
                  />
                </div>
                <p className="text-xs text-ink-soft">The investor will use this to log in initially.</p>
              </div>
            </div>
          )}

          {/* Review Pattern Summary */}
          {isValid && (
            <div className="mt-8 p-4 bg-paper border border-line rounded-lg flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-route shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-ink">Ready to create partner entity</p>
                {isDriver ? (
                  <p className="text-xs text-ink-soft mt-1">
                    You are granting partner access to existing driver <strong className="text-ink">{selectedDriver?.name}</strong>. They will use their current app credentials to log in.
                  </p>
                ) : (
                  <p className="text-xs text-ink-soft mt-1">
                    You are creating a new investor account for <strong className="text-ink">{name}</strong> ({phone}). A secure credentials card will be provided.
                  </p>
                )}
              </div>
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
