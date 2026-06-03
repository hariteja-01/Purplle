'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Zap, Menu, X, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SimulationControl } from './SimulationControl';

export function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const [healthStatus, setHealthStatus] = useState<'healthy' | 'degraded'>('healthy');

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const res = await fetch('/api/health');
        if (res.ok) {
          const data = await res.json();
          setHealthStatus(data.status);
        } else {
          setHealthStatus('degraded');
        }
      } catch {
        setHealthStatus('degraded');
      }
    };
    fetchHealth();
    const interval = setInterval(fetchHealth, 10000); // Check every 10s
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/80 backdrop-blur">
      <nav className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-cyan-500 to-cyan-600 flex items-center justify-center">
            <Zap className="h-6 w-6 text-slate-950" />
          </div>
          <span className="text-xl font-bold text-white">Apex</span>
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-8 flex-1 justify-center">
          <Link href="/dashboard" className="text-slate-400 hover:text-cyan-400 transition-colors">Dashboard</Link>
          <Link href="/analytics" className="text-slate-400 hover:text-cyan-400 transition-colors">Analytics</Link>
        </div>

        <div className="hidden md:flex items-center gap-4">
          {/* Health Status */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800" title="System Health">
            <div className={`h-2 w-2 rounded-full ${healthStatus === 'healthy' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
            <Activity className="h-3.5 w-3.5 text-slate-400" />
          </div>
          
          <SimulationControl />
        </div>

        {/* Mobile Menu Button */}
        <button className="md:hidden text-slate-400 hover:text-white" onClick={() => setIsOpen(!isOpen)}>
          {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </nav>

      {/* Mobile Navigation */}
      {isOpen && (
        <div className="md:hidden border-t border-slate-800 bg-slate-900">
          <div className="mx-auto max-w-7xl px-6 py-4 space-y-4">
            <Link href="/dashboard" className="block text-slate-400 hover:text-cyan-400 transition-colors py-2">Dashboard</Link>
            <Link href="/analytics" className="block text-slate-400 hover:text-cyan-400 transition-colors py-2">Analytics</Link>
            <div className="pt-2 border-t border-slate-800">
              <p className="text-xs text-slate-500 mb-2">Simulation Controls</p>
              <SimulationControl />
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
