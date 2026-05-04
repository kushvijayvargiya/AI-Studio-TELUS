import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer, 
  LineChart, 
  Line,
  ComposedChart,
  Area
} from 'recharts';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Calendar, 
  Target, 
  ArrowUpRight, 
  ArrowDownRight, 
  Save,
  ChevronLeft,
  ChevronRight,
  Info
} from 'lucide-react';
import { CustomerSummary, getMonthlyActuals, getPortfolioBudget, savePortfolioBudget, getAllPortfolioBudgets } from '../lib/db';
import { calculateRevenueForMonth } from '../lib/contractUtils';
import { format, subMonths, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { cn, formatCurrency, parseAmount } from '../lib/utils';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Card } from './ui/Card';
import { useToast } from './ui/Toast';

interface BudgetVsActualsProps {
  customers: CustomerSummary[];
}

interface MonthlyData {
  month: string; // yyyy-MM
  monthLabel: string; // MMM yyyy
  actual: number;
  budget: number;
  variance: number;
  variancePercent: number;
}

export const BudgetVsActuals: React.FC<BudgetVsActualsProps> = ({ customers }) => {
  const { showToast } = useToast();
  const [selectedPartner, setSelectedPartner] = useState<string>('All Partners');
  const [historicalData, setHistoricalData] = useState<MonthlyData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Budget entry state
  const [currentBudgetInput, setCurrentBudgetInput] = useState<string>('');
  const [isAnnual, setIsAnnual] = useState(false);
  
  const now = new Date();
  const currentMonthStr = format(now, 'yyyy-MM');
  
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth());
  
  const years = useMemo(() => {
    const currentYear = now.getFullYear();
    return [currentYear - 1, currentYear, currentYear + 1];
  }, []);

  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  const partners = useMemo(() => {
    const p = new Set<string>();
    customers.forEach(c => {
      if (c.partnerName) p.add(c.partnerName);
    });
    return ['All Partners', ...Array.from(p).sort()];
  }, [customers]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const currentYear = now.getFullYear();
      const startOfYear = new Date(currentYear, 0, 1);
      
      // Calculate how many months to show: at least 6, but also all months of current year
      const monthsSinceJan = now.getMonth() + 1;
      const monthsToShow = Math.max(6, monthsSinceJan);
      
      const months = Array.from({ length: monthsToShow }, (_, i) => subMonths(now, (monthsToShow - 1) - i));
      const data: MonthlyData[] = [];

      for (const monthDate of months) {
        const monthStr = format(monthDate, 'yyyy-MM');
        const monthLabel = format(monthDate, 'MMM yyyy');
        
        let totalActual = 0;
        
        // Filter customers by partner
        const filteredCustomers = selectedPartner === 'All Partners' 
          ? customers 
          : customers.filter(c => c.partnerName === selectedPartner);

        for (const customer of filteredCustomers) {
          // 1. Try to get actuals for this month
          const actualsData = await getMonthlyActuals(customer.id, monthStr);
          
          if (actualsData && Object.keys(actualsData.actuals).length > 0) {
            // Calculate revenue based on actual quantities
            // We need to match service names from contract with actuals
            const result = customer.result;
            let customerRevenue = 0;
            
            const services = result.customerServices || [];
            services.forEach(s => {
              const actualQty = actualsData.actuals[s.serviceName];
              const unitPrice = parseAmount(s.unitPrice);
              
              if (actualQty !== undefined) {
                customerRevenue += actualQty * unitPrice;
              } else {
                // Fallback to contracted quantity for this specific service
                const contractedQty = parseAmount(s.totalQuantity);
                customerRevenue += contractedQty * unitPrice;
              }
            });
            
            totalActual += customerRevenue;
          } else {
            // 2. Fallback to contracted amounts (entire month)
            totalActual += calculateRevenueForMonth(customer.result, monthDate, 'Customer');
          }
        }

        // 3. Get budget for this month
        const budgetRecord = await getPortfolioBudget(selectedPartner, monthStr);
        const budget = budgetRecord?.budget || 0;
        
        const variance = totalActual - budget;
        const variancePercent = budget > 0 ? (variance / budget) * 100 : 0;

        data.push({
          month: monthStr,
          monthLabel,
          actual: totalActual,
          budget,
          variance,
          variancePercent
        });
      }

      setHistoricalData(data);
      
      // Set current budget input from the latest month in data
      const currentMonthData = data.find(d => d.month === currentMonthStr);
      if (currentMonthData) {
        setCurrentBudgetInput(currentMonthData.budget.toString());
      } else {
        setCurrentBudgetInput('0');
      }

    } catch (err) {
      console.error("Error loading budget vs actuals data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedPartner, customers]);

  const handleSaveBudget = async () => {
    const budgetValue = parseFloat(currentBudgetInput);
    if (isNaN(budgetValue)) {
      showToast("Please enter a valid number for the budget.", "error");
      return;
    }

    const finalBudget = isAnnual ? budgetValue / 12 : budgetValue;
    
    try {
      if (isAnnual) {
        // Save for all 12 months of the selected year
        const savePromises = Array.from({ length: 12 }, (_, i) => {
          const monthStr = `${selectedYear}-${String(i + 1).padStart(2, '0')}`;
          return savePortfolioBudget(selectedPartner, monthStr, finalBudget);
        });
        await Promise.all(savePromises);
        showToast(`Annual budget of ${formatCurrency(budgetValue)} distributed across ${selectedYear} successfully.`, "success");
      } else {
        const monthStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
        await savePortfolioBudget(selectedPartner, monthStr, finalBudget);
        showToast(`Budget for ${months[selectedMonth]} ${selectedYear} saved successfully.`, "success");
      }
      loadData();
    } catch (err) {
      showToast("Failed to save budget.", "error");
    }
  };

  const ytdData = useMemo(() => {
    const currentYear = now.getFullYear();
    const monthsInYear = historicalData.filter(d => d.month.startsWith(String(currentYear)));
    
    if (monthsInYear.length === 0) return null;

    const totalActual = monthsInYear.reduce((acc, curr) => acc + curr.actual, 0);
    const totalBudget = monthsInYear.reduce((acc, curr) => acc + curr.budget, 0);
    const variance = totalActual - totalBudget;
    const variancePercent = totalBudget > 0 ? (variance / totalBudget) * 100 : 0;

    return {
      totalActual,
      totalBudget,
      variance,
      variancePercent,
      months: monthsInYear
    };
  }, [historicalData]);

  const lastThreeMonthsVariance = useMemo(() => {
    if (historicalData.length < 3) return null;
    const last3 = historicalData.slice(-3);
    const avgVariancePercent = last3.reduce((acc, curr) => acc + curr.variancePercent, 0) / 3;
    const totalActual = last3.reduce((acc, curr) => acc + curr.actual, 0);
    const totalBudget = last3.reduce((acc, curr) => acc + curr.budget, 0);
    const overallVariancePercent = totalBudget > 0 ? ((totalActual - totalBudget) / totalBudget) * 100 : 0;
    
    return {
      avg: avgVariancePercent,
      overall: overallVariancePercent,
      isPositive: overallVariancePercent >= 0
    };
  }, [historicalData]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-bg-secondary p-4 rounded-2xl shadow-xl border border-border-primary animate-in fade-in zoom-in-95 duration-200">
          <p className="text-xs font-black text-text-secondary uppercase tracking-widest mb-2">{label}</p>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-8">
              <span className="text-sm font-bold text-text-secondary">Actual:</span>
              <span className="text-sm font-black text-telus-purple">{formatCurrency(payload[0].value)}</span>
            </div>
            <div className="flex items-center justify-between gap-8">
              <span className="text-sm font-bold text-text-secondary">Budget:</span>
              <span className="text-sm font-black text-telus-green">{formatCurrency(payload[1].value)}</span>
            </div>
            <div className="pt-1.5 mt-1.5 border-t border-border-primary flex items-center justify-between gap-8">
              <span className="text-sm font-bold text-text-secondary">Variance:</span>
              <span className={cn(
                "text-sm font-black",
                payload[0].value >= payload[1].value ? "text-emerald-500" : "text-rose-500"
              )}>
                {payload[0].value >= payload[1].value ? '+' : ''}{formatCurrency(payload[0].value - payload[1].value)}
                <span className="text-[10px] ml-1">
                  ({((payload[0].value - payload[1].value) / (payload[1].value || 1) * 100).toFixed(1)}%)
                </span>
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-8">
      {/* Header & Partner Selection */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black text-telus-gray flex items-center">
            <TrendingUp className="w-8 h-8 mr-4 text-telus-purple" />
            Portfolio Budget vs Actuals
          </h2>
          <p className="text-text-secondary mt-1 font-medium">6-month historical comparison and budget management</p>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="w-64">
            <p className="text-[10px] font-black text-text-secondary uppercase tracking-widest mb-2 px-1">Select Partner</p>
            <select 
              value={selectedPartner}
              onChange={(e) => setSelectedPartner(e.target.value)}
              className="w-full px-4 py-2.5 bg-bg-secondary border border-border-primary rounded-xl text-sm font-bold text-telus-gray focus:outline-none focus:ring-2 focus:ring-telus-purple/20 transition-all"
            >
              {partners.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 border-none shadow-sm bg-bg-primary">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-telus-purple/10 rounded-lg">
              <DollarSign className="w-5 h-5 text-telus-purple" />
            </div>
            <span className="text-[10px] font-black text-text-secondary/50 uppercase tracking-widest">Current Month Actual</span>
          </div>
          <div className="flex flex-col">
            <span className="text-3xl font-black text-telus-gray">
              {formatCurrency(historicalData.find(d => d.month === currentMonthStr)?.actual || 0)}
            </span>
            <div className="flex items-center mt-2">
              {historicalData.length > 1 && (
                <>
                  {historicalData[historicalData.length - 1].actual >= historicalData[historicalData.length - 2].actual ? (
                    <ArrowUpRight className="w-4 h-4 text-telus-green mr-1" />
                  ) : (
                    <ArrowDownRight className="w-4 h-4 text-rose-500 mr-1" />
                  )}
                  <span className={cn(
                    "text-xs font-bold",
                    historicalData[historicalData.length - 1].actual >= historicalData[historicalData.length - 2].actual ? "text-telus-green" : "text-rose-500"
                  )}>
                    {historicalData.length > 1 ? (
                      `${Math.abs(((historicalData[historicalData.length - 1].actual - historicalData[historicalData.length - 2].actual) / (historicalData[historicalData.length - 2].actual || 1) * 100)).toFixed(1)}% vs last month`
                    ) : 'N/A'}
                  </span>
                </>
              )}
            </div>
          </div>
        </Card>

        <Card className="p-6 border-none shadow-sm bg-bg-primary">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-telus-green/10 rounded-lg">
              <Target className="w-5 h-5 text-telus-green" />
            </div>
            <span className="text-[10px] font-black text-text-secondary/50 uppercase tracking-widest">Current Month Budget</span>
          </div>
          <div className="flex flex-col">
            <span className="text-3xl font-black text-telus-gray">
              {formatCurrency(historicalData.find(d => d.month === currentMonthStr)?.budget || 0)}
            </span>
            <span className="text-xs font-bold text-text-secondary mt-2">
              Target for {format(now, 'MMMM yyyy')}
            </span>
          </div>
        </Card>

        <Card className="p-6 border-none shadow-sm bg-bg-primary">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-amber-500/10 rounded-lg">
              <Info className="w-5 h-5 text-amber-500" />
            </div>
            <span className="text-[10px] font-black text-text-secondary/50 uppercase tracking-widest">3-Month Variance</span>
          </div>
          <div className="flex flex-col">
            <div className="flex items-center">
              <span className={cn(
                "text-3xl font-black",
                lastThreeMonthsVariance?.isPositive ? "text-telus-green" : "text-rose-500"
              )}>
                {lastThreeMonthsVariance ? (lastThreeMonthsVariance.isPositive ? '+' : '') + lastThreeMonthsVariance.overall.toFixed(1) + '%' : 'N/A'}
              </span>
              {lastThreeMonthsVariance && (
                lastThreeMonthsVariance.isPositive ? 
                <TrendingUp className="w-6 h-6 ml-2 text-telus-green" /> : 
                <TrendingDown className="w-6 h-6 ml-2 text-rose-500" />
              )}
            </div>
            <span className="text-xs font-bold text-text-secondary mt-2">
              Performance relative to budget (Last 3 months)
            </span>
          </div>
        </Card>
      </div>

      {/* Chart Section */}
      <Card className="p-8 border-none shadow-sm bg-bg-primary">
        <div className="flex items-center justify-between mb-8">
          <h3 className="text-xl font-bold text-telus-gray">Historical Performance</h3>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-telus-purple rounded-full"></div>
              <span className="text-xs font-bold text-text-secondary">Actual Revenue</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-telus-green rounded-full"></div>
              <span className="text-xs font-bold text-text-secondary">Budget</span>
            </div>
          </div>
        </div>

        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={historicalData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
              <XAxis 
                dataKey="monthLabel" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: 'var(--chart-text)', fontSize: 12, fontWeight: 600 }}
                dy={10}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: 'var(--chart-text)', fontSize: 12, fontWeight: 600 }}
                tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--chart-grid)', opacity: 0.1 }} />
              <Area 
                type="monotone" 
                dataKey="budget" 
                fill="var(--color-telus-green)" 
                fillOpacity={0.1}
                stroke="var(--color-telus-green)" 
                strokeWidth={2}
                dot={{ fill: 'var(--color-telus-green)', r: 4 }}
                activeDot={{ r: 6, strokeWidth: 0 }}
              />
              <Bar 
                dataKey="actual" 
                fill="var(--color-telus-purple)" 
                radius={[4, 4, 0, 0]} 
                barSize={40}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* YTD Summary Section */}
      {ytdData && (
        <Card className="p-8 border-none shadow-sm bg-bg-primary overflow-hidden">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-xl font-bold text-telus-gray">Year-To-Date Summary ({now.getFullYear()})</h3>
              <p className="text-sm text-text-secondary mt-1">Cumulative performance for the current calendar year</p>
            </div>
            <div className={cn(
              "px-4 py-2 rounded-full text-sm font-black flex items-center",
              ytdData.variance >= 0 ? "bg-telus-green/10 text-telus-green" : "bg-rose-500/10 text-rose-500"
            )}>
              {ytdData.variance >= 0 ? <TrendingUp className="w-4 h-4 mr-2" /> : <TrendingDown className="w-4 h-4 mr-2" />}
              YTD Variance: {ytdData.variance >= 0 ? '+' : ''}{ytdData.variancePercent.toFixed(1)}%
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border-primary">
                  <th className="pb-4 text-[10px] font-black text-text-secondary/50 uppercase tracking-widest">Metric</th>
                  {ytdData.months.map(m => (
                    <th key={m.month} className="pb-4 text-[10px] font-black text-text-secondary/50 uppercase tracking-widest text-right">{m.monthLabel}</th>
                  ))}
                  <th className="pb-4 text-[10px] font-black text-telus-purple uppercase tracking-widest text-right">Total YTD</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-primary/50">
                <tr>
                  <td className="py-4 text-sm font-bold text-text-secondary">Actual Revenue</td>
                  {ytdData.months.map(m => (
                    <td key={m.month} className="py-4 text-sm font-black text-telus-gray text-right">{formatCurrency(m.actual)}</td>
                  ))}
                  <td className="py-4 text-sm font-black text-telus-purple text-right bg-telus-purple/5 rounded-t-xl">{formatCurrency(ytdData.totalActual)}</td>
                </tr>
                <tr>
                  <td className="py-4 text-sm font-bold text-text-secondary">Budget</td>
                  {ytdData.months.map(m => (
                    <td key={m.month} className="py-4 text-sm font-black text-telus-gray text-right">{formatCurrency(m.budget)}</td>
                  ))}
                  <td className="py-4 text-sm font-black text-telus-purple text-right bg-telus-purple/5">{formatCurrency(ytdData.totalBudget)}</td>
                </tr>
                <tr>
                  <td className="py-4 text-sm font-bold text-text-secondary">Variance ($)</td>
                  {ytdData.months.map(m => (
                    <td key={m.month} className={cn(
                      "py-4 text-sm font-black text-right",
                      m.variance >= 0 ? "text-telus-green" : "text-rose-500"
                    )}>
                      {m.variance >= 0 ? '+' : ''}{formatCurrency(m.variance)}
                    </td>
                  ))}
                  <td className={cn(
                    "py-4 text-sm font-black text-right bg-telus-purple/5 rounded-b-xl",
                    ytdData.variance >= 0 ? "text-telus-green" : "text-rose-500"
                  )}>
                    {ytdData.variance >= 0 ? '+' : ''}{formatCurrency(ytdData.variance)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Budget Management Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="p-8 border-none shadow-sm bg-bg-primary">
          <h3 className="text-xl font-bold text-telus-gray mb-6 flex items-center">
            <Calendar className="w-6 h-6 mr-3 text-telus-purple" />
            Set Current Month Budget
          </h3>
          
          <div className="space-y-6">
            <div className="flex flex-wrap gap-6">
              <div>
                <label className="block text-xs font-black text-text-secondary/50 uppercase tracking-widest mb-3">
                  Budget Type
                </label>
                <div className="flex p-1 bg-bg-secondary rounded-xl w-fit">
                  <button 
                    onClick={() => setIsAnnual(false)}
                    className={cn(
                      "px-6 py-2 rounded-lg text-xs font-bold transition-all",
                      !isAnnual ? "bg-bg-primary text-telus-purple shadow-sm" : "text-text-secondary hover:text-telus-purple"
                    )}
                  >
                    Monthly
                  </button>
                  <button 
                    onClick={() => setIsAnnual(true)}
                    className={cn(
                      "px-6 py-2 rounded-lg text-xs font-bold transition-all",
                      isAnnual ? "bg-bg-primary text-telus-purple shadow-sm" : "text-text-secondary hover:text-telus-purple"
                    )}
                  >
                    Annual
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-text-secondary/50 uppercase tracking-widest mb-3">
                  Target Year
                </label>
                <div className="flex p-1 bg-bg-secondary rounded-xl w-fit">
                  {years.map(year => (
                    <button 
                      key={year}
                      onClick={() => setSelectedYear(year)}
                      className={cn(
                        "px-6 py-2 rounded-lg text-xs font-bold transition-all",
                        selectedYear === year ? "bg-bg-primary text-telus-purple shadow-sm" : "text-text-secondary hover:text-telus-purple"
                      )}
                    >
                      {year}
                    </button>
                  ))}
                </div>
              </div>

              {!isAnnual && (
                <div className="w-full">
                  <label className="block text-xs font-black text-text-secondary/50 uppercase tracking-widest mb-3">
                    Target Month
                  </label>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 p-1 bg-bg-secondary rounded-xl">
                    {months.map((month, idx) => (
                      <button 
                        key={month}
                        onClick={() => setSelectedMonth(idx)}
                        className={cn(
                          "py-2 rounded-lg text-xs font-bold transition-all",
                          selectedMonth === idx ? "bg-bg-primary text-telus-purple shadow-sm" : "text-text-secondary hover:text-telus-purple"
                        )}
                      >
                        {month}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-black text-text-secondary/50 uppercase tracking-widest mb-3">
                {isAnnual ? 'Annual Budget Amount' : 'Monthly Budget Amount'}
              </label>
              <div className="relative">
                <DollarSign className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary/50" />
                <Input 
                  type="number"
                  value={currentBudgetInput}
                  onChange={(e) => setCurrentBudgetInput(e.target.value)}
                  placeholder="0.00"
                  className="pl-11 h-12 text-lg font-bold bg-bg-secondary border-border-primary text-telus-gray"
                />
              </div>
              {isAnnual && (
                <p className="mt-2 text-xs text-text-secondary italic">
                  Annual budget will be divided by 12 ({formatCurrency(parseFloat(currentBudgetInput || '0') / 12)} per month)
                </p>
              )}
            </div>

            <Button 
              onClick={handleSaveBudget}
              className="w-full h-12 text-base font-bold bg-telus-purple hover:bg-telus-purple/90"
            >
              <Save className="w-5 h-5 mr-2" />
              {isAnnual 
                ? `Save Budget for the year ${selectedYear}` 
                : `Save Budget for ${months[selectedMonth]} ${selectedYear}`
              }
            </Button>
          </div>
        </Card>

        <Card className="p-8 border-none shadow-sm bg-bg-primary overflow-hidden relative">
          <div className="absolute top-0 right-0 w-32 h-32 bg-telus-purple/5 rounded-bl-full -mr-16 -mt-16"></div>
          
          <h3 className="text-xl font-bold text-telus-gray mb-6">Variance Analysis</h3>
          
          <div className="space-y-6 relative z-10">
            {historicalData.slice(-3).reverse().map((month, idx) => (
              <div key={month.month} className="flex items-center justify-between p-4 rounded-2xl bg-bg-secondary border border-border-primary">
                <div>
                  <p className="text-xs font-black text-text-secondary/50 uppercase tracking-widest mb-1">{month.monthLabel}</p>
                  <div className="flex items-center">
                    <span className="text-lg font-black text-telus-gray mr-3">{formatCurrency(month.actual)}</span>
                    <span className="text-xs font-bold text-text-secondary/50">vs {formatCurrency(month.budget)}</span>
                  </div>
                </div>
                <div className={cn(
                  "flex flex-col items-end",
                  month.variance >= 0 ? "text-telus-green" : "text-rose-500"
                )}>
                  <div className="flex items-center font-black">
                    {month.variance >= 0 ? <TrendingUp className="w-4 h-4 mr-1" /> : <TrendingDown className="w-4 h-4 mr-1" />}
                    {month.variancePercent.toFixed(1)}%
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider">
                    {month.variance >= 0 ? 'Over Budget' : 'Under Budget'}
                  </span>
                </div>
              </div>
            ))}
            
            {historicalData.length === 0 && (
              <div className="text-center py-12 text-text-secondary/50 font-bold uppercase tracking-widest text-xs">
                No historical data available
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};
