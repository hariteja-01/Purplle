'use client';

import { Card } from '@/components/ui/card';
import { FunnelStage } from '@/lib/types';
import { Users, LogIn } from 'lucide-react';

interface FunnelChartProps {
  data: FunnelStage[];
  title?: string;
  reEntryCount?: number;
  groupEntryCount?: number;
}

export function FunnelChart({ data, title = 'Conversion Funnel', reEntryCount = 0, groupEntryCount = 0 }: FunnelChartProps) {
  // Use entry stage count as max width reference
  const maxCount = data.length > 0 ? Math.max(data[0].count, 1) : 1;

  return (
    <Card className="border-slate-700 bg-gradient-to-br from-slate-800 to-slate-900 p-6 h-full flex flex-col">
      <h3 className="mb-6 text-lg font-semibold text-cyan-400">{title}</h3>
      <div className="space-y-4 flex-1">
        {data.map((stage, index) => {
          const width = (stage.count / maxCount) * 100;
          return (
            <div key={index} className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-300">{stage.stage}</span>
                <div className="flex gap-4 text-xs text-slate-400 items-center">
                  <span>{stage.count.toLocaleString()}</span>
                  {index > 0 && (
                    <span className="text-amber-400/80 bg-amber-400/10 px-1.5 rounded text-[10px]">
                      -{stage.drop_off_pct.toFixed(1)}% drop
                    </span>
                  )}
                </div>
              </div>
              <div className="h-8 overflow-hidden rounded bg-slate-800 border border-slate-700/50">
                <div 
                  className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400 transition-all duration-1000 ease-out" 
                  style={{ width: `${Math.max(width, 1)}%` }} 
                />
              </div>
            </div>
          );
        })}
      </div>
      
      <div className="mt-6 pt-4 border-t border-slate-800 grid grid-cols-2 gap-4">
        <div className="flex items-center gap-3 bg-slate-900/50 p-3 rounded-lg border border-slate-800">
          <div className="p-2 bg-purple-500/10 rounded-md">
            <LogIn className="h-4 w-4 text-purple-400" />
          </div>
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider">Re-entries</p>
            <p className="text-lg font-bold text-slate-200">{reEntryCount}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-slate-900/50 p-3 rounded-lg border border-slate-800">
          <div className="p-2 bg-blue-500/10 rounded-md">
            <Users className="h-4 w-4 text-blue-400" />
          </div>
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider">Group Entries</p>
            <p className="text-lg font-bold text-slate-200">{groupEntryCount}</p>
          </div>
        </div>
      </div>
    </Card>
  );
}
