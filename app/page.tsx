import Link from 'next/link';
import { ArrowRight, BarChart3, Database, Shield, Zap } from 'lucide-react';

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-50">
      <main className="flex-1">
        <section className="relative flex flex-col items-center justify-center space-y-10 overflow-hidden px-6 pt-32 pb-24 md:pt-48 md:pb-32">
          {/* Background effects */}
          <div className="absolute top-0 -z-10 h-full w-full bg-slate-950">
            <div className="absolute bottom-auto left-auto right-0 top-0 h-[500px] w-[500px] -translate-x-[30%] translate-y-[20%] rounded-full bg-cyan-900/20 opacity-50 blur-[80px]"></div>
            <div className="absolute bottom-0 left-0 right-auto top-auto h-[500px] w-[500px] translate-x-[10%] -translate-y-[20%] rounded-full bg-blue-900/20 opacity-50 blur-[80px]"></div>
          </div>

          <div className="mx-auto flex max-w-[58rem] flex-col items-center space-y-8 text-center">
            <div className="inline-flex items-center rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-sm font-medium text-cyan-300">
              <Zap className="mr-2 h-4 w-4" />
              <span>Apex Intelligence Engine v2.0 Live</span>
            </div>
            
            <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
              Transform CCTV into
              <br className="hidden sm:inline" />
              <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent"> Retail Intelligence</span>
            </h1>
            
            <p className="max-w-[42rem] leading-normal text-slate-400 sm:text-xl sm:leading-8">
              Real-time store analytics powered by edge-AI event streams. 
              Correlate anonymous visitor journeys with POS data to unlock funnel metrics, heatmap insights, and live anomaly detection.
            </p>
            
            <div className="flex flex-col gap-4 sm:flex-row">
              <Link
                href="/dashboard"
                className="inline-flex h-12 items-center justify-center rounded-md bg-cyan-600 px-8 text-sm font-medium text-white shadow transition-colors hover:bg-cyan-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-700 disabled:pointer-events-none disabled:opacity-50"
              >
                Launch Dashboard
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              <Link
                href="/demo"
                className="inline-flex h-12 items-center justify-center rounded-md border border-slate-700 bg-slate-900 px-8 text-sm font-medium shadow-sm transition-colors hover:bg-slate-800 hover:text-cyan-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-700"
              >
                View Interactive Demo
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[85rem] px-6 py-24 sm:py-32">
          <div className="grid gap-8 md:grid-cols-3">
            <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50 p-8 shadow-sm backdrop-blur-sm">
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-cyan-500/10">
                <BarChart3 className="h-6 w-6 text-cyan-400" />
              </div>
              <h3 className="mb-2 text-xl font-bold">Real-time Analytics</h3>
              <p className="text-slate-400">
                Sub-second latency pipeline mapping physical store journeys to digital-style funnel metrics and heatmaps.
              </p>
            </div>
            <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50 p-8 shadow-sm backdrop-blur-sm">
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-blue-500/10">
                <Database className="h-6 w-6 text-blue-400" />
              </div>
              <h3 className="mb-2 text-xl font-bold">POS Correlation</h3>
              <p className="text-slate-400">
                Advanced time-series matching algorithm to connect anonymous CCTV queue events with precise transaction records.
              </p>
            </div>
            <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50 p-8 shadow-sm backdrop-blur-sm">
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-500/10">
                <Shield className="h-6 w-6 text-emerald-400" />
              </div>
              <h3 className="mb-2 text-xl font-bold">Privacy First</h3>
              <p className="text-slate-400">
                No PII storage. All tracking utilizes ephemeral UUIDs that reset daily. Fully compliant with data protection regulations.
              </p>
            </div>
          </div>
        </section>
      </main>
      
      <footer className="border-t border-slate-800 bg-slate-950 py-6 md:py-0">
        <div className="container flex flex-col items-center justify-between gap-4 md:h-16 md:flex-row">
          <p className="text-sm text-slate-500">
            Built for the Apex Retail Intelligence Challenge.
          </p>
        </div>
      </footer>
    </div>
  );
}
