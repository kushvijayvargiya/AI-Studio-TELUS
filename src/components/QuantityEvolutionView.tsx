import React, { useMemo, useState } from 'react';
import { ContractAnalysisResult, ServiceDetail } from '../lib/gemini';
import { TrendingUp, Eye, EyeOff } from 'lucide-react';
import { cn, cleanServiceName, isUserBased, isInfrastructureBased, cleanSowName } from '../lib/utils';
import { getNumOrNull } from '../lib/contractUtils';

interface QuantityEvolutionViewProps {
  result: ContractAnalysisResult;
}

export const QuantityEvolutionView: React.FC<QuantityEvolutionViewProps> = ({ result }) => {
  const [showOneTimeCosts, setShowOneTimeCosts] = useState(false);

  const normalizeSow = (str: string) => {
    return str.toLowerCase()
      .replace(/\([^)]*\)/g, '') // Remove parentheses
      .replace(/sow|co|change order|contract|signed|active|final|draft|v\d+|version|rev\d+|revision/gi, '') // Remove common words
      .replace(/[^a-z0-9]/g, '') // Keep only alphanumeric for the key
      .trim();
  };

  const normalizeService = (str: string) => {
    return str.toLowerCase()
      .replace(/\([^)]*\)/g, '') // Remove parentheses and their contents
      .replace(/managed|service|essentials|advanced|premium|standard|basic|professional|transition/gi, '') // Remove common qualifiers
      .replace(/[^a-z0-9]/g, '') // Keep only alphanumeric for the key
      .trim();
  };

  const evolutionDataBySOW = useMemo(() => {
    const sowGroups: Record<string, {
      sowName: string;
      services: Record<string, {
        serviceName: string;
        serviceType?: string;
        description?: string;
        history: { name: string; quantity: number; total: number; prev: number | null; change: number | null; isSigned: boolean; date: string; type: 'SOW' | 'CO' }[];
      }>
    }> = {};

    // Helper to add to history
    const addToHistory = (s: ServiceDetail, name: string, type: 'SOW' | 'CO', date: string) => {
      const rawSowName = cleanSowName(s.sowName || 'SOW', result.customerName);
      const sowNameKey = normalizeSow(rawSowName) || 'sow';
      const rawServiceName = (s.serviceName || 'Unknown Service').trim();

      if (!sowGroups[sowNameKey]) {
        sowGroups[sowNameKey] = { sowName: rawSowName, services: {} };
      }
      
      // Find matching service key to group similar services
      const existingKeys = Object.keys(sowGroups[sowNameKey].services);
      let serviceName = rawServiceName;
      
      const normalizedNew = rawServiceName.toLowerCase().trim();
      const baseNew = normalizeService(rawServiceName);
      
      // 1. Exact match (case-insensitive, trimmed)
      const exactMatch = existingKeys.find(k => k.toLowerCase().trim() === normalizedNew);
      
      if (exactMatch) {
        serviceName = exactMatch;
      } else if (baseNew.length >= 2) {
        // 2. Aggressive base name match
        const baseMatch = existingKeys.find(k => {
          const baseExisting = normalizeService(k);
          return baseExisting === baseNew || (baseExisting.length > 3 && baseNew.length > 3 && (baseExisting.includes(baseNew) || baseNew.includes(baseExisting)));
        });
        
        if (baseMatch) {
          serviceName = baseMatch;
        }
      }

      if (!sowGroups[sowNameKey].services[serviceName]) {
        sowGroups[sowNameKey].services[serviceName] = { serviceName, serviceType: s.serviceType, description: s.description, history: [] };
      }
      
      const total = getNumOrNull(s.totalQuantity || s.onboardedQuantity);
      const prev = getNumOrNull(s.previousQuantity);
      const change = getNumOrNull(s.changeQuantity);
      
      let qty = 0;
      if (type === 'SOW') {
        qty = total || 0;
      } else {
        // For CO, prioritize explicit change
        if (change !== null) {
          qty = change;
        } else if (total !== null && prev !== null) {
          qty = total - prev;
        } else if (total !== null) {
          // If only total is provided, we'll calculate delta later based on running total
          qty = total; 
        }
      }

      sowGroups[sowNameKey].services[serviceName].history.push({
        name,
        quantity: isNaN(qty) ? 0 : qty,
        total: total || 0,
        prev: prev,
        change: change,
        isSigned: s.isSigned,
        date,
        type
      });
    };

    // 1. Initial SOW services (Customer facing)
    result.customerServices?.forEach(s => {
      addToHistory(s, s.sowName || 'SOW', 'SOW', s.effectiveDate || s.dafStartDate || 'N/A');
    });

    // 2. Change Order services (Customer facing, signed only)
    result.changeOrders?.forEach(co => {
      if (co.facing?.toLowerCase() !== 'vendor' && co.isSigned) {
        co.services?.forEach(s => {
          if (s.isSigned) {
            // Use associatedSOW from CO to ensure it matches the SOW key
            const serviceWithSow = { ...s, sowName: co.associatedSOW || s.sowName };
            addToHistory(serviceWithSow, co.changeOrderNumber || 'CO', 'CO', s.effectiveDate || co.date);
          }
        });
      }
    });

    // Sort history by date for each service to calculate running totals correctly
    Object.values(sowGroups).forEach(sow => {
      Object.values(sow.services).forEach(g => {
        g.history.sort((a, b) => {
          const dateA = new Date(a.date).getTime();
          const dateB = new Date(b.date).getTime();
          if (!isNaN(dateA) && !isNaN(dateB)) return dateA - dateB;
          if (a.type === 'SOW' && b.type === 'CO') return -1;
          if (a.type === 'CO' && b.type === 'SOW') return 1;
          return 0;
        });

        // Calculate deltas based on running total if previousQuantity was missing
        let runningTotal = 0;
        g.history.forEach((h) => {
          if (h.type === 'SOW') {
            runningTotal = h.total;
          } else {
            // It's a CO. 
            // If change was explicitly provided, use it
            if (h.change !== null) {
              h.quantity = h.change;
            } else if (h.prev === null) {
              // If prev was missing, h.quantity was set to total.
              // We need to adjust it to be the delta: total - runningTotal
              h.quantity = h.total - runningTotal;
            }
            runningTotal = h.total;
          }
        });
      });
    });

    return Object.values(sowGroups).map(sow => {
      let services = Object.values(sow.services);
      
      if (!showOneTimeCosts) {
        services = services.filter(s => {
          const type = s.serviceType?.toUpperCase();
          return type !== 'PS' && type !== 'TS' && 
                 !s.serviceName.toLowerCase().includes('professional') && 
                 !s.serviceName.toLowerCase().includes('transition');
        });
      }

      return {
        sowName: sow.sowName,
        services
      };
    }).filter(sow => sow.services.length > 0);
  }, [result, showOneTimeCosts]);

  const formatDate = (dateStr: string) => {
    if (!dateStr || dateStr === 'N/A') return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d);
  };

  return (
    <div className="telus-card overflow-hidden animate-in fade-in zoom-in duration-500">
      <div className="p-8 sm:p-10 border-b border-border-primary bg-bg-secondary/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-2xl font-black text-telus-gray flex items-center tracking-tight">
            <div className="p-3 bg-telus-green/10 rounded-2xl mr-5 border border-telus-green/20 shadow-sm">
              <TrendingUp className="w-6 h-6 text-telus-green" />
            </div>
            Service Quantity Evolution
          </h3>
          <p className="text-sm text-text-secondary mt-2 font-medium ml-14">Tracking service volume changes across SOWs and Change Orders</p>
        </div>
        
        <button 
          onClick={() => setShowOneTimeCosts(!showOneTimeCosts)}
          className="flex items-center space-x-1 text-[9px] font-bold uppercase tracking-wider text-text-secondary hover:text-telus-gray transition-colors bg-bg-primary hover:bg-bg-secondary px-3 py-1.5 rounded-lg border border-border-primary shadow-sm self-start sm:self-center"
        >
          {showOneTimeCosts ? (
            <>
              <EyeOff className="w-3.5 h-3.5 text-text-secondary/50" />
              <span>Hide One-Time Costs</span>
            </>
          ) : (
            <>
              <Eye className="w-3.5 h-3.5 text-text-secondary/50" />
              <span>Show One-Time Costs</span>
            </>
          )}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-bg-secondary/30 border-b border-border-primary">
              <th className="px-4 py-2 text-[10px] font-black text-text-secondary/50 uppercase tracking-widest">Service</th>
              <th className="px-4 py-2 text-[10px] font-black text-text-secondary/50 uppercase tracking-widest">SOW Qty</th>
              <th className="px-4 py-2 text-[10px] font-black text-text-secondary/50 uppercase tracking-widest">Evolution</th>
              <th className="px-4 py-2 text-[10px] font-black text-text-secondary/50 uppercase tracking-widest">Final Qty</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-primary/50">
            {evolutionDataBySOW.map((sowGroup, sowGroupIdx) => (
              <React.Fragment key={sowGroupIdx}>
                {/* SOW Header Row */}
                <tr className="bg-bg-secondary/20 border-y border-border-primary">
                  <td colSpan={4} className="px-4 py-1.5 text-[10px] font-black text-telus-purple uppercase tracking-widest bg-telus-purple/5">
                    {sowGroup.sowName}
                  </td>
                </tr>
                {/* Services for this SOW */}
                {sowGroup.services.map((item, idx) => {
                  const sowEntry = item.history.find(h => h.type === 'SOW');
                  const rawSowQty = sowEntry ? sowEntry.quantity : 0;
                  const sowQty = isNaN(rawSowQty) ? 0 : rawSowQty;
                  const hasSow = !!sowEntry;
                  const coEntries = item.history.filter(h => h.type === 'CO');
                  const rawFinalQty = sowQty + coEntries.reduce((sum, co) => sum + (isNaN(co.quantity) ? 0 : co.quantity), 0);
                  const finalQty = isNaN(rawFinalQty) ? 0 : rawFinalQty;
                  
                  return (
                    <tr key={`${sowGroupIdx}-${idx}`} className="hover:bg-bg-secondary/30 transition-colors group">
                      <td className="px-4 py-2">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-telus-gray text-xs group-hover:text-telus-purple transition-colors" title={item.serviceName}>
                            {cleanServiceName(item.serviceName, result.customerName)}
                          </span>
                          {isUserBased(item.serviceName, item.description || '', item.serviceType) ? (
                            <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded bg-telus-purple/10 text-telus-purple text-[8px] font-black border border-telus-purple/20 shadow-sm shrink-0" title="User Based">U</span>
                          ) : isInfrastructureBased(item.serviceName, item.description || '', item.serviceType) ? (
                            <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded bg-bg-secondary text-telus-gray text-[8px] font-black border border-border-primary shadow-sm shrink-0" title="Infrastructure Based">I</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-[10px] font-bold text-text-secondary">
                        {hasSow ? String(sowQty) : 'N/A'}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex flex-col space-y-1">
                          {coEntries.length === 0 ? (
                            <span className="text-[9px] text-text-secondary/50 italic font-medium">No changes</span>
                          ) : (
                            coEntries.map((h, hIdx) => (
                              <div key={hIdx} className="flex items-center justify-between p-1.5 rounded bg-bg-primary border border-border-primary shadow-sm group-hover:border-telus-purple/30 transition-all min-w-[100px]">
                                <div className="flex flex-col">
                                  <span className="text-[8px] text-text-secondary font-black uppercase tracking-widest">{h.name}</span>
                                  {h.date && h.date !== 'N/A' && (
                                    <span className="text-[7px] text-text-secondary/50 font-medium">{formatDate(h.date)}</span>
                                  )}
                                </div>
                                <span className={cn(
                                  "text-[9px] font-black px-1 py-0 rounded border shadow-sm ml-2",
                                  (isNaN(h.quantity) ? 0 : h.quantity) >= 0 
                                    ? "bg-telus-green/10 text-telus-green border-telus-green/20" 
                                    : "bg-rose-500/10 text-rose-500 border-rose-500/20"
                                )}>
                                  {`${(isNaN(h.quantity) ? 0 : h.quantity) >= 0 ? '+' : ''}${String(isNaN(h.quantity) ? 0 : h.quantity)}`}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex flex-col">
                          <span className="font-black text-telus-green text-xs leading-none">{String(finalQty)}</span>
                          <span className="text-[7px] text-text-secondary/50 font-bold uppercase tracking-widest mt-0.5">Total Units</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
