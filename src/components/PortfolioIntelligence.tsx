import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { ShieldAlert, TrendingUp, Calendar, AlertCircle, CheckCircle2, Clock, ArrowUpRight, ArrowDownRight, Users, Target, Zap, BarChart3, PieChart as PieChartIcon, Activity, Cloud, Info, LayoutDashboard } from 'lucide-react';
import { CustomerSummary } from '../lib/db';
import { cn } from '../lib/utils';

interface PortfolioIntelligenceProps {
  customers: CustomerSummary[];
  view?: 'portfolio' | 'marketing' | 'analytics';
  onSelectCustomer?: (customer: CustomerSummary) => void;
  onViewChange?: (view: 'portfolio' | 'marketing' | 'analytics') => void;
}

const COLORS = ['var(--color-telus-purple)', 'var(--color-telus-green)', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6'];

export const PortfolioIntelligence: React.FC<PortfolioIntelligenceProps> = ({ customers, view = 'portfolio', onSelectCustomer, onViewChange }) => {
  // 1. Calculate Revenue at Risk (Expiring in 30, 60, 90 days)
  const revenueAtRisk = useMemo(() => {
    const now = new Date();
    const risk = {
      days30: 0,
      days60: 0,
      days90: 0,
      total: 0
    };

    customers.forEach(customer => {
      const expiryStr = customer.result.contractExpiryDate;
      if (!expiryStr || expiryStr === 'Not specified') return;

      const expiryDate = new Date(expiryStr);
      if (isNaN(expiryDate.getTime())) return;

      const diffDays = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      // Calculate customer's monthly revenue
      let monthlyRevenue = 0;
      customer.result.customerServices?.forEach(s => {
        if (s.amount && (s.amount.toLowerCase().includes('month') || s.serviceType === 'MS')) {
          const amount = parseFloat(s.amount.replace(/[^0-9.]/g, '')) || 0;
          monthlyRevenue += amount;
        }
      });

      if (diffDays <= 30 && diffDays > 0) risk.days30 += monthlyRevenue;
      if (diffDays <= 60 && diffDays > 0) risk.days60 += monthlyRevenue;
      if (diffDays <= 90 && diffDays > 0) risk.days90 += monthlyRevenue;
      risk.total += monthlyRevenue;
    });

    return risk;
  }, [customers]);

  // 2. Product Intensity (Service Type Distribution)
  const productIntensity = useMemo(() => {
    const counts: Record<string, number> = {};
    customers.forEach(customer => {
      customer.result.customerServices?.forEach(s => {
        const type = s.serviceType || 'Other';
        counts[type] = (counts[type] || 0) + 1;
      });
    });

    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [customers]);

  // 3. Renewal Health Queue
  const renewalQueue = useMemo(() => {
    return customers.map(customer => {
      const expiryStr = customer.result.contractExpiryDate;
      const changeOrdersCount = customer.result.changeOrders?.length || 0;
      const servicesCount = customer.result.customerServices?.length || 0;
      
      let score = 50; // Base score
      if (changeOrdersCount > 2) score += 20;
      if (servicesCount > 5) score += 10;
      
      const expiryDate = expiryStr ? new Date(expiryStr) : null;
      const now = new Date();
      if (expiryDate && !isNaN(expiryDate.getTime())) {
        const diffDays = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays < 30) score -= 20;
        else if (diffDays < 90) score -= 10;
      }

      let status: 'High' | 'Medium' | 'Low' = 'Medium';
      if (score >= 70) status = 'High';
      else if (score < 40) status = 'Low';

      return {
        name: customer.customerName,
        score,
        status,
        expiry: expiryStr || 'N/A'
      };
    }).sort((a, b) => b.score - a.score).slice(0, 5);
  }, [customers]);

  // 4. Marketing Analytics (Upsell/Cross-sell Potential)
  const marketingAnalytics = useMemo(() => {
    let upsellOpps = 0;
    let crossSellOpps = 0;
    const targets: { name: string; potential: number; services: string[]; customer: CustomerSummary }[] = [];
    const serviceOpps: Record<string, number> = {
      'Security': 0,
      'Cloud': 0,
      'Backup': 0,
      'Managed Services': 0
    };
    
    customers.forEach(customer => {
      const services = customer.result.customerServices || [];
      const serviceNames = services.map(s => (s.serviceName || '').toLowerCase());
      const customerPotential: string[] = [];
      
      // Security Upsell
      const hasBasicSecurity = serviceNames.some(n => n.includes('antivirus') || n.includes('firewall'));
      const hasAdvancedSecurity = serviceNames.some(n => n.includes('endpoint') || n.includes('edr') || n.includes('soc'));
      if (hasBasicSecurity && !hasAdvancedSecurity) {
        upsellOpps++;
        customerPotential.push('Advanced Security');
        serviceOpps['Security']++;
      }
      
      // Cloud Cross-sell
      const hasMS = services.some(s => s.serviceType === 'MS');
      const hasCloud = serviceNames.some(n => n.includes('cloud') || n.includes('azure') || n.includes('aws'));
      if (hasMS && !hasCloud) {
        crossSellOpps++;
        customerPotential.push('Cloud Infrastructure');
        serviceOpps['Cloud']++;
      }

      // Backup Cross-sell
      const hasBackup = serviceNames.some(n => n.includes('backup') || n.includes('dr') || n.includes('recovery'));
      if (hasMS && !hasBackup) {
        customerPotential.push('Backup & DR');
        serviceOpps['Backup']++;
      }

      if (customerPotential.length > 0) {
        targets.push({
          name: customer.customerName,
          potential: customerPotential.length * 500, // Simulated MRR potential
          services: customerPotential,
          customer
        });
      }
    });

    const opportunityChart = Object.entries(serviceOpps).map(([name, value]) => ({ name, value }));

    return { 
      upsellOpps, 
      crossSellOpps, 
      targets: targets.sort((a, b) => b.potential - a.potential).slice(0, 5),
      opportunityChart,
      totalPotentialMRR: targets.reduce((sum, t) => sum + t.potential, 0)
    };
  }, [customers]);

  // 5. Product Intelligence (Adoption & Depth)
  const productAnalytics = useMemo(() => {
    const adoptionBySegment = [
      { segment: '1-3 Services', count: 0 },
      { segment: '4-7 Services', count: 0 },
      { segment: '8+ Services', count: 0 }
    ];

    const msTypes: Record<string, number> = {};
    const psTrends: Record<string, number> = {};
    const topServices: Record<string, number> = {};

    customers.forEach(customer => {
      // Filter out Transition Services (TS) as requested
      const services = (customer.result.customerServices || []).filter(s => s.serviceType !== 'TS');
      const count = services.length;
      
      if (count <= 3) adoptionBySegment[0].count++;
      else if (count <= 7) adoptionBySegment[1].count++;
      else adoptionBySegment[2].count++;

      services.forEach(s => {
        const name = s.serviceName;
        topServices[name] = (topServices[name] || 0) + 1;

        if (s.serviceType === 'MS') {
          // Categorize MS types
          let category = 'General MS';
          const lowerName = name.toLowerCase();
          if (lowerName.includes('security') || lowerName.includes('firewall') || lowerName.includes('endpoint') || lowerName.includes('soc')) category = 'Security MS';
          else if (lowerName.includes('cloud') || lowerName.includes('azure') || lowerName.includes('aws') || lowerName.includes('hosting')) category = 'Cloud MS';
          else if (lowerName.includes('backup') || lowerName.includes('dr') || lowerName.includes('recovery')) category = 'Backup/DR MS';
          else if (lowerName.includes('network') || lowerName.includes('sd-wan') || lowerName.includes('connectivity')) category = 'Network MS';
          else if (lowerName.includes('voice') || lowerName.includes('uc') || lowerName.includes('collaboration')) category = 'Voice/UC MS';
          
          msTypes[category] = (msTypes[category] || 0) + 1;
        } else if (s.serviceType === 'PS') {
          // Categorize PS trends based on new deep categorization
          let category = 'Other Projects';
          const lowerName = name.toLowerCase();
          
          if (lowerName.includes('cloud') || lowerName.includes('azure') || lowerName.includes('aws') || lowerName.includes('migration') || lowerName.includes('server')) {
            category = 'Cloud & Infrastructure';
          } else if (lowerName.includes('security') || lowerName.includes('audit') || lowerName.includes('pen') || lowerName.includes('firewall') || lowerName.includes('compliance')) {
            category = 'Security & Compliance';
          } else if (lowerName.includes('m365') || lowerName.includes('office') || lowerName.includes('teams') || lowerName.includes('email') || lowerName.includes('collaboration')) {
            category = 'Modern Workplace';
          } else if (lowerName.includes('consulting') || lowerName.includes('roadmap') || lowerName.includes('assessment') || lowerName.includes('advisory')) {
            category = 'Strategic Consulting';
          }
          
          psTrends[category] = (psTrends[category] || 0) + 1;
        }
      });
    });

    const msBreakdown = Object.entries(msTypes).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    const psBreakdown = Object.entries(psTrends).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    const topSelling = Object.entries(topServices).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);

    // Intensity Calculations
    const customersWithMS = customers.filter(c => (c.result.customerServices || []).some(s => s.serviceType === 'MS')).length;
    const customersWithBoth = customers.filter(c => {
      const services = c.result.customerServices || [];
      return services.some(s => s.serviceType === 'MS') && services.some(s => s.serviceType === 'PS');
    }).length;
    
    const avgDocCount = customers.length > 0 ? customers.reduce((acc, c) => acc + (c.result.customerServices || []).length, 0) / customers.length : 0;
    const depthIndex = Math.min(100, Math.round((avgDocCount / 10) * 100));

    const intensityDrivers = [
      { label: 'Managed Services Mix', value: customers.length > 0 ? Math.round((customersWithMS / customers.length) * 100) : 0, color: 'bg-telus-purple' },
      { label: 'Cross-Product Linkage', value: customers.length > 0 ? Math.round((customersWithBoth / customers.length) * 100) : 0, color: 'bg-telus-green' },
      { label: 'Service Depth Index', value: depthIndex, color: 'bg-telus-accent' }
    ];

    return { adoptionBySegment, msBreakdown, psBreakdown, topSelling, intensityDrivers };
  }, [customers]);

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Internal Tab Switcher for better discoverability */}
      <div className="flex items-center justify-center mb-12">
        <div className="flex p-1.5 bg-bg-secondary rounded-2xl border border-border-primary shadow-sm">
          {[
            { id: 'portfolio', label: 'Portfolio Overview', icon: LayoutDashboard },
            { id: 'marketing', label: 'Marketing Analytics', icon: Target },
            { id: 'analytics', label: 'Product Intelligence', icon: Activity }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => onViewChange?.(tab.id as any)}
              className={cn(
                "flex items-center space-x-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all duration-300",
                view === tab.id 
                  ? "bg-telus-purple text-white shadow-lg shadow-[#4B286D33]" 
                  : "text-text-secondary hover:text-telus-purple hover:bg-bg-primary"
              )}
            >
              <tab.icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {view === 'portfolio' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Revenue at Risk Widget */}
          <div className="telus-card p-10 relative overflow-hidden group bg-bg-secondary border-border-primary">
            <div className="absolute top-0 right-0 w-40 h-40 bg-telus-purple/5 rounded-bl-full -z-10 transition-transform group-hover:scale-110"></div>
            <div className="flex items-center justify-between mb-10">
              <h3 className="text-xl font-black text-telus-gray flex items-center tracking-tight">
                <div className="p-2.5 bg-bg-primary rounded-xl mr-4 border border-border-primary shadow-sm">
                  <ShieldAlert className="w-6 h-6 text-telus-purple" />
                </div>
                Revenue at Risk
              </h3>
              <span className="text-[10px] font-black text-white bg-telus-purple px-3 py-1.5 rounded-lg uppercase tracking-widest shadow-lg shadow-telus-purple/20">90 Day Outlook</span>
            </div>
            
            <div className="space-y-8">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-[11px] font-black text-text-secondary uppercase tracking-widest mb-2">Total Exposure</p>
                  <p className="text-4xl font-black text-telus-gray">{formatCurrency(revenueAtRisk.days90)}</p>
                </div>
                <div className="flex items-center text-telus-purple text-xs font-black bg-bg-primary px-3 py-1.5 rounded-xl border border-border-primary">
                  <ArrowUpRight className="w-4 h-4 mr-2" />
                  Risk Identified
                </div>
              </div>

              <div className="space-y-5 pt-6 border-t border-border-primary">
                {[
                  { label: 'Next 30 Days', value: revenueAtRisk.days30, color: 'bg-rose-500' },
                  { label: 'Next 60 Days', value: revenueAtRisk.days60, color: 'bg-amber-500' },
                  { label: 'Next 90 Days', value: revenueAtRisk.days90, color: 'bg-telus-green' }
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between group/item">
                    <div className="flex items-center text-sm font-bold text-text-secondary">
                      <div className={cn("w-2.5 h-2.5 rounded-full mr-4 shadow-sm", item.color)}></div>
                      <span>{item.label}</span>
                    </div>
                    <span className="font-black text-telus-gray text-base">{formatCurrency(item.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Renewal Health Queue */}
          <div className="telus-card p-10 relative overflow-hidden group bg-bg-secondary border-border-primary">
            <div className="absolute top-0 right-0 w-40 h-40 bg-telus-green/5 rounded-bl-full -z-10 transition-transform group-hover:scale-110"></div>
            <div className="flex items-center justify-between mb-10">
              <h3 className="text-xl font-black text-text-primary flex items-center tracking-tight">
                <div className="p-2.5 bg-bg-primary rounded-xl mr-4 border border-border-primary shadow-sm">
                  <CheckCircle2 className="w-6 h-6 text-telus-green" />
                </div>
                Renewal Health Queue
              </h3>
              <span className="text-[10px] font-black text-white bg-telus-green px-3 py-1.5 rounded-lg uppercase tracking-widest shadow-lg shadow-telus-green/20">Priority Management</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {renewalQueue.map((item, idx) => (
                <div key={idx} className="flex flex-col p-5 rounded-[32px] bg-bg-secondary border border-border-primary hover:border-telus-purple/30 hover:bg-bg-primary hover:shadow-xl hover:shadow-telus-purple/5 transition-all group/item">
                  <div className="flex items-center justify-between mb-4">
                    <div className="relative group/tooltip">
                      <div className={cn(
                        "w-12 h-12 rounded-2xl flex items-center justify-center font-black text-base shrink-0 cursor-help shadow-sm border",
                        item.status === 'High' ? "bg-bg-primary text-telus-green border-telus-green/20" :
                        item.status === 'Medium' ? "bg-bg-primary text-amber-500 border-amber-500/20" :
                        "bg-bg-primary text-rose-500 border-rose-500/20"
                      )}>
                        {item.score}
                      </div>
                      
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-64 p-5 bg-bg-secondary/95 backdrop-blur-md text-text-primary rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all z-[150] text-left pointer-events-none border border-border-primary">
                        <h4 className="text-[11px] font-black mb-4 border-b border-border-primary pb-2 uppercase tracking-widest text-telus-purple">Renewal Health Logic</h4>
                        <div className="space-y-3 text-[10px] font-bold">
                          <div className="flex justify-between items-center">
                            <span className="text-text-secondary">Contract Expiry:</span>
                            <span className="text-text-primary font-black bg-bg-primary px-2 py-0.5 rounded">40%</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-text-secondary">Product Intensity:</span>
                            <span className="text-text-primary font-black bg-bg-primary px-2 py-0.5 rounded">30%</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-text-secondary">Billing Health:</span>
                            <span className="text-text-primary font-black bg-bg-primary px-2 py-0.5 rounded">20%</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-text-secondary">Risk Flags:</span>
                            <span className="text-text-primary font-black bg-bg-primary px-2 py-0.5 rounded">10%</span>
                          </div>
                        </div>
                        <div className="mt-4 pt-3 border-t border-border-primary text-[9px] text-text-secondary italic leading-relaxed">
                          Weighted algorithm assessing proactive revenue intelligence and portfolio-wide risk.
                        </div>
                      </div>
                    </div>
                    <span className={cn(
                      "px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest shadow-sm",
                      item.status === 'High' ? "bg-telus-green text-white" :
                      item.status === 'Medium' ? "bg-amber-500 text-white" :
                      "bg-rose-500 text-white"
                    )}>
                      {item.status}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-black text-text-primary truncate mb-1.5 group-hover/item:text-telus-purple transition-colors">{item.name}</p>
                    <div className="flex items-center text-[11px] text-text-secondary font-bold uppercase tracking-wider">
                      <Calendar className="w-3.5 h-3.5 mr-2 text-telus-purple/80" />
                      {item.expiry}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {view === 'marketing' && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Summary Stats */}
            <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="telus-card p-8 text-center relative overflow-hidden group bg-bg-secondary border-border-primary">
                <div className="absolute top-0 right-0 w-24 h-24 bg-telus-green/5 rounded-bl-full -z-10"></div>
                <p className="text-[11px] font-black text-text-secondary uppercase tracking-widest mb-2">Total Potential MRR</p>
                <p className="text-4xl font-black text-telus-green">{formatCurrency(marketingAnalytics.totalPotentialMRR)}</p>
                <div className="mt-3 flex items-center justify-center text-[11px] text-telus-green font-black uppercase tracking-widest">
                  <TrendingUp className="w-4 h-4 mr-2" />
                  Estimated Growth
                </div>
              </div>
              <div className="telus-card p-8 text-center relative overflow-hidden group bg-bg-secondary border-border-primary">
                <div className="absolute top-0 right-0 w-24 h-24 bg-telus-purple/5 rounded-bl-full -z-10"></div>
                <p className="text-[11px] font-black text-text-secondary uppercase tracking-widest mb-2">Upsell Opportunities</p>
                <p className="text-4xl font-black text-telus-purple">{marketingAnalytics.upsellOpps}</p>
                <p className="text-[10px] text-text-secondary mt-2 font-bold uppercase tracking-wider">Security & Performance</p>
              </div>
              <div className="telus-card p-8 text-center relative overflow-hidden group bg-bg-secondary border-border-primary">
                <div className="absolute top-0 right-0 w-24 h-24 bg-telus-purple/5 rounded-bl-full -z-10"></div>
                <p className="text-[11px] font-black text-text-secondary uppercase tracking-widest mb-2">Cross-Sell Leads</p>
                <p className="text-4xl font-black text-telus-purple">{marketingAnalytics.crossSellOpps}</p>
                <p className="text-[10px] text-text-secondary mt-2 font-bold uppercase tracking-wider">Cloud & Backup</p>
              </div>
            </div>

            {/* Opportunity Chart */}
            <div className="telus-card p-8 bg-bg-secondary border-border-primary">
              <h4 className="text-xs font-black text-telus-gray uppercase tracking-widest mb-6 flex items-center">
                <div className="p-2 bg-telus-purple/10 rounded-lg mr-3">
                  <BarChart3 className="w-4 h-4 text-telus-purple" />
                </div>
                Opportunities by Category
              </h4>
              <div className="h-40 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={marketingAnalytics.opportunityChart}>
                    <XAxis dataKey="name" hide />
                    <Tooltip 
                      contentStyle={{ 
                        borderRadius: '16px', 
                        border: 'none', 
                        boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', 
                        fontSize: '11px', 
                        fontWeight: 'bold',
                        backgroundColor: 'var(--chart-tooltip-bg)',
                        color: 'var(--color-text-primary)'
                      }}
                      itemStyle={{ color: 'var(--color-text-primary)' }}
                      cursor={{ fill: 'var(--color-telus-purple)', opacity: 0.05 }}
                    />
                    <Bar dataKey="value" fill="var(--color-telus-purple)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Top Targets */}
            <div className="telus-card p-10 bg-bg-secondary border-border-primary">
            <div className="flex items-center justify-between mb-10">
              <h3 className="text-xl font-black text-telus-gray flex items-center tracking-tight">
                <div className="p-2.5 bg-bg-primary rounded-xl mr-4 border border-border-primary shadow-sm">
                  <Target className="w-6 h-6 text-telus-purple" />
                </div>
                Top Upsell Targets
              </h3>
              <span className="text-[10px] font-black text-white bg-telus-purple px-3 py-1.5 rounded-lg uppercase tracking-widest shadow-lg shadow-telus-purple/20">High Probability</span>
            </div>

            <div className="space-y-5">
              {marketingAnalytics.targets.map((target, idx) => (
                <div 
                  key={idx} 
                  onClick={() => onSelectCustomer?.(target.customer)}
                  className="flex items-center justify-between p-6 rounded-3xl bg-bg-primary/50 border border-border-primary hover:border-telus-purple/30 hover:shadow-xl hover:shadow-telus-purple/5 hover:bg-bg-secondary transition-all group cursor-pointer"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-black text-telus-gray truncate group-hover:text-telus-purple transition-colors">{target.name}</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {target.services.map((s, sIdx) => (
                        <span key={sIdx} className="text-[9px] font-black bg-bg-secondary text-text-secondary px-2 py-1 rounded-lg border border-border-primary uppercase tracking-widest">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-right ml-6">
                    <p className="text-lg font-black text-telus-green">+{formatCurrency(target.potential)}</p>
                    <p className="text-[10px] text-text-secondary font-black uppercase tracking-widest">Est. MRR</p>
                  </div>
                </div>
              ))}
            </div>
            </div>

            {/* Campaign Intelligence */}
            <div className="bg-bg-secondary p-10 rounded-[40px] shadow-2xl relative overflow-hidden flex flex-col justify-between group border border-border-primary">
              <div className="absolute top-0 right-0 w-80 h-80 bg-telus-purple/10 rounded-bl-full -z-10 transition-transform group-hover:scale-110"></div>
              <div>
                <h3 className="text-2xl font-black text-telus-gray mb-10 flex items-center tracking-tight">
                  <div className="p-2.5 bg-telus-purple/20 rounded-xl mr-4 border border-telus-purple/30">
                    <Zap className="w-6 h-6 text-telus-purple" />
                  </div>
                  Campaign Intelligence
                </h3>
                <div className="space-y-6">
                  <div className="p-6 rounded-3xl bg-bg-primary/50 border border-border-primary hover:bg-bg-primary transition-all hover:translate-x-2">
                    <div className="flex items-center mb-4">
                      <div className="p-2.5 bg-telus-purple/20 rounded-xl mr-4">
                        <ShieldAlert className="w-5 h-5 text-telus-purple" />
                      </div>
                      <p className="text-xs font-black text-telus-gray uppercase tracking-widest">Security Uplift Campaign</p>
                    </div>
                    <p className="text-sm text-text-secondary leading-relaxed">
                      Targeting <span className="text-telus-gray font-black">{marketingAnalytics.upsellOpps}</span> customers currently on basic firewall/AV plans. High conversion potential for EDR and SOC-as-a-Service bundles given recent ransomware trends.
                    </p>
                  </div>
                  <div className="p-6 rounded-3xl bg-bg-primary/50 border border-border-primary hover:bg-bg-primary transition-all hover:translate-x-2">
                    <div className="flex items-center mb-4">
                      <div className="p-2.5 bg-telus-green/20 rounded-xl mr-4">
                        <Cloud className="w-5 h-5 text-telus-green" />
                      </div>
                      <p className="text-xs font-black text-telus-gray uppercase tracking-widest">Cloud Continuity Drive</p>
                    </div>
                    <p className="text-sm text-text-secondary leading-relaxed">
                      Identified <span className="text-telus-gray font-black">{marketingAnalytics.crossSellOpps}</span> Managed Services clients without off-site backup. Positioning "Cloud DR" as a critical insurance policy for operational resilience.
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-10 pt-8 border-t border-border-primary flex items-center justify-between">
                <div className="flex items-center text-telus-purple text-xs font-black uppercase tracking-widest">
                  <Activity className="w-5 h-5 mr-3" />
                  Real-time Insights
                </div>
                <button className="text-[11px] font-black text-white uppercase tracking-widest bg-telus-purple px-6 py-3 rounded-2xl hover:bg-telus-purple/90 transition-all shadow-lg shadow-telus-purple/20 active:scale-95">
                  Generate Campaign
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {view === 'analytics' && (
        <div className="space-y-10">
          <div className="mb-10">
            <h2 className="text-4xl font-black text-telus-gray tracking-tight mb-4">Product Intelligence</h2>
            <p className="text-lg text-text-secondary max-w-3xl leading-relaxed font-medium">
              Deep-dive analytics into service adoption patterns, cross-sell opportunities, and product intensity across your customer base. Use these insights to identify high-growth segments and optimize service delivery.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* MS Breakdown */}
            <div className="telus-card p-10 bg-bg-secondary border-border-primary">
              <h3 className="text-xl font-black text-telus-gray flex items-center tracking-tight mb-8">
                <div className="p-2.5 bg-bg-primary rounded-xl mr-4 border border-border-primary shadow-sm">
                  <Activity className="w-6 h-6 text-telus-purple" />
                </div>
                Managed Services Types
              </h3>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={productAnalytics.msBreakdown} layout="vertical">
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" width={120} fontSize={10} fontWeight="bold" />
                    <Tooltip 
                      contentStyle={{ 
                        borderRadius: '16px', 
                        border: 'none', 
                        boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', 
                        fontSize: '11px', 
                        fontWeight: 'bold',
                        backgroundColor: 'var(--chart-tooltip-bg)',
                        color: 'var(--color-text-primary)'
                      }}
                      itemStyle={{ color: 'var(--color-text-primary)' }}
                      cursor={{ fill: 'var(--color-telus-purple)', opacity: 0.05 }}
                    />
                    <Bar dataKey="value" fill="var(--color-telus-purple)" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* PS Trends */}
            <div className="telus-card p-10 bg-bg-secondary border-border-primary">
              <h3 className="text-xl font-black text-telus-gray flex items-center tracking-tight mb-8">
                <div className="p-2.5 bg-bg-primary rounded-xl mr-4 border border-border-primary shadow-sm">
                  <Zap className="w-6 h-6 text-telus-green" />
                </div>
                Professional Services Trends
              </h3>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={productAnalytics.psBreakdown} layout="vertical">
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" width={150} fontSize={10} fontWeight="bold" />
                    <Tooltip 
                      contentStyle={{ 
                        borderRadius: '16px', 
                        border: 'none', 
                        boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', 
                        fontSize: '11px', 
                        fontWeight: 'bold',
                        backgroundColor: 'var(--chart-tooltip-bg)',
                        color: 'var(--color-text-primary)'
                      }}
                      itemStyle={{ color: 'var(--color-text-primary)' }}
                      cursor={{ fill: 'var(--color-telus-green)', opacity: 0.05 }}
                    />
                    <Bar dataKey="value" fill="var(--color-telus-green)" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Managed Services Definitions */}
          <div className="telus-card p-10 bg-bg-secondary border-border-primary">
            <h3 className="text-xl font-black text-telus-gray flex items-center tracking-tight mb-8">
              <div className="p-2.5 bg-bg-primary rounded-xl mr-4 border border-border-primary shadow-sm">
                <Info className="w-6 h-6 text-telus-purple" />
              </div>
              Managed Services Definitions
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                { label: 'Service Desk', desc: '24/7 technical support and incident management for end-users.' },
                { label: 'Network Monitoring', desc: 'Proactive oversight of connectivity, bandwidth, and hardware health.' },
                { label: 'Endpoint Management', desc: 'Automated patching, software deployment, and security for user devices.' },
                { label: 'Security Services', desc: 'Managed firewall, EDR, and SOC monitoring for threat protection.' },
                { label: 'Cloud Management', desc: 'Governance, cost optimization, and scaling of cloud infrastructure.' },
                { label: 'Backup & DR', desc: 'Automated data protection and disaster recovery orchestration.' }
              ].map((item, idx) => (
                <div key={idx} className="p-5 rounded-2xl bg-bg-primary border border-border-primary">
                  <p className="text-xs font-black text-telus-gray uppercase tracking-widest mb-2">{item.label}</p>
                  <p className="text-xs text-text-secondary leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Top Selling Services */}
            <div className="telus-card p-10 lg:col-span-2 bg-bg-secondary border-border-primary">
              <h3 className="text-xl font-black text-telus-gray flex items-center tracking-tight mb-8">
                <div className="p-2.5 bg-telus-purple/10 rounded-xl mr-4 border border-telus-purple/20 shadow-sm">
                  <TrendingUp className="w-6 h-6 text-telus-purple" />
                </div>
                Top Selling Services (Overall)
              </h3>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={productAnalytics.topSelling}>
                    <XAxis dataKey="name" hide />
                    <YAxis fontSize={10} fontStyle="bold" stroke="var(--color-text-secondary)" />
                    <Tooltip 
                      contentStyle={{ 
                        borderRadius: '16px', 
                        border: 'none', 
                        boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', 
                        fontSize: '11px', 
                        fontWeight: 'bold',
                        backgroundColor: 'var(--chart-tooltip-bg)',
                        color: 'var(--color-text-primary)'
                      }}
                      itemStyle={{ color: 'var(--color-text-primary)' }}
                      cursor={{ fill: 'var(--color-telus-purple)', opacity: 0.05 }}
                    />
                    <Bar dataKey="value" fill="var(--color-telus-purple)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
                {productAnalytics.topSelling.slice(0, 4).map((item, idx) => (
                  <div key={idx} className="p-3 rounded-xl bg-bg-primary border border-border-primary">
                    <p className="text-[9px] font-black text-text-secondary/50 uppercase tracking-widest truncate">{item.name}</p>
                    <p className="text-lg font-black text-telus-purple">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Adoption by Segment */}
            <div className="telus-card p-10 flex flex-col justify-between group bg-bg-secondary border-border-primary">
              <div>
                <h4 className="text-xs font-black text-telus-gray uppercase tracking-widest mb-8 flex items-center">
                  <div className="p-2 bg-telus-purple/10 rounded-lg mr-3">
                    <Users className="w-4 h-4 text-telus-purple" />
                  </div>
                  Adoption by Segment
                </h4>
                <div className="space-y-8">
                  {productAnalytics.adoptionBySegment.map((seg, idx) => (
                    <div key={idx} className="group/seg">
                      <div className="flex items-center justify-between text-[11px] font-black text-text-secondary uppercase tracking-widest mb-3">
                        <span>{seg.segment}</span>
                        <span className="text-telus-purple font-black">{seg.count} Customers</span>
                      </div>
                      <div className="w-full h-3 bg-bg-secondary rounded-full overflow-hidden border border-border-primary p-0.5">
                        <div 
                          className="h-full bg-telus-purple rounded-full transition-all duration-1000 ease-out shadow-sm" 
                          style={{ width: `${customers.length > 0 ? (seg.count / customers.length) * 100 : 0}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-10 p-6 rounded-3xl bg-telus-purple/5 border border-telus-purple/10 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 bg-telus-purple/10 rounded-bl-full -z-10"></div>
                <p className="text-[11px] font-black text-telus-purple uppercase tracking-widest mb-2">Portfolio Insight</p>
                <p className="text-sm text-telus-gray font-bold leading-relaxed">
                  Most customers are in the <span className="text-telus-purple font-black">{productAnalytics.adoptionBySegment.sort((a,b) => b.count - a.count)[0].segment}</span> segment.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Product Intensity Chart */}
            <div className="telus-card p-10 relative overflow-hidden group bg-bg-secondary border-border-primary">
              <div className="absolute top-0 right-0 w-40 h-40 bg-telus-purple/5 rounded-bl-full -z-10 transition-transform group-hover:scale-110"></div>
              <div className="flex items-center justify-between mb-10">
                <h3 className="text-xl font-black text-telus-gray flex items-center tracking-tight">
                  <div className="p-2.5 bg-telus-purple/10 rounded-xl mr-4 border border-telus-purple/20 shadow-sm">
                    <PieChartIcon className="w-6 h-6 text-telus-purple" />
                  </div>
                  Product Intensity (Portfolio Mix)
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={productIntensity}
                        cx="50%"
                        cy="50%"
                        innerRadius={70}
                        outerRadius={100}
                        paddingAngle={8}
                        dataKey="value"
                        stroke="none"
                      >
                        {productIntensity.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ 
                          borderRadius: '20px', 
                          border: 'none', 
                          boxShadow: '0 20px 50px rgba(0,0,0,0.2)', 
                          fontWeight: 'bold',
                          backgroundColor: 'var(--chart-tooltip-bg)',
                          color: 'var(--color-text-primary)'
                        }}
                        itemStyle={{ color: 'var(--color-text-primary)' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-4">
                  {productIntensity.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3.5 rounded-2xl border border-border-primary bg-bg-primary hover:bg-bg-secondary hover:shadow-md transition-all">
                      <div className="flex items-center">
                        <div className="w-3.5 h-3.5 rounded-full mr-4 shadow-sm" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></div>
                        <span className="text-sm font-black text-telus-gray">{item.name}</span>
                      </div>
                      <span className="text-sm font-black text-telus-purple">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Intensity Drivers (Simplified version to fit side-by-side) */}
            <div className="telus-card p-10 relative group/card overflow-hidden bg-bg-secondary border-border-primary">
              <div className="absolute top-0 right-0 w-48 h-48 bg-telus-purple/5 rounded-bl-full rounded-tr-[40px] -z-10 transition-transform group-hover/card:scale-110"></div>
              <div className="flex items-center justify-between mb-12">
                <div className="flex items-center">
                  <h3 className="text-xl font-black text-telus-gray flex items-center tracking-tight">
                    <div className="p-2.5 bg-telus-purple/10 rounded-xl mr-4 border border-telus-purple/20 shadow-sm">
                      <AlertCircle className="w-6 h-6 text-telus-purple" />
                    </div>
                    Intensity Drivers
                  </h3>
                </div>
              </div>

              <div className="space-y-10">
                {productAnalytics.intensityDrivers.map((driver, idx) => (
                  <div key={idx} className="space-y-3">
                    <div className="flex justify-between items-end">
                      <span className="text-xs font-black text-text-secondary uppercase tracking-widest">{driver.label}</span>
                      <span className="text-sm font-black text-telus-gray">{driver.value}%</span>
                    </div>
                    <div className="h-3 bg-bg-secondary rounded-full overflow-hidden border border-border-primary p-0.5">
                      <div 
                        className={cn("h-full rounded-full transition-all duration-1000 ease-out shadow-sm", driver.color)}
                        style={{ width: `${driver.value}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
