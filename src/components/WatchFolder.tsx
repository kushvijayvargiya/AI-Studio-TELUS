import React, { useState, useEffect } from 'react';
import { FolderSearch, FileText, CheckCircle2, Clock, AlertCircle, ArrowRight, HardDrive, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';

interface IngestionEvent {
  id: string;
  fileName: string;
  customer: string;
  type: 'SOW' | 'CO' | 'DAF';
  status: 'Processing' | 'Completed' | 'Failed';
  timestamp: string;
}

export const WatchFolder: React.FC = () => {
  const [events, setEvents] = useState<IngestionEvent[]>([
    { id: '1', fileName: 'SOW_Customer_A_2024.pdf', customer: 'Customer A', type: 'SOW', status: 'Completed', timestamp: '2 mins ago' },
    { id: '2', fileName: 'CO_123_Customer_B.docx', customer: 'Customer B', type: 'CO', status: 'Processing', timestamp: 'Just now' },
    { id: '3', fileName: 'DAF_Approval_C.pdf', customer: 'Customer C', type: 'DAF', status: 'Completed', timestamp: '1 hour ago' },
  ]);

  const [isScanning, setIsScanning] = useState(false);

  const simulateScan = () => {
    setIsScanning(true);
    setTimeout(() => {
      setIsScanning(false);
      const newEvent: IngestionEvent = {
        id: Math.random().toString(36).substr(2, 9),
        fileName: `CO_${Math.floor(Math.random() * 1000)}_New_Customer.pdf`,
        customer: 'New Customer',
        type: 'CO',
        status: 'Processing',
        timestamp: 'Just now'
      };
      setEvents(prev => [newEvent, ...prev.slice(0, 4)]);
    }, 2000);
  };

  return (
    <div className="bg-bg-secondary p-8 rounded-3xl shadow-sm border border-border-primary relative overflow-hidden group">
      <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-bl-full -z-10 transition-transform group-hover:scale-110"></div>
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h3 className="text-lg font-bold text-telus-gray flex items-center">
            <FolderSearch className="w-5 h-5 mr-2 text-indigo-600" />
            Watch-Folder Orchestration
          </h3>
          <p className="text-xs text-text-secondary mt-1 font-medium italic">Monitoring: /contracts/ingestion/live</p>
        </div>
        <button 
          onClick={simulateScan}
          disabled={isScanning}
          className={cn(
            "flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border shadow-sm",
            isScanning 
              ? "bg-bg-primary text-text-secondary/50 border-border-primary cursor-not-allowed" 
              : "bg-bg-primary text-indigo-500 border-indigo-500/30 hover:bg-indigo-500/10 hover:border-indigo-500/50 active:scale-95"
          )}
        >
          <RefreshCw className={cn("w-3.5 h-3.5", isScanning && "animate-spin")} />
          <span>{isScanning ? 'Scanning...' : 'Scan Now'}</span>
        </button>
      </div>

      <div className="space-y-4">
        {events.map((event) => (
          <div key={event.id} className="flex items-center justify-between p-4 rounded-2xl bg-bg-primary/50 border border-border-primary hover:border-indigo-500/30 transition-all group/item">
            <div className="flex items-center space-x-4 min-w-0">
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                event.type === 'SOW' ? "bg-indigo-500/10 text-indigo-500" :
                event.type === 'CO' ? "bg-blue-500/10 text-blue-500" :
                "bg-emerald-500/10 text-emerald-500"
              )}>
                <FileText className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center space-x-2">
                  <p className="text-sm font-bold text-telus-gray truncate">{event.fileName}</p>
                  <span className="text-[9px] font-black uppercase tracking-widest text-text-secondary/50 bg-bg-secondary px-1.5 py-0.5 rounded border border-border-primary">{event.type}</span>
                </div>
                <p className="text-[10px] text-text-secondary font-medium">Customer: {event.customer} • {event.timestamp}</p>
              </div>
            </div>
            <div className="flex items-center space-x-3 shrink-0">
              <div className={cn(
                "flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border shadow-sm",
                event.status === 'Completed' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
                event.status === 'Processing' ? "bg-amber-500/10 text-amber-500 border-amber-500/20" :
                "bg-rose-500/10 text-rose-500 border-rose-500/20"
              )}>
                {event.status === 'Processing' && <RefreshCw className="w-3 h-3 animate-spin" />}
                {event.status === 'Completed' && <CheckCircle2 className="w-3 h-3" />}
                {event.status === 'Failed' && <AlertCircle className="w-3 h-3" />}
                <span>{event.status}</span>
              </div>
              <button className="p-2 text-text-secondary/50 hover:text-indigo-500 hover:bg-bg-secondary rounded-lg transition-all opacity-0 group-hover/item:opacity-100 shadow-sm">
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 p-4 rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-500/20 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-bl-full -z-10"></div>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <HardDrive className="w-5 h-5 text-indigo-200" />
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-indigo-200">System Status</p>
              <p className="text-sm font-bold">Cognitive Engine Active</p>
            </div>
          </div>
          <div className="flex items-center space-x-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
            <span className="text-[10px] font-bold uppercase tracking-widest">Live</span>
          </div>
        </div>
      </div>
    </div>
  );
};
