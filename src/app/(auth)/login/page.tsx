'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Briefcase, Car, Phone, Mail, Key, ArrowRight } from 'lucide-react';

type Role = 'admin' | 'partner' | 'driver';

export default function LoginPage() {
  const router = useRouter();
  const [activeRole, setActiveRole] = useState<Role>('admin');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    // Mock login delay
    setTimeout(() => {
      if (activeRole === 'admin') {
        router.push('/admin');
      } else {
        alert(`Mock Login Success! Would redirect to /${activeRole} portal.`);
        setIsLoading(false);
      }
    }, 800);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper p-4">
      <div className="w-full max-w-[800px] bg-paper-raised border border-line rounded-2xl shadow-xl overflow-hidden flex flex-col md:flex-row">
        
        {/* Left Panel - Branding */}
        <div className="bg-ink p-8 md:w-[300px] flex flex-col justify-between text-paper-raised">
          <div>
            <div className="h-10 w-10 bg-route rounded-lg flex items-center justify-center mb-6">
              <Car className="h-6 w-6 text-paper-raised" />
            </div>
            <h1 className="font-heading text-2xl font-bold mb-2">Driver Finance</h1>
            <p className="text-paper-raised/70 text-sm">Revenue tracking, partner splits, and driver compensation.</p>
          </div>
          
          <div className="mt-12 hidden md:block">
            <p className="text-xs text-paper-raised/50 font-mono">SYS-ORIGIN v2.0</p>
          </div>
        </div>

        {/* Right Panel - Login Form */}
        <div className="flex-1 p-8 md:p-12">
          <h2 className="font-heading text-2xl font-bold text-ink mb-6">Sign In</h2>
          
          {/* Role Selector */}
          <div className="flex gap-2 p-1 bg-paper border border-line rounded-lg mb-8">
            <button
              onClick={() => { setActiveRole('admin'); setIdentifier(''); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all ${
                activeRole === 'admin' ? 'bg-paper-raised shadow text-ink' : 'text-ink-soft hover:text-ink hover:bg-line/20'
              }`}
            >
              <Shield className="h-4 w-4" /> Admin
            </button>
            <button
              onClick={() => { setActiveRole('partner'); setIdentifier(''); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all ${
                activeRole === 'partner' ? 'bg-paper-raised shadow text-ink' : 'text-ink-soft hover:text-ink hover:bg-line/20'
              }`}
            >
              <Briefcase className="h-4 w-4" /> Partner
            </button>
            <button
              onClick={() => { setActiveRole('driver'); setIdentifier(''); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all ${
                activeRole === 'driver' ? 'bg-paper-raised shadow text-ink' : 'text-ink-soft hover:text-ink hover:bg-line/20'
              }`}
            >
              <Car className="h-4 w-4" /> Driver
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-ink">
                {activeRole === 'admin' ? 'Email Address' : 'Phone Number'}
              </label>
              <div className="relative">
                {activeRole === 'admin' ? (
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-ink-soft" />
                ) : (
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-ink-soft" />
                )}
                <input
                  type={activeRole === 'admin' ? "email" : "tel"}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder={activeRole === 'admin' ? "admin@company.com" : "0501234567"}
                  required
                  className={`w-full h-12 pl-11 pr-4 bg-paper border border-line rounded-lg text-ink focus:outline-none focus:ring-2 focus:ring-ink/20 ${activeRole !== 'admin' && 'font-mono'}`}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-ink flex justify-between">
                Password
                <a href="#" className="text-route hover:underline text-xs">Forgot?</a>
              </label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-ink-soft" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full h-12 pl-11 pr-4 bg-paper border border-line rounded-lg text-ink font-mono focus:outline-none focus:ring-2 focus:ring-ink/20"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !identifier || !password}
              className={`w-full h-12 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors ${
                (identifier && password && !isLoading) 
                  ? 'bg-ink text-paper-raised hover:bg-ink-soft' 
                  : 'bg-line text-ink-soft cursor-not-allowed'
              }`}
            >
              {isLoading ? 'Authenticating...' : 'Sign In'}
              {!isLoading && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>
          
          <div className="mt-8 pt-6 border-t border-line text-center">
            <p className="text-xs text-ink-soft">
              Protected by enterprise-grade encryption.<br/>
              Only authorized personnel may access this system.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
