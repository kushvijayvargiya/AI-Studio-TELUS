import React, { useMemo, useState } from 'react';
import { ContractAnalysisResult, ServiceDetail } from '../lib/gemini';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell, AreaChart, Area } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Calendar } from 'lucide-react';
import { startOfMonth } from 'date-fns';
import { RevenueTrendGraph } from './RevenueTrendGraph';
import { calculateRevenueForMonth } from '../lib/contractUtils';
import { parseAmount } from '../lib/utils';

const formatCurrency = (val: number) => 
  new Intl.NumberFormat('en-US', { 
    style: 'currency', 
    currency: 'USD',
    notation: 'compact'
  }).format(val);

export const RevenueWaterfall: React.FC<{ result: ContractAnalysisResult }> = ({ result }) => {
  const [currentDate, setCurrentDate] = useState(startOfMonth(new Date()));
  
  const waterfallData = useMemo(() => {
    const months = 24;
    const data = [];
    
    for (let i = 0; i < months; i++) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth() + i, 1);
      const monthLabel = date.toLocaleString('default', { month: 'short', year: '2-digit' });
      
      const monthlyRevenue = calculateRevenueForMonth(result, date, 'Customer', true);
      
      data.push({
        month: monthLabel,
        revenue: monthlyRevenue,
        timestamp: date.getTime()
      });
    }
    
    return data;
  }, [result, currentDate]);

  const totalCurrentRevenue = waterfallData[0]?.revenue || 0;
  const revenueAtEnd = waterfallData[waterfallData.length - 1]?.revenue || 0;
  const dropOff = totalCurrentRevenue - revenueAtEnd;
  const dropOffPercent = totalCurrentRevenue > 0 ? (dropOff / totalCurrentRevenue) * 100 : 0;

  return (
    <div className="space-y-6">
      <RevenueTrendGraph 
        result={result} 
        currentDate={currentDate} 
        setCurrentDate={setCurrentDate} 
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="telus-card p-4 hover:shadow-md transition-shadow group relative overflow-hidden bg-bg-primary">
          <div className="absolute top-0 right-0 w-32 h-32 bg-bg-secondary rounded-bl-full -z-10 transition-transform group-hover:scale-110"></div>
          <div className="flex items-center space-x-2 mb-3">
            <div className="p-1.5 bg-bg-secondary rounded-lg">
              <DollarSign className="w-4 h-4 text-text-secondary" />
            </div>
            <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">Current Monthly Revenue</p>
          </div>
          <p className="text-xl font-black text-telus-gray tracking-tight">{formatCurrency(totalCurrentRevenue)}</p>
        </div>
        <div className="telus-card p-4 hover:shadow-md transition-shadow group relative overflow-hidden bg-bg-primary">
          <div className="absolute top-0 right-0 w-32 h-32 bg-bg-secondary rounded-bl-full -z-10 transition-transform group-hover:scale-110"></div>
          <div className="flex items-center space-x-2 mb-3">
            <div className="p-1.5 bg-bg-secondary rounded-lg">
              <Calendar className="w-4 h-4 text-text-secondary" />
            </div>
            <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">Revenue in 24 Months</p>
          </div>
          <p className="text-xl font-black text-telus-gray tracking-tight">{formatCurrency(revenueAtEnd)}</p>
        </div>
        <div className="telus-card p-4 border-rose-500/20 bg-rose-500/5 hover:shadow-md transition-shadow group relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/10 rounded-bl-full -z-10 transition-transform group-hover:scale-110"></div>
          <div className="flex items-center space-x-2 mb-3">
            <div className="p-1.5 bg-rose-500/10 rounded-lg">
              <TrendingDown className="w-4 h-4 text-rose-500" />
            </div>
            <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest">Revenue Drop-off (Churn Risk)</p>
          </div>
          <div className="flex items-center space-x-2">
            <p className="text-xl font-black text-rose-500 tracking-tight">{formatCurrency(dropOff)}</p>
            <span className="px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-500 text-[10px] font-bold border border-rose-500/20 shadow-sm">
              -{dropOffPercent.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      <div className="telus-card p-8 hover:shadow-md transition-shadow bg-bg-primary">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-6 border-b border-border-primary">
          <div>
            <h3 className="text-xl font-bold text-telus-gray flex items-center">
              <div className="p-1.5 bg-indigo-500/10 rounded-lg mr-3">
                <TrendingDown className="w-5 h-5 text-indigo-500" />
              </div>
              24-Month Revenue Waterfall
            </h3>
            <p className="text-sm text-text-secondary mt-2 font-medium">
              Projected monthly recurring revenue based on contract expiry dates.
            </p>
          </div>
          <div className="flex items-center space-x-4 text-xs font-bold text-text-secondary uppercase tracking-widest bg-bg-secondary px-4 py-2 rounded-xl border border-border-primary">
            <div className="flex items-center">
              <div className="w-3 h-3 bg-indigo-500 rounded-full mr-2 shadow-sm" />
              <span>Projected Revenue</span>
            </div>
          </div>
        </div>
        
        <div className="h-[350px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={waterfallData}>
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
                tick={{ fill: 'var(--chart-text)', fontSize: 10, fontWeight: 600 }}
                dy={10}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: 'var(--chart-text)', fontSize: 10, fontWeight: 600 }}
                tickFormatter={(val) => `$${val/1000}k`}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'var(--bg-secondary)', 
                  borderRadius: '12px', 
                  border: '1px solid var(--border-primary)',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  color: 'var(--telus-gray)'
                }}
                itemStyle={{ color: 'var(--telus-gray)' }}
                formatter={(val: number) => [formatCurrency(val), 'Revenue']}
              />
              <Area 
                type="monotone" 
                dataKey="revenue" 
                stroke="#6366f1" 
                strokeWidth={3}
                fillOpacity={1} 
                fill="url(#colorRevenue)" 
                animationDuration={1500}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
