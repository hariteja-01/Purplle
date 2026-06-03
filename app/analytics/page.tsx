'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Header } from '@/components/Header';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Store } from '@/lib/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function AnalyticsPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStore, setSelectedStore] = useState<string>('');
  const [funnelData, setFunnelData] = useState<any[]>([]);
  
  useEffect(() => {
    const fetchStores = async () => {
      try {
        const res = await fetch('/api/stores');
        if (res.ok) {
          const data = await res.json();
          setStores(data.stores);
          if (data.stores.length > 0) setSelectedStore(data.stores[0].store_id);
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchStores();
  }, []);

  useEffect(() => {
    if (!selectedStore) return;
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/stores/${selectedStore}/funnel`);
        if (res.ok) {
          const data = await res.json();
          setFunnelData(data.funnel_stages.map((stage: any) => ({
            name: stage.stage,
            visitors: stage.count
          })));
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchData();
  }, [selectedStore]);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <Header />
      
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h1 className="text-2xl font-bold text-white tracking-tight">Historical Analytics</h1>
            <Select value={selectedStore} onValueChange={setSelectedStore}>
              <SelectTrigger className="w-[280px] bg-slate-900 border-slate-700">
                <SelectValue placeholder="Select Store" />
              </SelectTrigger>
              <SelectContent>
                {stores.map((store) => (
                  <SelectItem key={store.store_id} value={store.store_id}>
                    {store.name} ({store.store_id})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-6">
            <Card className="border-slate-700 bg-slate-900/50 p-6 h-[500px]">
              <h3 className="text-lg font-medium text-slate-200 mb-6">Traffic by Stage</h3>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funnelData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="name" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip 
                    cursor={{fill: '#1e293b'}}
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc' }}
                  />
                  <Bar dataKey="visitors" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
