'use client';

import { useEffect, useState } from 'react';
import { Users, TrendingUp, Zap, Clock } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Header } from '@/components/Header';
import { KPICard } from '@/components/KPICard';
import { Heatmap } from '@/components/Heatmap';
import { FunnelChart } from '@/components/FunnelChart';
import { AnomalyAlerts } from '@/components/AnomalyAlerts';
import { EventFeed } from '@/components/EventFeed';
import {
  MetricsResponse,
  Store,
  HeatmapResponse,
  AnomalyResponse,
  FunnelResponse
} from '@/lib/types';

export default function DashboardPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStore, setSelectedStore] = useState<string>('');
  
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapResponse | null>(null);
  const [anomalies, setAnomalies] = useState<AnomalyResponse | null>(null);
  const [funnel, setFunnel] = useState<FunnelResponse | null>(null);
  
  const [lastUpdated, setLastUpdated] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  // Initial stores fetch
  useEffect(() => {
    const fetchStores = async () => {
      try {
        const res = await fetch('/api/stores');
        if (res.ok) {
          const data = await res.json();
          setStores(data.stores);
          if (data.stores.length > 0) {
            setSelectedStore(data.stores[0].store_id);
          }
        }
      } catch (err) {
        console.error('Failed to fetch stores:', err);
      }
    };
    fetchStores();
  }, []);

  // Poll metrics every 3 seconds
  useEffect(() => {
    if (!selectedStore) return;

    const fetchData = async () => {
      try {
        const [metRes, heatRes, anomRes, funRes] = await Promise.all([
          fetch(`/api/stores/${selectedStore}/metrics`),
          fetch(`/api/stores/${selectedStore}/heatmap`),
          fetch(`/api/stores/${selectedStore}/anomalies`),
          fetch(`/api/stores/${selectedStore}/funnel`)
        ]);

        if (metRes.ok) setMetrics(await metRes.json());
        if (heatRes.ok) setHeatmap(await heatRes.json());
        if (anomRes.ok) setAnomalies(await anomRes.json());
        if (funRes.ok) setFunnel(await funRes.json());
        
        setLastUpdated(Date.now());
        setLoading(false);
      } catch (err) {
        console.error('Failed to fetch store data:', err);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [selectedStore]);

  // Last updated counter
  const [secondsAgo, setSecondsAgo] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastUpdated) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [lastUpdated]);

  if (loading || !metrics) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950">
        <div className="animate-pulse flex flex-col items-center">
          <Zap className="h-12 w-12 text-cyan-500 mb-4 animate-bounce" />
          <div className="text-cyan-400 font-mono">Initializing Intelligence System...</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Header />
      <main className="min-h-screen bg-slate-950 p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          
          {/* Header row */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/50 p-4 rounded-xl border border-slate-800">
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Live Operations Dashboard</h1>
              <p className="text-sm text-slate-400 mt-1 flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                Live updating • Last updated {secondsAgo}s ago
              </p>
            </div>
            <div className="flex items-center gap-4">
              <Select value={selectedStore} onValueChange={setSelectedStore}>
                <SelectTrigger className="w-[280px] bg-slate-950 border-slate-700">
                  <SelectValue placeholder="Select Store" />
                </SelectTrigger>
                <SelectContent>
                  {stores.map((store) => (
                    <SelectItem key={store.store_id} value={store.store_id} className="font-medium">
                      {store.name} <span className="text-xs text-slate-500 ml-2">({store.store_id})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KPICard 
              label="Unique Visitors Today" 
              value={metrics.unique_visitors.toLocaleString()} 
              icon={<Users className="h-8 w-8" />} 
              color="cyan" 
            />
            <KPICard 
              label="Conversion Rate" 
              value={metrics.conversion_rate.toFixed(1)} 
              unit="%" 
              icon={<Zap className="h-8 w-8" />} 
              color="green" 
            />
            <KPICard 
              label="Billing Queue Depth" 
              value={metrics.current_queue_depth} 
              icon={<Users className="h-8 w-8" />} 
              color="amber" 
            />
            <KPICard 
              label="Queue Abandonment" 
              value={metrics.abandonment_rate.toFixed(1)} 
              unit="%" 
              icon={<Clock className="h-8 w-8" />} 
              color="red" 
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="col-span-1 lg:col-span-2 space-y-6">
              <Tabs defaultValue="overview" className="w-full">
                <TabsList className="grid w-full grid-cols-3 bg-slate-900/50 p-1 border border-slate-800">
                  <TabsTrigger value="overview">Zone Heatmap</TabsTrigger>
                  <TabsTrigger value="funnel">Conversion Funnel</TabsTrigger>
                  <TabsTrigger value="alerts">System Anomalies</TabsTrigger>
                </TabsList>
                
                <TabsContent value="overview" className="mt-4 outline-none">
                  <div className="h-[500px]">
                    <Heatmap 
                      data={heatmap?.zones || []} 
                      confidence={heatmap?.data_confidence} 
                    />
                  </div>
                </TabsContent>
                
                <TabsContent value="funnel" className="mt-4 outline-none">
                  <div className="h-[500px]">
                    <FunnelChart 
                      data={funnel?.funnel_stages || []} 
                      reEntryCount={funnel?.re_entry_count}
                      groupEntryCount={funnel?.group_entry_detected}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="alerts" className="mt-4 outline-none">
                  <div className="h-[500px]">
                    <AnomalyAlerts anomalies={anomalies?.anomalies || []} />
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            <div className="col-span-1">
              <EventFeed />
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
