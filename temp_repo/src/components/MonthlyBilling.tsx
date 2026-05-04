import React, { useMemo, useState } from 'react';
import { ContractAnalysisResult, ServiceDetail } from '../lib/gemini';
import { DollarSign, LayoutGrid, Hash, TrendingUp, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, RotateCcw, Calendar, FileText, Printer, X, AlertCircle, Edit2, Check, UploadCloud, FileCheck, Clock, ChevronDown, ChevronUp, Info, ShieldCheck, Activity, RefreshCw } from 'lucide-react';
import { cn, parseAmount, cleanServiceName, isUserBased, isInfrastructureBased, normalizeSow } from '../lib/utils';
import { format, addMonths, setYear, getYear, startOfMonth, endOfMonth, isAfter } from 'date-fns';
import { parseDate, hasCancellationCO, getCancellationDate, checkActive as importedCheckActive, getNumOrNull, calculateBilledAmount, getDerivedUnitPrice, getBilledQuantity } from '../lib/contractUtils';
import { getMonthlyActuals, saveMonthlyActuals, MonthlyActuals, saveAuditLog, AuditLog } from '../lib/db';
import { toPng } from 'html-to-image';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import { UserRole } from '../App';
import { Skeleton, SkeletonTable } from './ui/Skeleton';

interface MonthlyBillingProps {
  result: ContractAnalysisResult;
  showVendorFinancials?: boolean;
  onUpdateResult?: (updatedResult: ContractAnalysisResult) => void;
  customerId?: string;
  userRole?: UserRole;
}

const normalizeService = (str: string) => {
  return str.toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/managed|service|essentials|advanced|premium|standard|basic|professional|transition/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
};

export const MonthlyBilling: React.FC<MonthlyBillingProps> = ({ result, showVendorFinancials = true, onUpdateResult, customerId, userRole = 'ADMIN' }) => {
  const [currentDate, setCurrentDate] = useState(startOfMonth(new Date()));
  const [billingSource, setBillingSource] = useState<'Customer' | 'Vendor'>('Customer');
  const [showInvoice, setShowInvoice] = useState(false);
  const [isEditingAliases, setIsEditingAliases] = useState(false);
  const [tempCustomerAlias, setTempCustomerAlias] = useState(result.customerAlias || 'Customer');
  const [tempVendorAlias, setTempVendorAlias] = useState(result.vendorAlias || 'Vendor');
  const [actuals, setActuals] = useState<Record<string, number>>({});
  const [overrides, setOverrides] = useState<Record<string, { qty: number, price: number }>>({});
  const [isUploadingActuals, setIsUploadingActuals] = useState(false);
  const [editingService, setEditingService] = useState<string | null>(null);
  const [tempQty, setTempQty] = useState<number>(0);
  const [tempPrice, setTempPrice] = useState<number>(0);
  const [uploadPreview, setUploadPreview] = useState<Record<string, number> | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  React.useEffect(() => {
    const loadActuals = async () => {
      if (!customerId) return;
      const monthStr = format(currentDate, 'yyyy-MM');
      const data = await getMonthlyActuals(customerId, monthStr);
      if (data) {
        setActuals(data.actuals);
      } else {
        setActuals({});
      }
    };
    loadActuals();
  }, [customerId, currentDate]);

  const handleSaveOverride = async (serviceName: string, qty: number, price: number) => {
    setOverrides(prev => ({ ...prev, [serviceName]: { qty, price } }));
    setEditingService(null);

    // Persist to MonthlyActuals in IndexedDB
    if (customerId) {
      const monthStr = format(currentDate, 'yyyy-MM');
      const currentActuals = await getMonthlyActuals(customerId, monthStr);
      const updatedActuals = {
        ...(currentActuals?.actuals || {}),
        [serviceName]: qty
      };
      
      await saveMonthlyActuals({
        id: `${customerId}_${monthStr}`,
        customerId,
        month: monthStr,
        actuals: updatedActuals
      });
      
      // Create Audit Log
      await saveAuditLog({
        id: crypto.randomUUID(),
        customerId,
        timestamp: Date.now(),
        userEmail: 'kushagra.vijayvargiya@telus.com', // Mock user for now
        action: 'MANUAL_OVERRIDE',
        details: `Updated ${serviceName}: Qty ${qty}, Price ${price}`,
        month: monthStr
      });

      // Also update actuals state to keep it in sync
      setActuals(updatedActuals);
    }

    // Only update the main result (overview) if it's NOT a user-based service
    // User-based services should keep their "overview qty" from the contract/COs
    const isUserSvc = isUserBased(serviceName, ''); 
    
    if (onUpdateResult && !isUserSvc) {
      const updatedResult = JSON.parse(JSON.stringify(result)) as ContractAnalysisResult;
      
      const updateService = (s: ServiceDetail) => {
        if (s.serviceName === serviceName) {
          s.onboardedQuantity = String(qty);
          s.unitPrice = String(price);
          // Update amount to reflect the new total
          s.amount = String(qty * price);
        }
      };

      updatedResult.customerServices?.forEach(updateService);
      updatedResult.vendorServices?.forEach(updateService);
      updatedResult.changeOrders?.forEach(co => co.services?.forEach(updateService));

      onUpdateResult(updatedResult);
    }
  };

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleUploadActuals = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !customerId) return;

    setIsUploadingActuals(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const json = XLSX.utils.sheet_to_json(worksheet) as any[];

          const newActuals: Record<string, number> = {};
          
          // Find rows matching current customer
          const customerNameLower = result.customerName.toLowerCase();
          
          json.forEach(row => {
            // Try to find customer column
            const customerCol = Object.keys(row).find(k => k.toLowerCase().includes('customer') || k.toLowerCase().includes('client'));
            const serviceCol = Object.keys(row).find(k => k.toLowerCase().includes('service') || k.toLowerCase().includes('product') || k.toLowerCase().includes('item'));
            const qtyCol = Object.keys(row).find(k => k.toLowerCase().includes('qty') || k.toLowerCase().includes('quantity') || k.toLowerCase().includes('actual'));

            if (customerCol && serviceCol && qtyCol) {
              const rowCustomer = String(row[customerCol]).toLowerCase();
              // Fuzzy match customer name
              if (rowCustomer.includes(customerNameLower) || customerNameLower.includes(rowCustomer)) {
                const rawServiceName = String(row[serviceCol]).trim();
                const serviceName = cleanServiceName(rawServiceName, result.customerName);
                const qty = parseInt(String(row[qtyCol]).replace(/,/g, ''), 10);
                if (!isNaN(qty)) {
                  newActuals[serviceName] = qty;
                }
              }
            }
          });

          if (Object.keys(newActuals).length > 0) {
            setUploadPreview(newActuals);
          } else {
            alert('No matching actuals found for this customer in the uploaded file. Please ensure columns for Customer, Service, and Quantity exist.');
          }
        } catch (err) {
          console.error('Error parsing file:', err);
          alert('Error parsing the file. Please upload a valid Excel or CSV file.');
        } finally {
          setIsUploadingActuals(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (err) {
      console.error('Error reading file:', err);
      setIsUploadingActuals(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const confirmUpload = async () => {
    if (!uploadPreview || !customerId) return;
    
    const monthStr = format(currentDate, 'yyyy-MM');
    const actualsRecord: MonthlyActuals = {
      id: `${customerId}_${monthStr}`,
      customerId,
      month: monthStr,
      actuals: uploadPreview
    };

    await saveMonthlyActuals(actualsRecord);
    
    // Create Audit Log
    await saveAuditLog({
      id: crypto.randomUUID(),
      customerId,
      timestamp: Date.now(),
      userEmail: 'kushagra.vijayvargiya@telus.com',
      action: 'BULK_UPLOAD_ACTUALS',
      details: `Uploaded actuals for ${Object.keys(uploadPreview).length} services`,
      month: monthStr
    });

    setActuals(uploadPreview);
    setUploadPreview(null);
  };

  const saveAliases = () => {
    if (onUpdateResult) {
      onUpdateResult({
        ...result,
        customerAlias: tempCustomerAlias,
        vendorAlias: tempVendorAlias
      });
    }
    setIsEditingAliases(false);
  };

  const handleDownloadPDF = async () => {
    const element = document.getElementById('invoice-printable-area');
    if (!element) return;

    try {
      const width = element.scrollWidth;
      const height = element.scrollHeight;

      const dataUrl = await toPng(element, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        width: width,
        height: height,
        style: {
          width: `${width}px`,
          height: `${height}px`,
        }
      });
      
      const pdf = new jsPDF({
        orientation: width > height ? 'landscape' : 'portrait',
        unit: 'px',
        format: [width, height]
      });

      pdf.addImage(dataUrl, 'PNG', 0, 0, width, height);
      pdf.save(`Proforma_Invoice_${result.customerName || 'Customer'}_${format(currentDate, 'MMM_yyyy')}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
    }
  };

  const handleDownloadExcel = () => {
    const data: any[] = [];
    
    // Header
    data.push(['PROFORMA INVOICE']);
    data.push(['Invoice Date:', format(new Date(), 'MMMM dd, yyyy')]);
    data.push(['Billing Period:', format(currentDate, 'MMMM yyyy')]);
    data.push([]);
    data.push(['Bill To:', result.customerName || 'Customer']);
    data.push([]);
    
    // Table Headers
    data.push(['Description', 'Qty', 'Unit Price', 'Total']);
    
    // Table Data
    sowBillingData.forEach(sowGroup => {
      data.push([sowGroup.sowName, '', '', '']); // SOW Header
      sowGroup.services.forEach(item => {
        data.push([
          item.serviceName + (!item.isRecurring ? ' (One-Time Charge)' : ''),
          item.finalQty > 0 ? item.finalQty : '-',
          item.totalPrice !== 0 ? item.unitPrice : '-',
          item.totalPrice !== 0 ? item.totalPrice : '-'
        ]);
      });
    });
    
    data.push([]);
    data.push(['', '', 'Subtotal', grandTotal]);
    data.push(['', '', 'Tax (0%)', 0]);
    data.push(['', '', 'Total Due', grandTotal]);

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Invoice');
    
    XLSX.writeFile(wb, `Proforma_Invoice_${result.customerName || 'Customer'}_${format(currentDate, 'MMM_yyyy')}.xlsx`);
  };

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-US', { 
    style: 'currency', 
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(val);

  const sowBillingData = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);

    const checkActive = (s: ServiceDetail, fallbackDate?: string) => {
      return importedCheckActive(s, monthStart, monthEnd, result, fallbackDate);
    };

    const sowGroups: Record<string, {
      sowName: string;
      services: Record<string, {
        serviceName: string;
        serviceType?: string;
        description?: string;
        isRecurring: boolean;
        isExpired: boolean;
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

    const addToGroup = (s: ServiceDetail, sourceSowName: string, isCO: boolean) => {
      // Strip customer name from SOW name if present
      let rawSowName = (sourceSowName || 'SOW').trim();
      if (result.customerName && rawSowName.toLowerCase().startsWith(result.customerName.toLowerCase())) {
        rawSowName = rawSowName.substring(result.customerName.length).replace(/^[\s/-]+/, '').trim();
      }

      const sowNameKey = normalizeSow(rawSowName) || 'sow';
      const rawServiceName = (s.serviceName || 'Unknown Service').trim();
      const cleanedServiceName = cleanServiceName(rawServiceName, result.customerName);

      if (!sowGroups[sowNameKey]) {
        sowGroups[sowNameKey] = { sowName: rawSowName, services: {} };
      }

      const existingKeys = Object.keys(sowGroups[sowNameKey].services);
      let serviceName = cleanedServiceName;
      
      const normalizedNew = cleanedServiceName.toLowerCase().trim();
      const baseNew = normalizeService(cleanedServiceName);
      
      const exactMatch = existingKeys.find(k => k.toLowerCase().trim() === normalizedNew);
      
      if (exactMatch) {
        serviceName = exactMatch;
      } else if (baseNew.length >= 2) {
        const baseMatch = existingKeys.find(k => {
          const baseExisting = normalizeService(k);
          return baseExisting === baseNew || (baseExisting.length > 3 && baseNew.length > 3 && (baseExisting.includes(baseNew) || baseNew.includes(baseExisting)));
        });
        if (baseMatch) {
          serviceName = baseMatch;
        }
      }

      if (!sowGroups[sowNameKey].services[serviceName]) {
        sowGroups[sowNameKey].services[serviceName] = { 
          serviceName, 
          serviceType: s.serviceType,
          description: s.description,
          isRecurring: s.serviceType === 'MS' || 
                       (s.serviceType && s.serviceType.toLowerCase().includes('managed')) || 
                       (s.amount && (s.amount.toLowerCase().includes('month') || s.amount.toLowerCase().includes('year'))) ? true : false,
          isExpired: false,
          history: []
        };
      }

      const endStr = (s.potentialEndDate && s.potentialEndDate !== 'N/A') ? s.potentialEndDate : s.expiryDate;
      const end = parseDate(endStr);
      if (end && isAfter(monthStart, end)) {
        sowGroups[sowNameKey].services[serviceName].isExpired = true;
      }

      const total = getBilledQuantity(s);
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
        date: s.effectiveDate || s.dafStartDate || 'N/A'
      });
    };

    // 1. Initial SOW services
    const baseServices = billingSource === 'Customer' ? result.customerServices : result.vendorServices;
    baseServices?.forEach(s => {
      if (checkActive(s)) {
        addToGroup(s, s.sowName || 'SOW', false);
      }
    });

    // 2. Change Order services (signed only)
    result.changeOrders?.forEach(co => {
      const isVendorCO = co.facing?.toLowerCase() === 'vendor';
      const matchesSource = billingSource === 'Vendor' ? isVendorCO : !isVendorCO;
      
      if (matchesSource && co.isSigned) {
        const coDate = co.date;
        
        // If the CO has specific services listed, add them
        if (co.services && co.services.length > 0) {
          co.services.forEach(s => {
            if (checkActive(s, coDate)) {
              // Override date with CO date if service date is missing
              const svcWithDate = { ...s, effectiveDate: s.effectiveDate || coDate };
              addToGroup(svcWithDate, co.associatedSOW || s.sowName || 'SOW', true);
            }
          });
        } else {
          // If no specific services, add the CO itself as a service line item
          const amount = parseAmount(co.amount);
          if (amount !== 0) {
            const dummyService = {
              serviceName: `Change Order: ${co.changeOrderNumber || co.changeDescription}`,
              amount: co.amount,
              serviceType: co.amount && co.amount.toLowerCase().includes('month') ? 'MS' : 'PS',
              totalQuantity: '1', // Assume 1 unit for a generic CO charge
              effectiveDate: coDate,
              requiresDAF: co.requiresDAF,
              hasDAF: co.hasDAF
            } as ServiceDetail;
            if (checkActive(dummyService, coDate)) {
              addToGroup(dummyService, co.associatedSOW || 'SOW', true);
            }
          }
        }
      }
    });

    return Object.values(sowGroups).map(sow => ({
      sowName: sow.sowName,
      services: Object.values(sow.services).map(svc => {
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

            if (qtyDelta !== 0 && unitPrice > 0) {
              totalPrice = finalQty * unitPrice;
            } else if (isNewTotal && h.amount > 0) {
              totalPrice = h.amount;
            } else {
              totalPrice += h.amount;
            }

            if (unitPrice === 0) {
              if (!isNewTotal && qtyDelta !== 0 && h.amount !== 0) {
                unitPrice = Math.abs(h.amount / qtyDelta);
              } else if (finalQty > 0) {
                unitPrice = totalPrice / finalQty;
              }
            }
          }
        });

        // Ensure we explicitly use the unitPrice discovered
        if (unitPrice === 0) {
          unitPrice = finalQty > 0 ? totalPrice / finalQty : totalPrice;
        }
        
        const contractedQty = finalQty;
        const contractedPrice = totalPrice;

        let isActual = false;
        // Override with actuals if available
        const actualQty = actuals[svc.serviceName];
        if (actualQty !== undefined) {
          finalQty = actualQty;
          totalPrice = finalQty * unitPrice;
          isActual = true;
        }

        // Override with manual overrides if available
        const override = overrides[svc.serviceName];
        if (override) {
          finalQty = override.qty;
          unitPrice = override.price;
          totalPrice = finalQty * unitPrice;
          isActual = true;
        }

        return {
          ...svc,
          finalQty,
          totalPrice,
          unitPrice,
          contractedQty,
          isActual
        };
      }).filter(svc => svc.finalQty > 0)
    })).filter(sow => sow.services.length > 0);
  }, [result, currentDate, billingSource, actuals, overrides]);

  const grandTotal = sowBillingData.reduce((acc, sow) => acc + sow.services.reduce((sum, svc) => sum + svc.totalPrice, 0), 0);

  return (
    <div className="telus-card overflow-hidden animate-in fade-in zoom-in duration-500 bg-bg-secondary border-border-primary">
      <div className="p-5 sm:p-6 border-b border-border-primary bg-bg-secondary flex flex-wrap items-center justify-between gap-4">
        <div className="flex-1 min-w-[300px]">
          <h3 className="text-2xl font-black text-telus-gray flex items-center tracking-tight whitespace-nowrap">
            <div className="p-2.5 bg-telus-purple/10 rounded-xl mr-3 border border-border-primary shadow-sm shrink-0">
              <DollarSign className="w-5 h-5 text-telus-purple" />
            </div>
            SOW-wise Billing
          </h3>
          <p className="text-xs text-text-secondary mt-1.5 font-medium ml-12 max-w-2xl">Detailed billing breakdown by Statement of Work, including all change orders.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 ml-14 sm:ml-0">
          {/* Source Toggle */}
          {showVendorFinancials && (
            <div className="flex items-center bg-bg-primary p-1 rounded-xl border border-border-primary group relative">
              {isEditingAliases ? (
                <div className="flex items-center space-x-2 px-2">
                  <input 
                    value={tempCustomerAlias} 
                    onChange={e => setTempCustomerAlias(e.target.value)}
                    className="w-24 px-2 py-1 text-xs rounded border border-border-primary bg-bg-secondary text-telus-gray focus:outline-none focus:border-telus-purple"
                    placeholder="Customer"
                  />
                  <input 
                    value={tempVendorAlias} 
                    onChange={e => setTempVendorAlias(e.target.value)}
                    className="w-24 px-2 py-1 text-xs rounded border border-border-primary bg-bg-secondary text-telus-gray focus:outline-none focus:border-telus-purple"
                    placeholder="Vendor"
                  />
                  <button onClick={saveAliases} className="p-1 hover:bg-bg-secondary rounded text-telus-green"><Check className="w-3.5 h-3.5"/></button>
                  <button onClick={() => setIsEditingAliases(false)} className="p-1 hover:bg-bg-secondary rounded text-rose-500"><X className="w-3.5 h-3.5"/></button>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => setBillingSource('Customer')}
                    className={cn("px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all", billingSource === 'Customer' ? "bg-bg-secondary text-telus-purple shadow-sm" : "text-text-secondary/60 hover:text-telus-purple")}
                  >
                    {result.customerAlias || 'Customer'}
                  </button>
                  <button
                    onClick={() => setBillingSource('Vendor')}
                    className={cn("px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all", billingSource === 'Vendor' ? "bg-bg-secondary text-telus-purple shadow-sm" : "text-text-secondary/60 hover:text-telus-purple")}
                  >
                    {result.vendorAlias || 'Vendor'}
                  </button>
                  <button 
                    onClick={() => setIsEditingAliases(true)}
                    className="absolute -right-8 opacity-0 group-hover:opacity-100 p-1.5 text-text-secondary/60 hover:text-telus-purple transition-all"
                    title="Edit Names"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          )}

          {/* Date Selector */}
          <div className="flex items-center space-x-3 bg-bg-primary p-2 telus-card-inner border border-border-primary rounded-xl">
            <div className="flex items-center border-r border-border-primary pr-2">
              <button 
                onClick={() => setCurrentDate(setYear(currentDate, getYear(currentDate) - 1))}
                className="p-2 hover:bg-bg-secondary rounded-xl transition-colors text-text-secondary/60 hover:text-telus-purple"
                title="Previous Year"
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setCurrentDate(addMonths(currentDate, -1))}
                className="p-2 hover:bg-bg-secondary rounded-xl transition-colors text-text-secondary/60 hover:text-telus-purple"
                title="Previous Month"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
            
            <div className="flex flex-col items-center min-w-[120px]">
              <span className="font-black text-telus-gray tracking-tight text-base leading-none">
                {format(currentDate, 'MMMM')}
              </span>
              <span className="text-[10px] font-black text-telus-purple uppercase tracking-widest mt-1">
                {format(currentDate, 'yyyy')}
              </span>
            </div>

            <div className="flex items-center border-l border-border-primary pl-2">
              <button 
                onClick={() => setCurrentDate(addMonths(currentDate, 1))}
                className="p-2 hover:bg-bg-secondary rounded-xl transition-colors text-text-secondary/60 hover:text-telus-purple"
                title="Next Month"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setCurrentDate(setYear(currentDate, getYear(currentDate) + 1))}
                className="p-2 hover:bg-bg-secondary rounded-xl transition-colors text-text-secondary/60 hover:text-telus-purple"
                title="Next Year"
              >
                <ChevronsRight className="w-4 h-4" />
              </button>
            </div>
            
            <div className="pl-2 border-l border-border-primary">
              <button 
                onClick={() => setCurrentDate(startOfMonth(new Date()))}
                className="p-2 bg-bg-secondary hover:bg-telus-purple/10 rounded-xl transition-colors text-text-secondary/80 hover:text-telus-purple"
                title="Reset to Current Month"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <input 
              type="file" 
              accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" 
              className="hidden" 
              ref={fileInputRef}
              onChange={handleUploadActuals}
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingActuals || userRole === 'VIEWER'}
              className={cn(
                "telus-button-secondary py-2.5 px-4 rounded-full flex items-center space-x-2 bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200 disabled:opacity-50 shadow-sm",
                userRole === 'VIEWER' && "cursor-not-allowed opacity-50"
              )}
              title={userRole === 'VIEWER' ? "Insufficient permissions to upload" : "Upload Monthly Actuals"}
            >
              {isUploadingActuals ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
              <span className="hidden sm:inline">{isUploadingActuals ? 'Uploading...' : 'Upload Actuals'}</span>
            </button>
            <button 
              onClick={() => setShowInvoice(true)}
              className="telus-button-primary py-2.5 px-6 rounded-full flex items-center space-x-2 shadow-md"
              title="Generate Proforma Invoice"
            >
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">Generate Invoice</span>
            </button>
          </div>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-bg-primary border-b border-border-primary">
              <th className="px-4 py-2 text-[10px] font-black text-text-secondary uppercase tracking-widest">Service</th>
              <th className="px-4 py-2 text-[10px] font-black text-text-secondary uppercase tracking-widest text-center">Current Qty</th>
              <th className="px-4 py-2 text-[10px] font-black text-text-secondary uppercase tracking-widest text-right">Unit Price</th>
              <th className="px-4 py-2 text-[10px] font-black text-text-secondary uppercase tracking-widest text-right">Total Price</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-primary">
            {sowBillingData.map((sowGroup, sowGroupIdx) => (
              <React.Fragment key={sowGroupIdx}>
                {/* SOW Header Row */}
                <tr className="bg-bg-primary border-y border-border-primary">
                  <td colSpan={4} className="px-4 py-1.5 text-[10px] font-black text-telus-purple uppercase tracking-widest bg-telus-purple/5">
                    {sowGroup.sowName}
                  </td>
                </tr>
                {/* Services for this SOW */}
                {sowGroup.services.map((item, idx) => (
                  <tr key={`${sowGroupIdx}-${idx}`} className="hover:bg-bg-primary transition-colors group">
                    <td className="px-4 py-2">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-telus-gray text-xs group-hover:text-telus-purple transition-colors truncate max-w-[200px]" title={item.serviceName}>
                          {cleanServiceName(item.serviceName, result.customerName)}
                        </span>
                        {isUserBased(item.serviceName, item.description || '', item.serviceType) ? (
                          <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-telus-purple/10 text-telus-purple text-[8px] font-black border border-border-primary shadow-sm shrink-0" title="User Based">U</span>
                        ) : isInfrastructureBased(item.serviceName, item.description || '', item.serviceType) ? (
                          <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-bg-primary text-telus-gray text-[8px] font-black border border-border-primary shadow-sm shrink-0" title="Infrastructure Based">I</span>
                        ) : null}
                        {!item.isRecurring && (
                          <span className="inline-flex items-center justify-center px-1.5 py-0 rounded bg-blue-500/10 text-blue-400 text-[8px] font-black border border-blue-500/20 shadow-sm uppercase tracking-widest shrink-0" title="One-Time Charge">One-Time</span>
                        )}
                        {item.isExpired && (
                          <span className="inline-flex items-center justify-center px-1.5 py-0 rounded bg-amber-500/10 text-amber-400 text-[8px] font-black border border-amber-500/20 shadow-sm uppercase tracking-widest shrink-0" title="Month-to-Month (Expired but not cancelled)">
                            <AlertCircle className="w-2.5 h-2.5 mr-1" />
                            M2M
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-center">
                      {editingService === item.serviceName ? (
                        <div className="flex items-center space-x-1">
                          <input 
                            type="number" 
                            value={isNaN(tempQty) ? '' : tempQty} 
                            onChange={e => {
                              const val = parseFloat(e.target.value);
                              setTempQty(isNaN(val) ? 0 : val);
                            }}
                            className="w-12 px-1 py-0.5 text-xs rounded border border-border-primary bg-bg-primary text-telus-gray"
                          />
                          <button onClick={() => handleSaveOverride(item.serviceName, tempQty, tempPrice)} className="text-telus-green"><Check className="w-3 h-3"/></button>
                        </div>
                      ) : (
                        <div className="inline-flex items-center space-x-1 telus-card-inner px-1.5 py-0.5 bg-bg-primary border border-border-primary rounded-lg">
                          {item.isActual && (
                            <span className="inline-flex items-center justify-center px-1 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[8px] font-bold border border-blue-500/20 mr-1" title="Actual Quantity from Upload">
                              ACTUAL
                            </span>
                          )}
                          <Hash className="w-2.5 h-2.5 text-text-secondary/50" />
                          <span className="text-[10px] font-black text-telus-gray">
                            {item.finalQty > 0 ? item.finalQty : 'N/A'}
                          </span>
                          {item.finalQty !== item.contractedQty && (
                            <span className="ml-1.5 text-[9px] font-bold text-text-secondary/50 line-through" title={`Contracted Qty: ${item.contractedQty}`}>
                              {item.contractedQty}
                            </span>
                          )}
                          {userRole !== 'VIEWER' && (
                            <button onClick={() => {
                              setEditingService(item.serviceName);
                              setTempQty(item.finalQty);
                              setTempPrice(item.unitPrice);
                            }} className="ml-1 text-text-secondary/40 hover:text-telus-purple transition-colors"><Edit2 className="w-3 h-3"/></button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {editingService === item.serviceName ? (
                        <input 
                          type="number" 
                          value={isNaN(tempPrice) ? '' : tempPrice} 
                          onChange={e => {
                            const val = parseFloat(e.target.value);
                            setTempPrice(isNaN(val) ? 0 : val);
                          }}
                          className="w-16 px-1 py-0.5 text-xs rounded border border-border-primary bg-bg-primary text-telus-gray text-right"
                        />
                      ) : (
                        <span className="font-bold text-text-secondary/80 text-[10px] whitespace-nowrap">
                          {item.totalPrice !== 0 ? formatCurrency(item.unitPrice) : '-'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span className="font-black text-telus-green text-sm tracking-tight whitespace-nowrap">
                        {item.totalPrice !== 0 ? formatCurrency(item.totalPrice) : '-'}
                      </span>
                    </td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
          <tfoot className="bg-bg-primary border-t-2 border-border-primary">
            <tr>
              <td colSpan={3} className="px-4 py-3 text-right font-black text-telus-gray uppercase tracking-widest text-[10px]">
                Total {billingSource} Billing
              </td>
              <td className="px-4 py-3 text-right">
                <span className="font-black text-telus-purple text-lg tracking-tight">
                  {formatCurrency(grandTotal)}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {showInvoice && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm">
          <div className="bg-bg-secondary rounded-3xl shadow-2xl w-full max-w-4xl flex flex-col h-full max-h-[90vh] overflow-hidden border border-border-primary">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-border-primary shrink-0 bg-bg-secondary z-10">
              <h2 className="text-xl sm:text-2xl font-black text-telus-gray flex items-center tracking-tight min-w-0">
                <FileText className="w-6 h-6 text-telus-purple mr-3 shrink-0" />
                <span className="truncate">Proforma Invoice - {format(currentDate, 'MMMM yyyy')}</span>
              </h2>
              <div className="flex items-center space-x-2 sm:space-x-3 shrink-0 ml-4">
                <button 
                  onClick={handleDownloadExcel}
                  className="telus-button-secondary py-2 px-3 sm:px-4 flex items-center space-x-2 bg-green-500/10 text-green-500 hover:bg-green-500/20 border-green-500/20"
                  title="Download Excel"
                >
                  <FileText className="w-4 h-4" />
                  <span className="hidden sm:inline">Excel</span>
                </button>
                <button 
                  onClick={handleDownloadPDF}
                  className="telus-button-primary py-2 px-3 sm:px-4 flex items-center space-x-2"
                >
                  <FileText className="w-4 h-4" />
                  <span className="hidden sm:inline">PDF</span>
                </button>
                <button 
                  onClick={() => window.print()}
                  className="p-2 bg-bg-primary hover:bg-bg-secondary rounded-xl transition-colors text-text-secondary hover:text-telus-purple flex items-center justify-center border border-border-primary"
                  title="Print"
                >
                  <Printer className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => setShowInvoice(false)}
                  className="p-2 bg-bg-primary hover:bg-bg-secondary rounded-xl transition-colors text-text-secondary hover:text-telus-purple flex items-center justify-center border border-border-primary"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            {/* Scrollable Container */}
            <div className="overflow-y-auto flex-1 bg-bg-primary min-h-0">
              {/* Invoice Content (Printable Area) */}
              <div className="p-6 sm:p-10 bg-bg-secondary" id="invoice-printable-area">
                <div className="flex flex-col sm:flex-row justify-between items-start gap-6 mb-10">
                <div>
                  <h1 className="text-3xl sm:text-4xl font-black text-telus-purple tracking-tighter mb-2">PROFORMA INVOICE</h1>
                  <p className="text-text-secondary font-medium">Invoice Date: {format(new Date(), 'MMMM dd, yyyy')}</p>
                  <p className="text-text-secondary font-medium">Billing Period: {format(currentDate, 'MMMM yyyy')}</p>
                </div>
                <div className="sm:text-right">
                  <h3 className="text-xl font-black text-text-primary mb-1">AXON</h3>
                  <p className="text-sm text-text-secondary">123 Axon Way</p>
                  <p className="text-sm text-text-secondary">Vancouver, BC V6B 0M3</p>
                  <p className="text-sm text-text-secondary">Canada</p>
                </div>
              </div>

              <div className="mb-12">
                <h3 className="text-sm font-bold text-text-secondary uppercase tracking-widest mb-2">Bill To:</h3>
                <h2 className="text-xl font-black text-text-primary">{result.customerName || 'Customer'}</h2>
              </div>

              <table className="w-full text-left mb-12">
                <thead>
                  <tr className="border-b-2 border-border-primary/50">
                    <th className="py-3 text-xs font-black text-text-secondary uppercase tracking-widest">Description</th>
                    <th className="py-3 text-xs font-black text-text-secondary uppercase tracking-widest text-center">Qty</th>
                    <th className="py-3 text-xs font-black text-text-secondary uppercase tracking-widest text-right">Unit Price</th>
                    <th className="py-3 text-xs font-black text-text-secondary uppercase tracking-widest text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-primary/50">
                  {sowBillingData.map((sowGroup, sowGroupIdx) => (
                    <React.Fragment key={sowGroupIdx}>
                      <tr>
                        <td colSpan={4} className="py-4 text-sm font-black text-telus-purple bg-bg-primary/50 px-2">
                          {sowGroup.sowName}
                        </td>
                      </tr>
                      {sowGroup.services.map((item, idx) => (
                        <tr key={`${sowGroupIdx}-${idx}`}>
                          <td className="py-3 px-2">
                            <div className="font-bold text-text-primary text-xs">
                              {cleanServiceName(item.serviceName, result.customerName)}
                            </div>
                            {!item.isRecurring && (
                              <div className="text-[10px] text-text-secondary uppercase tracking-widest mt-0.5">One-Time Charge</div>
                            )}
                          </td>
                          <td className="py-3 px-2 text-center text-xs font-bold text-text-primary">
                            <div className="flex items-center justify-center space-x-1">
                              {item.isActual && (
                                <span className="inline-flex items-center justify-center px-1 py-0.5 rounded bg-blue-500/10 text-blue-500 text-[8px] font-bold border border-blue-500/20" title="Actual Quantity from Upload">
                                  ACTUAL
                                </span>
                              )}
                              <span>{item.finalQty > 0 ? item.finalQty : '-'}</span>
                            </div>
                          </td>
                          <td className="py-3 px-2 text-right text-xs font-bold text-text-secondary">
                            {item.totalPrice !== 0 ? formatCurrency(item.unitPrice) : '-'}
                          </td>
                          <td className="py-3 px-2 text-right text-xs font-black text-text-primary">
                            {item.totalPrice !== 0 ? formatCurrency(item.totalPrice) : '-'}
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>

              <div className="flex justify-end">
                <div className="w-1/2 sm:w-1/3">
                  <div className="flex justify-between py-3 border-b border-border-primary/50">
                    <span className="text-sm font-bold text-text-secondary">Subtotal</span>
                    <span className="text-sm font-black text-text-primary">{formatCurrency(grandTotal)}</span>
                  </div>
                  <div className="flex justify-between py-3 border-b border-border-primary/50">
                    <span className="text-sm font-bold text-text-secondary">Tax (0%)</span>
                    <span className="text-sm font-black text-text-primary">$0.00</span>
                  </div>
                  <div className="flex justify-between py-4 border-b-2 border-border-primary">
                    <span className="text-lg font-black text-text-primary uppercase tracking-widest">Total Due</span>
                    <span className="text-xl font-black text-telus-green">{formatCurrency(grandTotal)}</span>
                  </div>
                </div>
              </div>

              <div className="mt-16 pt-8 border-t border-border-primary/50 text-center">
                <p className="text-xs font-bold text-text-secondary uppercase tracking-widest">
                  This is a proforma invoice generated for informational purposes only.
                </p>
              </div>
            </div>
          </div>
        </div>
        </div>
      )}
      {/* Upload Preview Modal */}
      {uploadPreview && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-bg-secondary rounded-3xl border border-border-primary shadow-2xl max-w-2xl w-full overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-border-primary bg-bg-primary/50">
              <h3 className="text-xl font-black text-telus-gray flex items-center">
                <FileCheck className="w-6 h-6 mr-3 text-telus-green" />
                Review Uploaded Actuals
              </h3>
              <p className="text-sm text-text-secondary mt-1 font-medium">Please verify the quantities before applying them to the billing period.</p>
            </div>
            
            <div className="p-6 max-h-[60vh] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border-primary">
                    <th className="py-2 text-[10px] font-black text-text-secondary/60 uppercase tracking-widest">Service Name</th>
                    <th className="py-2 text-[10px] font-black text-text-secondary/60 uppercase tracking-widest text-right">Quantity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-primary">
                  {Object.entries(uploadPreview).map(([name, qty]) => (
                    <tr key={name}>
                      <td className="py-3 text-xs font-bold text-telus-gray">{name}</td>
                      <td className="py-3 text-xs font-black text-telus-purple text-right">{qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-6 bg-bg-primary/50 border-t border-border-primary flex justify-end space-x-3">
              <button 
                onClick={() => setUploadPreview(null)}
                className="px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-widest text-text-secondary/80 hover:text-telus-gray hover:bg-bg-primary transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={confirmUpload}
                className="px-8 py-2 bg-telus-green text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-telus-green/20 hover:scale-105 transition-all"
              >
                Confirm & Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
