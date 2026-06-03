'use client';

import { useEffect, useState, useRef } from 'react';
import { StoreEvent } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

export function EventFeed() {
  const [events, setEvents] = useState<StoreEvent[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const res = await fetch('/api/events/recent');
        if (res.ok) {
          const data = await res.json();
          setEvents(data.events);
        }
      } catch (err) {
        console.error('Failed to fetch recent events:', err);
      }
    };

    fetchEvents();
    const interval = setInterval(fetchEvents, 3000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll to top (since events are sorted DESC, newest at top)
  useEffect(() => {
    // If we wanted newest at bottom we would scroll to bottom
    // Since API returns ORDER BY timestamp DESC, newest is at the top
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [events]);

  const getEventColor = (type: string) => {
    switch (type) {
      case 'ENTRY': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'EXIT': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'ZONE_ENTER': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'ZONE_EXIT': return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
      case 'ZONE_DWELL': return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';
      case 'BILLING_QUEUE_JOIN': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'BILLING_QUEUE_ABANDON': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'REENTRY': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      default: return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <Card className="border-slate-700 bg-gradient-to-br from-slate-800 to-slate-900 p-6 flex flex-col h-[500px]">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-cyan-400">Live Event Feed</h3>
        <span className="text-xs text-slate-500">Last 20 events</span>
      </div>
      
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent"
      >
        {events.length === 0 ? (
          <div className="text-center text-slate-500 mt-10">No recent events</div>
        ) : (
          events.map((event) => (
            <div 
              key={event.event_id} 
              className="p-3 rounded-lg bg-slate-900/50 border border-slate-800 text-sm flex flex-col gap-2 transition-all animate-in fade-in slide-in-from-top-2"
            >
              <div className="flex justify-between items-start">
                <Badge variant="outline" className={`${getEventColor(event.event_type)} font-mono text-[10px]`}>
                  {event.event_type}
                </Badge>
                <span className="text-slate-500 text-xs">
                  {new Date(event.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
              
              <div className="flex justify-between items-center mt-1">
                <span className="font-mono text-slate-300 text-xs">{event.visitor_id}</span>
                <div className="flex items-center gap-2">
                  {event.is_staff && (
                    <Badge variant="outline" className="text-[9px] bg-slate-800 text-slate-400 border-slate-700 h-4 px-1">STAFF</Badge>
                  )}
                  <span className="text-slate-400 text-xs truncate max-w-[100px] text-right">
                    {event.zone_id}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
