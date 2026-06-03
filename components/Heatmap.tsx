'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { HeatmapZone } from '@/lib/types';

interface HeatmapProps {
  data: HeatmapZone[];
  title?: string;
  confidence?: 'HIGH' | 'LOW';
}

export function Heatmap({ data, title = 'Store Heatmap', confidence = 'LOW' }: HeatmapProps) {
  // Store layout approximation
  const layoutOrder = [
    'ENTRY', // Usually ignored in data, but here for layout reference
    'SKINCARE', 'MOISTURISER', 
    'MAKEUP', 'FRAGRANCE',
    'BILLING'
  ];

  const getIntensityColor = (score: number) => {
    // Score is 0-100. Map to a color scale from blue(cool) to red(hot)
    // Low: slate-800 (0) -> Blue-500 (25) -> Green-500 (50) -> Yellow-500 (75) -> Red-500 (100)
    if (score === 0) return 'bg-slate-800 border-slate-700';
    if (score < 25) return 'bg-blue-900/40 border-blue-800/50 text-blue-100';
    if (score < 50) return 'bg-emerald-900/50 border-emerald-800/50 text-emerald-100';
    if (score < 75) return 'bg-amber-900/50 border-amber-800/50 text-amber-100';
    return 'bg-red-900/50 border-red-800/50 text-red-100 shadow-[0_0_15px_rgba(239,68,68,0.2)]';
  };

  const getZoneData = (zoneId: string) => {
    return data.find(z => z.zone_id === zoneId);
  };

  return (
    <Card className="border-slate-700 bg-gradient-to-br from-slate-800 to-slate-900 p-6 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-semibold text-cyan-400">{title}</h3>
        <Badge variant="outline" className={confidence === 'HIGH' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}>
          {confidence === 'HIGH' ? 'High Confidence' : 'Low Data Volume'}
        </Badge>
      </div>

      <div className="flex-1 flex items-center justify-center">
        {/* Abstract Store Layout */}
        <div className="grid grid-cols-2 gap-4 w-full max-w-md">
          {/* Top Row - Entrance / Billing */}
          <div className="col-span-1 p-4 rounded-xl bg-slate-900/50 border border-slate-800 flex items-center justify-center opacity-50">
            <span className="text-slate-500 font-medium">ENTRANCE</span>
          </div>
          
          {(() => {
            const z = getZoneData('BILLING');
            return (
              <div className={`col-span-1 p-4 rounded-xl border transition-all duration-700 flex flex-col justify-center items-center ${getIntensityColor(z?.normalized_score || 0)}`}>
                <span className="font-semibold mb-1">BILLING</span>
                <span className="text-2xl font-bold">{z?.visit_count || 0}</span>
                <span className="text-xs opacity-70">Avg {Math.round((z?.avg_dwell_ms || 0)/1000)}s</span>
              </div>
            );
          })()}

          {/* Middle Row */}
          {(() => {
            const z = getZoneData('SKINCARE');
            return (
              <div className={`col-span-1 p-4 rounded-xl border transition-all duration-700 flex flex-col justify-center items-center ${getIntensityColor(z?.normalized_score || 0)}`}>
                <span className="font-semibold mb-1 text-sm">SKINCARE</span>
                <span className="text-2xl font-bold">{z?.visit_count || 0}</span>
                <span className="text-xs opacity-70">Avg {Math.round((z?.avg_dwell_ms || 0)/1000)}s</span>
              </div>
            );
          })()}
          
          {(() => {
            const z = getZoneData('MOISTURISER');
            return (
              <div className={`col-span-1 p-4 rounded-xl border transition-all duration-700 flex flex-col justify-center items-center ${getIntensityColor(z?.normalized_score || 0)}`}>
                <span className="font-semibold mb-1 text-sm">MOISTURISER</span>
                <span className="text-2xl font-bold">{z?.visit_count || 0}</span>
                <span className="text-xs opacity-70">Avg {Math.round((z?.avg_dwell_ms || 0)/1000)}s</span>
              </div>
            );
          })()}

          {/* Bottom Row */}
          {(() => {
            const z = getZoneData('MAKEUP');
            return (
              <div className={`col-span-1 p-4 rounded-xl border transition-all duration-700 flex flex-col justify-center items-center ${getIntensityColor(z?.normalized_score || 0)}`}>
                <span className="font-semibold mb-1 text-sm">MAKEUP</span>
                <span className="text-2xl font-bold">{z?.visit_count || 0}</span>
                <span className="text-xs opacity-70">Avg {Math.round((z?.avg_dwell_ms || 0)/1000)}s</span>
              </div>
            );
          })()}
          
          {(() => {
            const z = getZoneData('FRAGRANCE');
            return (
              <div className={`col-span-1 p-4 rounded-xl border transition-all duration-700 flex flex-col justify-center items-center ${getIntensityColor(z?.normalized_score || 0)}`}>
                <span className="font-semibold mb-1 text-sm">FRAGRANCE</span>
                <span className="text-2xl font-bold">{z?.visit_count || 0}</span>
                <span className="text-xs opacity-70">Avg {Math.round((z?.avg_dwell_ms || 0)/1000)}s</span>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-6 flex items-center justify-between text-xs text-slate-400 border-t border-slate-800 pt-4">
        <span>Low Activity</span>
        <div className="flex-1 mx-4 h-2 rounded-full bg-gradient-to-r from-slate-800 via-emerald-900 to-red-900" />
        <span>High Activity</span>
      </div>
    </Card>
  );
}
