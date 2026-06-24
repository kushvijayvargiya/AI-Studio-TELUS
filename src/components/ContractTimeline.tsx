import React, { useState, useMemo, useCallback } from 'react';
import { CustomerSummary } from '../lib/db';
import { ChevronDown, ChevronUp, Calendar, Clock, Briefcase, Filter, ShieldAlert, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';
import { cn, cleanSowName, cleanServiceName } from '../lib/utils';
import { addMonths, differenceInDays } from 'date-fns';

const parseTermToMonths = (term?: string): number | null => {
  if (!term || term === 'N/A') return null;
  const match = term.match(/(\d+)\s*(month|year)/i);
  if (!match) return null;
  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  if (unit.startsWith('year')) return value * 12;
  return value;
};

interface ContractTimelineProps {
  customers: CustomerSummary[];
}

export const ContractTimeline: React.FC<ContractTimelineProps> = ({ customers }) => {
  const [expandedSows, setExpandedSows] = useState<Record<string, boolean>>({});
  const [hidePS, setHidePS] = useState(false);
  const [isCollapsedView, setIsCollapsedView] = useState(false);
  const [sortField, setSortField] = useState<'name' | 'start' | 'end'>('end');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const toggleSow = useCallback((id: string) => {
    setExpandedSows(prev => ({ ...prev, [id]: !prev[id] }));
    setIsCollapsedView(false);
  }, []);

  const handleSort = (field: 'name' | 'start' | 'end') => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const SortIcon = ({ field }: { field: 'name' | 'start' | 'end' }) => {
    if (sortField !== field) return <RefreshCw className="w-2.5 h-2.5 ml-1 opacity-20" />;
    return sortDirection === 'asc' 
      ? <TrendingUp className="w-2.5 h-2.5 ml-1 text-telus-purple" /> 
      : <TrendingDown className="w-2.5 h-2.5 ml-1 text-telus-purple" />;
  };

  const collapseAll = useCallback(() => {
    setExpandedSows({});
    setIsCollapsedView(true);
  }, []);

  const processedData = useMemo(() => {
    return customers.map(customer => {
      const allServices = [
        ...(customer.result.customerServices || []),
        ...(customer.result.vendorServices || [])
      ];
      
      // Add services from change orders to ensure we capture everything
      /*
      customer.result.changeOrders?.forEach(co => {
        if (co.services) {
          co.services.forEach(s => {
            // Avoid duplicates if the service is already in allServices
            const exists = allServices.some(existing => 
              existing.serviceName === s.serviceName && 
              (existing.sowName === s.sowName || existing.sowName === co.associatedSOW)
            );
            if (!exists) {
              allServices.push({
                ...s,
                sowName: s.sowName || co.associatedSOW
              });
            }
          });
        }
      });
      */
      
      // Create a map of CO names to their associated SOWs for grouping
      const coToSowMap: Record<string, string> = {};
      customer.result.changeOrders?.forEach(co => {
        const coName = cleanSowName(co.changeOrderNumber, customer.customerName).toLowerCase();
        const sowName = cleanSowName(co.associatedSOW, customer.customerName);
        if (coName && sowName && coName !== sowName) {
          coToSowMap[coName] = sowName;
          // Also add version without extension
          const coNameNoExt = coName.replace(/\.(docx|pdf|doc)$/i, '');
          if (coNameNoExt !== coName) {
            coToSowMap[coNameNoExt] = sowName;
          }
        }
      });

      const getGroupKey = (rawName: string) => {
        const cleanName = cleanSowName(rawName, customer.customerName);
        const lower = cleanName.toLowerCase();
        
        // Check for direct match in coToSowMap
        if (coToSowMap[lower]) return coToSowMap[lower];
        
        // Check for partial match (e.g. "CR004292025_V1.docx" matches "CR004292025")
        for (const [coKey, sowName] of Object.entries(coToSowMap)) {
          if (lower.includes(coKey)) return sowName;
        }
        
        return cleanName;
      };
      
      // Group by SOW Name
      const sowGroups: Record<string, any> = {};
      
      allServices.forEach(s => {
        const sowName = getGroupKey(s.sowName || 'Unknown SOW');
        if (!sowGroups[sowName]) {
          sowGroups[sowName] = {
            sowName: sowName,
            services: []
          };
        }
        sowGroups[sowName].services.push(s);
      });

      const isChangeOrderName = (name: string) => {
        const lower = name.toLowerCase();
        
        // Direct CO keywords
        const isCO = lower.includes('change order') || 
               lower.includes('amendment') || 
               lower.includes('co #') || 
               lower.startsWith('co-') ||
               lower.includes('_cr') ||
               lower.includes(' cr') ||
               lower.startsWith('cr') ||
               lower.match(/cr\d+/) ||
               lower.includes('change request') ||
               customer.result.changeOrders?.some(co => {
                 const coNum = cleanSowName(co.changeOrderNumber, customer.customerName).toLowerCase();
                 return lower.includes(coNum) || coNum.includes(lower);
               });
        
        // Filter out generic document names that don't look like SOW titles
        const isGenericDoc = (lower.endsWith('.docx') || lower.endsWith('.pdf')) && 
                             (lower.match(/^\d+/) || lower.includes(' v1') || lower.includes(' v2'));

        return isCO || isGenericDoc;
      };

      return {
        customerName: customer.customerName,
        sows: Object.values(sowGroups)
          .filter(sow => !isChangeOrderName(sow.sowName))
          .map(sow => {
          // Determine SOW type
          const types = new Set(sow.services.map((s: any) => s.serviceType).filter(Boolean));
          let sowType = 'Mixed';
          if (types.has('MS')) {
            sowType = 'MS SOW';
          } else if (types.size === 1) {
            sowType = (Array.from(types)[0] as string) || 'Other';
          } else if (types.size === 0) {
            sowType = 'N/A';
          }

          if (sowType !== 'PS' && sowType !== 'MS SOW') return null;

          sow.isPS = sowType === 'PS';

          // Filter services for timeline calculation based on SOW type
          const timelineServices = sowType === 'MS SOW' 
            ? sow.services.filter((s: any) => s.serviceType === 'MS') 
            : sow.services;

          // Calculate dates
          let totalMonths = 0;
          let msTerm = null;
          timelineServices.forEach((s: any) => {
            const m = parseTermToMonths(s.term);
            if (s.serviceType === 'MS') {
              msTerm = s.term;
            }
            if (m && m > totalMonths) totalMonths = m;
          });

          const displayTerm = msTerm || (totalMonths > 0 ? `${totalMonths} months` : 'N/A');

          const dafDates = timelineServices
            .map((s: any) => s.dafStartDate || s.effectiveDate)
            .filter((d: any) => d && d !== 'N/A')
            .map((d: any) => new Date(d as string))
            .filter((d: any) => !isNaN(d.getTime()));
          
          const minDafDate = dafDates.length > 0
            ? new Date(Math.min(...dafDates.map((d: any) => d.getTime())))
            : null;

          let maxExpiryDate = null;
          if (minDafDate && totalMonths > 0) {
            maxExpiryDate = addMonths(minDafDate, totalMonths);
          } else {
            const expiryDates = timelineServices
              .map((s: any) => s.potentialEndDate || s.expiryDate)
              .filter((d: any) => d && d !== 'N/A')
              .map((d: any) => new Date(d as string))
              .filter((d: any) => !isNaN(d.getTime()));
            
            maxExpiryDate = expiryDates.length > 0 
              ? new Date(Math.max(...expiryDates.map((d: any) => d.getTime()))) 
              : null;
          }

          const daysToExpiry = maxExpiryDate ? differenceInDays(maxExpiryDate, new Date()) : null;
          const safeDaysToExpiry = (daysToExpiry !== null && !isNaN(daysToExpiry)) ? daysToExpiry : null;
          const riskLevel = safeDaysToExpiry !== null && safeDaysToExpiry <= 30 ? 'critical' : 
                           safeDaysToExpiry !== null && safeDaysToExpiry <= 90 ? 'warning' : 'healthy';

          // Check if SOW is unsigned based on the customer's unsignedDocuments list
          const isSowUnsignedInDocs = customer.result.unsignedDocuments?.some(doc => {
            const cleanDoc = cleanSowName(doc, customer.customerName).toLowerCase();
            const cleanGroupName = sow.sowName.toLowerCase();
            return cleanDoc.includes(cleanGroupName) || cleanGroupName.includes(cleanDoc);
          }) || false;
          const isSigned = !isSowUnsignedInDocs;

          return {
            ...sow,
            sowType,
            totalMonths,
            displayTerm,
            isSigned,
            startDate: minDafDate ? new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).format(minDafDate) : 'N/A',
            endDate: maxExpiryDate ? new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).format(maxExpiryDate) : 'N/A',
            startRaw: minDafDate ? minDafDate.getTime() : Infinity,
            endRaw: maxExpiryDate ? maxExpiryDate.getTime() : Infinity,
            daysToExpiry: safeDaysToExpiry,
            riskLevel
          };
        })
        .filter((sow): sow is NonNullable<typeof sow> => sow !== null)
      };
    });
  }, [customers]);

  const sortedData = useMemo(() => {
    // 1. Filter PS if needed
    let data = hidePS 
      ? processedData.map(c => ({ ...c, sows: c.sows.filter(s => !s.isPS) })).filter(c => c.sows.length > 0)
      : processedData;

    // 2. Sort SOWs within each customer
    data = data.map(customer => {
      const sortedSows = [...customer.sows].sort((a, b) => {
        let comparison = 0;
        if (sortField === 'name') comparison = a.sowName.localeCompare(b.sowName);
        else if (sortField === 'start') comparison = a.startRaw - b.startRaw;
        else if (sortField === 'end') comparison = a.endRaw - b.endRaw;
        
        return sortDirection === 'asc' ? comparison : -comparison;
      });
      return { ...customer, sows: sortedSows };
    });

    // 3. Sort customers by their "first" SOW based on the current sort criteria
    return [...data].sort((a, b) => {
      const aVal = a.sows[0];
      const bVal = b.sows[0];
      if (!aVal || !bVal) return 0;

      let comparison = 0;
      if (sortField === 'name') comparison = aVal.sowName.localeCompare(bVal.sowName);
      else if (sortField === 'start') comparison = aVal.startRaw - bVal.startRaw;
      else if (sortField === 'end') comparison = aVal.endRaw - bVal.endRaw;

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [processedData, hidePS, sortField, sortDirection]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-bg-secondary p-4 rounded-2xl border border-border-primary shadow-sm">
        <div className="flex items-center space-x-4">
          <h3 className="text-lg font-bold text-telus-gray">Contract Timeline</h3>
          <div className="flex items-center space-x-2 px-3 py-1 bg-telus-purple/10 rounded-full border border-telus-purple/20">
            <ShieldAlert className="w-3.5 h-3.5 text-telus-purple" />
            <span className="text-[10px] font-black text-telus-purple uppercase tracking-widest">Risk Monitoring Active</span>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <button 
            onClick={() => setHidePS(!hidePS)}
            className={cn("flex items-center px-4 py-2 rounded-xl text-sm font-bold border transition-colors", hidePS ? "bg-telus-purple text-white border-telus-purple" : "bg-bg-primary text-text-secondary border-border-primary hover:bg-bg-secondary")}
          >
            <Filter className="w-4 h-4 mr-2" />
            {hidePS ? 'Showing All' : 'Hide PS SOWs'}
          </button>
          <button 
            onClick={collapseAll}
            className="px-4 py-2 rounded-xl text-sm font-bold bg-bg-primary text-text-secondary border border-border-primary hover:bg-bg-secondary hover:text-telus-purple transition-colors"
          >
            Collapse All
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {sortedData.map((customer, cIdx) => (
          <div key={cIdx} className="bg-bg-secondary rounded-2xl border border-border-primary shadow-sm overflow-hidden">
            <div 
              className={cn("p-4 border-b border-border-primary bg-bg-secondary/50 flex justify-between items-center", isCollapsedView && "cursor-pointer hover:bg-bg-secondary")}
              onClick={() => isCollapsedView && setIsCollapsedView(false)}
            >
              <h4 className="text-lg font-bold text-telus-gray">{customer.customerName}</h4>
              {isCollapsedView && <span className="text-xs font-bold text-text-secondary bg-bg-primary px-2 py-0.5 rounded-full border border-border-primary">{customer.sows.length} SOWs</span>}
            </div>
            {!isCollapsedView && (
              <div className="divide-y divide-border-primary">
                <div className="flex items-center justify-between px-4 py-2 bg-bg-primary/30 text-[9px] font-bold text-text-secondary uppercase tracking-widest">
                  <div 
                    className="flex items-center space-x-3 cursor-pointer hover:text-telus-purple transition-colors"
                    onClick={() => handleSort('name')}
                  >
                    <span className="w-4"></span>
                    <span className="flex items-center">SOW Name <SortIcon field="name" /></span>
                  </div>
                  <div className="flex items-center space-x-6">
                    <span 
                      className="w-28 flex items-center justify-center cursor-pointer hover:text-telus-purple transition-colors"
                      onClick={() => handleSort('start')}
                    >
                      Start Date <SortIcon field="start" />
                    </span>
                    <span className="w-28 text-center">Term</span>
                    <span 
                      className="w-28 flex items-center justify-center cursor-pointer hover:text-telus-purple transition-colors"
                      onClick={() => handleSort('end')}
                    >
                      End Date <SortIcon field="end" />
                    </span>
                  </div>
                </div>
                {customer.sows.map((sow, sIdx) => {
                  const sowId = `${customer.customerName}-${sow.sowName}`;
                  const isExpanded = expandedSows[sowId];
                  
                  return (
                    <div key={sIdx}>
                      <button 
                        onClick={() => toggleSow(sowId)}
                        className={cn(
                          "w-full flex items-center justify-between p-4 hover:bg-bg-primary transition-colors relative overflow-hidden",
                          sow.riskLevel === 'critical' && "bg-rose-500/5",
                          sow.riskLevel === 'warning' && "bg-amber-500/5"
                        )}
                      >
                        {sow.riskLevel !== 'healthy' && (
                          <div className={cn(
                            "absolute left-0 top-0 bottom-0 w-1",
                            sow.riskLevel === 'critical' ? "bg-rose-500" : "bg-amber-500"
                          )} />
                        )}
                        <div className="flex items-center space-x-3">
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-text-secondary/50" /> : <ChevronDown className="w-4 h-4 text-text-secondary/50" />}
                          <div className="flex flex-col items-start text-left">
                            <div className="flex items-center space-x-2">
                              <span className="font-bold text-telus-gray text-sm">{sow.sowName}</span>
                              {!sow.isSigned && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter bg-rose-500/10 text-rose-500 border border-rose-500/20">
                                  Unsigned
                                </span>
                              )}
                            </div>
                            {sow.riskLevel !== 'healthy' && (
                              <span className={cn(
                                "text-[8px] font-black uppercase tracking-widest mt-0.5",
                                sow.riskLevel === 'critical' ? "text-rose-500" : "text-amber-500"
                              )}>
                                {sow.riskLevel === 'critical' ? 'Critical Expiry' : 'Expiring Soon'} ({sow.daysToExpiry} days)
                              </span>
                            )}
                          </div>
                          {sow.isPS && <span className="px-1.5 py-0.5 rounded bg-bg-primary border border-border-primary text-[9px] font-bold text-text-secondary uppercase">PS</span>}
                        </div>
                        <div className="flex items-center space-x-6 text-xs text-text-secondary font-medium">
                          <span className="flex items-center w-28"><Calendar className="w-3.5 h-3.5 mr-1.5 text-text-secondary/50" /> {sow.startDate}</span>
                          <span className="flex items-center w-28"><Clock className="w-3.5 h-3.5 mr-1.5 text-text-secondary/50" /> {sow.displayTerm}</span>
                          <span className="flex items-center w-28"><Briefcase className="w-3.5 h-3.5 mr-1.5 text-text-secondary/50" /> {sow.endDate}</span>
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="px-4 pb-4 bg-bg-primary/20">
                          {Object.entries(sow.services.reduce((acc: any, service: any) => {
                            const type = service.serviceType || 'Other';
                            if (!acc[type]) acc[type] = [];
                            acc[type].push(service);
                            return acc;
                          }, {})).map(([type, services]: [string, any]) => (
                            <div key={type} className="mb-4 last:mb-0">
                              <h5 className="text-[10px] font-bold text-text-secondary/60 uppercase tracking-wider mb-1.5">{type}</h5>
                              <table className="w-full text-xs text-text-secondary/80">
                                <tbody className="divide-y divide-border-primary">
                                  {services.map((service: any, idx: number) => (
                                    <tr key={idx}>
                                      <td className="py-2 font-medium text-telus-gray">
                                        {cleanServiceName(service.serviceName, customer.customerName)}
                                      </td>
                                      <td className="py-2 text-right">{service.term || 'N/A'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
