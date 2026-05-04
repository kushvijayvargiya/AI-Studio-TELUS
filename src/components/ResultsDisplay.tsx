import React, { useState, useMemo, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { ContractAnalysisResult, ServiceDetail } from '../lib/gemini';
import { ParsedDocument } from '../lib/zipParser';
import { Building2, Calendar, FileText, Activity, AlertCircle, FileWarning, CheckCircle2, XCircle, Clock, Briefcase, Users, UserCheck, Database, Cloud, DollarSign, Eye, EyeOff, LayoutDashboard, CalendarDays, ChevronDown, ChevronUp, FoldVertical, UnfoldVertical, RefreshCw, Percent, ShieldAlert, MessageSquare, TrendingUp, TrendingDown, Filter, Info, Waypoints, ChevronRight, UploadCloud, ShieldCheck } from 'lucide-react';
import { cn, cleanSowName as utilsCleanSowName, cleanServiceName, parseAmount, formatCurrency, formatAmountString, isUserBased, isInfrastructureBased, normalizeSow } from '../lib/utils';
import { getCustomer } from '../lib/db';
import { MonthlyBilling } from './MonthlyBilling';
import { MarginAnalysis } from './MarginAnalysis';
import { RiskDashboard } from './RiskDashboard';
import { RevenueWaterfall } from './RevenueWaterfall';
import { ChatWithContract } from './ChatWithContract';
import { QuantityEvolutionView } from './QuantityEvolutionView';
import { CustomerIntelligence } from './CustomerIntelligence';
import { SmartDashboard } from './SmartDashboard';
import { BrainCircuit, Sparkles } from 'lucide-react';
import { parseDate, checkActive, getNum, calculateBilledAmount, getDerivedUnitPrice } from '../lib/contractUtils';
import { Skeleton, SkeletonCard, SkeletonTable } from './ui/Skeleton';
import { Tooltip } from './ui/Tooltip';
import { UserRole } from '../App';
import { getAuditLogs, AuditLog } from '../lib/db';
import { format } from 'date-fns';

const parseTermToMonths = (term?: string): number | null => {
  if (!term || term === 'N/A') return null;
  const match = term.match(/(\d+)\s*(month|year)/i);
  if (!match) return null;
  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  if (unit.startsWith('year')) return value * 12;
  return value;
};

const addMonths = (date: Date, months: number): Date => {
  const newDate = new Date(date.getTime());
  newDate.setMonth(newDate.getMonth() + months);
  return newDate;
};

interface ResultsDisplayProps {
  result: ContractAnalysisResult;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  initialTab?: 'overview' | 'monthly_billing' | 'timeline' | 'evolution' | 'intelligence' | 'smart_insights' | 'margin_analysis' | 'risk_dashboard' | 'revenue_forecast' | 'daf' | 'audit_logs';
  onUpdateResult?: (result: ContractAnalysisResult) => void;
  onFileSelect?: (file: File, customerId?: string) => void;
  customerId?: string;
  userRole?: UserRole;
}

const ServiceTable: React.FC<{ 
  title: string, 
  services: ServiceDetail[], 
  showDocuments?: boolean, 
  context?: 'sow' | 'co', 
  customerName?: string, 
  onToggleDaf?: (service: ServiceDetail) => void,
  onUpdateService?: (service: ServiceDetail, updates: Partial<ServiceDetail>) => void,
  userRole?: UserRole
}> = ({ title, services, showDocuments = true, context = 'sow', customerName, onToggleDaf, onUpdateService, userRole }) => {
  if (services.length === 0) return null;

  let oneTime = 0;
  let recurring = 0;
  let hasAmounts = false;

  services.forEach(s => {
    if (s.amount) {
      hasAmounts = true;
      const billedAmount = calculateBilledAmount(s);
      const isMS = s.serviceType === 'MS' || s.serviceType?.toLowerCase().includes('managed');
      if (isMS || s.amount.toLowerCase().includes('month') || s.amount.toLowerCase().includes('year')) {
        recurring += billedAmount;
      } else {
        oneTime += billedAmount;
      }
    }
  });

  const totalParts = [];
  if (oneTime !== 0) totalParts.push(`${formatCurrency(oneTime)} (One-time)`);
  if (recurring !== 0) totalParts.push(`${formatCurrency(recurring)}/month`);
  const totalDisplay = totalParts.length > 0 ? totalParts.join(' + ') : (hasAmounts ? '$0' : null);

  const isSow = context === 'sow';
  const col1Header = isSow ? 'SOW Qty' : 'Before CO';
  const col2Header = isSow ? 'Onboarded' : 'After CO';

  return (
    <div className="mb-6 last:mb-0">
      <h4 className="text-[10px] font-black text-text-secondary mb-2 flex items-center uppercase tracking-widest px-1">
        <span className="w-1 h-3 bg-telus-purple/30 rounded-full mr-2.5"></span>
        {title}
      </h4>
      <div className="overflow-x-auto telus-card-inner bg-bg-secondary/20">
        <table className="w-full text-left text-sm text-text-primary table-fixed">
          <thead className="bg-bg-primary/50 border-b border-border-primary text-text-primary">
            <tr>
              <th className={cn(isSow ? "w-[30%]" : "w-[25%]", "px-2 py-1 font-black text-[9px] uppercase tracking-widest text-text-secondary")}>Service</th>
              <th className={cn(isSow ? "w-[10%]" : "w-[8%]", "px-2 py-1 font-black text-[9px] uppercase tracking-widest text-text-secondary text-center")}>{col1Header}</th>
              {!isSow && <th className="w-[8%] px-2 py-1 font-black text-[9px] uppercase tracking-widest text-text-secondary text-center">Change</th>}
              <th className={cn(isSow ? "w-[10%]" : "w-[8%]", "px-2 py-1 font-black text-[9px] uppercase tracking-widest text-text-secondary text-center")}>{col2Header}</th>
              <th className="w-[15%] px-2 py-1 font-black text-[9px] uppercase tracking-widest text-text-secondary text-center">Effective</th>
              <th className="w-[12%] px-2 py-1 font-black text-[9px] uppercase tracking-widest text-text-secondary text-right">Unit Price</th>
              <th className={cn(isSow ? "w-[13%]" : "w-[14%]", "px-2 py-1 font-black text-[9px] uppercase tracking-widest text-text-secondary text-right")}>Amount</th>
              <th className="w-[10%] px-2 py-1 font-black text-[9px] uppercase tracking-widest text-text-secondary text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-primary/30">
            {services.map((service, idx) => {
              const isPSorTS = service.serviceType === 'PS' || service.serviceType === 'TS' || 
                               service.serviceType?.toLowerCase().includes('professional') || 
                               service.serviceType?.toLowerCase().includes('transition');
              const isBilled = service.billingStatus?.toLowerCase().includes('billed') || 
                               service.billingStatus?.toLowerCase().includes('completed');

              let initialQty = '';
              let finalQty = '';

              if (isSow) {
                initialQty = service.totalQuantity && service.totalQuantity !== 'NaN' ? service.totalQuantity : '1';
                // If PS/TS and billed, onboarded = total
                if (isPSorTS && isBilled) {
                  finalQty = initialQty;
                } else {
                  finalQty = service.onboardedQuantity && service.onboardedQuantity !== 'NaN' ? service.onboardedQuantity : '0';
                }
              } else {
                // Change Order context
                initialQty = service.previousQuantity && service.previousQuantity !== 'NaN' ? service.previousQuantity : '0';
                finalQty = service.totalQuantity && service.totalQuantity !== 'NaN' ? service.totalQuantity : '0';
              }

              const nInitial = getNum(initialQty);
              const nFinal = getNum(finalQty);
              let diff = nFinal - nInitial;

              // Use explicit changeQuantity if available
              if (!isSow && service.changeQuantity) {
                const nChange = getNum(service.changeQuantity);
                if (nChange !== 0) diff = nChange;
              }

              return (
                <tr key={idx} className={cn(
                  "transition-colors hover:bg-bg-primary/80",
                  !service.isSigned ? "bg-rose-500/10" : ""
                )}>
                  <td className="px-2 py-1">
                    <div className="flex items-center space-x-1.5">
                      {isUserBased(service.serviceName, service.description, service.serviceType) ? (
                        <span className="inline-flex items-center justify-center w-2.5 h-2.5 rounded bg-telus-purple/10 text-telus-purple text-[6px] font-black border border-telus-purple/20 shadow-sm shrink-0" title="User Based">U</span>
                      ) : isInfrastructureBased(service.serviceName, service.description, service.serviceType) ? (
                        <span className="inline-flex items-center justify-center w-2.5 h-2.5 rounded bg-bg-secondary text-text-primary text-[6px] font-black border border-border-primary shadow-sm shrink-0" title="Infrastructure Based">I</span>
                      ) : <div className="w-2.5 h-2.5 shrink-0" />}
                      <div className="font-semibold text-text-primary truncate text-[10px]" title={service.serviceName}>
                        {cleanServiceName(service.serviceName, customerName)}
                      </div>
                    </div>
                    {showDocuments && (
                      <div className="text-[8px] text-text-secondary/60 mt-0 flex items-center truncate">
                        <FileText className="w-1.5 h-1.5 mr-1 opacity-50" />
                        {service.sourceDocument}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-1 text-center text-[9px] font-bold text-text-secondary bg-bg-primary/40">
                    {initialQty}
                  </td>
                  {!isSow && (
                    <td className="px-3 py-1.5 text-center bg-bg-primary/40">
                      {diff !== 0 ? (
                        <span className={cn(
                          "text-[9px] font-black px-1.5 py-0.5 rounded-md shadow-sm border",
                          diff > 0 ? "bg-telus-green/10 text-telus-green border-telus-green/20" : "bg-rose-500/10 text-rose-500 border-rose-500/20"
                        )}>
                          {diff > 0 ? '+' : ''}{diff}
                        </span>
                      ) : (
                        <span className="text-[9px] text-text-secondary/30 font-bold">-</span>
                      )}
                    </td>
                  )}
                  <td className="px-2 py-1 text-center text-[9px] font-bold text-telus-green bg-bg-primary/40">
                    {isSow && onUpdateService ? (
                      <input 
                        type="text"
                        value={finalQty}
                        onChange={(e) => onUpdateService(service, { onboardedQuantity: e.target.value })}
                        className="w-10 text-center bg-transparent border-b border-telus-green/30 focus:outline-none focus:border-telus-green text-text-primary"
                      />
                    ) : (
                      finalQty
                    )}
                  </td>
                  <td className="px-2 py-1 text-center text-[10px] font-black text-telus-purple bg-telus-purple/10 rounded-md whitespace-nowrap border border-telus-purple/20">
                    {service.dafStartDate || service.effectiveDate || 'N/A'}
                  </td>
                  <td className="px-2 py-1 font-bold text-text-primary text-right text-[9px] whitespace-nowrap">
                    {(() => {
                      const derivedPrice = getDerivedUnitPrice(service);
                      return derivedPrice > 0 
                        ? <span className="text-text-secondary italic">@{formatCurrency(derivedPrice)}/u</span> 
                        : <span className="text-text-secondary/30">-</span>;
                    })()}
                  </td>
                  <td className="px-2 py-1 font-bold text-text-primary text-right text-[9px] whitespace-nowrap">
                    {(() => {
                      const billed = calculateBilledAmount(service);
                      const total = parseAmount(service.amount);

                      if (billed === 0 && total > 0) {
                        return (
                          <div className="flex flex-col items-end">
                            <span className="text-text-secondary/40 font-black">$0</span>
                            <span className="text-[7px] text-text-secondary/60 line-through italic">{formatAmountString(service.amount, service.serviceType)}</span>
                          </div>
                        );
                      }

                      if (billed !== total && billed > 0) {
                        return (
                          <div className="flex flex-col items-end">
                            <span className="text-telus-green font-black">{formatAmountString(String(billed), service.serviceType)}</span>
                            <span className="text-[7px] text-text-secondary/60 line-through italic">{formatAmountString(service.amount, service.serviceType)}</span>
                          </div>
                        );
                      }
                      return (
                        <div className="flex flex-col items-end">
                          <span className="font-black">{formatAmountString(service.amount, service.serviceType)}</span>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {(service.billingStatus?.toLowerCase().includes('daf') || service.requiresDAF || service.billingStatus?.toLowerCase().includes('billed')) && onToggleDaf ? (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onToggleDaf(service);
                        }}
                        className={cn(
                          "inline-flex items-center px-1 py-0 rounded text-[7px] font-bold uppercase tracking-wider border transition-all cursor-pointer",
                          service.billingStatus?.toLowerCase().includes('pending') 
                            ? "bg-amber-100 text-amber-700 border-amber-200 hover:bg-emerald-100 hover:text-emerald-700 hover:border-emerald-200 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/30 dark:hover:bg-telus-green/20 dark:hover:text-telus-green dark:hover:border-telus-green/30" 
                            : "bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-amber-100 hover:text-amber-700 hover:border-amber-200 dark:bg-telus-green/20 dark:text-telus-green dark:border-telus-green/30 dark:hover:bg-amber-500/20 dark:hover:text-amber-400 dark:hover:border-amber-500/30"
                        )}
                        title={service.billingStatus?.toLowerCase().includes('pending') ? "Click to mark DAF as received" : "Click to mark DAF as missing"}
                      >
                        {service.billingStatus}
                      </button>
                    ) : (
                      <span className={cn(
                        "inline-flex items-center px-1.5 py-0 rounded text-[8px] font-bold uppercase tracking-wider border",
                        !service.isSigned ? "bg-rose-500/10 text-rose-500 border-rose-500/20" : 
                        service.billingStatus?.toLowerCase().includes('pending') ? "bg-amber-500/10 text-amber-600 border-amber-500/20" : "bg-telus-green/10 text-telus-green border-telus-green/20"
                      )}>
                        {service.billingStatus || (service.isSigned ? 'Active' : 'Unsigned')}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {totalDisplay && (
            <tfoot className="bg-bg-secondary/40 border-t border-border-primary">
              <tr>
                <td colSpan={3} className="px-3 py-2 text-right font-bold text-text-secondary/50 uppercase tracking-widest text-[9px]">
                  Total:
                </td>
                <td colSpan={2} className="px-3 py-2 font-black text-telus-green whitespace-nowrap text-sm">
                  {totalDisplay}
                </td>
                <td className="px-3 py-2"></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
};

const SowGroupDisplay: React.FC<{
  sowName: string;
  customerServices: ServiceDetail[];
  vendorServices: ServiceDetail[];
  changeOrders: any[];
  isExpanded: boolean;
  onToggle: () => void;
  showVendorFinancials: boolean;
  onMakeActive?: (idx: number) => void;
  onRevertActive?: (idx: number) => void;
  showDocuments?: boolean;
  onUpdateSowName?: (oldName: string, newName: string) => void;
  customerAlias?: string;
  vendorAlias?: string;
  customerName?: string;
  onToggleDaf?: (service: ServiceDetail) => void;
  onToggleCoDaf?: (co: any) => void;
  onUpdateResult?: (result: ContractAnalysisResult) => void;
  result?: ContractAnalysisResult;
  userRole: UserRole;
}> = ({ sowName, customerServices, vendorServices, changeOrders, isExpanded, onToggle, showVendorFinancials, onMakeActive, onRevertActive, showDocuments = true, onUpdateSowName, customerAlias, vendorAlias, customerName, onToggleDaf, onToggleCoDaf, onUpdateResult, result, userRole }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(sowName);

  const handleUpdateService = (service: ServiceDetail, updates: Partial<ServiceDetail>) => {
    if (!onUpdateResult || !result) return;
    const updatedResult = JSON.parse(JSON.stringify(result)) as ContractAnalysisResult;
    const updateSvc = (s: ServiceDetail) => {
      if (s.serviceName === service.serviceName && s.sowName === service.sowName && s.description === service.description) {
        Object.assign(s, updates);
      }
    };
    updatedResult.customerServices?.forEach(updateSvc);
    updatedResult.vendorServices?.forEach(updateSvc);
    updatedResult.changeOrders?.forEach(co => co.services?.forEach(updateSvc));
    onUpdateResult(updatedResult);
  };

  const handleSave = () => {
    if (onUpdateSowName) {
      onUpdateSowName(sowName, editedName);
    }
    setIsEditing(false);
  };

  const visibleServices = showVendorFinancials 
    ? [...customerServices, ...vendorServices]
    : [...customerServices];
    
  const visibleChangeOrders = showVendorFinancials
    ? changeOrders
    : changeOrders.filter(co => co.facing?.toLowerCase() !== 'vendor');

  // Determine SOW type
  const types = new Set(visibleServices.map(s => s.serviceType).filter(Boolean));
  const isMsSow = types.has('MS');
  const sowType = isMsSow ? 'MS SOW' : (types.size === 1 ? Array.from(types)[0] : 'SOW');
  
  // Calculate term and end date
  let totalMonths = 0;
  visibleServices.forEach(s => {
    const m = parseTermToMonths(s.term);
    if (m && m > totalMonths) totalMonths = m;
  });

  const dafDates = visibleServices
    .map(s => s.dafStartDate)
    .filter(d => d && d !== 'N/A')
    .map(d => new Date(d as string))
    .filter(d => !isNaN(d.getTime()));
  
  const minDafDate = dafDates.length > 0
    ? new Date(Math.min(...dafDates.map(d => d.getTime())))
    : null;

  let maxExpiryDate = null;
  if (minDafDate && totalMonths > 0) {
    maxExpiryDate = addMonths(minDafDate, totalMonths);
  } else {
    const expiryDates = visibleServices
      .map(s => s.potentialEndDate || s.expiryDate)
      .filter(d => d && d !== 'N/A')
      .map(d => new Date(d as string))
      .filter(d => !isNaN(d.getTime()));
    
    maxExpiryDate = expiryDates.length > 0 
      ? new Date(Math.max(...expiryDates.map(d => d.getTime()))) 
      : null;
  }
  
  const formattedExpiry = maxExpiryDate 
    ? new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).format(maxExpiryDate)
    : 'N/A';

  const formattedDafStart = minDafDate
    ? new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).format(minDafDate)
    : 'N/A';

  const isSowSigned = visibleServices.every(s => s.isSigned);

  const calculateSowTotal = (services: ServiceDetail[], cos: any[], facing: 'Customer' | 'Vendor') => {
    let oneTime = 0;
    let recurring = 0;
    let hasAmounts = false;

    services.forEach(s => {
      if (s.amount) {
        hasAmounts = true;
        const billedAmount = calculateBilledAmount(s);
        const isMS = s.serviceType === 'MS' || s.serviceType?.toLowerCase().includes('managed');
        if (isMS || s.amount.toLowerCase().includes('month') || s.amount.toLowerCase().includes('year')) {
          recurring += billedAmount;
        } else {
          oneTime += billedAmount;
        }
      }
    });

    cos.forEach(co => {
      const isVendorCO = co.facing?.toLowerCase() === 'vendor';
      const matchesFacing = facing === 'Vendor' ? isVendorCO : !isVendorCO;
      
      if (matchesFacing) {
        if (co.services && co.services.length > 0) {
          co.services.forEach(s => {
            if (s.amount) {
              hasAmounts = true;
              const billedAmount = calculateBilledAmount(s);
              const isMS = s.serviceType === 'MS' || s.serviceType?.toLowerCase().includes('managed');
              if (isMS || s.amount.toLowerCase().includes('month') || s.amount.toLowerCase().includes('year')) {
                recurring += billedAmount;
              } else {
                oneTime += billedAmount;
              }
            }
          });
        } else if (co.amount) {
          // If DAF is required for the CO but not present, skip it
          if (co.requiresDAF && !co.hasDAF) return;

          hasAmounts = true;
          // For COs without specific services, use the overall CO amount
          if (co.amount.toLowerCase().includes('month') || co.amount.toLowerCase().includes('year')) {
            recurring += parseAmount(co.amount);
          } else {
            oneTime += parseAmount(co.amount);
          }
        }
      }
    });

    if (!hasAmounts) return null;

    const parts = [];
    if (oneTime !== 0) parts.push(`${formatCurrency(oneTime)} (One-time)`);
    if (recurring !== 0) parts.push(`${formatCurrency(recurring)}/month`);
    
    return parts.length > 0 ? parts.join(' + ') : '$0';
  };

  const customerTotal = calculateSowTotal(customerServices, changeOrders, 'Customer');
  const vendorTotal = showVendorFinancials ? calculateSowTotal(vendorServices, changeOrders, 'Vendor') : null;

  // Calculate quantity evolution for the overview
  const evolvedChangeOrders = useMemo(() => {
    // Track current quantities for each service in this SOW group
    const currentQuantities: Record<string, string> = {};
    
    const normalize = (str: string) => {
      if (!str) return '';
      return str.toLowerCase()
        .replace(/\([^)]*\)/g, '')
        .replace(/managed|service|essentials|advanced|premium|standard|basic|professional|transition/gi, '')
        .replace(/[^a-z0-9]/g, '')
        .trim();
    };

    // Initialize with SOW services
    [...customerServices, ...vendorServices].forEach(s => {
      currentQuantities[normalize(s.serviceName)] = s.totalQuantity || s.onboardedQuantity || '0';
    });

    // Group Change Orders by SOW folder
    const sowGroups: Record<string, any[]> = {};
    visibleChangeOrders.forEach(co => {
      const sow = co.associatedSOW || 'unknown';
      if (!sowGroups[sow]) sowGroups[sow] = [];
      sowGroups[sow].push(co);
    });

    const sortedCOs: any[] = [];
    
    // Sort SOWs
    const sortedSows = Object.keys(sowGroups).sort();
    
    sortedSows.forEach(sow => {
      // Sort COs within SOW by date, then by facing
      const group = sowGroups[sow].sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        if (!isNaN(dateA) && !isNaN(dateB) && dateA !== dateB) return dateA - dateB;
        
        // If dates are the same, prioritize Customer over Vendor
        const facingA = a.facing?.toLowerCase();
        const facingB = b.facing?.toLowerCase();
        if (facingA === 'customer' && facingB !== 'customer') return -1;
        if (facingB === 'customer' && facingA !== 'customer') return 1;
        return 0;
      });
      sortedCOs.push(...group);
    });

    // Process Change Orders in order
    return sortedCOs.map(co => {
      const evolvedServices = co.services?.map((s: ServiceDetail) => {
        const normName = normalize(s.serviceName);
        
        // Find the best matching service name from currentQuantities
        let matchedKey = normName;
        const existingKeys = Object.keys(currentQuantities);
        
        // 1. Try exact normalized match
        if (!currentQuantities[normName]) {
          // 2. Try fuzzy match
          const fuzzyMatch = existingKeys.find(k => {
            return k === normName || (k.length > 3 && normName.length > 3 && (k.includes(normName) || normName.includes(k)));
          });
          if (fuzzyMatch) matchedKey = fuzzyMatch;
        }

        const hasPrev = s.previousQuantity && s.previousQuantity !== 'NaN' && s.previousQuantity !== '0';
        const prev = hasPrev ? s.previousQuantity : (currentQuantities[matchedKey] || '0');
        
        // If AI extracted a total quantity, use it. 
        // If it's missing, try to use changeQuantity + prev
        let total = s.totalQuantity && s.totalQuantity !== 'NaN' ? s.totalQuantity : null;
        
        if (!total && s.changeQuantity) {
          const nChange = getNum(s.changeQuantity);
          const nPrev = getNum(prev);
          total = String(nPrev + nChange);
        }
        
        if (!total) total = prev;
        
        // Update current quantities for next COs
        currentQuantities[matchedKey] = total;
        
        return {
          ...s,
          previousQuantity: prev,
          totalQuantity: total
        };
      });
      
      return {
        ...co,
        services: evolvedServices
      };
    });
  }, [customerServices, vendorServices, visibleChangeOrders]);

  const renderServiceSection = (services: ServiceDetail[], title: string, icon: React.ReactNode, colorClass: string) => {
    if (services.length === 0) return null;
    
    const isMS = (s: ServiceDetail) => s.serviceType === 'MS' || s.serviceType?.toLowerCase().includes('managed');
    const isPS = (s: ServiceDetail) => s.serviceType === 'PS' || s.serviceType?.toLowerCase().includes('professional');
    const isTS = (s: ServiceDetail) => s.serviceType === 'TS' || s.serviceType?.toLowerCase().includes('transition');

    const ms = services.filter(isMS);
    const ps = services.filter(isPS);
    const ts = services.filter(isTS);
    const other = services.filter(s => !isMS(s) && !isPS(s) && !isTS(s));

    return (
      <div className={cn("p-4 rounded-2xl border mb-4 last:mb-0 shadow-sm", colorClass)}>
        <div className="flex items-center space-x-2 mb-3 pb-2 border-b border-border-primary/50">
          <div className="p-1.5 bg-bg-secondary/80 rounded-lg scale-75 origin-left shadow-sm border border-border-primary/30">{icon}</div>
          <h4 className="text-[11px] font-black text-text-primary uppercase tracking-widest">{title}</h4>
        </div>
        <div className="space-y-4">
          <ServiceTable title="Managed Services (Recurring)" services={ms} showDocuments={showDocuments} context="sow" customerName={customerName} onToggleDaf={onToggleDaf} onUpdateService={handleUpdateService} userRole={userRole} />
          <ServiceTable title="Professional Services (One-time)" services={ps} showDocuments={showDocuments} context="sow" customerName={customerName} onToggleDaf={onToggleDaf} onUpdateService={handleUpdateService} userRole={userRole} />
          <ServiceTable title="Transition Services (One-time)" services={ts} showDocuments={showDocuments} context="sow" customerName={customerName} onToggleDaf={onToggleDaf} onUpdateService={handleUpdateService} userRole={userRole} />
          <ServiceTable title="Other Services" services={other} showDocuments={showDocuments} context="sow" customerName={customerName} onToggleDaf={onToggleDaf} onUpdateService={handleUpdateService} userRole={userRole} />
        </div>
      </div>
    );
  };

  return (
    <div className="telus-card overflow-hidden mb-6 group">
      <div 
        onClick={onToggle} 
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onToggle(); }}
        className="w-full flex flex-col xl:flex-row xl:items-center justify-between p-4 bg-bg-primary hover:bg-bg-secondary transition-all border-b border-border-primary gap-3 relative overflow-hidden text-left cursor-pointer"
      >
        <div className="flex items-start space-x-3 z-10 flex-1 min-w-0">
          <div className="mt-0.5 p-1 bg-bg-primary rounded-md shadow-sm border border-border-primary group-hover:border-telus-purple/50 transition-colors shrink-0">
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-telus-purple" /> : <ChevronDown className="w-3.5 h-3.5 text-text-secondary/50 group-hover:text-telus-purple transition-colors" />}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              {isEditing ? (
                <div className="flex items-center gap-2">
                  <input 
                    value={editedName} 
                    onChange={(e) => setEditedName(e.target.value)}
                    className="font-bold text-telus-gray text-sm tracking-tight border border-border-primary rounded-lg px-2 py-0.5 bg-bg-secondary"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <button onClick={(e) => { e.stopPropagation(); handleSave(); }} className="text-[9px] text-telus-purple font-black uppercase">Save</button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-telus-gray text-base tracking-tight">{sowName}</h4>
                  <button onClick={(e) => { e.stopPropagation(); setIsEditing(true); }} className="text-[9px] text-text-secondary/50 hover:text-telus-purple font-black uppercase">Edit</button>
                </div>
              )}
              <span className={cn(
                "px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border shadow-sm shrink-0",
                isMsSow ? "bg-telus-purple/10 text-telus-purple border-telus-purple/20" : "bg-bg-secondary text-text-secondary border-border-primary"
              )}>
                {sowType}
              </span>
              <span className={cn(
                "font-black px-1.5 py-0.5 rounded text-[8px] uppercase tracking-wider border shadow-sm shrink-0",
                isSowSigned ? "bg-telus-green/10 text-telus-green border-telus-green/20" : "bg-rose-500/10 text-rose-500 border-rose-500/20"
              )}>
                {isSowSigned ? "Signed" : "Unsigned"}
              </span>
            </div>
            
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-text-secondary">
              <div className="flex items-center">
                <CalendarDays className="w-3 h-3 mr-1 opacity-40" />
                <span>Effective: <span className="text-telus-gray font-medium">{formattedDafStart}</span></span>
              </div>
              <div className="flex items-center">
                <Clock className="w-3 h-3 mr-1 opacity-40" />
                <span>Term: <span className="text-telus-gray font-medium">{totalMonths > 0 ? `${totalMonths} mo` : 'N/A'}</span></span>
              </div>
              <div className="flex items-center">
                <CalendarDays className="w-3 h-3 mr-1 opacity-40" />
                <span>Ends: <span className="text-telus-gray font-medium">{formattedExpiry}</span></span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold text-text-secondary z-10 xl:justify-end shrink-0">
          <div className="flex items-center bg-bg-secondary px-2 py-0.5 rounded-lg border border-border-primary">
            <Activity className="w-3 h-3 mr-1 text-telus-purple/60" />
            <span>{visibleServices.length}</span>
          </div>
          {visibleChangeOrders.length > 0 && (
            <div className="flex items-center bg-bg-secondary px-2 py-0.5 rounded-lg border border-border-primary">
              <FileText className="w-3 h-3 mr-1 text-blue-500/60" />
              <span>{visibleChangeOrders.length}</span>
            </div>
          )}
          {customerTotal && (
            <div className="flex items-center bg-telus-green/10 px-2 py-0.5 rounded-lg border border-telus-green/20 text-telus-green">
              <DollarSign className="w-3 h-3 mr-0.5" />
              <span className="font-black">{customerTotal}</span>
            </div>
          )}
        </div>
      </div>
      
      {isExpanded && (
        <div className="p-3 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200 bg-bg-primary">
          {/* Main SOW Services */}
          <div className="space-y-4">
            {renderServiceSection(
              customerServices, 
              `SOW: ${customerAlias || 'Customer'} Facing Services (TELUS)`, 
              <Users className="w-5 h-5 text-telus-green" />,
              "bg-telus-green/5 border-telus-green/10"
            )}
            
            {showVendorFinancials && renderServiceSection(
              vendorServices, 
              `SOW: ${vendorAlias || 'Vendor'} Facing Services (Jolera)`, 
              <Briefcase className="w-5 h-5 text-rose-500" />,
              "bg-rose-500/5 border-rose-500/10"
            )}
          </div>

          {/* Change Orders Section */}
          {visibleChangeOrders.length > 0 && (
            <div className="pt-8 border-t border-border-primary">
              <h4 className="text-lg font-bold text-telus-gray mb-6 flex items-center">
                <div className="p-1.5 bg-blue-500/10 rounded-lg mr-3 border border-blue-500/20 shadow-sm">
                  <FileText className="w-5 h-5 text-blue-500" />
                </div>
                Change Orders for this SOW
              </h4>
              <div className="space-y-6">
                {evolvedChangeOrders.map((co, idx) => (
                  <div key={idx} className="p-4 rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-bg-primary shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 pb-2 border-b border-blue-500/10">
                      <div>
                        <div className="flex items-center space-x-3 mb-2">
                          <h5 className="text-base font-bold text-telus-gray tracking-tight">
                            {co.changeOrderNumber ? <span className="text-blue-500 mr-2 bg-blue-500/10 px-2 py-0.5 rounded-md border border-blue-500/20">{co.changeOrderNumber}</span> : null}
                            {co.changeDescription}
                          </h5>
                          {co.facing && (
                            <span className={cn(
                              "px-2.5 py-1 text-[10px] uppercase tracking-wider font-bold rounded-md border shadow-sm",
                              co.facing.toLowerCase() === 'vendor' ? "bg-rose-500/10 text-rose-500 border-rose-500/20" :
                              co.facing.toLowerCase() === 'customer' ? "bg-telus-green/10 text-telus-green border-telus-green/20" :
                              "bg-bg-secondary text-text-secondary border-border-primary"
                            )}>
                              {co.facing}
                            </span>
                          )}
                          <span className={cn(
                            "px-2.5 py-1 text-[10px] uppercase tracking-wider font-bold rounded-md border shadow-sm",
                            co.isSigned ? "bg-telus-green/10 text-telus-green border-telus-green/20" : "bg-rose-500/10 text-rose-500 border-rose-500/20"
                          )}>
                            {co.isSigned ? "Signed" : "Unsigned"}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-text-secondary font-medium">
                          <span className="flex items-center bg-bg-secondary px-2.5 py-1 rounded-md border border-border-primary shadow-sm">
                            <Calendar className="w-3.5 h-3.5 mr-1.5 text-text-secondary/50" />
                            Date: {co.date}
                          </span>
                          {co.services && co.services.some(s => s.effectiveDate && s.effectiveDate !== 'N/A') && (
                            <span className="flex items-center bg-bg-secondary px-2.5 py-1 rounded-md border border-border-primary shadow-sm">
                              <CalendarDays className="w-3.5 h-3.5 mr-1.5 text-telus-purple/50" />
                              Effective: <span className="text-telus-gray font-bold ml-1">
                                {co.services.find(s => s.effectiveDate && s.effectiveDate !== 'N/A')?.effectiveDate}
                              </span>
                            </span>
                          )}
                          {(() => {
                            let displayAmount = co.amount;
                            if (co.requiresDAF && !co.hasDAF && (!co.services || co.services.length === 0)) {
                              displayAmount = '$0';
                            }
                            if (co.services && co.services.length > 0) {
                              let oneTime = 0;
                              let recurring = 0;
                              let hasAmounts = false;
                              co.services.forEach(s => {
                                if (s.amount) {
                                  hasAmounts = true;
                                  const billedAmount = calculateBilledAmount(s);
                                  const isMS = s.serviceType === 'MS' || s.serviceType?.toLowerCase().includes('managed');
                                  if (isMS || s.amount.toLowerCase().includes('month') || s.amount.toLowerCase().includes('year')) {
                                    recurring += billedAmount;
                                  } else {
                                    oneTime += billedAmount;
                                  }
                                }
                              });
                              if (hasAmounts) {
                                const parts = [];
                                if (oneTime !== 0) parts.push(`${formatCurrency(oneTime)} (One-time)`);
                                if (recurring !== 0) parts.push(`${formatCurrency(recurring)}/month`);
                                displayAmount = parts.length > 0 ? parts.join(' + ') : '$0';
                              }
                            }
                            return displayAmount && (
                              <span className="flex items-center bg-bg-secondary px-2.5 py-1 rounded-md border border-border-primary shadow-sm">
                                <DollarSign className="w-3.5 h-3.5 mr-1.5 text-telus-green" />
                                Amount: <span className="text-telus-gray font-bold ml-1">{formatAmountString(displayAmount)}</span>
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        {co.isSigned ? (
                          <div className="flex items-center space-x-2">
                            {co.manuallyActivated ? (
                              <>
                                <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold bg-telus-purple/10 text-telus-purple border border-telus-purple/20 shadow-sm" title="This was manually marked as active">
                                  <CheckCircle2 className="w-4 h-4 mr-1.5" /> Manually Activated
                                </span>
                                {onRevertActive && co.originalIndex !== undefined && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onRevertActive(co.originalIndex);
                                    }}
                                    className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold bg-bg-secondary text-text-secondary border border-border-primary shadow-sm hover:bg-bg-primary transition-colors"
                                    title="Revert to unsigned status"
                                  >
                                    Revert
                                  </button>
                                )}
                              </>
                            ) : (
                              <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold bg-telus-green/10 text-telus-green border border-telus-green/20 shadow-sm">
                                <CheckCircle2 className="w-4 h-4 mr-1.5" /> Signed
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center space-x-2">
                            <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-500/10 text-rose-500 border border-rose-500/20 shadow-sm">
                              <XCircle className="w-4 h-4 mr-1.5" /> Unsigned
                            </span>
                            {onMakeActive && co.originalIndex !== undefined && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onMakeActive(co.originalIndex);
                                }}
                                className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold bg-telus-purple/10 text-telus-purple border border-telus-purple/20 shadow-sm hover:bg-telus-purple/20 transition-colors"
                                title="Mark as active despite missing signature"
                              >
                                Make Active
                              </button>
                            )}
                          </div>
                        )}
                        {co.requiresDAF && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleCoDaf && onToggleCoDaf(co);
                            }}
                            className={cn(
                              "inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold border shadow-sm transition-all",
                              co.hasDAF 
                                ? "bg-blue-500/10 text-blue-500 border-blue-500/20 hover:bg-rose-500/10 hover:text-rose-500 hover:border-rose-500/20" 
                                : "bg-amber-500/10 text-amber-600 border-amber-500/20 hover:bg-blue-500/10 hover:text-blue-500 hover:border-blue-500/20"
                            )}
                            title={co.hasDAF ? "Click to mark as missing" : "Click to mark as received"}
                          >
                            {co.hasDAF ? "DAF Received" : "Pending DAF"}
                          </button>
                        )}
                      </div>
                    </div>
                    
                    {co.services && co.services.length > 0 && (
                      <div className="bg-bg-primary rounded-2xl border border-blue-500/10 overflow-hidden shadow-sm mt-3">
                        <ServiceTable title="Services added in this Change Order" services={co.services} showDocuments={showDocuments} context="co" customerName={customerName} onToggleDaf={onToggleDaf} onUpdateService={handleUpdateService} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SOW Total Summary */}
          {(customerTotal || vendorTotal) && (
            <div className="pt-6 mt-6 border-t border-border-primary/20">
              <div className="p-4 telus-card-inner bg-bg-secondary/40">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-2">
                    <DollarSign className="w-4 h-4 text-telus-purple" />
                    <h4 className="text-sm font-bold text-telus-purple uppercase tracking-wider">SOW Total Summary</h4>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {customerTotal && (
                    <div className="p-3 telus-card-inner bg-bg-secondary/60">
                      <p className="text-[10px] font-bold text-text-secondary/60 uppercase tracking-wider mb-1">{customerAlias || 'Customer'} Facing</p>
                      <p className="text-lg font-black text-telus-purple">{customerTotal}</p>
                    </div>
                  )}
                  {vendorTotal && (
                    <div className="p-3 telus-card-inner bg-bg-secondary/60">
                      <p className="text-[10px] font-bold text-text-secondary/60 uppercase tracking-wider mb-1">{vendorAlias || 'Vendor'} Facing</p>
                      <p className="text-lg font-black text-telus-purple">{vendorTotal}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const ServiceTimeline: React.FC<{ 
  result: ContractAnalysisResult, 
  showVendorFinancials: boolean,
  hidePS: boolean,
  setHidePS: (val: boolean) => void,
  onUpdateResult?: (updatedResult: ContractAnalysisResult) => void,
  onToggleDaf?: (service: ServiceDetail) => void
}> = ({ result, showVendorFinancials, hidePS, setHidePS, onUpdateResult, onToggleDaf }) => {
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [sortField, setSortField] = useState<'name' | 'type' | 'start' | 'end'>('end');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const toggleRow = (name: string) => {
    setExpandedRows(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const handleSort = (field: 'name' | 'type' | 'start' | 'end') => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const SortIcon = ({ field }: { field: 'name' | 'type' | 'start' | 'end' }) => {
    if (sortField !== field) return <RefreshCw className="w-2.5 h-2.5 ml-1 opacity-20" />;
    return sortDirection === 'asc' 
      ? <TrendingUp className="w-2.5 h-2.5 ml-1 text-telus-purple" /> 
      : <TrendingDown className="w-2.5 h-2.5 ml-1 text-telus-purple" />;
  };

  // Group services and change orders by SOW
  const sowGroups: Record<string, { 
    services: ServiceDetail[], 
    changeOrders: any[],
    type: string 
  }> = {};

  const cleanSowName = (name: string) => utilsCleanSowName(name, result.customerName);

  // Create a map of CO names to their associated SOWs for grouping
  const coToSowMap: Record<string, string> = {};
  result.changeOrders?.forEach(co => {
    const coName = cleanSowName(co.changeOrderNumber).toLowerCase();
    const sowName = cleanSowName(co.associatedSOW);
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
    const cleanName = cleanSowName(rawName);
    const lower = cleanName.toLowerCase();
    
    // Check for direct match in coToSowMap
    if (coToSowMap[lower]) return coToSowMap[lower];
    
    // Check for partial match (e.g. "CR004292025_V1.docx" matches "CR004292025")
    for (const [coKey, sowName] of Object.entries(coToSowMap)) {
      if (lower.includes(coKey)) return sowName;
    }
    
    return cleanName;
  };

  const allServices = [
    ...(result.customerServices || []),
    ...(result.vendorServices || [])
  ];

  allServices.forEach(s => {
    const key = getGroupKey(s.sowName);
    if (!sowGroups[key]) sowGroups[key] = { services: [], changeOrders: [], type: 'SOW' };
    sowGroups[key].services.push(s);
  });

  result.unsignedDocuments?.forEach(doc => {
    const key = getGroupKey(doc);
    if (!sowGroups[key]) {
      sowGroups[key] = { services: [], changeOrders: [], type: 'SOW' };
    }
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
           result.changeOrders?.some(co => {
             const coNum = cleanSowName(co.changeOrderNumber).toLowerCase();
             return lower.includes(coNum) || coNum.includes(lower);
           });
    
    // Filter out generic document names that don't look like SOW titles
    const isGenericDoc = (lower.endsWith('.docx') || lower.endsWith('.pdf')) && 
                         (lower.match(/^\d+/) || lower.includes(' v1') || lower.includes(' v2'));

    return isCO || isGenericDoc;
  };

  const timelineData = Object.entries(sowGroups)
    .filter(([name]) => !isChangeOrderName(name))
    .map(([name, group]) => {
    const cleanName = cleanSowName(name);
    const groupServices = group.services;
    
    // Determine SOW type (Managed, Professional, Transition, or Mixed)
    const types = new Set(groupServices.map(s => s.serviceType).filter(Boolean));
    let sowType = 'Mixed';
    if (types.has('MS')) {
      sowType = 'MS SOW';
    } else if (types.size === 1) {
      sowType = Array.from(types)[0] || 'Other';
    } else if (types.size === 0) {
      sowType = 'N/A';
    }

    if (sowType !== 'PS' && sowType !== 'MS SOW') return null;

    // Filter services for timeline calculation based on SOW type
    // If it's an MS SOW, only use MS services for the timeline (ignore one-time TS/PS)
    const timelineServices = sowType === 'MS SOW' 
      ? groupServices.filter(s => s.serviceType === 'MS') 
      : groupServices;

    const startDates = timelineServices
      .map(s => s.dafStartDate || s.effectiveDate)
      .filter(d => d && d !== 'N/A')
      .map(d => new Date(d as string))
      .filter(d => !isNaN(d.getTime()));
    
    const endDates = timelineServices
      .map(s => s.potentialEndDate || s.expiryDate)
      .filter(d => d && d !== 'N/A')
      .map(d => new Date(d as string))
      .filter(d => !isNaN(d.getTime()));

    const minStart = startDates.length > 0 ? new Date(Math.min(...startDates.map(d => d.getTime()))) : null;
    let maxEnd = endDates.length > 0 ? new Date(Math.max(...endDates.map(d => d.getTime()))) : null;

    // Calculate term and end date
    let totalMonths = 0;
    timelineServices.forEach(s => {
      const m = parseTermToMonths(s.term);
      if (m && m > totalMonths) totalMonths = m;
    });

    if (minStart && totalMonths > 0) {
      maxEnd = addMonths(minStart, totalMonths);
    }

    let duration = totalMonths > 0 ? `${totalMonths} months` : 'N/A';

    const hasUnsigned = groupServices.some(s => !s.isSigned) || result.unsignedDocuments?.includes(name);
    const hasPendingDAF = groupServices.some(s => s.requiresDAF && !s.hasDAF);
    const isExpiringSoon = maxEnd && (maxEnd.getTime() - new Date().getTime()) < (90 * 24 * 60 * 60 * 1000); // 90 days

    return {
      name: cleanName,
      type: sowType,
      start: minStart ? minStart.toISOString().split('T')[0] : 'N/A',
      end: maxEnd ? maxEnd.toISOString().split('T')[0] : 'N/A',
      duration,
      sortStartDate: minStart ? minStart.getTime() : Infinity,
      sortEndDate: maxEnd ? maxEnd.getTime() : Infinity,
      hasUnsigned,
      hasPendingDAF,
      isExpiringSoon,
      services: groupServices,
      changeOrders: group.changeOrders
    };
  }).filter((item): item is NonNullable<typeof item> => item !== null).sort((a, b) => {
    let comparison = 0;
    if (sortField === 'name') {
      comparison = a.name.localeCompare(b.name);
    } else if (sortField === 'type') {
      comparison = a.type.localeCompare(b.type);
    } else if (sortField === 'start') {
      comparison = a.sortStartDate - b.sortStartDate;
    } else if (sortField === 'end') {
      comparison = a.sortEndDate - b.sortEndDate;
    }
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  return (
    <div className="space-y-6">
      <div className="telus-card overflow-hidden border border-border-primary/50">
        <div className="p-6 sm:p-8 border-b border-border-primary/30 bg-bg-primary/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-text-primary flex items-center tracking-tight">
              <div className="p-2 bg-telus-purple/10 rounded-xl mr-4 border border-telus-purple/20 shadow-sm">
                <Clock className="w-5 h-5 text-telus-purple" />
              </div>
              SOW Timelines
              <span className="ml-3 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-500 border border-rose-500/20 animate-pulse">
                <ShieldAlert className="w-3 h-3 mr-1" />
                Risk Monitoring Active
              </span>
            </h3>
            <p className="text-sm text-text-secondary mt-2 font-medium">
              Overview of start and end dates at the SOW level.
            </p>
          </div>
          <button
            onClick={() => setHidePS(!hidePS)}
            className={cn(
              "flex items-center px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all border shadow-sm",
              hidePS 
                ? "bg-telus-purple text-text-primary border-telus-purple shadow-telus-purple/20" 
                : "bg-bg-secondary text-text-primary border-border-primary hover:bg-bg-primary"
            )}
          >
            <Filter className="w-3.5 h-3.5 mr-2" />
            {hidePS ? 'Showing All' : 'Hide PS SOWs'}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-bg-primary/50 border-b border-border-primary">
                <th 
                  className="px-4 py-2 text-[10px] font-bold text-text-secondary uppercase tracking-widest cursor-pointer hover:bg-bg-secondary transition-colors"
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center">SOW Name <SortIcon field="name" /></div>
                </th>
                <th 
                  className="px-4 py-2 text-[10px] font-bold text-text-secondary uppercase tracking-widest text-center cursor-pointer hover:bg-bg-secondary transition-colors"
                  onClick={() => handleSort('type')}
                >
                  <div className="flex items-center justify-center">Type <SortIcon field="type" /></div>
                </th>
                <th 
                  className="px-4 py-2 text-[10px] font-bold text-text-secondary uppercase tracking-widest text-center cursor-pointer hover:bg-bg-secondary transition-colors"
                  onClick={() => handleSort('start')}
                >
                  <div className="flex items-center justify-center">Start Date <SortIcon field="start" /></div>
                </th>
                <th 
                  className="px-4 py-2 text-[10px] font-bold text-text-secondary uppercase tracking-widest text-center cursor-pointer hover:bg-bg-secondary transition-colors"
                  onClick={() => handleSort('end')}
                >
                  <div className="flex items-center justify-center">End Date <SortIcon field="end" /></div>
                </th>
                <th className="px-4 py-2 text-[10px] font-bold text-text-secondary uppercase tracking-widest text-center">Total Term</th>
                <th className="px-4 py-2 text-[10px] font-bold text-text-secondary uppercase tracking-widest text-right">Risk Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-primary/30">
              {timelineData.map((item, idx) => (
                <React.Fragment key={idx}>
                  <tr 
                    onClick={() => toggleRow(item.name)}
                    className={cn(
                      "hover:bg-bg-primary/50 transition-colors group cursor-pointer",
                      (item.hasUnsigned || item.hasPendingDAF || item.isExpiringSoon) && "bg-rose-500/5 hover:bg-rose-500/10"
                    )}
                  >
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        {expandedRows[item.name] ? (
                          <ChevronDown className="w-3 h-3 text-telus-purple" />
                        ) : (
                          <ChevronRight className="w-3 h-3 text-text-secondary/50 group-hover:text-telus-purple" />
                        )}
                        <div className="font-bold text-text-primary text-[10px] group-hover:text-telus-purple transition-colors truncate max-w-[180px]" title={item.name}>{item.name}</div>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span className={cn(
                        "px-1.5 py-0 rounded text-[8px] font-bold uppercase tracking-wider border shadow-sm",
                        item.type === 'MS' ? "bg-telus-purple/10 text-telus-purple border-telus-purple/20" :
                        item.type === 'PS' ? "bg-telus-green/10 text-telus-green border-telus-green/20" :
                        item.type === 'TS' ? "bg-amber-500/10 text-amber-600 border-amber-500/20" :
                        "bg-bg-primary text-text-primary border-border-primary"
                      )}>
                        {item.type}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-[9px] font-bold text-text-primary text-center whitespace-nowrap">{item.start}</td>
                    <td className="px-4 py-2 text-[9px] font-bold text-text-primary text-center whitespace-nowrap">{item.end}</td>
                    <td className="px-4 py-2 text-center">
                      <span className="text-[9px] font-bold text-text-secondary bg-bg-primary px-2 py-0.5 rounded border border-border-primary shadow-sm whitespace-nowrap">
                        {item.duration}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap justify-end gap-1">
                        {item.hasUnsigned && (
                          <span className="inline-flex items-center px-1 py-0 rounded text-[7px] font-black uppercase tracking-tighter bg-rose-500/10 text-rose-500 border border-rose-500/20 shadow-sm">
                            <FileWarning className="w-2 h-2 mr-1" /> Unsigned
                          </span>
                        )}
                        {item.hasPendingDAF && (
                          <span className="inline-flex items-center px-1 py-0 rounded text-[7px] font-black uppercase tracking-tighter bg-amber-500/10 text-amber-600 border border-amber-500/20 shadow-sm">
                            <AlertCircle className="w-2 h-2 mr-1" /> Pending DAF
                          </span>
                        )}
                        {item.isExpiringSoon && (
                          <span className="inline-flex items-center px-1 py-0 rounded text-[7px] font-black uppercase tracking-tighter bg-telus-purple/10 text-telus-purple border border-telus-purple/20 shadow-sm">
                            <Clock className="w-2 h-2 mr-1" /> Expiring Soon
                          </span>
                        )}
                        {!item.hasUnsigned && !item.hasPendingDAF && !item.isExpiringSoon && (
                          <span className="inline-flex items-center px-1 py-0 rounded text-[7px] font-black uppercase tracking-tighter bg-telus-green/10 text-telus-green border border-telus-green/20 shadow-sm">
                            <CheckCircle2 className="w-2 h-2 mr-1" /> Healthy
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expandedRows[item.name] && (
                    <tr className="bg-bg-secondary/40 border-b border-border-primary/20">
                      <td colSpan={6} className="px-6 sm:px-8 py-4">
                        <div className="space-y-4">
                          {item.services.length > 0 ? (
                            <div className="space-y-2">
                              <h4 className="text-xs font-bold text-text-secondary uppercase tracking-wider">Services</h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {item.services.map((s, i) => (
                                  <div key={i} className="bg-bg-secondary p-3 rounded-lg border border-border-primary shadow-sm flex items-start justify-between">
                                    <div>
                                      <div className="font-bold text-sm text-text-primary">{s.serviceName}</div>
                                      <div className="text-xs text-text-secondary mt-1">{s.description || 'No description'}</div>
                                    </div>
                                    <div className="text-right">
                                      <div className="font-bold text-sm text-telus-purple">{s.amount}</div>
                                      <div className="mt-1">
                                        {s.billingStatus?.includes('DAF') && onToggleDaf ? (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              onToggleDaf(s);
                                            }}
                                            className={cn(
                                              "inline-flex items-center px-1.5 py-0 rounded text-[9px] font-bold uppercase tracking-wider border transition-all cursor-pointer",
                                              s.billingStatus?.includes('Pending') 
                                                ? "bg-amber-500/10 text-amber-600 border-amber-500/20 hover:bg-telus-green/10 hover:text-telus-green hover:border-telus-green/20" 
                                                : "bg-telus-green/10 text-telus-green border-telus-green/20 hover:bg-amber-500/10 hover:text-amber-600 hover:border-amber-500/20"
                                            )}
                                            title={s.billingStatus?.includes('Pending') ? "Click to mark DAF as received" : "Click to mark DAF as missing"}
                                          >
                                            {s.billingStatus}
                                          </button>
                                        ) : (
                                          <div className="text-[10px] text-text-secondary/60">{s.billingStatus}</div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="text-sm text-text-secondary/60 italic">No services found for this SOW.</div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const DafStatusView = ({ result, onUpdateResult, customerId }: { result: ContractAnalysisResult, onUpdateResult?: (result: ContractAnalysisResult) => void, customerId?: string }) => {
  const [documents, setDocuments] = useState<ParsedDocument[]>([]);

  React.useEffect(() => {
    if (customerId) {
      getCustomer(customerId).then(customer => {
        if (customer) {
          setDocuments(customer.documents);
        }
      });
    }
  }, [customerId]);
  const customerServices = [
    ...(result.customerServices || []),
    ...(result.changeOrders?.filter(co => co.facing?.toLowerCase() !== 'vendor').flatMap(co => co.services || []) || [])
  ];

  const dafChangeOrders = result.changeOrders?.filter(co => 
    co.facing?.toLowerCase() !== 'vendor' && 
    co.requiresDAF && 
    (!co.services || co.services.length === 0)
  ) || [];

  // If a service has an effective date, no DAF is needed
  const dafServices = customerServices.filter(s => 
    s.requiresDAF && (!s.effectiveDate || s.effectiveDate === 'N/A' || s.effectiveDate.toLowerCase().includes('daf'))
  );
  
  const dafItems = [
    ...dafServices,
    ...dafChangeOrders.map(co => ({
      serviceName: `Change Order: ${co.changeOrderNumber || co.changeDescription}`,
      sowName: co.associatedSOW || 'Change Orders',
      description: co.changeDescription,
      requiresDAF: co.requiresDAF,
      hasDAF: co.hasDAF,
      amount: co.amount,
      effectiveDate: co.date,
      isFlatCO: true,
      originalCO: co
    }))
  ];

  const groupedBySow = dafItems.reduce((acc, s) => {
    const sowKey = s.sowName || 'Unassigned';
    if (!acc[sowKey]) acc[sowKey] = [];
    acc[sowKey].push(s);
    return acc;
  }, {} as Record<string, any[]>);

  const handleToggleDaf = (itemToToggle: any) => {
    if (!onUpdateResult) return;
    
    const updatedResult = JSON.parse(JSON.stringify(result)) as ContractAnalysisResult;
    
    if (itemToToggle.isFlatCO) {
      updatedResult.changeOrders = updatedResult.changeOrders?.map(co => {
        const matchNum = co.changeOrderNumber === itemToToggle.originalCO.changeOrderNumber;
        const matchDesc = co.changeDescription === itemToToggle.originalCO.changeDescription;
        if (matchNum && matchDesc) {
          co.hasDAF = !co.hasDAF;
          co.manuallyActivated = true;
        }
        return co;
      });
    } else {
      const toggleService = (s: ServiceDetail) => {
        const matchName = s.serviceName.trim().toLowerCase() === itemToToggle.serviceName.trim().toLowerCase();
        const matchDesc = (s.description || "").trim().toLowerCase() === (itemToToggle.description || "").trim().toLowerCase();
        const matchSow = normalizeSow(s.sowName) === normalizeSow(itemToToggle.sowName);
        
        if (matchName && matchDesc && (matchSow || !s.sowName || !itemToToggle.sowName)) {
          s.hasDAF = !s.hasDAF;
          s.manuallyActivated = true;
          if (s.hasDAF) {
            s.billingStatus = 'Billed (Manual DAF)';
            s.requiresDAF = true;
            // Onboard quantities if they are 0 or missing
            if (!s.onboardedQuantity || s.onboardedQuantity === '0' || s.onboardedQuantity === 'N/A') {
              s.onboardedQuantity = s.totalQuantity || '1';
            }
            if (!s.dafStartDate || s.dafStartDate === 'N/A') {
              s.dafStartDate = s.effectiveDate && s.effectiveDate !== 'N/A' ? s.effectiveDate : new Date().toISOString().split('T')[0];
            }
          } else {
            s.billingStatus = 'Pending DAF';
            s.requiresDAF = true;
            s.onboardedQuantity = '0';
          }
        }
      };

      updatedResult.customerServices?.forEach(toggleService);
      updatedResult.vendorServices?.forEach(toggleService);
      updatedResult.changeOrders?.forEach(co => {
        co.services?.forEach(toggleService);
      });
    }

    onUpdateResult(updatedResult);
  };

  return (
    <div className="space-y-6">
      <div className="telus-card p-6 border border-border-primary/50">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-base font-bold text-text-primary">Deliverable Approval Form (DAF) Compliance</h3>
            <p className="text-sm text-text-secondary">Tracking Deliverable Approval Forms across all statements of work. Click a status badge to manually override.</p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-center">
              <div className="text-2xl font-black text-telus-green">{dafServices.filter(s => s.hasDAF).length}</div>
              <div className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">Received</div>
            </div>
            <div className="w-px h-8 bg-border-primary"></div>
            <div className="text-center">
              <div className="text-2xl font-black text-rose-500">{dafServices.filter(s => !s.hasDAF).length}</div>
              <div className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">Missing</div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {Object.entries(groupedBySow).map(([sowName, services]) => (
              <div key={sowName} className="telus-card-inner overflow-hidden border border-border-primary/30">
              <div className="bg-bg-primary/50 px-3 py-1.5 border-b border-border-primary/30 flex items-center justify-between">
                <span className="text-[10px] font-bold text-text-primary">{utilsCleanSowName(sowName, result.customerName)}</span>
                <span className="text-[9px] font-bold text-text-secondary uppercase tracking-widest">{services.length} Services</span>
              </div>
              <div className="divide-y divide-border-primary/20">
                {services.map((s, idx) => (
                  <div key={idx} className="px-3 py-2 flex items-center justify-between hover:bg-bg-primary/30 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-text-primary">
                        {cleanServiceName(s.serviceName, result.customerName)}
                      </div>
                      <div className="text-[9px] text-text-secondary">{s.description}</div>
                      {documents
                        .filter(doc => 
                          (doc.folder === s.sowName || doc.folder.includes(`${s.sowName}/DAF`)) && 
                          doc.name.toLowerCase().includes('daf')
                        )
                        .map((file, fIdx) => (
                          <div key={fIdx} className="mt-1 flex items-center text-[9px] text-telus-purple bg-telus-purple/10 px-1.5 py-0.5 rounded w-fit border border-telus-purple/20">
                            <FileText className="w-3 h-3 mr-1" />
                            {file.name.split('/').pop()}
                          </div>
                        ))}
                    </div>
                    <div className="ml-4 flex items-center space-x-3">
                      {!s.isFlatCO && (
                        <div className="flex flex-col items-end">
                          <div className="text-[8px] font-bold text-text-secondary uppercase tracking-widest">Onboarded Qty</div>
                          <input 
                            type="text"
                            value={s.onboardedQuantity || '0'}
                            onChange={(e) => {
                              if (!onUpdateResult) return;
                              const updatedResult = JSON.parse(JSON.stringify(result)) as ContractAnalysisResult;
                              const updateQty = (svc: ServiceDetail) => {
                                if (svc.serviceName === s.serviceName && svc.sowName === s.sowName && svc.description === s.description) {
                                  svc.onboardedQuantity = e.target.value;
                                }
                              };
                              updatedResult.customerServices?.forEach(updateQty);
                              updatedResult.vendorServices?.forEach(updateQty);
                              updatedResult.changeOrders?.forEach(co => co.services?.forEach(updateQty));
                              onUpdateResult(updatedResult);
                            }}
                            className="w-12 text-right text-[10px] font-bold text-telus-purple telus-card-inner px-1 focus:outline-none focus:border-telus-purple bg-bg-secondary"
                          />
                        </div>
                      )}
                      <div className="text-right flex flex-col items-end">
                        <div className="text-[8px] font-bold text-text-secondary uppercase tracking-widest">DAF Date</div>
                        <input
                          type="date"
                          value={s.dafStartDate || s.effectiveDate || ''}
                          onChange={(e) => {
                            if (!onUpdateResult) return;
                            const updatedResult = JSON.parse(JSON.stringify(result)) as ContractAnalysisResult;
                            const updateDate = (svc: ServiceDetail) => {
                              if (svc.serviceName === s.serviceName && svc.sowName === s.sowName && svc.description === s.description) {
                                svc.dafStartDate = e.target.value;
                                if (e.target.value && !svc.hasDAF) {
                                  svc.hasDAF = true;
                                  svc.manuallyActivated = true;
                                  svc.billingStatus = 'Billed (Manual DAF)';
                                  if (!svc.onboardedQuantity || svc.onboardedQuantity === '0' || svc.onboardedQuantity === 'N/A') {
                                    svc.onboardedQuantity = svc.totalQuantity || '1';
                                  }
                                }
                              }
                            };
                            const updateCO = (co: any) => {
                              if (s.isFlatCO && co.changeOrderNumber === s.originalCO?.changeOrderNumber && co.changeDescription === s.originalCO?.changeDescription) {
                                co.date = e.target.value;
                                if (e.target.value && !co.hasDAF) {
                                  co.hasDAF = true;
                                  co.manuallyActivated = true;
                                }
                              }
                              co.services?.forEach(updateDate);
                            };
                            updatedResult.customerServices?.forEach(updateDate);
                            updatedResult.vendorServices?.forEach(updateDate);
                            updatedResult.changeOrders?.forEach(updateCO);
                            onUpdateResult(updatedResult);
                          }}
                          disabled={!onUpdateResult}
                          className="w-24 text-right text-[10px] font-medium text-text-primary telus-card-inner px-1 focus:outline-none focus:border-telus-purple bg-bg-secondary"
                        />
                      </div>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleToggleDaf(s);
                        }}
                        disabled={!onUpdateResult}
                        className={cn(
                          "px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-widest border transition-all",
                          s.hasDAF 
                            ? "bg-telus-green/10 text-telus-green border-telus-green/20 hover:bg-rose-500/10 hover:text-rose-500 hover:border-rose-500/20" 
                            : "bg-rose-500/10 text-rose-500 border-rose-500/20 hover:bg-telus-green/10 hover:text-telus-green hover:border-telus-green/20",
                          !onUpdateResult && "cursor-default pointer-events-none"
                        )}
                        title={s.hasDAF ? "Click to mark as missing" : "Click to mark as received"}
                      >
                        {s.hasDAF ? (s.manuallyActivated ? 'Received (Manual)' : 'Received') : 'Missing'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {dafServices.length === 0 && (
            <div className="text-center py-12 bg-bg-primary/30 rounded-xl border border-dashed border-border-primary">
              <ShieldCheck className="w-12 h-12 text-text-secondary/30 mx-auto mb-3" />
              <p className="text-sm text-text-secondary font-medium">No services requiring DAF found in this contract.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const ResultsDisplay: React.FC<ResultsDisplayProps> = ({ 
  result, 
  onRefresh, 
  isRefreshing = false, 
  initialTab = 'overview', 
  onUpdateResult, 
  onFileSelect, 
  customerId,
  userRole = 'ADMIN'
}) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0 && onFileSelect) {
      onFileSelect(e.target.files[0], customerId);
    }
  };
  const [showVendorFinancials, setShowVendorFinancials] = useState(false);
  const [hidePS, setHidePS] = useState(false);
  const [showDocuments, setShowDocuments] = useState(false);
  const [activeTab, setActiveTab] = useState<ResultsDisplayProps['initialTab']>(initialTab);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  useEffect(() => {
    if (activeTab === 'audit_logs' && customerId) {
      setIsLoadingLogs(true);
      getAuditLogs(customerId).then(logs => {
        setAuditLogs(logs.sort((a, b) => b.timestamp - a.timestamp));
        setIsLoadingLogs(false);
      });
    }
  }, [activeTab, customerId]);

  React.useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);
  const [expandedSows, setExpandedSows] = useState<Record<string, boolean>>({});
  const [allExpanded, setAllExpanded] = useState(false);

  const handleToggleDaf = (serviceToToggle: ServiceDetail) => {
    if (!onUpdateResult) return;
    
    const updatedResult = JSON.parse(JSON.stringify(result)) as ContractAnalysisResult;
    
    const toggleService = (s: ServiceDetail) => {
      const matchName = s.serviceName.trim().toLowerCase() === serviceToToggle.serviceName.trim().toLowerCase();
      const matchDesc = (s.description || "").trim().toLowerCase() === (serviceToToggle.description || "").trim().toLowerCase();
      const matchSow = normalizeSow(s.sowName) === normalizeSow(serviceToToggle.sowName);
      
      if (matchName && matchDesc && (matchSow || !s.sowName || !serviceToToggle.sowName)) {
        s.hasDAF = !s.hasDAF;
        s.manuallyActivated = true;
        if (s.hasDAF) {
          s.billingStatus = 'Billed (Manual DAF)';
          s.requiresDAF = true;
          // Onboard quantities if they are 0 or missing
          if (!s.onboardedQuantity || s.onboardedQuantity === '0' || s.onboardedQuantity === 'N/A') {
            s.onboardedQuantity = s.totalQuantity || '1';
          }
          if (!s.dafStartDate || s.dafStartDate === 'N/A') {
            s.dafStartDate = s.effectiveDate && s.effectiveDate !== 'N/A' ? s.effectiveDate : new Date().toISOString().split('T')[0];
          }
        } else {
          s.billingStatus = 'Pending DAF';
          s.requiresDAF = true;
          s.onboardedQuantity = '0';
        }
      }
    };

    updatedResult.customerServices?.forEach(toggleService);
    updatedResult.vendorServices?.forEach(toggleService);
    updatedResult.changeOrders?.forEach(co => {
      co.services?.forEach(toggleService);
    });

    onUpdateResult(updatedResult);
  };

  const handleToggleCoDaf = (coToToggle: any) => {
    if (!onUpdateResult) return;
    
    const updatedResult = JSON.parse(JSON.stringify(result)) as ContractAnalysisResult;
    
    updatedResult.changeOrders = updatedResult.changeOrders?.map(co => {
      const matchNum = co.changeOrderNumber === coToToggle.changeOrderNumber;
      const matchSow = normalizeSow(co.associatedSOW) === normalizeSow(coToToggle.associatedSOW);
      const matchDesc = co.changeDescription === coToToggle.changeDescription;

      if (matchNum && matchSow && matchDesc) {
        const newHasDaf = !co.hasDAF;
        return {
          ...co,
          hasDAF: newHasDaf,
          manuallyActivated: true,
          // If toggling ON, ensure amount is considered billed
          // If the CO has services, toggle them all too
          services: co.services?.map((s: any) => ({
            ...s,
            hasDAF: newHasDaf,
            manuallyActivated: true,
            billingStatus: newHasDaf ? 'Billed (Manual DAF)' : 'Pending DAF',
            onboardedQuantity: newHasDaf ? (s.totalQuantity || '1') : '0'
          }))
        };
      }
      return co;
    });

    onUpdateResult(updatedResult);
  };

  const cleanSowName = (name: string) => utilsCleanSowName(name, result.customerName);

  const toggleSow = (sowName: string) => {
    setExpandedSows(prev => ({ ...prev, [sowName]: !prev[sowName] }));
  };

  const toggleAll = () => {
    const nextState = !allExpanded;
    setAllExpanded(nextState);
    const newExpanded: Record<string, boolean> = {};
    
    const allSows = new Set<string>();
    result.customerServices?.forEach(s => allSows.add(normalizeSow(s.sowName)));
    result.vendorServices?.forEach(s => allSows.add(normalizeSow(s.sowName)));
    result.changeOrders?.forEach(co => {
      let key = normalizeSow(co.associatedSOW);
      allSows.add(key);
    });
    
    // Attempt to handle grouped keys similar to getSowGroups for changeOrders
    const sowGroupsKeys = Object.keys(getSowGroups());
    sowGroupsKeys.forEach(sow => {
      newExpanded[sow] = nextState;
    });
    
    allSows.forEach(sow => {
      newExpanded[sow] = nextState;
    });
    setExpandedSows(newExpanded);
  };

  React.useEffect(() => {
    setExpandedSows(prev => {
      const initialExpanded: Record<string, boolean> = { ...prev };
      const allSows = new Set<string>();
      result.customerServices?.forEach(s => allSows.add(normalizeSow(s.sowName)));
      result.vendorServices?.forEach(s => allSows.add(normalizeSow(s.sowName)));
      result.changeOrders?.forEach(co => allSows.add(normalizeSow(co.associatedSOW)));
      
      const sowGroupsKeys = Object.keys(getSowGroups());
      sowGroupsKeys.forEach(sow => {
        if (initialExpanded[sow] === undefined) initialExpanded[sow] = false;
      });

      allSows.forEach(sow => {
        if (initialExpanded[sow] === undefined) initialExpanded[sow] = false;
      });
      
      return initialExpanded;
    });
  }, [result]);

  useEffect(() => {
    if (!onUpdateResult || !result) return;

    let hasChanges = false;
    const updatedResult = JSON.parse(JSON.stringify(result)) as ContractAnalysisResult;

    const processService = (s: ServiceDetail) => {
      if (s.manuallyActivated) return; // Skip if user manually overrode

      const hasEffectiveDate = s.effectiveDate && s.effectiveDate !== 'N/A' && s.effectiveDate.trim() !== '';
      const hasDafDate = s.dafStartDate && s.dafStartDate !== 'N/A' && s.dafStartDate.trim() !== '';
      const isMS = s.serviceType === 'MS' || s.serviceType?.toLowerCase().includes('managed');

      let newRequiresDAF = s.requiresDAF;
      let newHasDAF = s.hasDAF;
      let newBillingStatus = s.billingStatus;

      if (!s.isSigned) {
        newBillingStatus = 'Unsigned';
        newRequiresDAF = isMS;
        newHasDAF = false;
      } else if (hasDafDate) {
        newRequiresDAF = true;
        newHasDAF = true;
        newBillingStatus = 'Billed (DAF Received)';
        if (!hasEffectiveDate) {
          s.effectiveDate = s.dafStartDate;
          hasChanges = true;
        }
      } else if (hasEffectiveDate) {
        newRequiresDAF = false;
        newHasDAF = false;
        newBillingStatus = 'Billed (Effective Date)';
      } else {
        if (isMS) {
          newRequiresDAF = true;
          newHasDAF = false;
          newBillingStatus = 'Pending DAF';
        } else {
          newRequiresDAF = false;
          newHasDAF = false;
          newBillingStatus = 'Pending';
        }
      }

      if (s.requiresDAF !== newRequiresDAF || s.hasDAF !== newHasDAF || s.billingStatus !== newBillingStatus) {
        s.requiresDAF = newRequiresDAF;
        s.hasDAF = newHasDAF;
        s.billingStatus = newBillingStatus;
        hasChanges = true;
      }
    };

    updatedResult.customerServices?.forEach(processService);
    updatedResult.vendorServices?.forEach(processService);
    
    // Normalize CO associatedSOW to match existing SOWs
    const validSows = new Set<string>();
    updatedResult.customerServices?.forEach(s => validSows.add(s.sowName));
    updatedResult.vendorServices?.forEach(s => validSows.add(s.sowName));
    const validSowList = Array.from(validSows);

    updatedResult.changeOrders?.forEach(co => {
      co.services?.forEach(processService);
      
      if (validSowList.length > 0) {
        const coSow = co.associatedSOW || '';
        const coSowLower = coSow.toLowerCase();
        
        if (!validSows.has(coSow)) {
          if (validSowList.length === 1) {
            if (co.associatedSOW !== validSowList[0]) {
              co.associatedSOW = validSowList[0];
              hasChanges = true;
            }
          } else {
            const match = validSowList.find(sow => {
              const sowLower = sow.toLowerCase();
              return (sowLower.length > 3 && coSowLower.includes(sowLower)) ||
                     (coSowLower.length > 3 && sowLower.includes(coSowLower));
            });
            if (match && co.associatedSOW !== match) {
              co.associatedSOW = match;
              hasChanges = true;
            } else if (['main', 'root', 'sow', 'unknown', ''].includes(coSowLower) && co.associatedSOW !== validSowList[0]) {
              co.associatedSOW = validSowList[0];
              hasChanges = true;
            }
          }
        }
      }
    });

    if (hasChanges) {
      onUpdateResult(updatedResult);
    }
  }, [result, onUpdateResult]);

  const getSowGroups = () => {
    const groups: Record<string, { displayName: string, customerServices: ServiceDetail[], vendorServices: ServiceDetail[], changeOrders: any[] }> = {};
    
    result.customerServices?.forEach(s => {
      const key = normalizeSow(s.sowName);
      if (!groups[key]) {
        groups[key] = { 
          displayName: utilsCleanSowName(s.sowName, result.customerName), 
          customerServices: [], 
          vendorServices: [], 
          changeOrders: [] 
        };
      }
      groups[key].customerServices.push(s);
    });

    result.vendorServices?.forEach(s => {
      const key = normalizeSow(s.sowName);
      if (!groups[key]) {
        groups[key] = { 
          displayName: utilsCleanSowName(s.sowName, result.customerName), 
          customerServices: [], 
          vendorServices: [], 
          changeOrders: [] 
        };
      }
      groups[key].vendorServices.push(s);
    });

    result.changeOrders?.forEach((co, idx) => {
      let key = normalizeSow(co.associatedSOW);
      
      // Attempt to associate orphaned COs with existing SOW groups
      if (!groups[key]) {
        const existingKeys = Object.keys(groups);
        
        if (existingKeys.length === 1) {
          // If there's only one SOW group, the CO almost certainly belongs to it
          key = existingKeys[0];
        } else if (existingKeys.length > 1) {
          // Try fuzzy matching
          const coNameLower = (co.associatedSOW || '').toLowerCase();
          const match = existingKeys.find(k => {
            const groupNameLower = groups[k].displayName.toLowerCase();
            // Check if one name is a significant substring of the other
            return (groupNameLower.length > 3 && coNameLower.includes(groupNameLower)) || 
                   (coNameLower.length > 3 && groupNameLower.includes(coNameLower));
          });
          
          if (match) {
            key = match;
          } else if (['main', 'root', 'sow', 'unknown', ''].includes(key)) {
            // If it's a generic name and we have multiple groups, default to the first one
            // as it's usually the primary SOW
            key = existingKeys[0];
          }
        }
      }

      if (!groups[key]) {
        groups[key] = { 
          displayName: utilsCleanSowName(co.associatedSOW, result.customerName), 
          customerServices: [], 
          vendorServices: [], 
          changeOrders: [] 
        };
      }
      groups[key].changeOrders.push({ ...co, originalIndex: idx });
    });

    return groups;
  };

  const handleMakeActive = (idx: number) => {
    if (!onUpdateResult) return;
    const newResult = { ...result };
    if (newResult.changeOrders && newResult.changeOrders[idx]) {
      newResult.changeOrders = [...newResult.changeOrders];
      const co = newResult.changeOrders[idx];
      newResult.changeOrders[idx] = {
        ...co,
        isSigned: true,
        manuallyActivated: true,
        services: co.services?.map(s => ({ ...s, isSigned: true }))
      };

      // Also update matching services in customerServices and vendorServices
      if (co.services && co.services.length > 0) {
        const coServiceNames = new Set(co.services.map(s => s.serviceName));
        const cleanCoSowName = utilsCleanSowName(co.associatedSOW, result.customerName);
        
        if (newResult.customerServices) {
          newResult.customerServices = newResult.customerServices.map(s => 
            (utilsCleanSowName(s.sowName, result.customerName) === cleanCoSowName && coServiceNames.has(s.serviceName)) 
              ? { ...s, isSigned: true } 
              : s
          );
        }
        
        if (newResult.vendorServices) {
          newResult.vendorServices = newResult.vendorServices.map(s => 
            (utilsCleanSowName(s.sowName, result.customerName) === cleanCoSowName && coServiceNames.has(s.serviceName)) 
              ? { ...s, isSigned: true } 
              : s
          );
        }
      }

      onUpdateResult(newResult);
    }
  };

  const handleRevertActive = (idx: number) => {
    if (!onUpdateResult) return;
    const newResult = { ...result };
    if (newResult.changeOrders && newResult.changeOrders[idx]) {
      newResult.changeOrders = [...newResult.changeOrders];
      const co = newResult.changeOrders[idx];
      newResult.changeOrders[idx] = {
        ...co,
        isSigned: false,
        manuallyActivated: false,
        services: co.services?.map(s => ({ ...s, isSigned: false }))
      };

      // Also revert matching services in customerServices and vendorServices
      if (co.services && co.services.length > 0) {
        const coServiceNames = new Set(co.services.map(s => s.serviceName));
        const cleanCoSowName = utilsCleanSowName(co.associatedSOW, result.customerName);
        
        if (newResult.customerServices) {
          newResult.customerServices = newResult.customerServices.map(s => 
            (utilsCleanSowName(s.sowName, result.customerName) === cleanCoSowName && coServiceNames.has(s.serviceName)) 
              ? { ...s, isSigned: false } 
              : s
          );
        }
        
        if (newResult.vendorServices) {
          newResult.vendorServices = newResult.vendorServices.map(s => 
            (utilsCleanSowName(s.sowName, result.customerName) === cleanCoSowName && coServiceNames.has(s.serviceName)) 
              ? { ...s, isSigned: false } 
              : s
          );
        }
      }

      onUpdateResult(newResult);
    }
  };

  const handleUpdateSowName = (oldName: string, newName: string) => {
    if (!onUpdateResult) return;
    const newResult = { ...result };
    
    if (newResult.customerServices) {
      newResult.customerServices = newResult.customerServices.map(s => 
        utilsCleanSowName(s.sowName, result.customerName) === oldName 
          ? { ...s, sowName: newName } 
          : s
      );
    }
    
    if (newResult.vendorServices) {
      newResult.vendorServices = newResult.vendorServices.map(s => 
        utilsCleanSowName(s.sowName, result.customerName) === oldName 
          ? { ...s, sowName: newName } 
          : s
      );
    }
    
    if (newResult.changeOrders) {
      newResult.changeOrders = newResult.changeOrders.map(co => 
        utilsCleanSowName(co.associatedSOW, result.customerName) === oldName 
          ? { ...co, associatedSOW: newName } 
          : co
      );
    }
    
    onUpdateResult(newResult);
  };

  const sowGroups = getSowGroups();
  console.log('ResultsDisplay result:', result);
  console.log('ResultsDisplay sowGroups:', sowGroups);
  const sowNames = Object.keys(sowGroups);

  return (
    <div className="w-full space-y-6">
      {/* Header / Summary Card */}
      <div className="telus-card overflow-hidden relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-telus-purple/5 rounded-bl-full -z-10"></div>
        <div className="p-6 sm:p-8 border-b border-border-primary bg-bg-secondary/80 backdrop-blur-sm">
          <div className="flex flex-row items-center justify-end gap-4 mb-4">
            <div className="flex items-center space-x-2">
              {onFileSelect && (
                <>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                    accept=".zip,application/zip"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="telus-button-secondary py-2"
                    title="Re-upload documents"
                  >
                    <UploadCloud className="w-4 h-4" />
                    <span>Re-upload</span>
                  </button>
                </>
              )}
              {onRefresh && (
                <button
                  onClick={onRefresh}
                  disabled={isRefreshing}
                  className={cn(
                    "telus-button-primary py-2",
                    isRefreshing && "opacity-50 cursor-not-allowed"
                  )}
                  title="Re-analyze documents"
                >
                  <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
                  <span>{isRefreshing ? 'Analyzing...' : 'Refresh Analysis'}</span>
                </button>
              )}
            </div>
          </div>
          <div className="text-text-primary text-sm leading-relaxed mt-6 prose max-w-none prose-p:mb-4 prose-strong:text-text-primary prose-strong:font-bold">
            <ReactMarkdown>
              {result.summary}
            </ReactMarkdown>
          </div>
        </div>
        
          <div className="px-6 sm:px-8 py-5 bg-bg-secondary flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-primary">
            <div className="flex items-center space-x-3 text-text-primary">
              <div className="p-1.5 bg-bg-primary rounded-lg border border-border-primary">
                <Calendar className="w-4 h-4 text-telus-purple" />
              </div>
              <Tooltip content="The date when the master agreement expires across all SOWs">
                <span className="text-sm font-bold uppercase tracking-wider cursor-help border-b border-dotted border-border-primary">Overall Contract Expiry:</span>
              </Tooltip>
              <span className="text-sm font-black text-text-primary bg-bg-primary px-4 py-1.5 rounded-xl border border-border-primary shadow-sm ml-2">
                {result.contractExpiryDate || 'Not specified'}
              </span>
            </div>
            
            {/* Renewal Health Score Widget */}
            <div className="relative group cursor-help">
              <div className="flex items-center space-x-4 bg-bg-primary p-2 rounded-2xl border border-border-primary shadow-sm transition-all hover:border-telus-purple/50 hover:bg-bg-secondary">
                <div className="flex items-center space-x-2 px-3 py-1.5 bg-bg-secondary rounded-xl border border-border-primary shadow-sm">
                  <ShieldAlert className="w-4 h-4 text-telus-purple" />
                  <span className="text-[10px] font-black text-text-secondary uppercase tracking-widest">Renewal Health</span>
                </div>
                <div className="flex items-center space-x-3 pr-2">
                  <div className="w-10 h-10 rounded-full border-4 border-border-primary flex items-center justify-center relative">
                    <div className="absolute inset-0 border-4 border-telus-purple rounded-full border-t-transparent -rotate-45"></div>
                    <span className="text-xs font-black text-telus-purple">82</span>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-telus-green uppercase tracking-widest leading-none">High Probability</p>
                    <div className="flex items-center mt-1">
                      <p className="text-[9px] font-bold text-text-secondary uppercase tracking-tighter">AI-Assessed Strategy</p>
                      <Info className="w-2.5 h-2.5 ml-1 text-text-secondary" />
                    </div>
                  </div>
                </div>
              </div>
 
              {/* Tooltip Logic Content */}
              <div className="absolute bottom-full right-0 mb-3 w-80 p-6 bg-bg-secondary backdrop-blur-md text-text-primary rounded-[32px] shadow-xl opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none z-50 translate-y-2 group-hover:translate-y-0 border border-border-primary">
                <div className="flex items-center space-x-3 mb-5 border-b border-border-primary pb-4">
                  <div className="p-2 bg-telus-purple/10 rounded-xl border border-telus-purple/20">
                    <ShieldAlert className="w-5 h-5 text-telus-purple" />
                  </div>
                  <div>
                    <h5 className="font-black text-base text-text-primary tracking-tight">Renewal Health Logic</h5>
                    <p className="text-[10px] font-bold text-telus-purple uppercase tracking-widest">AI-Assessed Strategy</p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-text-secondary font-black uppercase tracking-widest">Contract Expiry</span>
                    <div className="flex items-center">
                      <div className="w-20 h-1.5 bg-border-primary rounded-full mr-3 overflow-hidden border border-border-primary p-0.5">
                        <div className="h-full bg-telus-purple rounded-full w-[40%] shadow-sm"></div>
                      </div>
                      <span className="text-xs font-black text-telus-purple">40%</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-text-secondary font-black uppercase tracking-widest">Product Intensity</span>
                    <div className="flex items-center">
                      <div className="w-20 h-1.5 bg-border-primary rounded-full mr-3 overflow-hidden border border-border-primary p-0.5">
                        <div className="h-full bg-telus-purple rounded-full w-[30%] shadow-sm"></div>
                      </div>
                      <span className="text-xs font-black text-telus-purple">30%</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-text-secondary font-black uppercase tracking-widest">Billing Health</span>
                    <div className="flex items-center">
                      <div className="w-20 h-1.5 bg-border-primary rounded-full mr-3 overflow-hidden border border-border-primary p-0.5">
                        <div className="h-full bg-telus-purple rounded-full w-[20%] shadow-sm"></div>
                      </div>
                      <span className="text-xs font-black text-telus-purple">20%</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-text-secondary font-black uppercase tracking-widest">Risk Flags</span>
                    <div className="flex items-center">
                      <div className="w-20 h-1.5 bg-border-primary rounded-full mr-3 overflow-hidden border border-border-primary p-0.5">
                        <div className="h-full bg-telus-purple rounded-full w-[10%] shadow-sm"></div>
                      </div>
                      <span className="text-xs font-black text-telus-purple">10%</span>
                    </div>
                  </div>
                </div>
                
                <div className="mt-6 pt-4 border-t border-border-primary text-[10px] text-text-secondary font-medium italic leading-relaxed">
                  Strategic automation framework for proactive revenue intelligence and portfolio-wide risk.
                </div>
              </div>
                
                {/* Tooltip Arrow */}
                <div className="absolute -bottom-1.5 right-10 w-3 h-3 bg-bg-secondary border-r border-b border-border-primary rotate-45"></div>
              </div>
            </div>
          </div>

      {/* Sticky Tabs & Controls */}
      <div className="sticky top-20 z-40 bg-bg-primary/95 backdrop-blur-md py-4 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 border-b border-border-primary/20 transition-all duration-300">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 max-w-[1600px] mx-auto">
          <div className="flex flex-wrap gap-1 bg-bg-secondary p-1.5 rounded-2xl shadow-[0_10px_40px_rgba(75,40,109,0.05)] w-full lg:w-fit">
            <button
              onClick={() => setActiveTab('overview')}
              className={cn(
                "flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-200",
                activeTab === 'overview' 
                  ? "bg-telus-purple text-white shadow-sm" 
                  : "text-text-secondary hover:text-telus-purple hover:bg-bg-primary"
              )}
            >
              <LayoutDashboard className="w-3 h-3" />
              <span>Overview</span>
            </button>
            <button
              onClick={() => setActiveTab('monthly_billing')}
              className={cn(
                "flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-200",
                activeTab === 'monthly_billing' 
                  ? "bg-telus-purple text-white shadow-sm" 
                  : "text-text-secondary hover:text-telus-purple hover:bg-bg-primary"
              )}
            >
              <CalendarDays className="w-3 h-3" />
              <span>Billing</span>
            </button>
            <button
              onClick={() => setActiveTab('margin_analysis' as any)}
              className={cn(
                "flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-200",
                activeTab === ('margin_analysis' as any)
                  ? "bg-telus-purple text-white shadow-sm" 
                  : "text-text-secondary hover:text-telus-purple hover:bg-bg-primary"
              )}
            >
              <Percent className="w-3 h-3" />
              <span>Margins</span>
            </button>
            <button
              onClick={() => setActiveTab('risk_dashboard' as any)}
              className={cn(
                "flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-200",
                activeTab === ('risk_dashboard' as any)
                  ? "bg-telus-purple text-white shadow-sm" 
                  : "text-text-secondary hover:text-telus-purple hover:bg-bg-primary"
              )}
            >
              <ShieldAlert className="w-3 h-3" />
              <span>Risks</span>
            </button>
            <button
              onClick={() => setActiveTab('revenue_forecast' as any)}
              className={cn(
                "flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-200",
                activeTab === ('revenue_forecast' as any)
                  ? "bg-telus-purple text-white shadow-sm" 
                  : "text-text-secondary hover:text-telus-purple hover:bg-bg-primary"
              )}
            >
              <TrendingUp className="w-3 h-3" />
              <span>Forecast</span>
            </button>
            <button
              onClick={() => setActiveTab('evolution')}
              className={cn(
                "flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-200",
                activeTab === 'evolution' 
                  ? "bg-telus-green text-white shadow-sm" 
                  : "text-text-secondary hover:text-telus-green hover:bg-telus-green/10"
              )}
            >
              <TrendingUp className="w-3 h-3" />
              <span>Evolution</span>
            </button>
            <button
              onClick={() => setActiveTab('timeline')}
              className={cn(
                "flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-200",
                activeTab === 'timeline' 
                  ? "bg-telus-purple text-white shadow-sm" 
                  : "text-text-secondary hover:text-telus-purple hover:bg-bg-primary"
              )}
            >
              <Clock className="w-3 h-3" />
              <span>Timeline</span>
            </button>
            <button
              onClick={() => setActiveTab('daf')}
              className={cn(
                "flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-200",
                activeTab === 'daf' 
                  ? "bg-telus-purple text-white shadow-sm" 
                  : "text-text-secondary hover:text-telus-purple hover:bg-bg-primary"
              )}
              title="Deliverable Approval Form Status"
            >
              <ShieldCheck className="w-3 h-3" />
              <span>DAF (Deliverable Approval Form)</span>
            </button>
            <button
              onClick={() => setActiveTab('intelligence')}
              className={cn(
                "flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-200",
                activeTab === 'intelligence' 
                  ? "bg-telus-purple text-white shadow-sm" 
                  : "text-text-secondary hover:text-telus-purple hover:bg-bg-primary"
              )}
            >
              <BrainCircuit className="w-3 h-3" />
              <span>Intelligence</span>
            </button>
            <button
              onClick={() => setActiveTab('smart_insights')}
              className={cn(
                "flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-200",
                activeTab === 'smart_insights' 
                  ? "bg-telus-purple text-white shadow-sm" 
                  : "text-text-secondary hover:text-telus-purple hover:bg-bg-primary"
              )}
            >
              <Sparkles className="w-3 h-3" />
              <span>Smart Insights</span>
            </button>
            <button
              onClick={() => setActiveTab('audit_logs')}
              className={cn(
                "flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-200",
                activeTab === 'audit_logs' 
                  ? "bg-telus-purple text-white shadow-sm" 
                  : "text-text-secondary hover:text-telus-purple hover:bg-bg-primary"
              )}
            >
              <Activity className="w-3 h-3" />
              <span>Audit Logs</span>
            </button>
          </div>
 
          <div className="flex items-center space-x-2">
            {activeTab === 'overview' && (
              <button 
                onClick={toggleAll}
                className="text-[9px] font-bold uppercase tracking-wider text-telus-purple hover:text-white flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-bg-secondary hover:bg-telus-purple transition-all border border-border-primary/20 shadow-sm"
              >
                {allExpanded ? <FoldVertical className="w-3 h-3" /> : <UnfoldVertical className="w-3 h-3" />}
                <span>{allExpanded ? 'Collapse' : 'Expand'}</span>
              </button>
            )}
            {(activeTab === 'overview' || activeTab === 'monthly_billing' || activeTab === ('margin_analysis' as any) || activeTab === 'timeline') && (
              <button 
                onClick={() => setShowVendorFinancials(!showVendorFinancials)}
                className="flex items-center space-x-1 text-[9px] font-bold uppercase tracking-wider text-text-secondary hover:text-telus-gray transition-colors bg-bg-secondary hover:bg-bg-primary px-3 py-1.5 rounded-lg border border-border-primary/20 shadow-sm"
              >
                {showVendorFinancials ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5 text-text-secondary" />
                    <span>Hide {result.vendorAlias || 'Vendor'}</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5 text-text-secondary" />
                    <span>Show {result.vendorAlias || 'Vendor'}</span>
                  </>
                )}
              </button>
            )}
            {activeTab === 'overview' && (
              <button 
                onClick={() => setShowDocuments(!showDocuments)}
                className="flex items-center space-x-1 text-[9px] font-bold uppercase tracking-wider text-text-secondary hover:text-telus-gray transition-colors bg-bg-secondary hover:bg-bg-primary px-3 py-1.5 rounded-lg border border-border-primary/20 shadow-sm"
              >
                {showDocuments ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5 text-text-secondary" />
                    <span>Hide Docs</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5 text-text-secondary" />
                    <span>Show Docs</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === 'audit_logs' && (
          <div className="telus-card p-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-2xl font-black text-telus-gray flex items-center">
                  <Activity className="w-6 h-6 mr-3 text-telus-purple" />
                  Audit Logs & Versioning
                </h3>
                <p className="text-sm text-text-secondary mt-1 font-medium">Historical record of all manual overrides and data changes.</p>
              </div>
            </div>
 
            {isLoadingLogs ? (
              <SkeletonTable rows={10} />
            ) : auditLogs.length === 0 ? (
              <div className="text-center py-20 bg-bg-secondary rounded-2xl border-2 border-dashed border-border-primary/50">
                <Clock className="w-12 h-12 text-text-secondary/50 mx-auto mb-4" />
                <p className="text-text-secondary font-bold uppercase tracking-widest text-xs">No audit logs found for this customer.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-bg-primary/50 border-b border-border-primary/50">
                      <th className="px-4 py-3 text-[10px] font-black text-text-secondary uppercase tracking-widest">Timestamp</th>
                      <th className="px-4 py-3 text-[10px] font-black text-text-secondary uppercase tracking-widest">User</th>
                      <th className="px-4 py-3 text-[10px] font-black text-text-secondary uppercase tracking-widest">Action</th>
                      <th className="px-4 py-3 text-[10px] font-black text-text-secondary uppercase tracking-widest">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-primary/20">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-bg-primary/50 transition-colors">
                        <td className="px-4 py-4 text-[11px] font-bold text-text-secondary whitespace-nowrap">
                          {format(log.timestamp, 'MMM d, yyyy HH:mm:ss')}
                        </td>
                        <td className="px-4 py-4 text-[11px] font-black text-telus-purple">
                          {log.userEmail}
                        </td>
                        <td className="px-4 py-4">
                          <span className="px-2 py-0.5 rounded-full bg-telus-purple/10 text-telus-purple text-[9px] font-black uppercase tracking-wider border border-telus-purple/20">
                            {log.action}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-[11px] font-medium text-text-secondary">
                          {log.details}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'overview' && (
          <div className="space-y-8">
            {/* SOW Navigation */}
            <div className="flex flex-wrap gap-2.5 p-2 bg-bg-primary/50 rounded-2xl border border-border-primary/20 shadow-sm">
              {sowNames.map(key => (
                <button
                  key={key}
                  onClick={() => {
                    const el = document.getElementById(`sow-${key}`);
                    if (el) {
                      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      // Also expand it if it's collapsed
                      if (!expandedSows[key]) {
                        toggleSow(key);
                      }
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg text-sm font-bold transition-all bg-bg-secondary text-text-secondary hover:bg-telus-purple/10 border border-border-primary hover:border-telus-purple/30 hover:text-telus-purple shadow-sm"
                >
                  {sowGroups[key].displayName}
                </button>
              ))}
            </div>

            {/* SOW Groups */}
            <div className="space-y-6">
              {sowNames.map(key => (
                <div key={key} id={`sow-${key}`} className="scroll-mt-24">
                  <SowGroupDisplay
                    sowName={sowGroups[key].displayName}
                    customerServices={sowGroups[key].customerServices}
                    vendorServices={sowGroups[key].vendorServices}
                    changeOrders={sowGroups[key].changeOrders}
                    isExpanded={expandedSows[key]}
                    onToggle={() => toggleSow(key)}
                    showVendorFinancials={showVendorFinancials}
                    onMakeActive={handleMakeActive}
                    onRevertActive={handleRevertActive}
                    showDocuments={showDocuments}
                    onUpdateSowName={handleUpdateSowName}
                    customerAlias={result.customerAlias}
                    vendorAlias={result.vendorAlias}
                    customerName={result.customerName}
                    onToggleDaf={handleToggleDaf}
                    onToggleCoDaf={handleToggleCoDaf}
                    onUpdateResult={onUpdateResult}
                    result={result}
                    userRole={userRole}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'monthly_billing' && (
          <MonthlyBilling result={result} showVendorFinancials={showVendorFinancials} onUpdateResult={onUpdateResult} customerId={customerId} />
        )}

        {activeTab === ('margin_analysis' as any) && (
          <MarginAnalysis result={result} showVendorFinancials={showVendorFinancials} />
        )}

        {activeTab === ('risk_dashboard' as any) && (
          <RiskDashboard result={result} onUpdateResult={onUpdateResult} />
        )}

        {activeTab === ('revenue_forecast' as any) && (
          <RevenueWaterfall result={result} />
        )}

        {activeTab === 'timeline' && (
          <ServiceTimeline 
            result={result} 
            showVendorFinancials={showVendorFinancials} 
            hidePS={hidePS}
            setHidePS={setHidePS}
            onToggleDaf={handleToggleDaf}
          />
        )}

        {activeTab === 'daf' && (
          <DafStatusView result={result} onUpdateResult={onUpdateResult} customerId={customerId} />
        )}
        {activeTab === 'evolution' && (
          <QuantityEvolutionView result={result} />
        )}

        {activeTab === 'intelligence' && (
          <CustomerIntelligence result={result} />
        )}

        {activeTab === 'smart_insights' && (
          <SmartDashboard result={result} />
        )}
      </div>
    </div>
  );
};
