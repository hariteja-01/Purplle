'use client';

import { ArrowUp, ArrowDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useEffect, useState, useRef } from 'react';

interface KPICardProps {
  label: string;
  value: string | number;
  trend?: number;
  unit?: string;
  icon?: React.ReactNode;
  color?: 'cyan' | 'amber' | 'red' | 'green';
}

export function KPICard({ label, value, trend, unit, icon, color = 'cyan' }: KPICardProps) {
  const [flash, setFlash] = useState<'none' | 'increase' | 'decrease'>('none');
  const prevValueRef = useRef(value);

  const colorClasses = {
    cyan: 'text-cyan-400',
    amber: 'text-amber-400',
    red: 'text-red-400',
    green: 'text-emerald-400',
  };

  useEffect(() => {
    if (prevValueRef.current !== value) {
      const isNum = typeof value === 'number' && typeof prevValueRef.current === 'number';
      const increased = isNum ? (value as number) > (prevValueRef.current as number) : String(value) !== String(prevValueRef.current);
      
      setFlash(increased ? 'increase' : 'decrease');
      prevValueRef.current = value;
      
      const timer = setTimeout(() => setFlash('none'), 1000);
      return () => clearTimeout(timer);
    }
  }, [value]);

  const trendIsPositive = trend ? trend > 0 : false;

  const getBorderColor = () => {
    if (flash === 'increase') return 'border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.2)] bg-emerald-500/5';
    if (flash === 'decrease') return 'border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)] bg-red-500/5';
    return 'border-slate-700 bg-gradient-to-br from-slate-800 to-slate-900';
  };

  return (
    <Card className={`p-6 transition-all duration-500 ${getBorderColor()}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-slate-400">{label}</p>
          <div className="mt-2 flex items-end gap-2">
            <p className={`text-3xl font-bold ${colorClasses[color]}`}>{value}</p>
            {unit && <span className="text-slate-500">{unit}</span>}
          </div>
          {trend !== undefined && (
            <div className="mt-3 flex items-center gap-1">
              {trendIsPositive ? (
                <ArrowUp className="h-4 w-4 text-emerald-400" />
              ) : (
                <ArrowDown className="h-4 w-4 text-red-400" />
              )}
              <span className={trendIsPositive ? 'text-emerald-400' : 'text-red-400'}>
                {Math.abs(trend).toFixed(1)}%
              </span>
            </div>
          )}
        </div>
        {icon && <div className={colorClasses[color]}>{icon}</div>}
      </div>
    </Card>
  );
}
