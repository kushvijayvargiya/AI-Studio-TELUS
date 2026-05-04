import React, { useMemo, useState } from 'react';
import { ContractAnalysisResult, ServiceDetail } from '../lib/gemini';
import { AlertCircle, FileWarning, CheckCircle2, XCircle, ShieldAlert, FileText, Activity, Save } from 'lucide-react';
import { cn, cleanSowName, cleanServiceName, parseAmount, fuzzyMatch } from '../lib/utils';

import { CustomSelect } from './ui/CustomSelect';

interface RiskDashboardProps {
  result: ContractAnalysisResult;
  onUpdateResult?: (result: ContractAnalysisResult) => void;
}

const formatCurrency = (val: number) => 
  new Intl.NumberFormat('en-US', { 
    style: 'currency', 
    currency: 'USD'
  }).format(val);

interface GroupedRiskItem {
  id: string;
  name: string;
  sowName: string;
  customerAmount: number;
  vendorAmount: number;
  type: 'Service' | 'Change Order';
  status: string;
  hasCustomer: boolean;
  hasVendor: boolean;
  serviceType?: string;
}

const groupRiskItems = (items: any[], type: 'Service' | 'Change Order', status: string, customerName?: string, coToSowMap: Record<string, string> = {}): GroupedRiskItem[] => {
  const grouped: GroupedRiskItem[] = [];
  
  const getGroupKey = (rawName: string) => {
    const cleanName = cleanSowName(rawName, customerName);
    const lower = cleanName.toLowerCase();
    if (coToSowMap[lower]) return coToSowMap[lower];
    for (const [coKey, sowName] of Object.entries(coToSowMap)) {
      if (lower.includes(coKey)) return sowName;
    }
    return cleanName;
  };

    items.forEach(item => {
      const rawName = item.serviceName || item.changeDescription;
      const name = type === 'Service' ? cleanServiceName(rawName, customerName) : rawName;
      const sowName = getGroupKey(item.sowName || item.associatedSOW);
      const amount = parseAmount(item.amount);
      const facing = item.facing || 'Customer';
      
      const rawType = item.serviceType || '';
      const isPS = rawType === 'PS' || rawType.toLowerCase().includes('professional');
      const isTS = rawType === 'TS' || rawType.toLowerCase().includes('transition');
      const isMS = rawType === 'MS' || rawType.toLowerCase().includes('managed');
      const serviceType = isPS ? 'PS' : (isTS ? 'TS' : (isMS ? 'MS' : rawType));
      
      const existing = grouped.find(g => {
        if (g.type !== type || g.sowName !== sowName) return false;
        
        const isSameServiceType = serviceType && g.serviceType && serviceType === g.serviceType;
        
        // Special handling for TS and PS: always group by type within SOW to compare totals
        if (isSameServiceType && (serviceType === 'TS' || serviceType === 'PS')) {
          return true;
        }

        const isNameSimilar = fuzzyMatch(g.name, name);
        
        if (isNameSimilar) return true;
        
        if (isSameServiceType) {
          // Group if they are complementary (one customer, one vendor)
          // and the group doesn't already have this facing
          const isComplementary = (facing.toLowerCase() === 'vendor' && !g.hasVendor) || 
                                  (facing.toLowerCase() === 'customer' && !g.hasCustomer);
          if (isComplementary) return true;
        }
        
        return false;
      });
      
      if (existing) {
        if (facing.toLowerCase() === 'vendor') {
          existing.vendorAmount += amount;
          existing.hasVendor = true;
        } else {
          existing.customerAmount += amount;
          // For TS/PS, we use a generic name if multiple items are grouped
          if (serviceType === 'TS' || serviceType === 'PS') {
            existing.name = serviceType === 'TS' ? 'Total Transition Services' : 'Total Professional Services';
          } else if (!existing.hasCustomer || name.length > existing.name.length) {
            existing.name = name;
          }
          existing.hasCustomer = true;
        }
      } else {
        grouped.push({
          id: Math.random().toString(36).substr(2, 9),
          name: (serviceType === 'TS' || serviceType === 'PS') 
            ? (serviceType === 'TS' ? 'Total Transition Services' : 'Total Professional Services')
            : name,
          sowName,
          customerAmount: facing.toLowerCase() === 'customer' ? amount : 0,
          vendorAmount: facing.toLowerCase() === 'vendor' ? amount : 0,
          type,
          status,
          hasCustomer: facing.toLowerCase() === 'customer',
          hasVendor: facing.toLowerCase() === 'vendor',
          serviceType
        });
      }
    });
  
  return grouped;
};

export const RiskDashboard: React.FC<RiskDashboardProps> = ({ result, onUpdateResult }) => {
  const [pendingMatch, setPendingMatch] = useState<{customerServiceName: string, sowName: string, vendorServiceName: string} | null>(null);

  const handleManualMatch = (customerServiceName: string, sowName: string, vendorServiceName: string) => {
    setPendingMatch({ customerServiceName, sowName, vendorServiceName });
  };

  const confirmMatch = () => {
    if (!pendingMatch || !onUpdateResult) return;

    const { customerServiceName, sowName, vendorServiceName } = pendingMatch;

    // We need to find the actual service name if customerServiceName is a group name
    const updatedCustomerServices = (result.customerServices || []).map(s => {
      const sSowName = cleanSowName(s.sowName, result.customerName);
      const sName = cleanServiceName(s.serviceName, result.customerName);
      
      const isPSGroup = customerServiceName === 'Total Professional Services' && (s.serviceType === 'PS' || s.serviceType?.toLowerCase().includes('professional'));
      const isTSGroup = customerServiceName === 'Total Transition Services' && (s.serviceType === 'TS' || s.serviceType?.toLowerCase().includes('transition'));
      
      const isMatch = (s.serviceName === customerServiceName || sName === customerServiceName || isPSGroup || isTSGroup) && sSowName === sowName;
      
      if (isMatch) {
        return { ...s, manualVendorMatchName: vendorServiceName };
      }
      return s;
    });

    onUpdateResult({
      ...result,
      customerServices: updatedCustomerServices
    });
    setPendingMatch(null);
  };

  const riskData = useMemo(() => {
    const coToSowMap: Record<string, string> = {};
    result.changeOrders?.forEach(co => {
      const coName = cleanSowName(co.changeOrderNumber, result.customerName).toLowerCase();
      const sowName = cleanSowName(co.associatedSOW, result.customerName);
      if (coName && sowName && coName !== sowName) {
        coToSowMap[coName] = sowName;
        const coNameNoExt = coName.replace(/\.(docx|pdf|doc)$/i, '');
        if (coNameNoExt !== coName) coToSowMap[coNameNoExt] = sowName;
      }
    });

    const getGroupKey = (rawName: string) => {
      const cleanName = cleanSowName(rawName, result.customerName);
      const lower = cleanName.toLowerCase();
      if (coToSowMap[lower]) return coToSowMap[lower];
      for (const [coKey, sowName] of Object.entries(coToSowMap)) {
        if (lower.includes(coKey)) return sowName;
      }
      return cleanName;
    };

    const allServices = [
      ...(result.customerServices || []).map(s => ({ ...s, facing: 'Customer' })),
      ...(result.vendorServices || []).map(s => ({ ...s, facing: 'Vendor' }))
    ];
    
    const vendorServicesPool = (result.vendorServices || []).map(s => ({
      name: s.serviceName,
      sowName: getGroupKey(s.sowName),
      serviceType: s.serviceType
    }));

    const allChangeOrders = result.changeOrders || [];
    
    // 1. Orphan Services (Signed MS SOW, but 0 onboarded quantity)
    const orphanServices = allServices.filter(s => 
      s.isSigned && 
      (s.serviceType === 'MS' || s.serviceType?.toLowerCase().includes('managed')) &&
      (!s.onboardedQuantity || s.onboardedQuantity === '0')
    );
    
    // 2. Unsigned Value
    const unsignedServices = allServices.filter(s => !s.isSigned);
    const unsignedCOs = allChangeOrders.filter(co => !co.isSigned);
    
    let totalUnsignedValue = 0;
    unsignedServices.forEach(s => totalUnsignedValue += parseAmount(s.amount));
    unsignedCOs.forEach(co => totalUnsignedValue += parseAmount(co.amount));
    
    // 3. Service Mismatches (Customer vs Vendor)
    // Group all services by SOW and Type to check for mismatches
    const groupedMismatches: GroupedRiskItem[] = [];
    const processedServices: { name: string, sowName: string, serviceType: string, facing: string, amount: number }[] = allServices.map(s => {
      const rawType = (s.serviceType || '').toUpperCase();
      const isPS = rawType === 'PS' || rawType.includes('PROFESSIONAL');
      const isTS = rawType === 'TS' || rawType.includes('TRANSITION');
      const serviceType = isPS ? 'PS' : (isTS ? 'TS' : (rawType === 'MS' || rawType.includes('MANAGED') ? 'MS' : rawType));
      return {
        name: s.serviceName,
        sowName: getGroupKey(s.sowName),
        serviceType,
        facing: s.facing || 'Customer',
        amount: parseAmount(s.amount)
      };
    });

    const groups: { 
      name: string, 
      sowName: string, 
      hasCustomer: boolean, 
      hasVendor: boolean, 
      customerAmount: number, 
      vendorAmount: number,
      serviceType: string,
      customerServices: string[],
      vendorServices: string[]
    }[] = [];

    processedServices.forEach(s => {
      // Try to find an existing group
      const existingGroup = groups.find(g => {
        if (g.sowName !== s.sowName || g.serviceType !== s.serviceType) return false;
        
        // Check for manual match first
        const originalCustomerService = result.customerServices?.find(cs => 
          (cs.serviceName === s.name || cleanServiceName(cs.serviceName, result.customerName) === s.name) && 
          getGroupKey(cs.sowName) === s.sowName
        );

        if (s.facing === 'Customer') {
          if (originalCustomerService?.manualVendorMatchName) {
            // If this group already has the manually matched vendor service
            if (g.vendorServices.includes(originalCustomerService.manualVendorMatchName)) return true;
          }
        } else {
          // If s is Vendor, check if any Customer service in this group manually matches this Vendor service
          const hasCustomerMatchingThisVendor = g.customerServices.some(csName => {
            const cs = result.customerServices?.find(x => 
              (x.serviceName === csName || cleanServiceName(x.serviceName, result.customerName) === csName) && 
              getGroupKey(x.sowName) === s.sowName
            );
            return cs?.manualVendorMatchName === s.name;
          });
          if (hasCustomerMatchingThisVendor) return true;
        }

        // For PS/TS, we always group by type within SOW
        if (s.serviceType === 'PS' || s.serviceType === 'TS') return true;
        
        // For others, check for name similarity
        return fuzzyMatch(g.name, s.name);
      });

      if (existingGroup) {
        if (s.facing === 'Customer') {
          existingGroup.hasCustomer = true;
          existingGroup.customerAmount += s.amount;
          existingGroup.customerServices.push(s.name);
          // Keep the longer name as it's usually more descriptive
          if (s.name.length > existingGroup.name.length) existingGroup.name = s.name;
        } else {
          existingGroup.hasVendor = true;
          existingGroup.vendorAmount += s.amount;
          existingGroup.vendorServices.push(s.name);
        }
      } else {
        groups.push({
          name: (s.serviceType === 'PS' || s.serviceType === 'TS')
            ? (s.serviceType === 'PS' ? 'Total Professional Services' : 'Total Transition Services')
            : s.name,
          sowName: s.sowName,
          hasCustomer: s.facing === 'Customer',
          hasVendor: s.facing === 'Vendor',
          customerAmount: s.facing === 'Customer' ? s.amount : 0,
          vendorAmount: s.facing === 'Vendor' ? s.amount : 0,
          serviceType: s.serviceType,
          customerServices: s.facing === 'Customer' ? [s.name] : [],
          vendorServices: s.facing === 'Vendor' ? [s.name] : []
        });
      }
    });

    const finalMismatches = groups
      .filter(g => g.hasCustomer && !g.hasVendor)
      .map(g => ({
        id: `mismatch-${g.sowName}-${g.name}-${g.serviceType}`,
        name: g.name,
        sowName: g.sowName,
        customerAmount: g.customerAmount,
        vendorAmount: g.vendorAmount,
        type: 'Service' as const,
        status: 'No Vendor Match',
        hasCustomer: true,
        hasVendor: false,
        serviceType: g.serviceType
      }));

    const groupedOrphans = groupRiskItems(orphanServices, 'Service', 'Missing DAF', result.customerName, coToSowMap);
    const groupedUnsignedServices = groupRiskItems(unsignedServices, 'Service', 'Unsigned', result.customerName, coToSowMap);
    const groupedUnsignedCOs = groupRiskItems(unsignedCOs, 'Change Order', 'Unsigned', result.customerName, coToSowMap);

    return {
      orphanServices,
      groupedOrphans,
      totalUnsignedValue,
      unsignedCount: unsignedServices.length + unsignedCOs.length,
      mismatches: finalMismatches,
      unsignedServices,
      unsignedCOs,
      groupedUnsigned: [...groupedUnsignedServices, ...groupedUnsignedCOs],
      vendorServicesPool
    };
  }, [result]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Risk Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-bg-secondary p-4 sm:p-5 rounded-2xl border border-rose-500/20 shadow-xl shadow-rose-500/5 hover:shadow-2xl hover:shadow-rose-500/10 transition-all group relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/5 rounded-bl-full -z-10 transition-transform group-hover:scale-110"></div>
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 bg-rose-500/10 rounded-xl shadow-sm border border-rose-500/20">
              <ShieldAlert className="w-4 h-4 text-rose-500" />
            </div>
            <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">Total Unsigned Value</p>
          </div>
          <p className="text-3xl font-black text-telus-gray tracking-tight">{formatCurrency(riskData.totalUnsignedValue)}</p>
          <p className="text-xs text-text-secondary/60 mt-2 font-bold flex items-center">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mr-2 animate-pulse"></span>
            {riskData.unsignedCount} unsigned documents/services
          </p>
          <div className="absolute inset-x-0 -bottom-12 bg-bg-secondary/95 backdrop-blur-md text-telus-gray text-[10px] p-4 rounded-2xl opacity-0 group-hover:opacity-100 transition-all z-10 pointer-events-none mx-4 mb-2 shadow-[0_20px_50px_rgba(75,40,109,0.15)] border border-border-primary">
            <p className="font-bold text-telus-purple mb-1 uppercase tracking-widest text-[9px]">Insight</p>
            Total monetary value associated with services and change orders that have not been signed.
          </div>
        </div>
        
        <div className="telus-card p-4 sm:p-5 bg-bg-secondary border-amber-500/20 hover:shadow-2xl hover:shadow-amber-500/10 transition-all group relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-bl-full -z-10 transition-transform group-hover:scale-110"></div>
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 bg-amber-500/10 rounded-xl shadow-sm border border-amber-500/20">
              <AlertCircle className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">Orphan Services</p>
          </div>
          <p className="text-3xl font-black text-telus-gray tracking-tight">{riskData.orphanServices.length}</p>
          <p className="text-xs text-text-secondary/60 mt-2 font-bold flex items-center">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-2 animate-pulse"></span>
            Signed but not onboarded (DAF missing)
          </p>
          <div className="absolute inset-x-0 -bottom-16 bg-bg-secondary/95 backdrop-blur-md text-telus-gray text-[10px] p-4 rounded-2xl opacity-0 group-hover:opacity-100 transition-all z-10 pointer-events-none mx-4 mb-2 shadow-[0_20px_50px_rgba(75,40,109,0.15)] border border-border-primary">
            <p className="font-bold text-telus-purple mb-1 uppercase tracking-widest text-[9px]">Insight</p>
            Signed Managed Services (MS) that have no associated Deliverable Approval Form (DAF). This represents potential revenue leakage as the service is active but not being billed.
          </div>
        </div>

        <div className="telus-card p-4 sm:p-5 bg-bg-secondary border-border-primary hover:shadow-2xl hover:shadow-telus-purple/10 transition-all group relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-telus-purple/5 rounded-bl-full -z-10 transition-transform group-hover:scale-110"></div>
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 bg-telus-purple/10 rounded-xl shadow-sm border border-border-primary">
              <FileWarning className="w-4 h-4 text-telus-purple" />
            </div>
            <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">Service Mismatches</p>
          </div>
          <p className="text-3xl font-black text-telus-gray tracking-tight">{riskData.mismatches.length}</p>
          <p className="text-xs text-text-secondary/60 mt-2 font-bold flex items-center">
            <span className="w-1.5 h-1.5 rounded-full bg-telus-purple mr-2 animate-pulse"></span>
            {result.customerAlias || 'Customer'} services without {result.vendorAlias || 'Vendor'} match
          </p>
          <div className="absolute inset-x-0 -bottom-16 bg-bg-secondary/95 backdrop-blur-md text-telus-gray text-[10px] p-4 rounded-2xl opacity-0 group-hover:opacity-100 transition-all z-10 pointer-events-none mx-4 mb-2 shadow-[0_20px_50px_rgba(75,40,109,0.15)] border border-border-primary">
            <p className="font-bold text-telus-purple mb-1 uppercase tracking-widest text-[9px]">Insight</p>
            {result.customerAlias || 'Customer'}-facing services (TELUS) that do not have a corresponding {result.vendorAlias || 'Vendor'} service (Jolera). This could indicate a gap in service delivery or a missing {result.vendorAlias || 'Vendor'} contract.
          </div>
        </div>
      </div>

      {/* Detailed Risk Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Orphan Services List */}
        <div className="telus-card overflow-hidden hover:shadow-md transition-all bg-bg-secondary border-border-primary">
          <div className="p-5 border-b border-border-primary bg-bg-secondary">
            <h4 className="font-black text-telus-gray flex items-center text-lg tracking-tight">
              <div className="p-2 bg-amber-500/10 rounded-xl mr-3 shadow-sm border border-amber-500/20">
                <Activity className="w-5 h-5 text-amber-500" />
              </div>
              Orphan Services (Revenue Leakage)
            </h4>
          </div>
          <div className="divide-y divide-border-primary">
            {riskData.groupedOrphans.length > 0 ? riskData.groupedOrphans.map((item) => (
              <div key={item.id} className="p-5 hover:bg-bg-primary transition-colors group">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center space-x-2">
                      <p className="text-sm font-bold text-telus-gray group-hover:text-telus-purple transition-colors">{item.name}</p>
                    </div>
                    <p className="text-[10px] text-text-secondary/60 mt-1 font-bold uppercase tracking-widest">{item.sowName}</p>
                  </div>
                  <span className="px-2 py-1 rounded-lg bg-amber-500/10 text-amber-500 text-[9px] font-black uppercase tracking-widest whitespace-nowrap ml-4 border border-amber-500/20 shadow-sm">{item.status}</span>
                </div>
                <div className="mt-4 flex items-center space-x-6 bg-bg-primary/50 p-4 rounded-xl border border-border-primary">
                  {item.hasCustomer && (
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black text-text-secondary/60 uppercase tracking-widest mb-1">{result.customerAlias || 'Customer'}</span>
                      <span className="text-sm font-black text-telus-green tracking-tight">{formatCurrency(item.customerAmount)}<span className="text-[9px] text-text-secondary/40 ml-1 font-bold">/mo</span></span>
                    </div>
                  )}
                  {item.hasVendor && (
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black text-text-secondary/60 uppercase tracking-widest mb-1">{result.vendorAlias || 'Vendor'}</span>
                      <span className="text-sm font-black text-rose-500 tracking-tight">{formatCurrency(item.vendorAmount)}<span className="text-[9px] text-text-secondary/40 ml-1 font-bold">/mo</span></span>
                    </div>
                  )}
                </div>
              </div>
            )) : (
              <div className="p-16 flex flex-col items-center justify-center text-center">
                <div className="w-20 h-20 bg-telus-green/10 rounded-full flex items-center justify-center mb-6 shadow-sm border border-telus-green/20">
                  <CheckCircle2 className="w-10 h-10 text-telus-green" />
                </div>
                <p className="text-telus-gray font-black text-xl tracking-tight mb-2">All Good!</p>
                <p className="text-text-secondary/60 font-bold uppercase tracking-widest text-xs">No orphan services detected</p>
              </div>
            )}
          </div>
        </div>

        {/* Unsigned Documents List */}
        <div className="telus-card overflow-hidden hover:shadow-md transition-all bg-bg-secondary border-border-primary">
          <div className="p-5 border-b border-border-primary bg-bg-secondary">
            <h4 className="font-black text-telus-gray flex items-center text-lg tracking-tight">
              <div className="p-2 bg-rose-500/10 rounded-xl mr-3 shadow-sm border border-rose-500/20">
                <FileText className="w-5 h-5 text-rose-500" />
              </div>
              Unsigned Value Breakdown
            </h4>
          </div>
          <div className="divide-y divide-border-primary">
            {riskData.groupedUnsigned.length > 0 ? riskData.groupedUnsigned.map((item) => (
              <div key={item.id} className="p-5 hover:bg-bg-primary transition-colors group">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center space-x-2">
                      <p className="text-sm font-bold text-telus-gray group-hover:text-telus-purple transition-colors">
                        {item.name}
                      </p>
                    </div>
                    <p className="text-[10px] text-text-secondary/60 mt-1 font-bold uppercase tracking-widest">
                      {item.sowName}
                    </p>
                  </div>
                  <span className="px-2 py-1 rounded-lg bg-rose-500/10 text-rose-500 text-[9px] font-black uppercase tracking-widest whitespace-nowrap ml-4 border border-rose-500/20 shadow-sm">{item.status}</span>
                </div>
                <div className="mt-4 flex items-center space-x-6 bg-bg-primary/50 p-4 rounded-xl border border-border-primary">
                  {item.hasCustomer && (
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black text-text-secondary/60 uppercase tracking-widest mb-1">{result.customerAlias || 'Customer'}</span>
                      <span className="text-sm font-black text-telus-green tracking-tight">{formatCurrency(item.customerAmount)}</span>
                    </div>
                  )}
                  {item.hasVendor && (
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black text-text-secondary/60 uppercase tracking-widest mb-1">{result.vendorAlias || 'Vendor'}</span>
                      <span className="text-sm font-black text-rose-500 tracking-tight">{formatCurrency(item.vendorAmount)}</span>
                    </div>
                  )}
                </div>
              </div>
            )) : (
              <div className="p-16 flex flex-col items-center justify-center text-center">
                <div className="w-20 h-20 bg-telus-green/10 rounded-full flex items-center justify-center mb-6 shadow-sm border border-telus-green/20">
                  <CheckCircle2 className="w-10 h-10 text-telus-green" />
                </div>
                <p className="text-telus-gray font-black text-xl tracking-tight mb-2">All Signed!</p>
                <p className="text-text-secondary/60 font-bold uppercase tracking-widest text-xs">All documents have been signed</p>
              </div>
            )}
          </div>
        </div>

        {/* Service Mismatches List */}
        <div className="telus-card overflow-hidden hover:shadow-md transition-all lg:col-span-2 bg-bg-secondary border-border-primary">
          <div className="p-5 border-b border-border-primary bg-bg-secondary">
            <h4 className="font-black text-telus-gray flex items-center text-lg tracking-tight">
              <div className="p-2 bg-telus-purple/10 rounded-xl mr-3 shadow-sm border border-border-primary">
                <FileWarning className="w-5 h-5 text-telus-purple" />
              </div>
              Service Mismatches ({result.customerAlias || 'Customer'} vs {result.vendorAlias || 'Vendor'})
            </h4>
          </div>
          <div className="divide-y divide-border-primary">
            {riskData.mismatches.length > 0 ? riskData.mismatches.map((item) => (
              <div key={item.id} className="p-5 hover:bg-bg-primary transition-colors group">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center space-x-2">
                      <p className="text-sm font-bold text-telus-gray group-hover:text-telus-purple transition-colors">
                        {item.name}
                      </p>
                    </div>
                    <p className="text-[10px] text-text-secondary/60 mt-1 font-bold uppercase tracking-widest">
                      {item.sowName}
                    </p>
                  </div>
                  <span className="px-2 py-1 rounded-lg bg-telus-purple/10 text-telus-purple text-[9px] font-black uppercase tracking-widest whitespace-nowrap ml-4 border border-telus-purple/20 shadow-sm">{item.status}</span>
                </div>
                <div className="mt-4 flex items-center space-x-6 bg-bg-primary/50 p-4 rounded-xl border border-border-primary">
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black text-text-secondary/60 uppercase tracking-widest mb-1">{result.customerAlias || 'Customer'} Amount</span>
                    <span className="text-sm font-black text-telus-green tracking-tight">{formatCurrency(item.customerAmount)}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black text-text-secondary/60 uppercase tracking-widest mb-1">{result.vendorAlias || 'Vendor'} Status</span>
                    <div className="flex flex-col space-y-2">
                      <span className="text-sm font-black text-rose-500 tracking-tight flex items-center">
                        <XCircle className="w-3.5 h-3.5 mr-1.5" />
                        Missing in {result.vendorAlias || 'Vendor'} Contract
                      </span>
                      
                      {onUpdateResult && (
                        <div className="flex items-center space-x-2">
                          <CustomSelect
                            value=""
                            onChange={(val) => handleManualMatch(item.name, item.sowName, val)}
                            options={[
                              { label: "Manually match to vendor service...", value: "" },
                              ...riskData.vendorServicesPool
                                .filter(vs => vs.sowName === item.sowName)
                                .map(vs => ({ label: vs.name, value: vs.name }))
                            ]}
                            className="w-full max-w-[250px]"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )) : (
              <div className="p-16 flex flex-col items-center justify-center text-center">
                <div className="w-20 h-20 bg-telus-green/10 rounded-full flex items-center justify-center mb-6 shadow-sm border border-telus-green/20">
                  <CheckCircle2 className="w-10 h-10 text-telus-green" />
                </div>
                <p className="text-telus-gray font-black text-xl tracking-tight mb-2">All Matched!</p>
                <p className="text-text-secondary/60 font-bold uppercase tracking-widest text-xs">All {result.customerAlias || 'Customer'} services have {result.vendorAlias || 'Vendor'} matches</p>
              </div>
            )}
          </div>
        </div>

        {pendingMatch && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
            <div className="bg-bg-secondary p-6 rounded-2xl shadow-xl max-w-sm w-full border border-border-primary">
              <h3 className="text-lg font-bold text-telus-gray mb-4">Confirm Match</h3>
              <p className="text-sm text-text-secondary mb-6">
                Are you sure you want to match <strong>{pendingMatch.customerServiceName}</strong> to <strong>{pendingMatch.vendorServiceName}</strong>?
              </p>
              <div className="flex justify-end space-x-3">
                <button onClick={() => setPendingMatch(null)} className="px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest text-text-secondary hover:text-telus-gray">Cancel</button>
                <button onClick={confirmMatch} className="telus-button-primary !py-2 !px-6">Confirm</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
