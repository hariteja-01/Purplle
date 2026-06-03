'use client';

import { AlertCircle, TrendingDown, AlertTriangle, Zap, CameraOff, Users } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Anomaly } from '@/lib/types';

interface AnomalyAlertsProps {
  anomalies: Anomaly[];
  title?: string;
}

export function AnomalyAlerts({ anomalies, title = 'Real-Time Anomalies' }: AnomalyAlertsProps) {
  const severityStyles = {
    INFO: 'bg-blue-900/40 text-blue-300 border-blue-700/50',
    WARN: 'bg-amber-900/40 text-amber-300 border-amber-700/50',
    CRITICAL: 'bg-red-900/40 text-red-300 border-red-700/50 shadow-[0_0_10px_rgba(239,68,68,0.2)]',
  };

  const typeIcons = {
    QUEUE_SPIKE: <Users className="h-5 w-5" />,
    CONVERSION_DROP: <TrendingDown className="h-5 w-5" />,
    DEAD_ZONE: <CameraOff className="h-5 w-5" />,
  };

  const formatValue = (type: string, val: number) => {
    if (type === 'CONVERSION_DROP') return `${val}%`;
    return val;
  };

  return (
    <Card className="border-slate-700 bg-gradient-to-br from-slate-800 to-slate-900 p-6 h-full flex flex-col">
      <h3 className="mb-4 text-lg font-semibold text-cyan-400">{title}</h3>
      <div className="space-y-3 flex-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-700">
        {anomalies.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full opacity-50 text-slate-400">
            <Zap className="h-8 w-8 mb-2" />
            <p>No anomalies detected</p>
          </div>
        ) : (
          anomalies.map((anomaly) => (
            <div 
              key={anomaly.anomaly_id} 
              className={`rounded-lg border p-4 transition-all duration-500 animate-in fade-in slide-in-from-right-4 ${severityStyles[anomaly.severity]}`}
            >
              <div className="flex items-start gap-4">
                <div className="mt-1 bg-black/20 p-2 rounded-lg">
                  {typeIcons[anomaly.type] || <AlertCircle className="h-5 w-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <Badge variant="outline" className={`text-[10px] uppercase border-current bg-black/20`}>
                      {anomaly.type.replace('_', ' ')}
                    </Badge>
                    <span className="text-xs opacity-70">
                      {new Date(anomaly.detected_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  
                  <div className="mt-2 text-sm">
                    {anomaly.type === 'QUEUE_SPIKE' && (
                      <p>Queue depth spiked to <strong className="font-bold">{anomaly.current_value}</strong> (Expected: {anomaly.expected_value})</p>
                    )}
                    {anomaly.type === 'CONVERSION_DROP' && (
                      <p>Conversion dropped to <strong className="font-bold">{anomaly.current_value}%</strong> (7-day avg: {anomaly.expected_value}%)</p>
                    )}
                    {anomaly.type === 'DEAD_ZONE' && (
                      <p>No activity detected in <strong className="font-bold">{anomaly.affected_zone}</strong> for 30 minutes</p>
                    )}
                  </div>
                  
                  <div className="mt-3 pt-3 border-t border-current/20 flex items-start gap-2">
                    <span className="text-[10px] uppercase tracking-wider opacity-70 mt-0.5">Action:</span>
                    <p className="text-xs font-medium">{anomaly.suggested_action}</p>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
