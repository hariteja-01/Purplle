'use client';

import { useState, useEffect } from 'react';
import { Play, Square, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SimulationStatus } from '@/lib/types';

export function SimulationControl() {
  const [status, setStatus] = useState<SimulationStatus>({
    running: false,
    events_generated: 0,
    current_visitors: 0,
  });

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/simulation/status');
        if (res.ok) {
          const data = await res.json();
          setStatus(data);
        }
      } catch (err) {
        console.error('Failed to fetch simulation status:', err);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleAction = async (action: 'start' | 'stop' | 'reset') => {
    if (action === 'reset' && !window.confirm('Are you sure you want to reset the simulation and database? This will clear all data.')) {
      return;
    }

    try {
      await fetch('/api/simulation/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      
      // Immediate status update for better UX
      if (action === 'start') setStatus(prev => ({ ...prev, running: true }));
      if (action === 'stop') setStatus(prev => ({ ...prev, running: false }));
      if (action === 'reset') setStatus({ running: false, events_generated: 0, current_visitors: 0 });
      
    } catch (err) {
      console.error(`Failed to ${action} simulation:`, err);
    }
  };

  return (
    <div className="flex items-center gap-4 bg-slate-900/50 p-2 rounded-lg border border-slate-800">
      <div className="flex items-center gap-2 px-2">
        <div className={`h-2 w-2 rounded-full ${status.running ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`} />
        <span className="text-xs font-medium text-slate-300">
          {status.running ? 'Sim Active' : 'Sim Stopped'}
        </span>
      </div>
      
      <div className="flex gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => handleAction('start')}
          disabled={status.running}
          className="h-8 w-8 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-400/10"
          title="Start Simulation"
        >
          <Play className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => handleAction('stop')}
          disabled={!status.running}
          className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-400/10"
          title="Stop Simulation"
        >
          <Square className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => handleAction('reset')}
          className="h-8 w-8 text-slate-400 hover:text-white hover:bg-slate-700"
          title="Reset Simulation Data"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex gap-4 px-2 text-xs text-slate-500 border-l border-slate-800 pl-4">
        <div>
          <span className="block text-slate-400">Events</span>
          <span className="font-mono">{status.events_generated.toLocaleString()}</span>
        </div>
        <div>
          <span className="block text-slate-400">Visitors</span>
          <span className="font-mono">{status.current_visitors}</span>
        </div>
      </div>
    </div>
  );
}
