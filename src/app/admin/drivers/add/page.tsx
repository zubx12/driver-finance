'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Key, User, Phone, CheckCircle, Copy } from 'lucide-react';

export default function AddDriverPage() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState(Math.random().toString(36).slice(-8));
  const [status, setStatus] = useState(true); // true = active
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Validation
  const isValid = name.trim().length > 0 && phone.trim().length > 0 && password.length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    
    setIsSubmitting(true);
    // Simulate network request
    setTimeout(() => {
      setIsSubmitting(false);
      setIsSuccess(true);
    }, 800);
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
          <h2 className="font-heading text-2xl font-bold text-ink mb-2">Driver Account Created</h2>
          <p className="text-ink-soft mb-8">
            The account for {name} is active. Share these exact credentials with them so they can log in to the Driver App.
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
          
          <div className="mt-8 pt-6 border-t border-line flex gap-4">
            <Link href="/admin/drivers" className="flex-1">
              <button className="w-full h-11 bg-paper hover:bg-line/50 text-ink font-medium rounded-lg border border-line transition-colors">
                Back to Drivers
              </button>
            </Link>
            <button 
              onClick={() => {
                setName(''); setPhone(''); setPassword(Math.random().toString(36).slice(-8)); setIsSuccess(false);
              }}
              className="flex-1 h-11 bg-ink hover:bg-ink-soft text-paper-raised font-medium rounded-lg transition-colors"
            >
              Add Another Driver
            </button>
          </div>
        </div>
      </div>
    );
  }

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
          <div className="space-y-4">
            <h3 className="font-heading text-lg font-bold text-ink">Personal Information</h3>
            
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
                    placeholder="e.g. Ahmed Al-Farsi"
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
          </div>

          <div className="h-px bg-line w-full my-6"></div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-lg font-bold text-ink">Account Security</h3>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-ink-soft">Account Status</span>
                <button
                  type="button"
                  onClick={() => setStatus(!status)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${status ? 'bg-route' : 'bg-line'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-paper-raised transition-transform ${status ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
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
              <p className="text-xs text-ink-soft">The driver will use this to log in initially.</p>
            </div>
          </div>
          
          {/* Review Pattern Summary before submit */}
          {isValid && (
            <div className="mt-8 p-4 bg-paper border border-line rounded-lg flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-route shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-ink">Ready to create account</p>
                <p className="text-xs text-ink-soft mt-1">
                  You are creating an {status ? 'Active' : 'Inactive'} driver account for <strong className="text-ink">{name}</strong> ({phone}). A secure credentials card will be provided on the next screen.
                </p>
              </div>
            </div>
          )}
        </div>
        
        <div className="bg-paper px-6 py-4 border-t border-line flex justify-end gap-3">
          <Link href="/admin/drivers">
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
            {isSubmitting ? 'Creating...' : 'Create Driver Account'}
          </button>
        </div>
      </form>
    </div>
  );
}
