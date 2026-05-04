import React, { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CustomerSummary } from '../lib/db';
import { FileText, Search, Download, Calendar, FileCheck, ChevronDown, ChevronRight, UploadCloud, FileSpreadsheet, ChevronLeft, ChevronLeftCircle, ChevronRightCircle, ShieldCheck, ShieldOff, Lock, Unlock } from 'lucide-react';
import { parseAmount, formatCurrency, cleanServiceName, normalizeSow, cleanSowName, cn } from '../lib/utils';
import { hasCancellationCO, getCancellationDate, getDerivedUnitPrice, calculateBilledAmount, getNum, getBilledQuantity } from '../lib/contractUtils';
import { MonthlyBilling } from './MonthlyBilling';
import { getMonthlyActuals, saveMonthlyActuals, MonthlyActuals, getCustomerDetails, getPartnerDetails, getRegistryPartners, getRegistryCustomers, getRegistrySows, saveRegistrySow } from '../lib/db';
import { ServiceDetail, ChangeOrder } from '../lib/gemini';
import * as XLSX from 'xlsx';

import { CustomSelect } from './ui/CustomSelect';
import { useToast } from './ui/Toast';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { usePrivacy } from '../contexts/PrivacyContext';
import { ActualsRowSchema } from '../lib/schemas';
import { z } from 'zod';
import { UploadActualsSection } from './billing/UploadActualsSection';

interface BillingReportProps {
  customers: CustomerSummary[];
}

interface BillingItem {
  customerId: string;
  customerName: string;
  serviceName: string;
  unitPrice: number;
  qty: number;
  total: number;
  sowName: string;
  isSigned: boolean;
  isRecurring: boolean;
  startDate: Date | null;
  endDate: Date | null;
  hasCancellationCO: boolean;
  isActual?: boolean;
}

export const BillingReport: React.FC<BillingReportProps> = ({ customers }) => {
  const { showToast } = useToast();
  const { maskValue, isPrivacyMode } = usePrivacy();
  const [searchQuery, setSearchQuery] = useState('');
  const [previewCustomerIndex, setPreviewCustomerIndex] = useState<number | null>(null);
  const [previewProformaIndex, setPreviewProformaIndex] = useState<number | null>(null);
  const [brdDetails, setBrdDetails] = useState<{ details: any, partner: any, sows: any[] } | null>(null);
  const [editingCarSow, setEditingCarSow] = useState<string | null>(null);
  const [carEditValue, setCarEditValue] = useState('');

  // Default to current month and year
  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState<number>(currentDate.getMonth()); // 0-11
  const [selectedYear, setSelectedYear] = useState<number>(currentDate.getFullYear());
  const [selectedPartner, setSelectedPartner] = useState<string>('All Partners');
  
  // Upload specific states
  const [uploadMonth, setUploadMonth] = useState<number>(currentDate.getMonth());
  const [uploadYear, setUploadYear] = useState<number>(currentDate.getFullYear());
  const [uploadPartner, setUploadPartner] = useState<string>('');
  const [isUploadExpanded, setIsUploadExpanded] = useState(false);
  
  const [actualsMap, setActualsMap] = useState<Record<string, Record<string, number>>>({}); // customerId -> { serviceName -> qty }
  const [isUploadingActuals, setIsUploadingActuals] = useState(false);

  React.useEffect(() => {
    const loadAllActuals = async () => {
      const monthStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
      const newActualsMap: Record<string, Record<string, number>> = {};
      
      for (const customer of customers) {
        const data = await getMonthlyActuals(customer.id, monthStr);
        if (data) {
          newActualsMap[customer.id] = data.actuals;
        }
      }
      setActualsMap(newActualsMap);
    };
    loadAllActuals();
  }, [customers, selectedMonth, selectedYear]);

  const handleUploadActuals = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

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

          const monthStr = `${uploadYear}-${String(uploadMonth + 1).padStart(2, '0')}`;
          let updatedCustomersCount = 0;
          let updatedServicesCount = 0;

          // Group rows by customer
          const customerRows: Record<string, any[]> = {};
          
          const validationErrors: string[] = [];
          
          json.forEach((row, index) => {
            try {
              // Map dynamic columns to schema fields for validation
              const customerCol = Object.keys(row).find(k => k.toLowerCase().includes('customer') || k.toLowerCase().includes('client'));
              const serviceCol = Object.keys(row).find(k => k.toLowerCase().includes('service') || k.toLowerCase().includes('product') || k.toLowerCase().includes('item'));
              const qtyCol = Object.keys(row).find(k => k.toLowerCase().includes('qty') || k.toLowerCase().includes('quantity') || k.toLowerCase().includes('actual'));

              const mappedRow = {
                customerName: customerCol ? String(row[customerCol]) : undefined,
                serviceName: serviceCol ? String(row[serviceCol]) : undefined,
                quantity: qtyCol ? Number(String(row[qtyCol]).replace(/,/g, '')) : undefined
              };

              ActualsRowSchema.parse(mappedRow);

              if (customerCol && row[customerCol]) {
                const rowCustomer = String(row[customerCol]).toLowerCase().trim();
                if (!customerRows[rowCustomer]) customerRows[rowCustomer] = [];
                customerRows[rowCustomer].push(row);
              }
            } catch (err) {
              if (err instanceof z.ZodError) {
                validationErrors.push(`Row ${index + 1}: ${err.issues[0].message}`);
              }
            }
          });

          if (validationErrors.length > 0) {
            showToast(`Validation failed for ${validationErrors.length} rows. First error: ${validationErrors[0]}`, 'error');
            // We continue with valid rows, or could stop here. Let's continue with valid rows as per original logic but notify.
          }

          const newActualsMap = { ...actualsMap };

          for (const customer of customers) {
            // Only process customers for the selected upload partner
            if (customer.result.partnerName !== uploadPartner) continue;

            const customerNameLower = customer.customerName.toLowerCase();
            
            // Find matching rows for this customer
            const matchingRows = Object.entries(customerRows).find(([rowCustomer]) => 
              rowCustomer.includes(customerNameLower) || customerNameLower.includes(rowCustomer)
            )?.[1];

            if (matchingRows && matchingRows.length > 0) {
              const newActuals: Record<string, number> = {};
              
              matchingRows.forEach(row => {
                const serviceCol = Object.keys(row).find(k => k.toLowerCase().includes('service') || k.toLowerCase().includes('product') || k.toLowerCase().includes('item'));
                const qtyCol = Object.keys(row).find(k => k.toLowerCase().includes('qty') || k.toLowerCase().includes('quantity') || k.toLowerCase().includes('actual'));

                if (serviceCol && qtyCol) {
                  const rawServiceName = String(row[serviceCol]).trim();
                  const serviceName = cleanServiceName(rawServiceName, customer.customerName);
                  const qty = parseInt(String(row[qtyCol]).replace(/,/g, ''), 10);
                  if (!isNaN(qty)) {
                    newActuals[serviceName] = qty;
                  }
                }
              });

              if (Object.keys(newActuals).length > 0) {
                const actualsRecord: MonthlyActuals = {
                  id: `${customer.id}_${monthStr}`,
                  customerId: customer.id,
                  month: monthStr,
                  actuals: newActuals
                };
                await saveMonthlyActuals(actualsRecord);
                newActualsMap[customer.id] = newActuals;
                updatedCustomersCount++;
                updatedServicesCount += Object.keys(newActuals).length;
              }
            }
          }

          setActualsMap(newActualsMap);
          if (updatedCustomersCount > 0) {
            showToast(`Successfully loaded actuals for ${updatedServicesCount} services across ${updatedCustomersCount} customers for partner ${uploadPartner}.`, 'success');
          } else {
            showToast(`No matching actuals found for any customers belonging to ${uploadPartner} in the uploaded file. Please ensure columns for Customer, Service, and Quantity exist.`, 'warning');
          }
        } catch (err) {
          console.error('Error parsing file:', err);
          showToast('Error parsing the file. Please upload a valid Excel or CSV file.', 'error');
        } finally {
          setIsUploadingActuals(false);
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (err) {
      console.error('Error reading file:', err);
      setIsUploadingActuals(false);
    }
  };

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Generate an array of years (e.g., from 5 years ago to 5 years in the future)
  const years = Array.from({ length: 11 }, (_, i) => currentDate.getFullYear() - 5 + i);

  const [officialPartners, setOfficialPartners] = useState<string[]>([]);

  useEffect(() => {
    const loadPartners = async () => {
      const dbPartners = await getRegistryPartners();
      setOfficialPartners(dbPartners.map((p: any) => p.name).sort());
    };
    loadPartners();
    
    // We can also listen for a custom event if we want real-time updates across tabs
    // but for now, simple load is better than stale localStorage
    const handleRefresh = () => loadPartners();
    window.addEventListener('registry-updated', handleRefresh);
    return () => window.removeEventListener('registry-updated', handleRefresh);
  }, []);

  const partners = useMemo(() => {
    return ['All Partners', ...officialPartners];
  }, [officialPartners]);

  const uploadPartners = useMemo(() => {
    return officialPartners;
  }, [officialPartners]);

  const allBillingItems = useMemo(() => {
    const items: BillingItem[] = [];

    // Grouping structure to track evolution per customer, SOW, and service
    const evolutionMap: Record<string, {
      customerId: string;
      customerName: string;
      rawSowName: string;
      serviceName: string;
      history: {
        isCO: boolean;
        total: number;
        prev: number;
        change: number;
        amount: number;
        unitPrice: number;
        isRecurring: boolean;
        startDate: Date | null;
        endDate: Date | null;
        hasCancellationCO: boolean;
        isSigned: boolean;
      }[];
    }> = {};

    customers.forEach(customer => {
      const result = customer.result;
      if (!result) return;

      const addToEvolution = (service: ServiceDetail, isCO: boolean, coData?: ChangeOrder) => {
        const isRecurring = service.serviceType === 'MS' || (service.amount && service.amount.toLowerCase().includes('month'));
        const rawSowName = isCO ? (coData?.associatedSOW || 'Unknown SOW') : (service.sowName || 'Unknown SOW');
        const cleanName = cleanServiceName(service.serviceName, customer.customerName);
        const normSow = normalizeSow(rawSowName);
        const key = `${customer.id}_${normSow}_${cleanName.toLowerCase().trim()}_${isRecurring}`;

        if (!evolutionMap[key]) {
          evolutionMap[key] = {
            customerId: customer.id,
            customerName: customer.customerName,
            rawSowName,
            serviceName: cleanName,
            history: []
          };
        }

        // Determine dates
        let startDate: Date | null = null;
        if (service.dafStartDate) {
          const parsedDate = new Date(service.dafStartDate);
          if (!isNaN(parsedDate.getTime())) startDate = parsedDate;
        } else if (service.effectiveDate) {
          const parsedDate = new Date(service.effectiveDate);
          if (!isNaN(parsedDate.getTime())) startDate = parsedDate;
        } else if (isCO && coData?.date) {
          const parsedDate = new Date(coData.date);
          if (!isNaN(parsedDate.getTime())) startDate = parsedDate;
        }

        let endDate: Date | null = null;
        const cancellationDate = getCancellationDate(result, rawSowName);
        if (cancellationDate) {
          endDate = cancellationDate;
        } else if (service.expiryDate) {
          const parsedDate = new Date(service.expiryDate);
          if (!isNaN(parsedDate.getTime())) endDate = parsedDate;
        } else if (service.potentialEndDate) {
          const parsedDate = new Date(service.potentialEndDate);
          if (!isNaN(parsedDate.getTime())) endDate = parsedDate;
        }

        evolutionMap[key].history.push({
          isCO,
          total: getBilledQuantity(service),
          prev: getNum(service.previousQuantity),
          change: getNum(service.changeQuantity),
          amount: calculateBilledAmount(service),
          unitPrice: getDerivedUnitPrice(service),
          isRecurring,
          startDate,
          endDate,
          hasCancellationCO: !!cancellationDate,
          isSigned: !!service.isSigned
        });
      };

      // 1. Process base services
      result.customerServices?.forEach(s => {
        const isVendor = s.facing?.toLowerCase() === 'vendor';
        const hasEffectiveDate = s.effectiveDate && s.effectiveDate !== 'N/A' && s.effectiveDate.toLowerCase() !== 'pending';
        const active = (s.isSigned || s.manuallyActivated) && 
                      (!s.requiresDAF || s.hasDAF || s.manuallyActivated || hasEffectiveDate || isVendor);
        
        if (active) addToEvolution(s, false);
      });

      // 2. Process Change Orders
      result.changeOrders?.forEach(co => {
        if (co.facing?.toLowerCase() === 'vendor') return;
        if (!co.isSigned && !co.manuallyActivated) return;

        if (co.services && co.services.length > 0) {
          co.services.forEach(s => {
            const isVendor = s.facing?.toLowerCase() === 'vendor';
            const hasEffectiveDate = s.effectiveDate && s.effectiveDate !== 'N/A' && s.effectiveDate.toLowerCase() !== 'pending';
            const active = (s.isSigned || s.manuallyActivated) && 
                          (!s.requiresDAF || s.hasDAF || s.manuallyActivated || hasEffectiveDate || isVendor);
            
            if (active) addToEvolution(s, true, co);
          });
        } else if (co.amount) {
          const dummyService = {
            serviceName: `Change Order: ${co.changeOrderNumber || co.changeDescription}`,
            amount: co.amount,
            serviceType: co.amount && co.amount.toLowerCase().includes('month') ? 'MS' : 'PS',
            totalQuantity: '1',
            isSigned: co.isSigned || co.manuallyActivated,
            requiresDAF: co.requiresDAF,
            hasDAF: co.hasDAF,
            manuallyActivated: co.manuallyActivated
          } as ServiceDetail;

          const active = (co.isSigned || co.manuallyActivated) && 
                        (!co.requiresDAF || co.hasDAF || co.manuallyActivated || co.facing?.toLowerCase() === 'vendor');
          
          if (active) addToEvolution(dummyService, true, co);
        }
      });
    });

    // Determine target month/year for snapshot
    const targetDate = new Date(selectedYear, selectedMonth, 1);

    // Now calculate final values per evolution group for the current month
    Object.values(evolutionMap).forEach(evol => {
      // Sort history: SOW first, then COs by date if possible
      const sortedHistory = [...evol.history].sort((a, b) => {
        if (a.isCO && !b.isCO) return 1;
        if (!a.isCO && b.isCO) return -1;
        return 0;
      });

      let finalQty = 0;
      let totalPrice = 0;
      let unitPrice = 0;
      let isRecurring = false;
      let earliestStart: Date | null = null;
      let latestEnd: Date | null = null;
      let isSigned = false;
      let hasCancellation = false;

      sortedHistory.forEach(h => {
        isRecurring = h.isRecurring;
        isSigned = isSigned || h.isSigned;
        hasCancellation = hasCancellation || h.hasCancellationCO;
        
        if (h.startDate && (!earliestStart || h.startDate < earliestStart)) earliestStart = h.startDate;
        if (h.endDate && (!latestEnd || h.endDate > latestEnd)) latestEnd = h.endDate;

        if (!h.isCO) {
          finalQty = h.total || 0;
          unitPrice = h.unitPrice;
          totalPrice = unitPrice > 0 ? (finalQty * unitPrice) : h.amount;
          if (unitPrice === 0 && finalQty > 0) unitPrice = totalPrice / finalQty;
        } else {
          let qtyDelta = 0;
          let isNewTotal = false;

          if (h.change !== 0) {
            qtyDelta = h.change;
          } else if (h.total !== 0 && h.prev !== 0) {
            qtyDelta = h.total - h.prev;
            isNewTotal = true;
          } else if (h.total !== 0) {
            qtyDelta = h.total - finalQty;
            isNewTotal = true;
          }
          
          finalQty += qtyDelta;

          // If the CO provides an explicit or derived unit price, update the global rate
          if (h.unitPrice > 0) {
            unitPrice = h.unitPrice;
          }

          if (qtyDelta !== 0 && unitPrice > 0) {
            // Linear scaling for quantity changes
            totalPrice = finalQty * unitPrice;
          } else if (isNewTotal && h.amount > 0) {
            // If the CO provided a new total amount
            totalPrice = h.amount;
          } else {
            // For flat-fee additions or when price is unknown, sum the amounts
            totalPrice += h.amount;
          }

          // If we still don't have a unit price, derive it from the CO line total and change
          if (unitPrice === 0) {
            if (!isNewTotal && qtyDelta !== 0 && h.amount !== 0) {
              unitPrice = Math.abs(h.amount / qtyDelta);
            } else if (finalQty > 0) {
              unitPrice = totalPrice / finalQty;
            }
          }
        }
      });

      if (unitPrice === 0 && finalQty > 0) {
        unitPrice = totalPrice / finalQty;
      }

      if (totalPrice > 0 || finalQty > 0) {
        items.push({
          customerId: evol.customerId,
          customerName: evol.customerName,
          serviceName: evol.serviceName,
          unitPrice,
          qty: finalQty,
          total: totalPrice,
          sowName: cleanSowName(evol.rawSowName, evol.customerName),
          isSigned,
          isRecurring,
          startDate: earliestStart,
          endDate: latestEnd,
          hasCancellationCO: hasCancellation
        });
      }
    });

    return items.map(item => {
      // Override with actuals if available
      const customerActuals = actualsMap[item.customerId];
      if (customerActuals) {
        const actualQty = customerActuals[item.serviceName];
        if (actualQty !== undefined) {
          return {
            ...item,
            qty: actualQty,
            total: actualQty * item.unitPrice,
            isActual: true
          };
        }
      }
      return item;
    });
  }, [customers, actualsMap, selectedMonth, selectedYear]);

  const filteredItems = useMemo(() => {
    // 1. Filter by Date (Month/Year)
    const targetDate = new Date(selectedYear, selectedMonth, 1);
    const targetYear = targetDate.getFullYear();
    const targetMonth = targetDate.getMonth();

    let result = allBillingItems.filter(item => {
      // If we don't know when it started, assume it's active to be safe
      if (!item.startDate) return true;

      const startYear = item.startDate.getFullYear();
      const startMonth = item.startDate.getMonth();

      // For One-Time Costs (OTC), only show in the specific month it started
      if (!item.isRecurring) {
        return startYear === targetYear && startMonth === targetMonth;
      }

      // For Recurring Costs (MRC), check if it's active in this month
      // Service hasn't started yet
      if (startYear > targetYear || (startYear === targetYear && startMonth > targetMonth)) {
        return false;
      }

      // If it has an end date, check if it ended before the target month
      if (item.endDate) {
        const endYear = item.endDate.getFullYear();
        const endMonth = item.endDate.getMonth();
        
        // Service ended before this month
        if (endYear < targetYear || (endYear === targetYear && endMonth < targetMonth)) {
          if (!item.hasCancellationCO) {
            return true;
          }
          return false;
        }
      }

      return true;
    });

    // 2. Filter by Partner
    if (selectedPartner !== 'All Partners') {
      result = result.filter(item => {
        const customer = customers.find(c => c.id === item.customerId);
        // Match against official partner name if possible
        const partnerName = customer?.result.partnerName || '';
        return partnerName === selectedPartner;
      });
    }

    // 3. Filter by Search Query
    if (!searchQuery.trim()) return result;
    
    const query = searchQuery.toLowerCase();
    return result.filter(item => 
      item.customerName.toLowerCase().includes(query) ||
      item.serviceName.toLowerCase().includes(query) ||
      item.sowName.toLowerCase().includes(query)
    );
  }, [allBillingItems, searchQuery, selectedMonth, selectedYear, selectedPartner, customers]);

  const [expandedCustomers, setExpandedCustomers] = useState<Record<string, boolean>>({});

  const toggleCustomer = (customerName: string) => {
    setExpandedCustomers(prev => ({ ...prev, [customerName]: !prev[customerName] }));
  };

  const toggleAllCustomers = () => {
    console.log('toggleAllCustomers called', { groupedByCustomerKeys: Object.keys(groupedByCustomer), expandedCustomers });
    setExpandedCustomers(prev => {
      const keys = Object.keys(groupedByCustomer);
      // Check if all are currently expanded
      const allExpanded = keys.every(name => prev[name] === true);
      
      const nextState: Record<string, boolean> = {};
      keys.forEach(name => {
        nextState[name] = !allExpanded;
      });
      console.log('toggleAllCustomers nextState', nextState);
      return nextState;
    });
  };

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-US', { 
    style: 'currency', 
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(val);

  const grandTotal = filteredItems.reduce((acc, item) => acc + item.total, 0);

  // Group filtered items by customer
  const groupedByCustomer = useMemo(() => {
    return filteredItems.reduce((acc, item) => {
      if (!acc[item.customerName]) {
        acc[item.customerName] = {
          items: [],
          total: 0,
          customerId: item.customerId
        };
      }
      acc[item.customerName].items.push(item);
      acc[item.customerName].total += item.total;
      return acc;
    }, {} as Record<string, { items: typeof filteredItems, total: number, customerId: string }>);
  }, [filteredItems]);

  const customerList = useMemo(() => Object.keys(groupedByCustomer).map(name => 
    customers.find(c => c.customerName === name)!
  ), [groupedByCustomer, customers]);

  useEffect(() => {
    const fetchBrdDetails = async () => {
      if (previewCustomerIndex !== null) {
        const customer = customerList[previewCustomerIndex];
        
        // Get data from DatabaseManager (IndexedDB)
        const savedCustomers = await getRegistryCustomers();
        const savedPartners = await getRegistryPartners();
        
        // Find matching customer by name (fuzzy)
        const details = savedCustomers.find((c: any) => 
          c.name.toLowerCase().includes(customer.customerName.toLowerCase()) ||
          customer.customerName.toLowerCase().includes(c.name.toLowerCase())
        );
        
        // Find matching partner by name
        const partner = savedPartners.find((p: any) => 
          p.name.toLowerCase().includes((customer.result.partnerName || '').toLowerCase())
        );
        
        const savedSows = await getRegistrySows();
        
        setBrdDetails({ 
          details: details || { 
            cfnNumber: 'N/A', 
            billingAddress: 'N/A', 
            postalCode: 'N/A', 
            country: 'N/A', 
            invoiceEmail: 'N/A', 
            hardcopy: 'N/A', 
            wbsCode: 'N/A' 
          }, 
          partner: partner || { matCodeMRC: 'N/A' },
          sows: savedSows
        });
      } else {
        setBrdDetails(null);
      }
    };

    fetchBrdDetails();
  }, [previewCustomerIndex, customerList]);

  const handleDownloadAllBRDs = async () => {
    for (const customer of customerList) {
      await handleExportBRD(customer);
    }
  };

  // Simple CSV export
  const handleExportCSV = () => {
    const headers = ['Customer Name', 'SOW / Contract', 'Service Name', 'Unit Price', 'Qty', 'Total'];
    const rows = filteredItems.map(item => [
      `"${item.customerName.replace(/"/g, '""')}"`,
      `"${item.sowName.replace(/"/g, '""')}"`,
      `"${item.serviceName.replace(/"/g, '""')}"`,
      item.unitPrice.toFixed(2),
      item.qty,
      item.total.toFixed(2)
    ]);
    
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `billing_report_${months[selectedMonth]}_${selectedYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Billing report for ${months[selectedMonth]} ${selectedYear} (${selectedPartner}) exported successfully.`, 'success');
  };

  const handleExportBRD = async (customer: CustomerSummary) => {
    const savedCustomers = await getRegistryCustomers();
    const savedPartners = await getRegistryPartners();
    const savedSows = await getRegistrySows();
    
    const details = savedCustomers.find((c: any) => 
      c.name.toLowerCase().includes(customer.customerName.toLowerCase()) ||
      customer.customerName.toLowerCase().includes(c.name.toLowerCase())
    );
    
    const partner = savedPartners.find((p: any) => 
      p.name.toLowerCase().includes((customer.result.partnerName || '').toLowerCase())
    );

    const wb = XLSX.utils.book_new();
    const data = [
      ['', `${months[selectedMonth]} ${selectedYear}`],
      [],
      ['Invoice Description', `Partner Hub Services - ${months[selectedMonth]} ${selectedYear}`],
      ['CFN', details?.cfnNumber || ''],
      ['Legal Name', customer.customerName],
      ['Address', details?.billingAddress || ''],
      ['Postal Code', details?.postalCode || ''],
      ['Country', details?.country || ''],
      ['Email', details?.invoiceEmail || ''],
      ['Hardcopy', details?.hardcopy || ''],
      [],
      ['Billing Details'],
      ['Service level', 'Line item Description', 'JOELRA Qty', 'TELUS UNIT PRICE', 'Total', 'WBS code', 'MAT', 'CAR']
    ];

    // Add billing items grouped by SOW
    const customerItems = filteredItems.filter(item => item.customerId === customer.id);
    
    // Group by SOW
    const sowGroups: Record<string, typeof customerItems> = {};
    customerItems.forEach(item => {
      if (!sowGroups[item.sowName]) sowGroups[item.sowName] = [];
      sowGroups[item.sowName].push(item);
    });

    Object.entries(sowGroups).forEach(([sowName, items], sowIdx) => {
      const sowMeta = savedSows.find((s: any) => s.sowName === sowName);
      
      items.forEach((item, itemIdx) => {
        data.push([
          itemIdx === 0 ? sowName : '', // Only name SOW in first row
          item.serviceName,
          item.qty.toString(),
          item.unitPrice.toFixed(2),
          item.total.toFixed(2),
          item.isRecurring ? (details?.wbsCode || '') : (details?.wbsCodeOTC || ''),
          item.isRecurring ? (partner?.matCodeMRC || '') : (partner?.matCodeOTC || ''),
          sowMeta?.carNumber || ''
        ]);
      });
    });

    data.push(['', '', '', '', `Grand Total`, formatCurrency(customerItems.reduce((acc, item) => acc + item.total, 0))]);

    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'BRD');
    XLSX.writeFile(wb, `BRD_${customer.customerName.replace(/\s+/g, '_')}_${months[selectedMonth]}_${selectedYear}.xlsx`);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300 -mx-4 sm:-mx-6 lg:-mx-8">
      <div className="telus-card bg-bg-secondary w-full rounded-none border-x-0 border-border-primary">
        <div className="p-4 sm:p-8">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-8 mb-8">
            <div className="flex-1">
              <div className="flex items-center">
                <div className="p-3 bg-telus-purple/10 rounded-2xl mr-4">
                  <FileText className="w-6 h-6 text-telus-purple" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-telus-gray tracking-tight">
                    Active Billing Report
                  </h2>
                  <p className="text-xs font-bold text-text-secondary uppercase tracking-widest mt-0.5">
                    Monthly Recurring Services
                  </p>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-4">
                <div className="flex items-center space-x-3">
                  <CustomSelect
                    value={selectedMonth}
                    onChange={setSelectedMonth}
                    options={months.map((month, index) => ({ label: month, value: index }))}
                    icon={<Calendar className="w-4 h-4" />}
                    buttonClassName="p-2.5"
                  />
                  <span className="text-border-primary font-bold">/</span>
                  <CustomSelect
                    value={selectedYear}
                    onChange={setSelectedYear}
                    options={years.map(year => ({ label: String(year), value: year }))}
                    buttonClassName="p-2.5"
                  />
                  <span className="text-border-primary font-bold">|</span>
                  <CustomSelect
                    value={selectedPartner}
                    onChange={setSelectedPartner}
                    options={partners.map(p => ({ label: p, value: p }))}
                    className="min-w-[180px]"
                    buttonClassName="p-2.5"
                  />
                </div>

                <div className="relative flex-1 max-w-xs">
                  <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary/50" />
                  <input 
                    type="text" 
                    placeholder="Search report..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-11 pr-4 py-2.5 bg-bg-primary border border-border-primary rounded-xl text-sm font-bold text-telus-gray focus:outline-none focus:ring-2 focus:ring-telus-purple/30 focus:bg-bg-secondary transition-all placeholder:text-text-secondary/30"
                  />
                </div>

                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={toggleAllCustomers}
                  className="p-2.5 h-auto"
                  title="Toggle Expand All"
                >
                  {Object.keys(groupedByCustomer).length > 0 && Object.keys(groupedByCustomer).some(name => !expandedCustomers[name]) ? <ChevronRight className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </Button>

                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleExportCSV}
                  className="p-2.5 h-auto"
                  title="Export CSV"
                >
                  <Download className="w-5 h-5" />
                </Button>
              </div>
            </div>
            
            {/* Dedicated Upload Section */}
            <div className="w-full max-w-sm">
              <UploadActualsSection
                isUploadExpanded={isUploadExpanded}
                setIsUploadExpanded={setIsUploadExpanded}
                uploadMonth={uploadMonth}
                setUploadMonth={setUploadMonth}
                uploadYear={uploadYear}
                setUploadYear={setUploadYear}
                uploadPartner={uploadPartner}
                setUploadPartner={setUploadPartner}
                isUploadingActuals={isUploadingActuals}
                onUpload={handleUploadActuals}
                months={months}
                years={years}
                uploadPartners={uploadPartners}
              />
            </div>
          </div>

          <div className="overflow-x-auto border border-border-primary rounded-2xl">
            <table className="w-full text-left text-sm text-text-secondary min-w-[800px]">
              <thead className="bg-bg-primary text-telus-gray font-bold border-b border-border-primary">
                <tr>
                  <th className="px-6 py-4 uppercase tracking-widest text-[10px] font-black text-text-secondary/60">Customer Name</th>
                  <th className="px-6 py-4 uppercase tracking-widest text-[10px] font-black text-text-secondary/60">SOW / Contract</th>
                  <th className="px-6 py-4 uppercase tracking-widest text-[10px] font-black text-text-secondary/60">Service Name</th>
                  <th className="px-6 py-4 text-center uppercase tracking-widest text-[10px] font-black text-text-secondary/60">Status</th>
                  <th className="px-6 py-4 text-right uppercase tracking-widest text-[10px] font-black text-text-secondary/60">Unit Price</th>
                  <th className="px-6 py-4 text-right uppercase tracking-widest text-[10px] font-black text-text-secondary/60">Qty</th>
                  <th className="px-6 py-4 text-right uppercase tracking-widest text-[10px] font-black text-text-secondary/60">Total</th>
                  <th className="px-6 py-4 text-center uppercase tracking-widest text-[10px] font-black text-text-secondary/60">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-primary/30 bg-bg-secondary">
                {Object.keys(groupedByCustomer).length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-text-secondary/60 font-medium bg-bg-secondary">
                      No active billing items found for {months[selectedMonth]} {selectedYear}.
                    </td>
                  </tr>
                ) : (
                  Object.entries(groupedByCustomer).map(([customerName, group]) => (
                    <React.Fragment key={customerName}>
                      {/* Customer Group Header */}
                      <tr 
                        className="bg-bg-primary/50 hover:bg-bg-primary transition-colors cursor-pointer group"
                        onClick={() => toggleCustomer(customerName)}
                      >
                        <td className="px-6 py-4 font-black text-telus-gray flex items-center">
                          <div className="w-5 h-5 rounded-full bg-telus-purple/10 flex items-center justify-center mr-3 text-telus-purple transition-transform group-hover:scale-110">
                            {expandedCustomers[customerName] ? (
                              <ChevronDown className="w-3 h-3" />
                            ) : (
                              <ChevronRight className="w-3 h-3" />
                            )}
                          </div>
                          {maskValue(customerName, 'text')}
                        </td>
                        <td colSpan={5} className="px-6 py-4 text-xs text-text-secondary font-medium">
                          {group.items.length} active service{group.items.length !== 1 ? 's' : ''}
                        </td>
                        <td className="px-6 py-4 text-right font-black text-telus-purple">
                          {formatCurrency(group.total)}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center space-x-2">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                const idx = customerList.findIndex(c => c.id === group.customerId);
                                if (idx !== -1) setPreviewCustomerIndex(idx);
                              }}
                              className="text-blue-600 hover:bg-blue-500/10"
                              title="Preview BRD"
                            >
                              <FileSpreadsheet className="w-4 h-4 mr-1.5" />
                              <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline-block">Preview</span>
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                const idx = customerList.findIndex(c => c.id === group.customerId);
                                if (idx !== -1) setPreviewProformaIndex(idx);
                              }}
                              className="text-telus-purple hover:bg-telus-purple/10"
                              title="Draft Proforma"
                            >
                              <FileCheck className="w-4 h-4 mr-1.5" />
                              <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline-block">Draft</span>
                            </Button>
                          </div>
                        </td>
                      </tr>
                      
                      {/* Expanded Items */}
                      {expandedCustomers[customerName] && group.items.map((item, idx) => (
                        <tr key={`${customerName}-${idx}`} className="hover:bg-bg-primary/30 transition-colors bg-bg-secondary">
                          <td className="px-6 py-3 pl-14 text-xs text-text-secondary/60 font-medium">↳</td>
                          <td className="px-6 py-3 text-xs text-text-secondary">{item.sowName}</td>
                          <td className="px-6 py-3 font-medium text-sm text-telus-gray">
                            {cleanServiceName(item.serviceName, item.customerName)}
                          </td>
                          <td className="px-6 py-3 text-center">
                            <Badge variant={item.isSigned ? 'success' : 'danger'} size="sm">
                              {item.isSigned ? 'Signed' : 'Unsigned'}
                            </Badge>
                          </td>
                          <td className="px-6 py-3 text-right font-bold text-sm text-telus-gray">{formatCurrency(item.unitPrice)}</td>
                          <td className="px-6 py-3 text-right text-sm text-text-primary">
                            <div className="flex items-center justify-end space-x-2">
                              {(item as any).isActual && (
                                <Badge variant="info" size="xs">
                                  ACTUAL
                                </Badge>
                              )}
                              <span>{item.qty}</span>
                            </div>
                          </td>
                          <td className="px-6 py-3 text-right font-black text-telus-gray text-sm font-sans">{formatCurrency(item.total)}</td>
                          <td className="px-6 py-3"></td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))
                )}
              </tbody>
              {filteredItems.length > 0 && (
                <tfoot className="bg-bg-primary/50 font-bold text-telus-gray border-t border-border-primary">
                  <tr>
                    <td colSpan={6} className="px-6 py-4 text-right uppercase tracking-widest text-[10px] font-black text-text-secondary/60">Grand Total for {months[selectedMonth]} {selectedYear}</td>
                    <td className="px-6 py-4 text-right text-telus-purple font-black text-lg">{formatCurrency(grandTotal)}</td>
                    <td className="px-6 py-4"></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>

        {/* BRD Preview Modal Overlay */}
        {previewCustomerIndex !== null && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-bg-secondary w-full max-w-5xl h-full max-h-[90vh] rounded-[40px] shadow-2xl overflow-hidden flex flex-col border border-border-primary animate-in zoom-in-95 duration-300">
              <div className="p-6 border-b border-border-primary flex justify-between items-center bg-bg-primary shrink-0">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-blue-600 rounded-xl">
                    <FileSpreadsheet className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-telus-gray">BRD Preview</h3>
                    <p className="text-xs text-text-secondary font-bold uppercase tracking-widest">{customerList[previewCustomerIndex].customerName}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <button onClick={() => handleExportBRD(customerList[previewCustomerIndex])} className="text-sm font-bold text-blue-600 hover:text-blue-500">Download</button>
                  <button onClick={handleDownloadAllBRDs} className="text-sm font-bold text-blue-600 hover:text-blue-500">Download All</button>
                  <button onClick={() => setPreviewCustomerIndex(null)} className="p-2 hover:bg-bg-primary rounded-full transition-colors"><ChevronDown className="w-6 h-6 text-text-secondary" /></button>
                </div>
              </div>
              <div className="flex-grow overflow-y-auto p-6 bg-bg-primary/30">
                <div className="bg-bg-secondary p-6 rounded-xl border border-border-primary shadow-sm">
                  <div className="flex justify-between items-start mb-6">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-4">
                        <span className="text-[10px] font-black text-text-secondary uppercase tracking-widest w-32">Invoice Description</span>
                        <span className="text-sm font-bold text-telus-gray">Partner Hub Services - {months[selectedMonth]} {selectedYear}</span>
                      </div>
                      <div className="flex items-center space-x-4">
                        <span className="text-[10px] font-black text-text-secondary uppercase tracking-widest w-32">CFN</span>
                        <span className="text-sm font-bold text-telus-gray">{brdDetails?.details?.cfnNumber || 'N/A'}</span>
                      </div>
                      <div className="flex items-center space-x-4">
                        <span className="text-[10px] font-black text-text-secondary uppercase tracking-widest w-32">Legal Name</span>
                        <span className="text-sm font-bold text-telus-gray">{customerList[previewCustomerIndex].customerName}</span>
                      </div>
                      <div className="flex items-center space-x-4">
                        <span className="text-[10px] font-black text-text-secondary uppercase tracking-widest w-32">Address</span>
                        <span className="text-sm font-medium text-text-secondary">{brdDetails?.details?.billingAddress || 'N/A'}</span>
                      </div>
                      <div className="flex items-center space-x-4">
                        <span className="text-[10px] font-black text-text-secondary uppercase tracking-widest w-32">Postal Code</span>
                        <span className="text-sm font-medium text-text-secondary">{brdDetails?.details?.postalCode || 'N/A'}</span>
                      </div>
                      <div className="flex items-center space-x-4">
                        <span className="text-[10px] font-black text-text-secondary uppercase tracking-widest w-32">Country</span>
                        <span className="text-sm font-medium text-text-secondary">{brdDetails?.details?.country || 'N/A'}</span>
                      </div>
                      <div className="flex items-center space-x-4">
                        <span className="text-[10px] font-black text-text-secondary uppercase tracking-widest w-32">Email</span>
                        <span className="text-sm font-medium text-text-secondary">{brdDetails?.details?.invoiceEmail || 'N/A'}</span>
                      </div>
                      <div className="flex items-center space-x-4">
                        <span className="text-[10px] font-black text-text-secondary uppercase tracking-widest w-32">Hardcopy</span>
                        <span className="text-sm font-medium text-text-secondary">{brdDetails?.details?.hardcopy || 'N/A'}</span>
                      </div>
                    </div>
                    <div className="text-right space-y-1">
                      <div className="flex items-center justify-end space-x-2">
                        <span className="text-[10px] font-black text-text-secondary uppercase tracking-widest">WBS Code</span>
                        <span className="text-sm font-mono text-telus-purple">{brdDetails?.details?.wbsCode || 'N/A'}</span>
                      </div>
                      <div className="flex items-center justify-end space-x-2">
                        <span className="text-[10px] font-black text-text-secondary uppercase tracking-widest">MAT</span>
                        <span className="text-sm font-mono text-telus-purple">{brdDetails?.partner?.matCodeMRC || 'N/A'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-[10px] font-black text-text-secondary uppercase tracking-widest bg-bg-primary/50">
                        <tr>
                          <th className="px-4 py-3">Service level</th>
                          <th className="px-4 py-3">Line item Description</th>
                          <th className="px-4 py-3 text-right">JOELRA Qty</th>
                          <th className="px-4 py-3 text-right">TELUS UNIT PRICE</th>
                          <th className="px-4 py-3 text-right">Total</th>
                          <th className="px-4 py-3">WBS code</th>
                          <th className="px-4 py-3">MAT</th>
                          <th className="px-4 py-3">CAR</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-primary/30">
                        {(() => {
                          const items = filteredItems.filter(item => item.customerId === customerList[previewCustomerIndex].id);
                          const sowGroups = items.reduce((acc, item) => {
                            if (!acc[item.sowName]) acc[item.sowName] = [];
                            acc[item.sowName].push(item);
                            return acc;
                          }, {} as Record<string, typeof items>);

                          return Object.entries(sowGroups).map(([sowName, sowItems]) => (
                            <React.Fragment key={sowName}>
                              {sowItems.map((item, idx) => (
                                <tr key={idx} className="hover:bg-bg-primary/30 transition-colors">
                                  <td className="px-4 py-3 text-xs font-bold text-telus-gray">
                                    {idx === 0 ? item.sowName : ''}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-telus-gray">
                                    {cleanServiceName(item.serviceName, item.customerName)}
                                  </td>
                                  <td className="px-4 py-3 text-right text-sm font-medium text-telus-gray">
                                    {item.qty}
                                  </td>
                                  <td className="px-4 py-3 text-right text-sm font-medium text-telus-gray">
                                    {formatCurrency(item.unitPrice)}
                                  </td>
                                  <td className="px-4 py-3 text-right text-sm font-black text-telus-purple">
                                    {formatCurrency(item.total)}
                                  </td>
                                  <td className="px-4 py-3 text-xs font-mono text-text-secondary">
                                    {item.isRecurring ? (brdDetails?.details?.wbsCode || 'N/A') : (brdDetails?.details?.wbsCodeOTC || 'N/A')}
                                  </td>
                                  <td className="px-4 py-3 text-xs font-mono text-text-secondary">
                                    {item.isRecurring ? (brdDetails?.partner?.matCodeMRC || 'N/A') : (brdDetails?.partner?.matCodeOTC || 'N/A')}
                                  </td>
                                  <td className="px-4 py-3 text-xs font-mono text-text-secondary">
                                    {(() => {
                                      const currentSowName = item.sowName;
                                      const savedSows = brdDetails?.sows || [];
                                      const sowMeta = savedSows.find((s: any) => s.sowName === currentSowName);
                                      
                                      if (editingCarSow === currentSowName) {
                                        return (
                                          <input 
                                            autoFocus
                                            className="w-24 bg-bg-secondary border border-border-primary rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-telus-purple text-telus-gray"
                                            value={carEditValue}
                                            onChange={e => setCarEditValue(e.target.value)}
                                            onBlur={async () => {
                                              if (carEditValue.trim()) {
                                                const updatedSows = [...savedSows];
                                                const idx = updatedSows.findIndex((s: any) => s.sowName === currentSowName);
                                                let sowToSave;
                                                if (idx !== -1) {
                                                  updatedSows[idx].carNumber = carEditValue;
                                                  sowToSave = updatedSows[idx];
                                                } else {
                                                  sowToSave = { id: Date.now().toString(), sowName: currentSowName, carNumber: carEditValue };
                                                  updatedSows.push(sowToSave);
                                                }
                                                setBrdDetails(prev => prev ? { ...prev, sows: updatedSows } : null);
                                                await saveRegistrySow(sowToSave);
                                              }
                                              setEditingCarSow(null);
                                            }}
                                            onKeyDown={e => {
                                              if (e.key === 'Enter') e.currentTarget.blur();
                                              if (e.key === 'Escape') setEditingCarSow(null);
                                            }}
                                          />
                                        );
                                      }

                                      return (
                                        <button 
                                          onClick={() => {
                                            setEditingCarSow(currentSowName);
                                            setCarEditValue(sowMeta?.carNumber || '');
                                          }}
                                          className="hover:text-telus-purple transition-colors cursor-pointer underline decoration-dotted underline-offset-2"
                                        >
                                          {sowMeta?.carNumber || '[Pending]'}
                                        </button>
                                      );
                                    })()}
                                  </td>
                                </tr>
                              ))}
                            </React.Fragment>
                          ));
                        })()}
                      </tbody>
                      <tfoot className="bg-bg-primary/50 font-black">
                        <tr>
                          <td colSpan={4} className="px-4 py-4 text-right text-xs uppercase tracking-widest text-text-secondary">Grand Total</td>
                          <td className="px-4 py-4 text-right text-lg text-telus-purple">
                            {formatCurrency(filteredItems.filter(item => item.customerId === customerList[previewCustomerIndex].id).reduce((acc, item) => acc + item.total, 0))}
                          </td>
                          <td colSpan={3}></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
              <div className="p-4 border-t border-border-primary flex justify-between items-center bg-bg-secondary">
                <button onClick={() => setPreviewCustomerIndex(prev => prev! > 0 ? prev! - 1 : prev)} disabled={previewCustomerIndex === 0} className="p-2 rounded-full hover:bg-bg-primary disabled:opacity-30"><ChevronLeftCircle className="w-8 h-8 text-blue-600" /></button>
                <span className="text-sm font-bold text-text-secondary">{previewCustomerIndex + 1} / {customerList.length}</span>
                <button onClick={() => setPreviewCustomerIndex(prev => prev! < customerList.length - 1 ? prev! + 1 : prev)} disabled={previewCustomerIndex === customerList.length - 1} className="p-2 rounded-full hover:bg-bg-primary disabled:opacity-30"><ChevronRightCircle className="w-8 h-8 text-blue-600" /></button>
              </div>
            </div>
          </div>
        )}

        {/* Proforma Modal Overlay */}
        {previewProformaIndex !== null && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-bg-secondary w-full max-w-5xl h-full max-h-[90vh] rounded-[40px] shadow-2xl overflow-hidden flex flex-col border border-border-primary animate-in zoom-in-95 duration-300">
              <div className="p-6 border-b border-border-primary flex justify-between items-center bg-bg-primary shrink-0">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-telus-purple rounded-xl">
                    <FileCheck className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-telus-purple">{customerList[previewProformaIndex].customerName}</h3>
                    <p className="text-sm font-bold text-text-secondary uppercase tracking-widest">Portfolio Proforma Draft</p>
                  </div>
                </div>
                <button 
                  onClick={() => setPreviewProformaIndex(null)}
                  className="p-2 hover:bg-bg-primary rounded-full transition-colors"
                >
                  <ChevronDown className="w-6 h-6 text-text-secondary" />
                </button>
              </div>
              <div className="flex-grow overflow-y-auto min-h-0">
                <MonthlyBilling result={customerList[previewProformaIndex].result} />
              </div>
              <div className="p-4 border-t border-border-primary flex justify-between items-center bg-bg-secondary">
                <button onClick={() => setPreviewProformaIndex(prev => prev! > 0 ? prev! - 1 : prev)} disabled={previewProformaIndex === 0} className="p-2 rounded-full hover:bg-bg-primary disabled:opacity-30"><ChevronLeftCircle className="w-8 h-8 text-telus-purple" /></button>
                <span className="text-sm font-bold text-text-secondary">{previewProformaIndex + 1} / {customerList.length}</span>
                <button onClick={() => setPreviewProformaIndex(prev => prev! < customerList.length - 1 ? prev! + 1 : prev)} disabled={previewProformaIndex === customerList.length - 1} className="p-2 rounded-full hover:bg-bg-primary disabled:opacity-30"><ChevronRightCircle className="w-8 h-8 text-telus-purple" /></button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
};
