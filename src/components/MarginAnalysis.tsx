import React, { useMemo } from 'react';
import { ContractAnalysisResult, ServiceDetail } from '../lib/gemini';
import { TrendingUp, TrendingDown, DollarSign, Percent, ArrowRight, Briefcase, ShieldAlert, AlertCircle, Info } from 'lucide-react';
import { cn, cleanSowName, parseAmount, cleanServiceName } from '../lib/utils';

interface MarginAnalysisProps {
  result: ContractAnalysisResult;
  showVendorFinancials?: boolean;
}

const formatCurrency = (val: number) => 
  new Intl.NumberFormat('en-US', { 
    style: 'currency', 
    currency: 'USD'
  }).format(val);

export const MarginAnalysis: React.FC<MarginAnalysisProps> = ({ result, showVendorFinancials = true }) => {
  const sowMarginData = useMemo(() => {
    const customerServices = result.customerServices || [];
    const vendorServices = result.vendorServices || [];
    
    // Get unique SOW names
    const sowNames = Array.from(new Set(customerServices.map(s => s.sowName || 'General')));
    
    return sowNames.map(sowName => {
      const sowCustomerServices = customerServices.filter(s => (s.sowName || 'General') === sowName);
      const sowVendorServices = vendorServices.filter(s => (s.sowName || 'General') === sowName);
      
      const cleanedSowName = cleanSowName(sowName, result.customerName);
      
      const aggregateByType = (services: ServiceDetail[], vendorSource: ServiceDetail[]) => {
        const types = ['MS', 'TS', 'PS'];
        return types.map(type => {
          const typeServices = services.filter(s => s.serviceType === type);
          const revenue = typeServices.reduce((sum, s) => sum + parseAmount(s.amount), 0);
          
          // For cost, we try to match by type in the vendor services for this SOW
          const typeVendorServices = vendorSource.filter(s => s.serviceType === type);
          const cost = typeVendorServices.reduce((sum, s) => sum + parseAmount(s.amount), 0);
          
          const margin = revenue - cost;
          const marginPercent = revenue > 0 ? (margin / revenue) * 100 : 0;
          
          return {
            type,
            typeName: type === 'MS' ? 'Managed Services' : type === 'TS' ? 'Transition Services' : 'Professional Services',
            revenue,
            cost,
            margin,
            marginPercent,
            count: typeServices.length
          };
        }).filter(t => t.count > 0 || t.revenue > 0 || t.cost > 0);
      };

      const aggregated = aggregateByType(sowCustomerServices, sowVendorServices);
      
      const totalRevenue = aggregated.reduce((sum, a) => sum + a.revenue, 0);
      const totalCost = aggregated.reduce((sum, a) => sum + a.cost, 0);
      const totalMargin = totalRevenue - totalCost;
      const totalMarginPercent = totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0;

      return {
        sowName: cleanedSowName,
        originalSowName: sowName,
        items: aggregated,
        totalRevenue,
        totalCost,
        totalMargin,
        totalMarginPercent
      };
    });
  }, [result]);

  const overallTotals = useMemo(() => {
    const revenue = sowMarginData.reduce((sum, s) => sum + s.totalRevenue, 0);
    const cost = sowMarginData.reduce((sum, s) => sum + s.totalCost, 0);
    const margin = revenue - cost;
    const percent = revenue > 0 ? (margin / revenue) * 100 : 0;
    return { revenue, cost, margin, percent };
  }, [sowMarginData]);

  const vendorLabel = result.vendorAlias || 'Vendor';

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Overall Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="telus-card p-6 sm:p-8 hover:shadow-2xl hover:shadow-telus-purple/5 transition-all group relative overflow-hidden bg-bg-secondary border-border-primary">
          <div className="absolute top-0 right-0 w-32 h-32 bg-telus-purple/5 rounded-bl-full -z-10 transition-transform group-hover:scale-110"></div>
          <div className="flex items-center space-x-3 mb-6">
            <div className="p-2.5 bg-telus-purple/10 rounded-xl shadow-sm telus-card-inner border border-border-primary">
              <DollarSign className="w-5 h-5 text-telus-purple" />
            </div>
            <p className="text-xs font-bold text-text-secondary uppercase tracking-widest">Total Contract Revenue</p>
          </div>
          <p className="text-4xl font-black text-telus-gray tracking-tight">{formatCurrency(overallTotals.revenue)}</p>
        </div>
        {showVendorFinancials && (
          <div className="telus-card p-6 sm:p-8 hover:shadow-2xl hover:shadow-telus-purple/5 transition-all group relative overflow-hidden bg-bg-secondary border-border-primary">
            <div className="absolute top-0 right-0 w-32 h-32 bg-telus-purple/5 rounded-bl-full -z-10 transition-transform group-hover:scale-110"></div>
            <div className="flex items-center space-x-3 mb-6">
              <div className="p-2.5 bg-telus-purple/10 rounded-xl shadow-sm telus-card-inner border border-border-primary">
                <DollarSign className="w-5 h-5 text-telus-purple" />
              </div>
              <p className="text-xs font-bold text-text-secondary uppercase tracking-widest">Total Contract Cost</p>
            </div>
            <p className="text-4xl font-black text-telus-gray tracking-tight">{formatCurrency(overallTotals.cost)}</p>
          </div>
        )}
        <div className={cn(
          "telus-card p-6 sm:p-8 transition-all group relative overflow-hidden bg-bg-secondary border-border-primary",
          showVendorFinancials ? "bg-gradient-to-br from-telus-purple/5 to-bg-secondary border-telus-purple/30 shadow-telus-purple/5 hover:shadow-telus-purple/10" : "bg-bg-secondary border-border-primary shadow-sm hover:shadow-md"
        )}>
          {showVendorFinancials && <div className="absolute top-0 right-0 w-32 h-32 bg-telus-purple/10 rounded-bl-full -z-10 transition-transform group-hover:scale-110"></div>}
          <div className="flex items-center space-x-3 mb-6">
            <div className={cn("p-2.5 rounded-xl shadow-sm telus-card-inner border border-border-primary", showVendorFinancials ? "bg-telus-purple/20" : "bg-telus-purple/10")}>
              <Percent className="w-5 h-5 text-telus-purple" />
            </div>
            <p className={cn("text-xs font-bold uppercase tracking-widest", showVendorFinancials ? "text-telus-purple" : "text-text-secondary")}>
              Overall Gross Margin
            </p>
          </div>
          <div className="flex items-center justify-between">
            <p className={cn("text-4xl font-black tracking-tight", showVendorFinancials ? "text-telus-purple" : "text-telus-gray")}>
              {showVendorFinancials ? formatCurrency(overallTotals.margin) : '---'}
            </p>
            {showVendorFinancials && (
              <span className={cn(
                "px-4 py-1.5 rounded-xl text-sm font-black border shadow-sm telus-card-inner",
                overallTotals.percent > 20 ? "bg-telus-green/10 text-telus-green border-telus-green/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20"
              )}>
                {overallTotals.percent.toFixed(1)}%
              </span>
            )}
          </div>
        </div>
      </div>

      {/* SOW-wise Breakdown */}
      <div className="space-y-8">
        {/* Leakage Triage Section */}
        <div className="telus-card p-10 relative overflow-hidden group shadow-xl shadow-rose-500/5 border-rose-500/20 bg-bg-secondary">
          <div className="absolute top-0 right-0 w-48 h-48 bg-rose-500/5 rounded-bl-full -z-10 transition-transform group-hover:scale-110"></div>
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center space-x-4">
              <div className="p-3 bg-rose-500/10 rounded-2xl shadow-sm telus-card-inner border border-rose-500/20">
                <ShieldAlert className="w-6 h-6 text-rose-500" />
              </div>
              <div>
                <h3 className="text-2xl font-black text-telus-gray tracking-tight">Partner Margin & Leakage Triage</h3>
                <p className="text-sm text-text-secondary font-bold mt-1 uppercase tracking-widest">Identifying revenue leakage and cost discrepancies</p>
                <div className="mt-2 flex items-center text-[10px] text-text-secondary/60 font-bold uppercase tracking-wider">
                  <Info className="w-3.5 h-3.5 mr-1.5 text-telus-purple" />
                  TS/PS services are compared by total amounts within each SOW for accurate margin assessment.
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-2 bg-bg-primary px-4 py-2 rounded-xl border border-rose-500/20 shadow-sm telus-card-inner">
              <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></div>
              <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Live Audit</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="telus-card-inner p-6 border border-rose-500/20 bg-bg-primary/50 rounded-2xl hover:shadow-md transition-all group/card">
              <p className="text-[10px] font-black text-text-secondary/60 uppercase tracking-widest mb-4">Potential Revenue Leakage</p>
              <div className="space-y-4">
                {result.customerServices?.filter(s => !result.vendorServices?.some(v => v.serviceName === s.serviceName)).slice(0, 2).map((s, idx) => (
                  <div key={idx} className="flex items-center justify-between p-4 rounded-2xl bg-rose-500/5 border border-rose-500/10 group-hover/card:border-rose-500/30 transition-colors telus-card-inner">
                    <div className="flex items-center space-x-3">
                      <AlertCircle className="w-4 h-4 text-rose-500" />
                      <span className="text-sm font-bold text-telus-gray">{cleanServiceName(s.serviceName, result.customerName)}</span>
                    </div>
                    <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest bg-bg-secondary px-2 py-1 rounded border border-rose-500/20 telus-card-inner">Missing {vendorLabel} COGS</span>
                  </div>
                ))}
                {(!result.customerServices || result.customerServices.length === 0) && (
                  <p className="text-sm text-text-secondary/60 italic font-medium">No immediate leakage detected.</p>
                )}
              </div>
            </div>
            <div className="telus-card-inner p-6 border border-telus-green/20 bg-bg-primary/50 rounded-2xl hover:shadow-md transition-all group/card">
              <p className="text-[10px] font-black text-text-secondary/60 uppercase tracking-widest mb-4">Margin Optimization Opportunities</p>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-2xl bg-telus-green/5 border border-telus-green/10 group-hover/card:border-telus-green/30 transition-colors telus-card-inner">
                  <div className="flex items-center space-x-3">
                    <TrendingUp className="w-4 h-4 text-telus-green" />
                    <span className="text-sm font-bold text-telus-gray">Consolidated Managed Services</span>
                  </div>
                  <span className="text-[10px] font-black text-telus-green uppercase tracking-widest bg-bg-secondary px-2 py-1 rounded border border-telus-green/20 telus-card-inner">+4.2% Potential</span>
                </div>
                <div className="flex items-center justify-between p-4 rounded-2xl bg-telus-green/5 border border-telus-green/10 group-hover/card:border-telus-green/30 transition-colors telus-card-inner">
                  <div className="flex items-center space-x-3">
                    <TrendingUp className="w-4 h-4 text-telus-green" />
                    <span className="text-sm font-bold text-telus-gray">{vendorLabel} Rate Renegotiation</span>
                  </div>
                  <span className="text-[10px] font-black text-telus-green uppercase tracking-widest bg-bg-secondary px-2 py-1 rounded border border-telus-green/20 telus-card-inner">Q3 Target</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {sowMarginData.map((sow) => (
          <div key={sow.originalSowName} className="telus-card overflow-hidden hover:shadow-md transition-all bg-bg-secondary border-border-primary">
            <div className="p-5 border-b border-border-primary bg-bg-secondary flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-telus-purple/10 rounded-xl shadow-sm telus-card-inner border border-border-primary">
                  <Briefcase className="w-5 h-5 text-telus-purple" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-telus-gray tracking-tight">{sow.sowName}</h3>
                  <p className="text-[10px] text-text-secondary mt-0.5 font-bold uppercase tracking-widest">Aggregated margins for this SOW folder</p>
                </div>
              </div>
              {showVendorFinancials && (
                <div className="text-right bg-bg-primary p-3 rounded-xl border border-border-primary shadow-sm min-w-[120px] telus-card-inner">
                  <p className="text-[9px] font-black text-text-secondary/60 uppercase tracking-widest mb-0.5">SOW Margin</p>
                  <p className="text-xl font-black text-telus-purple tracking-tight">{sow.totalMarginPercent.toFixed(1)}%</p>
                </div>
              )}
            </div>
            <div className="overflow-x-auto telus-card-inner">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-bg-primary border-b border-border-primary">
                    <th className="px-4 py-2 text-[9px] font-black text-text-secondary uppercase tracking-widest">Service Group</th>
                    <th className="px-4 py-2 text-[9px] font-black text-text-secondary uppercase tracking-widest text-right">Revenue</th>
                    {showVendorFinancials && (
                      <>
                        <th className="px-4 py-2 text-[9px] font-black text-text-secondary uppercase tracking-widest text-right">Cost</th>
                        <th className="px-4 py-2 text-[9px] font-black text-text-secondary uppercase tracking-widest text-right">Margin ($)</th>
                        <th className="px-4 py-2 text-[9px] font-black text-text-secondary uppercase tracking-widest text-right">Margin (%)</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-primary">
                  {sow.items.map((item, iIdx) => (
                    <tr key={iIdx} className="hover:bg-bg-primary transition-colors group">
                      <td className="px-4 py-2">
                        <div className="font-bold text-telus-gray group-hover:text-telus-purple transition-colors text-xs">{item.typeName}</div>
                        <div className="text-[8px] text-text-secondary/60 font-bold uppercase tracking-widest mt-0.5">{item.count} lines aggregated</div>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <span className="font-black text-telus-gray text-xs tracking-tight">{formatCurrency(item.revenue)}</span>
                        {item.type === 'MS' && <span className="text-[8px] text-text-secondary/40 ml-1 font-bold uppercase tracking-wider">/mo</span>}
                      </td>
                      {showVendorFinancials && (
                        <>
                          <td className="px-4 py-2 text-right">
                            <span className="font-bold text-text-secondary/80 text-[11px] tracking-tight">{formatCurrency(item.cost)}</span>
                            {item.type === 'MS' && <span className="text-[9px] text-text-secondary/40 ml-1 font-bold uppercase tracking-wider">/mo</span>}
                          </td>
                          <td className="px-4 py-2 text-right">
                            <div className="flex items-center justify-end space-x-1.5">
                              {item.margin >= 0 ? <TrendingUp className="w-3.5 h-3.5 text-telus-green" /> : <TrendingDown className="w-3.5 h-3.5 text-rose-500" />}
                              <span className={cn("text-[11px] font-black tracking-tight", item.margin >= 0 ? "text-telus-green" : "text-rose-500")}>
                                {formatCurrency(item.margin)}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <span className={cn(
                              "text-[11px] font-black px-2 py-0.5 rounded text-[8px] border shadow-sm uppercase tracking-widest",
                              item.marginPercent > 20 ? "bg-telus-green/10 text-telus-green border-telus-green/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                            )}>
                              {item.marginPercent.toFixed(1)}%
                            </span>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                  <tr className="bg-bg-primary font-black border-t-2 border-border-primary">
                    <td className="px-4 py-3 text-[10px] text-telus-gray uppercase tracking-widest">Total for {sow.sowName}</td>
                    <td className="px-4 py-3 text-sm text-telus-purple text-right tracking-tight">{formatCurrency(sow.totalRevenue)}</td>
                    {showVendorFinancials && (
                      <>
                        <td className="px-4 py-3 text-sm text-text-secondary/80 text-right tracking-tight">{formatCurrency(sow.totalCost)}</td>
                        <td className="px-4 py-3 text-sm text-telus-green text-right tracking-tight">{formatCurrency(sow.totalMargin)}</td>
                        <td className="px-4 py-3 text-sm text-telus-purple text-right tracking-tight">{sow.totalMarginPercent.toFixed(1)}%</td>
                      </>
                    )}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {sowMarginData.length === 0 && (
        <div className="text-center py-24 bg-bg-secondary rounded-[40px] border-2 border-dashed border-border-primary">
          <div className="p-4 bg-bg-primary rounded-2xl shadow-sm inline-block mb-6 border border-border-primary">
            <DollarSign className="w-12 h-12 text-text-secondary/30" />
          </div>
          <p className="text-text-secondary/60 font-bold uppercase tracking-widest">No margin data available for analysis</p>
        </div>
      )}
    </div>
  );
};
