'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Play, SkipForward, CheckCircle2, AlertCircle } from 'lucide-react';
import { Header } from '@/components/Header';

export default function DemoPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const steps = [
    {
      title: 'Welcome to Apex Intelligence Engine',
      desc: 'This demo will walk you through the entire event ingestion and analytics pipeline. We will simulate live CCTV events being generated at the edge and ingested into our system.',
      actionText: 'Start Walkthrough',
      duration: 0
    },
    {
      title: '1. Initializing Edge Simulation',
      desc: 'Starting the simulated CCTV edge devices across 5 stores. The system is now generating anonymous UUIDs for visitors and logging ENTRY events.',
      actionText: 'Next',
      duration: 3000,
      autoAdvance: true
    },
    {
      title: '2. Generating Zone Activity',
      desc: 'Visitors are now moving through the store. Notice how the system captures ZONE_ENTER and calculates DWELL_MS without tracking any PII or facial data.',
      actionText: 'Next',
      duration: 4000,
      autoAdvance: true
    },
    {
      title: '3. Billing Queue & POS Correlation',
      desc: 'Visitors join the billing queue. The Intelligence API begins matching BILLING_QUEUE_JOIN events with simulated POS transactions using a 5-minute sliding window.',
      actionText: 'Next',
      duration: 4000,
      autoAdvance: true
    },
    {
      title: '4. Handling Edge Cases',
      desc: 'The pipeline is currently filtering out staff movements (15% of traffic), deduplicating camera overlap (ZONE_ENTER spam), and handling partial occlusions (low confidence scores).',
      actionText: 'Next',
      duration: 4000,
      autoAdvance: true
    },
    {
      title: 'Live Dashboard Ready',
      desc: 'The data pipeline is fully hydrated. Let\'s switch to the Live Dashboard to see the real-time Heatmaps, Conversion Funnels, and Anomaly Alerts.',
      actionText: 'Go to Dashboard',
      duration: 0
    }
  ];

  const currentStep = steps[step];

  useEffect(() => {
    if (isPlaying && currentStep.autoAdvance) {
      const timer = setTimeout(() => {
        setStep(s => Math.min(s + 1, steps.length - 1));
      }, currentStep.duration);
      return () => clearTimeout(timer);
    }
  }, [isPlaying, step, currentStep]);

  const handleNext = async () => {
    if (step === 0) {
      setIsPlaying(true);
      // Ensure database and simulation is reset/started
      try {
        await fetch('/api/simulation/control', { method: 'POST', body: JSON.stringify({ action: 'reset' }) });
        await fetch('/api/simulation/control', { method: 'POST', body: JSON.stringify({ action: 'start' }) });
      } catch (e) { console.error(e); }
    }

    if (step === steps.length - 1) {
      router.push('/dashboard');
      return;
    }

    setStep(s => s + 1);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col text-slate-50">
      <Header />
      
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-xl w-full bg-slate-900/50 border border-slate-800 rounded-2xl p-8 backdrop-blur-sm relative overflow-hidden">
          
          {/* Progress Bar */}
          <div className="absolute top-0 left-0 w-full h-1 bg-slate-800">
            <div 
              className="h-full bg-cyan-500 transition-all duration-500 ease-out"
              style={{ width: `${((step) / (steps.length - 1)) * 100}%` }}
            />
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">{currentStep.title}</h2>
            <p className="text-slate-400 text-lg leading-relaxed min-h-[100px]">
              {currentStep.desc}
            </p>
          </div>

          {/* Visualization Area */}
          <div className="h-48 bg-slate-950 border border-slate-800 rounded-xl mb-8 flex items-center justify-center p-6">
            {step === 0 && <Play className="h-16 w-16 text-slate-700" />}
            {step > 0 && step < steps.length - 1 && (
              <div className="w-full space-y-4">
                <div className="flex justify-between text-xs text-cyan-500 font-mono">
                  <span>[SYSTEM INGEST]</span>
                  <span className="animate-pulse">PROCESSING...</span>
                </div>
                <div className="space-y-2">
                  <div className="h-2 w-full bg-slate-800 rounded overflow-hidden">
                    <div className="h-full bg-cyan-600 animate-[progress_1s_ease-in-out_infinite]" />
                  </div>
                  <div className="h-2 w-3/4 bg-slate-800 rounded overflow-hidden">
                    <div className="h-full bg-blue-600 animate-[progress_1.5s_ease-in-out_infinite]" />
                  </div>
                </div>
              </div>
            )}
            {step === steps.length - 1 && (
              <div className="flex flex-col items-center text-emerald-500">
                <CheckCircle2 className="h-16 w-16 mb-4" />
                <span className="font-mono text-sm">PIPELINE READY</span>
              </div>
            )}
          </div>

          <div className="flex justify-between items-center">
            <div className="text-sm text-slate-500 font-medium">
              Step {step + 1} of {steps.length}
            </div>
            <Button 
              onClick={handleNext}
              className="bg-cyan-600 hover:bg-cyan-500 text-white min-w-[140px]"
            >
              {currentStep.actionText}
              {step < steps.length - 1 && <SkipForward className="ml-2 h-4 w-4" />}
            </Button>
          </div>

        </div>
      </main>
    </div>
  );
}
