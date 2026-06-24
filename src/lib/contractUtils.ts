import { ContractAnalysisResult, ServiceDetail } from './gemini';
import { isValid, isBefore, isAfter, isSameMonth, startOfMonth, endOfMonth } from 'date-fns';
import { parseAmount, normalizeSow } from './utils';

export const getNum = (val: string | number | undefined) => {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') return val;
  // Remove commas and other non-numeric characters except for the minus sign
  const cleaned = String(val).replace(/,/g, '');
  const match = cleaned.match(/-?\d+/);
  return match ? parseInt(match[0], 10) : 0;
};

export const getNumOrNull = (val: string | number | undefined) => {
  if (val === undefined || val === null || val === 'NaN' || val === 'N/A' || val === '') return null;
  if (typeof val === 'number') return isNaN(val) ? null : val;
  const cleaned = String(val).replace(/,/g, '');
  const match = cleaned.match(/-?\d+/);
  return match ? parseInt(match[0], 10) : null;
};

export const getDerivedUnitPrice = (service: ServiceDetail): number => {
  const extractedPrice = parseAmount(service.unitPrice);
  const totalAmount = parseAmount(service.amount);
  const totalQty = getNum(service.totalQuantity);
  const changeQty = getNum(service.changeQuantity);
  const absChangeQty = Math.abs(changeQty);

  // If unit price was extracted correctly and isn't just the total amount duplicated
  if (extractedPrice > 0) {
    // Sanity check: if unitPrice is exactly the total amount but quantity > 1, 
    // it's likely the AI extracted the total as the unit price.
    // Check against totalQty first, then changeQty
    const relevantQty = totalQty > 1 ? totalQty : (absChangeQty > 1 ? absChangeQty : 1);
    if (relevantQty > 1 && Math.abs(extractedPrice - totalAmount) < 0.01) {
      return totalAmount / relevantQty;
    }
    return extractedPrice;
  }

  // If we have an incremental amount and a change quantity (typical for COs)
  // We prioritize changeQty if it's a CO and totalQty is either 0 or significantly different from change
  // (Meaning totalQty likely represents the NEW total, not the delta)
  if (totalAmount > 0 && absChangeQty > 0) {
    // If totalQty is 0, or if totalQty is the NEW total (not the delta), use changeQty
    if (totalQty === 0 || totalQty !== absChangeQty) {
      return totalAmount / absChangeQty;
    }
  }

  if (totalAmount > 0 && totalQty > 0) {
    return totalAmount / totalQty;
  }
  return 0;
};

export const getBilledQuantity = (service: ServiceDetail): number => {
  if (service.requiresDAF && !service.hasDAF) return 0;
  const onboarded = getNum(service.onboardedQuantity);
  const total = getNum(service.totalQuantity);
  
  // If we have an active DAF, the onboarded quantity should be exactly as per DAF
  if (service.hasDAF) {
    return onboarded;
  }
  
  // Prioritize actual confirmed quantities
  if (onboarded > 0) return onboarded;
  
  // For PS/TS services that are marked as billed/completed, fallback to total qty
  const isPSorTS = service.serviceType === 'PS' || service.serviceType === 'TS' || 
                   service.serviceType?.toLowerCase()?.includes('professional') || 
                   service.serviceType?.toLowerCase()?.includes('transition');
  const isBilled = service.billingStatus?.toLowerCase()?.includes('billed') || 
                   service.billingStatus?.toLowerCase()?.includes('completed');
                   
  if (isPSorTS && isBilled && total > 0) return total;
  if (onboarded > 0) return onboarded;
  if (total > 0) return total;
  
  return 0;
};

export const calculateBilledAmount = (service: ServiceDetail) => {
  const amount = parseAmount(service.amount);
  const totalQty = getNum(service.totalQuantity);
  const onboardedQty = getNum(service.onboardedQuantity);
  const unitPrice = getDerivedUnitPrice(service);

  if (amount === 0 && unitPrice === 0) return 0;
  
  // If DAF is required but hasn't been received/marked as such, it's not billed
  if (service.requiresDAF && !service.hasDAF) {
    return 0;
  }

  // If onboarded matches total, preference goes to unitPrice * onboardedQty if unitPrice exists
  if (totalQty > 0 && onboardedQty === totalQty) {
    if (unitPrice > 0) return unitPrice * onboardedQty;
    return amount;
  }

  // If onboarded is 0, billed is 0 (unless it's a fixed fee PS/TS that's billed)
  const isPSorTS = service.serviceType === 'PS' || service.serviceType === 'TS' || 
                   service.serviceType?.toLowerCase()?.includes('professional') || 
                   service.serviceType?.toLowerCase()?.includes('transition');
  const isBilled = service.billingStatus?.toLowerCase()?.includes('billed') || 
                   service.billingStatus?.toLowerCase()?.includes('completed');

  if (onboardedQty === 0) {
    if (isPSorTS && isBilled && !service.hasDAF) return amount;
    return 0;
  }

  // If we have an onboarded quantity > 0 and unitPrice, calculate directly
  if (unitPrice > 0 && onboardedQty > 0) {
    return unitPrice * onboardedQty;
  }

  // If we have a discrepancy and totalQty > 0, scale the amount
  if (totalQty > 0) {
    return (onboardedQty / totalQty) * amount;
  }

  // Default to amount if we can't scale it
  return amount;
};

// Helper to parse dates from LLM strings
export const parseDate = (dateStr?: string): Date | null => {
  if (!dateStr || dateStr.toLowerCase() === 'n/a' || dateStr.toLowerCase().includes('signing')) return null;
  const parsed = new Date(dateStr);
  return isValid(parsed) ? parsed : null;
};

export const checkActive = (s: ServiceDetail, monthStart: Date, monthEnd: Date, result?: ContractAnalysisResult, fallbackDate?: string, isForecast: boolean = false) => {
  if (s.requiresDAF && !s.hasDAF) return false;

  const isRecurring = s.serviceType === 'MS' || 
                      (s.serviceType && s.serviceType.toLowerCase()?.includes('managed')) || 
                      (s.amount && (s.amount.toLowerCase()?.includes('month') || s.amount.toLowerCase()?.includes('year')));
  
  const start = parseDate(s.dafStartDate || s.effectiveDate || fallbackDate);
  const end = parseDate(s.potentialEndDate || s.expiryDate);
  const contractExpiry = result?.contractExpiryDate ? parseDate(result.contractExpiryDate) : null;
  
  if (isRecurring) {
    if (start && isAfter(start, monthEnd)) return false;
    
    // If we are in forecast mode, respect the contract expiry date even if it's month-to-month
    if (isForecast && contractExpiry && isAfter(monthStart, contractExpiry)) return false;

    // If service has an explicit end date
    if (end && isBefore(end, monthStart)) {
      if (result) {
        const isCancelled = hasCancellationCO(result, s.sowName);
        if (isCancelled) {
          const cancelDate = getCancellationDate(result, s.sowName);
          if (cancelDate && isAfter(monthStart, cancelDate)) return false;
          if (!cancelDate) return false;
        }
      }
      
      // If we are in forecast mode, we treat the service end date as hard stop
      if (isForecast) return false;

      return true; // Keep active (month-to-month) if no cancellation and not in forecast mode
    }
    
    return true;
  } else {
    return start && isSameMonth(start, monthStart);
  }
};

export const calculateRevenueForMonth = (result: ContractAnalysisResult, date: Date, billingSource: 'Customer' | 'Vendor', isForecast: boolean = false): number => {
  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);

  const sowGroups: Record<string, {
    services: Record<string, {
      history: {
        isCO: boolean;
        total: number | null;
        prev: number | null;
        change: number | null;
        amount: number;
        unitPrice: number;
        date: string;
      }[];
    }>
  }> = {};

  const addToGroup = (s: ServiceDetail, sourceSowName: string, isCO: boolean, dateStr?: string) => {
    const sowNameKey = normalizeSow(sourceSowName);
    const serviceName = s.serviceName;

    if (!sowGroups[sowNameKey]) {
      sowGroups[sowNameKey] = { services: {} };
    }

    if (!sowGroups[sowNameKey].services[serviceName]) {
      sowGroups[sowNameKey].services[serviceName] = { history: [] };
    }

    const total = getNumOrNull(s.totalQuantity || s.onboardedQuantity);
    const prev = getNumOrNull(s.previousQuantity);
    const change = getNumOrNull(s.changeQuantity);
    const amount = calculateBilledAmount(s);
    const unitPrice = getDerivedUnitPrice(s);

    sowGroups[sowNameKey].services[serviceName].history.push({
      isCO,
      total,
      prev,
      change,
      amount,
      unitPrice,
      date: dateStr || s.effectiveDate || s.dafStartDate || 'N/A'
    });
  };

  // 1. SOW services
  const baseServices = billingSource === 'Customer' ? result.customerServices : result.vendorServices;
  baseServices?.forEach(s => {
    if (checkActive(s, monthStart, monthEnd, result, undefined, isForecast)) {
      addToGroup(s, s.sowName || 'SOW', false);
    }
  });

  // 2. Change Order services (signed only)
  result.changeOrders?.forEach(co => {
    const isVendorCO = co.facing?.toLowerCase() === 'vendor';
    const matchesSource = billingSource === 'Vendor' ? isVendorCO : !isVendorCO;
    
    if (matchesSource && co.isSigned) {
      if (co.services && co.services.length > 0) {
        co.services.forEach(s => {
          if (checkActive(s, monthStart, monthEnd, result, co.date, isForecast)) {
            addToGroup(s, co.associatedSOW || s.sowName || 'SOW', true, co.date);
          }
        });
      } else {
        const amount = parseAmount(co.amount);
        if (amount !== 0) {
          const dummyService = {
            serviceName: `Change Order: ${co.changeOrderNumber || co.changeDescription}`,
            amount: co.amount,
            serviceType: co.amount && co.amount.toLowerCase()?.includes('month') ? 'MS' : 'PS',
            totalQuantity: '1'
          } as ServiceDetail;
          if (checkActive(dummyService, monthStart, monthEnd, result, co.date, isForecast)) {
            addToGroup(dummyService, co.associatedSOW || 'SOW', true, co.date);
          }
        }
      }
    }
  });

  let totalRevenue = 0;

  Object.values(sowGroups).forEach(sow => {
    Object.values(sow.services).forEach(svc => {
      // Sort history by date
      svc.history.sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        if (!isNaN(dateA) && !isNaN(dateB)) return dateA - dateB;
        if (!a.isCO && b.isCO) return -1;
        if (a.isCO && !b.isCO) return 1;
        return 0;
      });

      let finalQty = 0;
      let totalPrice = 0;
      let unitPrice = 0;

      svc.history.forEach(h => {
        if (!h.isCO) {
          finalQty = h.total || 0;
          unitPrice = h.unitPrice;
          totalPrice = unitPrice > 0 ? (finalQty * unitPrice) : h.amount;
          if (unitPrice === 0 && finalQty > 0) unitPrice = totalPrice / finalQty;
        } else {
          let qtyDelta = 0;
          let isNewTotal = false;

          if (h.change !== null) {
            qtyDelta = h.change;
          } else if (h.total !== null && h.prev !== null) {
            qtyDelta = h.total - h.prev;
            isNewTotal = true;
          } else if (h.total !== null) {
            qtyDelta = h.total - finalQty;
            isNewTotal = true;
          }
          
          finalQty += qtyDelta;

          if (h.unitPrice > 0) {
            unitPrice = h.unitPrice;
          }

          if (unitPrice > 0) {
            totalPrice = finalQty * unitPrice;
          } else if (isNewTotal) {
            totalPrice = h.amount;
            unitPrice = finalQty > 0 ? totalPrice / finalQty : 0;
          } else {
            totalPrice += h.amount;
            if (qtyDelta !== 0 && h.amount !== 0) {
              unitPrice = Math.abs(h.amount / qtyDelta);
            } else {
              unitPrice = finalQty > 0 ? totalPrice / finalQty : 0;
            }
          }
        }
      });

      if (finalQty > 0) {
        totalRevenue += totalPrice;
      }
    });
  });

  return totalRevenue;
};

export const hasCancellationCO = (result: ContractAnalysisResult, sowName: string): boolean => {
  return result.changeOrders?.some(co => 
    co.associatedSOW === sowName && 
    (co.changeDescription?.toLowerCase()?.includes('cancellation') || 
     co.changeDescription?.toLowerCase()?.includes('terminate') ||
     co.changeOrderNumber?.toLowerCase()?.includes('cancellation') ||
     co.changeOrderNumber?.toLowerCase()?.includes('terminate'))
  ) || false;
};

export const getCancellationDate = (result: ContractAnalysisResult, sowName: string): Date | null => {
  const cancellationCO = result.changeOrders?.find(co => 
    co.associatedSOW === sowName && 
    (co.changeDescription?.toLowerCase()?.includes('cancellation') || 
     co.changeDescription?.toLowerCase()?.includes('terminate') ||
     co.changeOrderNumber?.toLowerCase()?.includes('cancellation') ||
     co.changeOrderNumber?.toLowerCase()?.includes('terminate'))
  );
  
  if (cancellationCO && cancellationCO.date) {
    const date = new Date(cancellationCO.date);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  return null;
};
