import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const normalizeSow = (str: string) => {
  if (!str) return 'sow';
  return str.toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/sow|co|change order|contract|signed|active|final|draft|v\d+|version|rev\d+|revision/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim() || 'sow';
};

export const cleanSowName = (name: string, customerName?: string) => {
  let rawName = (name || 'Unknown SOW').trim();
  const originalName = rawName;
  
  // Try removing everything before the first "/"
  if (rawName.includes('/')) {
    rawName = rawName.substring(rawName.indexOf('/') + 1).trim();
  }
  
  if (customerName && customerName.trim().length > 0) {
    const cust = customerName.trim();
    const custLower = cust.toLowerCase();
    
    // Case 1: "Customer Name / SOW Name" or "Customer Name - SOW Name"
    // We look for separators and see if the part before matches customer name
    const separators = ['/', '-', ':'];
    for (const sep of separators) {
      if (rawName.includes(sep)) {
        const parts = rawName.split(sep);
        const firstPart = parts[0].trim();
        const firstPartLower = firstPart.toLowerCase();
        
        if (firstPartLower === custLower || firstPartLower.includes(custLower) || custLower.includes(firstPartLower)) {
          rawName = parts.slice(1).join(sep).trim();
          break; 
        }
        
        // Also check if the last part is the customer name
        const lastPart = parts[parts.length - 1].trim();
        const lastPartLower = lastPart.toLowerCase();
        if (lastPartLower === custLower || lastPartLower.includes(custLower) || custLower.includes(lastPartLower)) {
          rawName = parts.slice(0, -1).join(sep).trim();
          break;
        }
      }
    }
    
    // Case 2: Direct prefix/suffix without clear separator
    const rawLower = rawName.toLowerCase();
    if (rawLower.startsWith(custLower)) {
      rawName = rawName.substring(custLower.length).trim();
    } else if (rawLower.endsWith(custLower)) {
      rawName = rawName.substring(0, rawName.length - custLower.length).trim();
    }
  }

  // Final cleanup of separators and CO/SOWCO suffixes
  rawName = rawName.replace(/^[\s/-]+/, '').replace(/[\s/-]+$/, '').trim();
  
  // Strip CO, SOWCO, Change Order suffixes
  const coSuffixes = [
    /\s+SOWCO$/i,
    /\s+CO\s*\d*$/i,
    /\s+CHANGE\s*ORDER\s*\d*$/i,
    /\s+CO$/i
  ];
  
  for (const suffix of coSuffixes) {
    if (suffix.test(rawName)) {
      rawName = rawName.replace(suffix, '').trim();
    }
  }
  
  // Clean separators again after suffix removal
  rawName = rawName.replace(/^[\s/-]+/, '').replace(/[\s/-]+$/, '').trim();
  
  // If we ended up with nothing, revert to original (or a fallback)
  const result = rawName || originalName || 'Unknown SOW';
  return result;
};

export const cleanServiceName = (name: string, customerName?: string) => {
  let rawName = (name || 'Unknown Service').trim();
  const originalName = rawName;
  
  if (customerName && customerName.trim().length > 0) {
    const cust = customerName.trim();
    const custLower = cust.toLowerCase();
    
    // Case 1: "Customer Name - Service Name" or "Customer Name: Service Name" etc.
    // Use regex to handle various separators with optional whitespace
    const separatorRegex = /\s*[:\-\u2013\u2014\/]\s*/;
    const parts = rawName.split(separatorRegex);
    
    if (parts.length > 1) {
      const firstPart = parts[0].trim();
      const firstPartLower = firstPart.toLowerCase();
      
      // Check if first part is the customer name or contains it
      if (firstPartLower === custLower || 
          (firstPartLower.length > 3 && custLower.includes(firstPartLower)) || 
          (custLower.length > 3 && firstPartLower.includes(custLower))) {
        rawName = parts.slice(1).join(' - ').trim();
      }
    }
    
    // Case 2: Direct prefix without separator
    const rawLower = rawName.toLowerCase();
    if (rawLower.startsWith(custLower)) {
      rawName = rawName.substring(custLower.length).trim();
      // Clean leading separators
      rawName = rawName.replace(/^[\s/:\-\u2013\u2014]+/, '').trim();
    }
  }

  // Final cleanup of any leading/trailing junk
  rawName = rawName.replace(/^[\s/:\-\u2013\u2014]+/, '').replace(/[\s/:\-\u2013\u2014]+$/, '').trim();

  return rawName || originalName;
};

export const fuzzyMatch = (s1: string, s2: string, threshold: number = 0.7): boolean => {
  if (!s1 || !s2) return false;
  const n1 = s1.toLowerCase().replace(/[^\w\s]/g, '');
  const n2 = s2.toLowerCase().replace(/[^\w\s]/g, '');
  
  if (n1.includes(n2) || n2.includes(n1)) return true;
  
  const words1 = n1.split(/\s+/).filter(w => w.length > 2);
  const words2 = n2.split(/\s+/).filter(w => w.length > 2);
  
  if (words1.length === 0 || words2.length === 0) return false;
  
  const intersection = words1.filter(w => words2.includes(w));
  const similarity = intersection.length / Math.max(words1.length, words2.length);
  
  return similarity >= threshold;
};

// Helper to parse amount from string
export const parseAmount = (amountStr?: string): number => {
  if (!amountStr) return 0;
  
  // Remove spaces used as thousands separators (e.g. "57 600" -> "57600", "1 234 567" -> "1234567")
  let sanitizedStr = amountStr;
  let prevStr;
  do {
    prevStr = sanitizedStr;
    sanitizedStr = sanitizedStr.replace(/(\d)[\s\xA0]+(\d{3})(?=[^\d]|$)/g, '$1$2');
  } while (sanitizedStr !== prevStr);
  
  // Check for negative indicators: leading minus, minus after $, or parentheses
  const isNegative = sanitizedStr.includes('-') || (sanitizedStr.includes('(') && sanitizedStr.includes(')'));
  
  // Clean the string: remove everything except digits, dots, and commas
  // But wait, we need to be careful with dots and commas.
  // If there's both a dot and a comma, the one that appears last is likely the decimal separator.
  // If there's only one, and it's followed by exactly 3 digits, it's likely a thousands separator.
  // If it's followed by 2 digits, it's likely a decimal separator.
  
  const clean = (str: string): number => {
    // If there are multiple dots/commas, or if it's a common format
    // Let's use a simpler approach: 
    // 1. If there's a comma followed by 3 digits at the end or before another separator, it's a thousands separator.
    // 2. If there's a dot followed by 3 digits at the end or before another separator, it's a thousands separator.
    
    // Actually, let's just find all numbers and handle the most common formats.
    let s = str.trim();
    
    // If it has both , and .
    if (s.includes(',') && s.includes('.')) {
      const commaIdx = s.lastIndexOf(',');
      const dotIdx = s.lastIndexOf('.');
      if (commaIdx > dotIdx) {
        // Comma is decimal separator (European style: 1.234,56)
        s = s.replace(/\./g, '').replace(',', '.');
      } else {
        // Dot is decimal separator (US style: 1,234.56)
        s = s.replace(/,/g, '');
      }
    } else if (s.includes(',')) {
      // Only comma. Is it 1,234 or 12,34?
      const parts = s.split(',');
      if (parts[parts.length - 1].length === 3) {
        // Likely thousands separator: 1,234
        s = s.replace(/,/g, '');
      } else {
        // Likely decimal separator: 12,34
        s = s.replace(',', '.');
      }
    } else if (s.includes('.')) {
      // Only dot. Is it 1.234 or 12.34?
      const parts = s.split('.');
      if (parts[parts.length - 1].length === 3 && parts.length > 1 && parts[0].length <= 3) {
        // Likely thousands separator: 1.234 (European style without comma)
        // But wait, this is risky. In US, 1.234 is a decimal.
        // Usually, if there's only one dot, it's a decimal in US/Canada.
        // Let's assume dot is decimal unless it's clearly a thousands separator.
        // In the context of unit prices, 1.234 is more likely to be a decimal than 1234.
        s = s; // Keep as is
      }
    }
    
    const val = parseFloat(s.replace(/[^\d.-]/g, ''));
    return isNaN(val) ? 0 : val;
  };

  // Find all numbers preceded by $
  const dollarMatches = [...sanitizedStr.matchAll(/\$[\s]*([\d,.]+)/g)];
  if (dollarMatches.length > 0) {
    const values = dollarMatches.map(m => clean(m[1])).filter(v => !isNaN(v));
    // For unit prices, we usually want the first one if there are multiple (e.g. "$12.34 (Total: $1234)")
    // But for totals, we want the max. This is tricky.
    // Let's return the first one if it's a small string, otherwise max?
    // Actually, let's just return the first one, it's more likely to be the primary value.
    return isNegative ? -values[0] : values[0];
  }
  
  // Fallback to finding all numbers
  const matches = [...sanitizedStr.matchAll(/[\d,.]+/g)];
  if (matches.length > 0) {
    const rawMatches = matches.map(m => m[0]);
    const values = rawMatches.map(m => clean(m));
    
    // Filter out NaN and keep original indices to track raw strings
    const validValues: {val: number, raw: string}[] = [];
    values.forEach((v, i) => {
      if (!isNaN(v)) validValues.push({val: v, raw: rawMatches[i]});
    });

    if (validValues.length > 0) {
      if (validValues.length > 1) {
        // Try to find a number with a decimal, as unit prices usually have decimals (e.g. 2.50)
        // We prioritize decimals over whole numbers to avoid confusing quantity or "365" names as prices.
        const withDecimals = validValues.filter(v => v.raw.includes('.'));
        if (withDecimals.length > 0) {
          return isNegative ? -withDecimals[0].val : withDecimals[0].val;
        }
        
        // Skip common identifiers
        const contentVal = validValues.find(v => v.val !== 365 && v.val !== 24 && v.val !== 7);
        if (contentVal) {
           return isNegative ? -contentVal.val : contentVal.val;
        }
        
        const picked = validValues[0].val;
        return isNegative ? -picked : picked;
      }
      return isNegative ? -validValues[0].val : validValues[0].val;
    }
  }
  
  return 0;
};

export const formatCurrency = (val: number) => 
  new Intl.NumberFormat('en-US', { 
    style: 'currency', 
    currency: 'USD'
  }).format(val);

export const formatAmountString = (amountStr?: string, serviceType?: string) => {
  if (!amountStr || amountStr === 'N/A') return 'N/A';
  const num = parseAmount(amountStr);
  if (num === 0 && !amountStr.includes('0')) return amountStr;
  
  const formatted = formatCurrency(num);
  const lower = amountStr.toLowerCase();
  
  const isMS = serviceType === 'MS' || serviceType?.toLowerCase().includes('managed');
  
  if (lower.includes('month') || isMS) return `${formatted}/month`;
  if (lower.includes('year')) return `${formatted}/year`;
  if (lower.includes('one-time') || lower.includes('one time') || lower.includes('nrc')) return `${formatted} (One-time)`;
  
  // Default to one-time if not specified and not MS
  return `${formatted} (One-time)`;
};

export const isUserBased = (serviceName: string, description: string, serviceType?: string) => {
  const isPSTS = serviceType === 'PS' || serviceType === 'TS' || 
                 serviceType?.toLowerCase().includes('professional') || 
                 serviceType?.toLowerCase().includes('transition');
  if (isPSTS) return false;

  const userBasedServices = [
    'secure it xdr/edr',
    'secure it mail',
    'support it',
    'protect it',
    'monitor it',
    'tenant complete'
  ];
  
  const name = serviceName.toLowerCase();
  return userBasedServices.some(s => name.includes(s));
};

export const isInfrastructureBased = (serviceName: string, description: string, serviceType?: string) => {
  const isPSTS = serviceType === 'PS' || serviceType === 'TS' || 
                 serviceType?.toLowerCase().includes('professional') || 
                 serviceType?.toLowerCase().includes('transition');
  if (isPSTS) return false;

  return !isUserBased(serviceName, description, serviceType);
};
