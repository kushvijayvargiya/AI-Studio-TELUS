import React, { useMemo } from 'react';
import { ContractAnalysisResult, ServiceDetail } from '../lib/gemini';
import { format, addMonths, isBefore, isAfter, startOfMonth, endOfMonth, isSameMonth, subMonths, setYear, getYear } from 'date-fns';
import { TrendingUp, Info, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, RotateCcw } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { parseAmount } from '../lib/utils';
import { hasCancellationCO, parseDate } from '../lib/contractUtils';

interface RevenueTrendGraphProps {
  result: ContractAnalysisResult;
  currentDate: Date;
  setCurrentDate: (date: Date) => void;
}

import { calculateRevenueForMonth } from '../lib/contractUtils';

export const RevenueTrendGraph: React.FC<RevenueTrendGraphProps> = ({ result, currentDate, setCurrentDate }) => {
  const trendData = useMemo(() => {
    const data = [];
    const start = subMonths(startOfMonth(currentDate), 6);
    const today = startOfMonth(new Date());
    
    for (let i = 0; i < 13; i++) {
      const targetMonth = addMonths(start, i);
      const targetMonthStart = startOfMonth(targetMonth);
      
      // Use forecast logic for future months
      const isFuture = isAfter(targetMonthStart, today) || isSameMonth(targetMonthStart, today);
      const total = calculateRevenueForMonth(result, targetMonth, 'Customer', isFuture);

      data.push({
        month: format(targetMonth, 'MMM yy'),
        fullMonth: format(targetMonth, 'MMMM yyyy'),
        revenue: total,
        isCurrent: isSameMonth(targetMonth, currentDate)
      });
    }
    return data;
  }, [result, currentDate]);

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-US', { 
    style: 'currency', 
    currency: 'USD',
    notation: 'compact'
  }).format(val);

  return (
    <div className="telus-card overflow-hidden bg-bg-primary">
      {/* Header & Navigation */}
      <div className="px-6 sm:px-8 py-6 border-b border-border-primary flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <h3 className="text-xl font-bold text-telus-gray flex items-center">
            <div className="p-1.5 bg-indigo-500/10 rounded-lg mr-3">
              <TrendingUp className="w-5 h-5 text-indigo-500" />
            </div>
            Revenue Trend & Forecast
          </h3>
          <p className="text-sm text-text-secondary mt-1 font-medium">
            Historical and projected revenue based on contract dates.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 bg-bg-secondary p-1.5 rounded-2xl border border-border-primary shadow-sm">
            <div className="flex items-center border-r border-border-primary pr-1 mr-1">
              <button 
                onClick={() => setCurrentDate(setYear(currentDate, getYear(currentDate) - 1))}
                title="Previous Year"
                className="p-2 hover:bg-bg-primary hover:shadow-sm rounded-lg transition-all text-text-secondary/50 hover:text-indigo-500"
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setCurrentDate(addMonths(currentDate, -1))}
                title="Previous Month"
                className="p-2 hover:bg-bg-primary hover:shadow-sm rounded-lg transition-all text-text-secondary/50 hover:text-indigo-500"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col items-center min-w-[120px]">
              <span className="font-bold text-telus-gray tracking-tight text-sm leading-none">
                {format(currentDate, 'MMMM')}
              </span>
              <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest mt-1">
                {format(currentDate, 'yyyy')}
              </span>
            </div>

            <div className="flex items-center border-l border-border-primary pl-1 ml-1">
              <button 
                onClick={() => setCurrentDate(addMonths(currentDate, 1))}
                title="Next Month"
                className="p-2 hover:bg-bg-primary hover:shadow-sm rounded-lg transition-all text-text-secondary/50 hover:text-indigo-500"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setCurrentDate(setYear(currentDate, getYear(currentDate) + 1))}
                title="Next Year"
                className="p-2 hover:bg-bg-primary hover:shadow-sm rounded-lg transition-all text-text-secondary/50 hover:text-indigo-500"
              >
                <ChevronsRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <button 
            onClick={() => setCurrentDate(startOfMonth(new Date()))}
            title="Reset to Today"
            className="p-3 bg-bg-secondary hover:bg-bg-primary rounded-xl transition-colors text-text-secondary"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Chart Area */}
      <div className="p-6 sm:p-8 bg-bg-secondary/20">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center">
            <div className="flex items-center space-x-4 text-[10px] font-bold text-text-secondary/50 uppercase tracking-widest">
              <div className="flex items-center">
                <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 mr-2 shadow-sm"></div>
                <span>Projected Revenue</span>
              </div>
            </div>
            <div className="group relative ml-4">
              <Info className="w-4 h-4 text-text-secondary/30 cursor-help hover:text-indigo-400 transition-colors" />
              <div className="absolute bottom-full left-0 mb-3 w-72 p-4 bg-bg-secondary text-telus-gray text-[11px] rounded-2xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-[150] pointer-events-none leading-relaxed border border-border-primary backdrop-blur-xl">
                <p className="font-bold mb-2 uppercase tracking-wider text-indigo-400 text-[10px]">Trend Intelligence</p>
                This chart visualizes historical and projected revenue based on contract effective dates, renewals, and planned expansions. Use the navigation controls above to explore different time periods.
              </div>
            </div>
          </div>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trendData}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
              <XAxis 
                dataKey="month" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fontWeight: 700, fill: 'var(--chart-text)' }}
                dy={10}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fontWeight: 700, fill: 'var(--chart-text)' }}
                tickFormatter={(val) => `$${val/1000}k`}
              />
              <Tooltip 
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-bg-secondary text-telus-gray p-4 rounded-2xl shadow-2xl border border-border-primary backdrop-blur-xl">
                        <p className="text-[10px] font-black uppercase tracking-widest text-text-secondary/50 mb-2">{data.fullMonth}</p>
                        <p className="text-xl font-black text-telus-gray">
                          {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(data.revenue)}
                        </p>
                        {data.isCurrent && (
                          <div className="mt-2 inline-flex items-center px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-500 text-[9px] font-bold uppercase tracking-wider border border-indigo-500/20">
                            Current Month
                          </div>
                        )}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area 
                type="monotone" 
                dataKey="revenue" 
                stroke="#6366f1" 
                strokeWidth={4}
                fillOpacity={1} 
                fill="url(#colorRevenue)" 
                activeDot={{ r: 8, strokeWidth: 0, fill: '#4f46e5' }}
                dot={({ cx, cy, payload }) => {
                  if (payload.isCurrent) {
                    return (
                      <g>
                        <circle cx={cx} cy={cy} r={10} fill="#6366f1" fillOpacity={0.2} />
                        <circle cx={cx} cy={cy} r={6} fill="#4f46e5" stroke="#fff" strokeWidth={2} />
                      </g>
                    );
                  }
                  return null;
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
