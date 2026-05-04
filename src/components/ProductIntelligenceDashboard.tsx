import React, { useMemo, useState, useRef } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { CustomerSummary } from '../lib/db';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { Filter, ArrowUp, ArrowDown, Search, RotateCcw, Download, Users, FileText, Layers, DollarSign } from 'lucide-react';
import { cn } from '../lib/utils';

interface ProductIntelligenceDashboardProps {
  customers: CustomerSummary[];
}

export const ProductIntelligenceDashboard: React.FC<ProductIntelligenceDashboardProps> = ({ customers }) => {
  const dashboardRef = useRef<HTMLDivElement>(null);
  const downloadRef = useRef<HTMLDivElement>(null);
  const categoryRef = useRef<HTMLTableHeaderCellElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (downloadRef.current && !downloadRef.current.contains(event.target as Node)) {
        setIsDownloadOpen(false);
      }
      if (categoryRef.current && !categoryRef.current.contains(event.target as Node)) {
        setIsCategoryOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getCategory = (name: string, type: string) => {
    const n = name.toLowerCase();
    const t = type.toLowerCase();
    if (n.includes('protect') || n.includes('secure') || t.includes('protect') || t.includes('secure')) return 'Protect IT';
    if (n.includes('manage') || t.includes('manage')) return 'Manage IT';
    if (n.includes('support') || t.includes('support')) return 'Support IT';
    if (n.includes('present') || n.includes('simplicit') || t.includes('present') || t.includes('simplicit')) return 'Simplicit';
    if (n.includes('store') || t.includes('store')) return 'Store IT';
    return 'Other';
  };

  const normalizeName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '').trim();

  const [isDownloadOpen, setIsDownloadOpen] = useState(false);
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [startDate, setStartDate] = useState<string>('2025-01-01');
  const [endDate, setEndDate] = useState<string>('2026-12-31');
  const [searchTerm, setSearchTerm] = useState('');
  const [excludePS_TS, setExcludePS_TS] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set(['All']));
  const [sortConfig, setSortConfig] = useState<{ key: 'quantity' | 'price', direction: 'desc' | 'asc' }>({ key: 'quantity', direction: 'desc' });
  const [pieMetric, setPieMetric] = useState<'quantity' | 'price'>('quantity');

  const aggregatedData = useMemo(() => {
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();

    const filteredCustomers = customers.filter(c => c.createdAt >= start && c.createdAt <= end);

    const serviceMap = new Map<string, { name: string, type: string, quantity: number, price: number, category: string }>();

    filteredCustomers.forEach(c => {
      // Customer SOWs
      [...(c.result.customerServices || [])].forEach(s => {
        if (excludePS_TS && (s.serviceType === 'PS' || s.serviceType === 'TS')) return;

        const normalized = `${normalizeName(s.serviceName)}_${s.serviceType}`;
        const existing = serviceMap.get(normalized) || { name: s.serviceName, type: s.serviceType, quantity: 0, price: 0, category: getCategory(s.serviceName, s.serviceType) };
        
        const qty = parseInt(s.totalQuantity || '0') || 0;
        const price = parseFloat(s.amount.replace(/[^0-9.-]+/g, '')) || 0;
        
        existing.quantity += qty;
        existing.price += price;
        serviceMap.set(normalized, existing);
      });

      // Customer COs
      (c.result.changeOrders || []).filter(co => co.facing === 'Customer').forEach(co => {
        (co.services || []).forEach(s => {
          if (excludePS_TS && (s.serviceType === 'PS' || s.serviceType === 'TS')) return;

          const normalized = `${normalizeName(s.serviceName)}_${s.serviceType}`;
          const existing = serviceMap.get(normalized) || { name: s.serviceName, type: s.serviceType, quantity: 0, price: 0, category: getCategory(s.serviceName, s.serviceType) };
          
          const qty = parseInt(s.totalQuantity || '0') || 0;
          const price = parseFloat(s.amount.replace(/[^0-9.-]+/g, '')) || 0;
          
          existing.quantity += qty;
          existing.price += price;
          serviceMap.set(normalized, existing);
        });
      });
    });

    return Array.from(serviceMap.values())
      .filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()))
      .filter(s => selectedCategories.has('All') || selectedCategories.has(s.category))
      .sort((a, b) => b.quantity - a.quantity); // Default sort for charts
  }, [customers, startDate, endDate, searchTerm, excludePS_TS, selectedCategories]);

  const categories = useMemo(() => ['All', ...new Set(aggregatedData.map(s => s.category))], [aggregatedData]);

  const totalPages = Math.ceil(aggregatedData.length / itemsPerPage);
  
  // Reset page when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [startDate, endDate, searchTerm, excludePS_TS, selectedCategories]);

  const toggleCategorySelection = (category: string) => {
    const newSelection = new Set(selectedCategories);
    if (category === 'All') {
      setSelectedCategories(new Set(['All']));
    } else {
      newSelection.delete('All');
      if (newSelection.has(category)) {
        newSelection.delete(category);
      } else {
        newSelection.add(category);
      }
      if (newSelection.size === 0) newSelection.add('All');
      setSelectedCategories(newSelection);
    }
  };

  const toggleSort = (key: 'quantity' | 'price') => {
    let direction: 'asc' | 'desc' = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const sortedData = useMemo(() => {
    const data = [...aggregatedData];
    if (sortConfig.key) {
      data.sort((a, b) => {
        const aVal = a[sortConfig.key!];
        const bVal = b[sortConfig.key!];
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return data;
  }, [aggregatedData, sortConfig]);

  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedData.slice(start, start + itemsPerPage);
  }, [sortedData, currentPage]);

  const downloadExcel = () => {
    const ws = XLSX.utils.json_to_sheet(aggregatedData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Services');
    XLSX.writeFile(wb, 'ProductIntelligence.xlsx');
  };

  const downloadImage = async () => {
    if (dashboardRef.current) {
      const canvas = await html2canvas(dashboardRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#F4F5F7',
        windowWidth: 1200,
        onclone: (clonedDoc) => {
          const el = clonedDoc.getElementById('dashboard-capture-container');
          if (el) {
            el.style.width = '1200px';
            el.style.padding = '40px';
          }
        }
      });
      const link = document.createElement('a');
      link.download = 'dashboard.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    }
  };

  const downloadPDF = async () => {
    if (dashboardRef.current) {
      const canvas = await html2canvas(dashboardRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#F4F5F7',
        windowWidth: 1200,
        onclone: (clonedDoc) => {
          const el = clonedDoc.getElementById('dashboard-capture-container');
          if (el) {
            el.style.width = '1200px';
            el.style.padding = '40px';
          }
        }
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('l', 'mm', 'a4');
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save('dashboard.pdf');
    }
  };

  const durations = [
    { label: '3M', days: 90 },
    { label: '6M', days: 180 },
    { label: '1Y', days: 365 },
  ];

  const setDateRange = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  const filteredCustomers = useMemo(() => {
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    return customers.filter(c => c.createdAt >= start && c.createdAt <= end);
  }, [customers, startDate, endDate]);

  const sowNames = new Set<string>();
  filteredCustomers.forEach(c => {
    [...(c.result.customerServices || []), ...(c.result.vendorServices || [])].forEach(s => {
      sowNames.add(s.sowName);
    });
  });

  const truncate = (str: string, n: number) => {
    return (str.length > n) ? str.slice(0, n - 1) + '...' : str;
  };

  const topServices = aggregatedData.slice(0, 10).map(s => ({ name: s.name, value: s.quantity }));
  const categoryData = useMemo(() => {
    const catMap = new Map<string, number>();
    aggregatedData.forEach(s => {
      const val = catMap.get(s.category) || 0;
      catMap.set(s.category, val + (pieMetric === 'quantity' ? s.quantity : s.price));
    });
    return Array.from(catMap.entries()).map(([name, value]) => ({ name, value }));
  }, [aggregatedData, pieMetric]);

  const COLORS = ['#2B8000', '#4B286D', '#D9B0FF', '#71BE44', '#2A2C2E'];

  const RADIAN = Math.PI / 180;
  const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return percent > 0.05 ? (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" className="text-[10px] font-black">
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    ) : null;
  };

  return (
    <div id="dashboard-capture-container" className="p-8 max-w-[1600px] mx-auto space-y-10 bg-bg-primary min-h-screen" ref={dashboardRef}>
      
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex items-center gap-6">
          <div>
            <p className="text-sm font-black text-telus-purple tracking-[0.2em] uppercase mb-1">Strategic Overview</p>
            <h1 className="text-5xl font-black text-telus-gray tracking-tight">Product Intelligence</h1>
          </div>
        </div>
        <div className="relative" ref={downloadRef}>
          <button 
            onClick={() => setIsDownloadOpen(!isDownloadOpen)}
            className="bg-telus-purple hover:bg-telus-purple/90 text-white px-8 py-4 rounded-full font-bold flex items-center transition-all shadow-xl shadow-telus-purple/20 hover:-translate-y-1"
            data-html2canvas-ignore="true"
          >
            <Download className="w-5 h-5 mr-3" />
            Download Report
          </button>
          {isDownloadOpen && (
            <div className="absolute right-0 top-full mt-2 w-48 bg-bg-secondary rounded-[24px] shadow-[0_10px_40px_rgba(75,40,109,0.1)] z-50 overflow-hidden py-2 border border-border-primary" data-html2canvas-ignore="true">
              <button className="block w-full text-left px-6 py-3 text-sm font-bold text-text-secondary hover:bg-telus-purple/10 hover:text-telus-purple transition-colors" onClick={() => { downloadExcel(); setIsDownloadOpen(false); }}>Download Excel</button>
              <button className="block w-full text-left px-6 py-3 text-sm font-bold text-text-secondary hover:bg-telus-purple/10 hover:text-telus-purple transition-colors" onClick={() => { downloadPDF(); setIsDownloadOpen(false); }}>Download PDF</button>
              <button className="block w-full text-left px-6 py-3 text-sm font-bold text-text-secondary hover:bg-telus-purple/10 hover:text-telus-purple transition-colors" onClick={() => { downloadImage(); setIsDownloadOpen(false); }}>Download Image</button>
            </div>
          )}
        </div>
      </div>

      <>
        {/* Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {/* Total Customers */}
        <div className="telus-card p-8 bg-emerald-500/5 relative overflow-hidden group border-emerald-500/20">
          <div className="w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center mb-6 text-white shadow-lg shadow-emerald-500/20">
            <Users className="w-5 h-5" />
          </div>
          <p className="text-sm font-bold text-text-secondary mb-2">Total Customers</p>
          <h3 className="text-4xl font-black text-telus-gray mb-2">{new Set(filteredCustomers.map(c => c.customerName)).size}</h3>
          <div className="absolute bottom-0 right-0 w-24 h-24 bg-bg-secondary/40 rounded-tl-[48px] -mr-6 -mb-6"></div>
        </div>

        {/* SOWs Processed */}
        <div className="telus-card p-8 bg-telus-purple/5 relative overflow-hidden group border-telus-purple/20">
          <div className="w-12 h-12 bg-telus-purple rounded-full flex items-center justify-center mb-6 text-white shadow-lg shadow-telus-purple/20">
            <FileText className="w-5 h-5" />
          </div>
          <p className="text-sm font-bold text-text-secondary mb-2">SOWs Processed</p>
          <h3 className="text-4xl font-black text-telus-purple mb-2">{sowNames.size}</h3>
        </div>

        {/* Total Services */}
        <div className="telus-card p-8 bg-rose-500/5 relative overflow-hidden group border-rose-500/20">
          <div className="w-12 h-12 bg-rose-500 rounded-full flex items-center justify-center mb-6 text-white shadow-lg shadow-rose-500/20">
            <Layers className="w-5 h-5" />
          </div>
          <p className="text-sm font-bold text-text-secondary mb-2">Total Services</p>
          <h3 className="text-4xl font-black text-telus-gray mb-2">{aggregatedData.length.toLocaleString()}</h3>
        </div>

        {/* Total Price */}
        <div className="telus-card p-8 bg-blue-500/5 relative overflow-hidden group border-blue-500/20">
          <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center mb-6 text-white shadow-lg shadow-blue-500/20">
            <DollarSign className="w-5 h-5" />
          </div>
          <p className="text-sm font-bold text-text-secondary mb-2">Total Price</p>
          <h3 className="text-4xl font-black text-blue-500 mb-2">${Math.round(aggregatedData.reduce((acc, s) => acc + s.price, 0)).toLocaleString()}</h3>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center telus-card p-4 bg-bg-secondary border-border-primary">
        <div className="flex items-center space-x-3 px-2">
          <label className="text-[10px] font-black text-telus-gray uppercase tracking-widest">Start:</label>
          <input type="date" className="bg-bg-primary border border-border-primary rounded-full px-4 py-2 text-sm font-bold text-text-secondary focus:ring-2 focus:ring-telus-purple/20 outline-none" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <label className="text-[10px] font-black text-telus-gray uppercase tracking-widest ml-2">End:</label>
          <input type="date" className="bg-bg-primary border border-border-primary rounded-full px-4 py-2 text-sm font-bold text-text-secondary focus:ring-2 focus:ring-telus-purple/20 outline-none" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          <div className="flex space-x-1 ml-2">
            {durations.map(d => (
              <button key={d.label} onClick={() => setDateRange(d.days)} className="px-4 py-2 text-xs font-bold rounded-full bg-bg-primary text-text-secondary hover:bg-telus-purple/10 hover:text-telus-purple border border-border-primary transition-colors">{d.label}</button>
            ))}
          </div>
        </div>
        <div className="w-px h-8 bg-border-primary mx-2"></div>
        <label className="flex items-center space-x-2 cursor-pointer group">
          <div className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${excludePS_TS ? 'bg-telus-purple' : 'bg-bg-primary group-hover:bg-bg-secondary border border-border-primary'}`}>
            {excludePS_TS && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
          </div>
          <input type="checkbox" checked={excludePS_TS} onChange={(e) => setExcludePS_TS(e.target.checked)} className="hidden" />
          <span className="text-[10px] font-black text-telus-gray uppercase tracking-widest">Exclude PS/TS</span>
        </label>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left: Table */}
        <div className="lg:col-span-2 telus-card p-8 bg-bg-secondary border-border-primary">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
            <h2 className="text-2xl font-black text-telus-gray">Consolidated Service List</h2>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary/60" size={16} />
                <input 
                  type="text" 
                  placeholder="Search services..." 
                  className="pl-10 pr-4 py-2.5 bg-bg-primary border border-border-primary rounded-full text-sm font-bold text-text-secondary focus:ring-2 focus:ring-telus-purple/20 outline-none w-48 sm:w-64 transition-all placeholder:text-text-secondary/30"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <button 
                onClick={() => { setSearchTerm(''); setExcludePS_TS(false); setSelectedCategories(new Set(['All'])); setSortConfig({ key: 'quantity', direction: 'desc' }); }} 
                className="p-2.5 bg-bg-primary hover:bg-telus-purple/10 text-text-secondary hover:text-telus-purple rounded-full transition-colors border border-border-primary"
                title="Reset Filters"
              >
                <RotateCcw size={18} />
              </button>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-[10px] text-text-secondary uppercase tracking-widest bg-bg-primary rounded-2xl">
                <tr>
                  <th className="px-6 py-4 font-black rounded-l-2xl">Service Name</th>
                  <th className="px-6 py-4 font-black">Type</th>
                  <th className="px-6 py-4 font-black relative" ref={categoryRef}>
                    <div className="flex items-center gap-2">
                      <span>Category</span>
                      <button 
                        onClick={() => setIsCategoryOpen(!isCategoryOpen)}
                        className={`p-1.5 rounded-full transition-colors ${!selectedCategories.has('All') ? 'text-telus-purple bg-telus-purple/10' : 'text-text-secondary hover:bg-bg-secondary'}`}
                      >
                        <Filter size={14} />
                      </button>
                    </div>
                    {isCategoryOpen && (
                      <div className="absolute left-0 top-full mt-2 w-56 bg-bg-secondary rounded-[24px] shadow-[0_10px_40px_rgba(75,40,109,0.1)] z-20 overflow-hidden p-3 normal-case font-normal border border-border-primary" data-html2canvas-ignore="true">
                        {categories.map(c => (
                          <label key={c} className="flex items-center space-x-3 px-3 py-2 hover:bg-bg-primary rounded-xl cursor-pointer transition-colors">
                            <div className={`w-4 h-4 rounded flex items-center justify-center transition-colors ${selectedCategories.has(c) ? 'bg-telus-purple' : 'bg-bg-primary border border-border-primary'}`}>
                              {selectedCategories.has(c) && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                            </div>
                            <span className="text-sm font-bold text-text-secondary">{c}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </th>
                  <th className="px-6 py-4 font-black cursor-pointer group" onClick={() => toggleSort('quantity')}>
                    <div className="flex items-center gap-2">
                      <span>Quantity</span>
                      <div className="flex flex-col">
                        <ArrowUp size={10} className={sortConfig.key === 'quantity' && sortConfig.direction === 'asc' ? 'text-telus-purple' : 'text-text-secondary/30'} />
                        <ArrowDown size={10} className={sortConfig.key === 'quantity' && sortConfig.direction === 'desc' ? 'text-telus-purple' : 'text-text-secondary/30'} />
                      </div>
                    </div>
                  </th>
                  <th className="px-6 py-4 font-black cursor-pointer group rounded-r-2xl" onClick={() => toggleSort('price')}>
                    <div className="flex items-center justify-end gap-2">
                      <span>Price</span>
                      <div className="flex flex-col">
                        <ArrowUp size={10} className={sortConfig.key === 'price' && sortConfig.direction === 'asc' ? 'text-telus-purple' : 'text-text-secondary/30'} />
                        <ArrowDown size={10} className={sortConfig.key === 'price' && sortConfig.direction === 'desc' ? 'text-telus-purple' : 'text-text-secondary/30'} />
                      </div>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-primary">
                {paginatedData.map((service, idx) => (
                  <tr key={idx} className="hover:bg-telus-purple/5 transition-colors group">
                    <td className="px-6 py-4 font-bold text-telus-gray flex items-center gap-2" title={service.name}>
                      <span>{service.name}</span>
                    </td>
                    <td className="px-6 py-4 text-text-secondary font-medium">{service.type}</td>
                    <td className="px-6 py-4">
                      <span className="px-3 py-1 bg-bg-primary text-text-secondary text-xs font-bold rounded-full group-hover:bg-bg-secondary transition-colors border border-border-primary">{service.category}</span>
                    </td>
                    <td className="px-6 py-4 font-black text-telus-purple">{service.quantity}</td>
                    <td className="px-6 py-4 font-black text-telus-gray text-right">${Math.round(service.price).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="flex justify-between items-center mt-8 pt-6 border-t border-border-primary">
            <button 
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
              disabled={currentPage === 1}
              className="px-6 py-2.5 rounded-full text-sm font-bold bg-bg-primary text-text-secondary hover:bg-telus-purple/10 hover:text-telus-purple disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-border-primary"
            >
              Previous
            </button>
            <span className="text-sm font-bold text-text-secondary">Page <span className="text-telus-gray">{currentPage}</span> of {totalPages || 1}</span>
            <button 
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
              disabled={currentPage === totalPages || totalPages === 0}
              className="px-6 py-2.5 rounded-full text-sm font-bold bg-bg-primary text-text-secondary hover:bg-telus-purple/10 hover:text-telus-purple disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-border-primary"
            >
              Next
            </button>
          </div>
        </div>

        {/* Right: Charts */}
        <div className="space-y-8">
          <div className="telus-card p-8 bg-bg-secondary border-border-primary">
            <h2 className="text-xl font-black text-telus-gray mb-6">Top 10 Services</h2>
            <div className="h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topServices} layout="vertical" margin={{ left: 20, right: 30, top: 0, bottom: 0 }}>
                  <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--chart-text)', fontWeight: 700 }} axisLine={false} tickLine={false} />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    width={180} 
                    interval={0} 
                    axisLine={false}
                    tickLine={false}
                    tick={({ x, y, payload }) => (
                      <g transform={`translate(${x},${y})`}>
                        <text x={-10} y={0} dy={4} textAnchor="end" fill="var(--chart-text)" fontSize={9} className="font-bold">
                          {payload.value}
                        </text>
                      </g>
                    )}
                  />
                  <Tooltip 
                    cursor={{ fill: 'var(--chart-grid)' }}
                    contentStyle={{ 
                      borderRadius: '16px', 
                      border: 'none', 
                      boxShadow: '0 10px 25px rgba(0,0,0,0.1)', 
                      fontWeight: 'bold',
                      backgroundColor: 'var(--chart-tooltip-bg)',
                      color: 'var(--color-text-primary)'
                    }}
                    itemStyle={{ padding: '2px 0', color: 'var(--color-telus-purple)' }}
                  />
                  <Bar dataKey="value" fill="#D9B0FF" radius={[0, 8, 8, 0]} barSize={20}>
                    {topServices.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index < 3 ? '#4B286D' : '#D9B0FF'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          <div className="telus-card p-8 bg-bg-secondary border-border-primary">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-black text-telus-gray">By Category</h2>
              <div className="flex bg-bg-primary p-1 rounded-xl border border-border-primary">
                <button 
                  onClick={() => setPieMetric('quantity')}
                  className={cn(
                    "px-3 py-1 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all",
                    pieMetric === 'quantity' ? "bg-telus-purple text-white shadow-md" : "text-text-secondary hover:text-telus-purple"
                  )}
                >
                  Qty
                </button>
                <button 
                  onClick={() => setPieMetric('price')}
                  className={cn(
                    "px-3 py-1 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all",
                    pieMetric === 'price' ? "bg-telus-purple text-white shadow-md" : "text-text-secondary hover:text-telus-purple"
                  )}
                >
                  Price
                </button>
              </div>
            </div>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                  <Pie 
                    data={categoryData} 
                    innerRadius={60} 
                    outerRadius={100} 
                    paddingAngle={5} 
                    dataKey="value" 
                    stroke="none"
                    labelLine={false}
                    label={renderCustomizedLabel}
                  >
                    {categoryData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number) => pieMetric === 'price' ? `$${value.toLocaleString()}` : value.toLocaleString()} 
                    contentStyle={{ 
                      borderRadius: '16px', 
                      border: 'none', 
                      boxShadow: '0 10px 25px rgba(0,0,0,0.1)', 
                      fontWeight: 'bold',
                      backgroundColor: 'var(--chart-tooltip-bg)',
                      color: 'var(--color-text-primary)'
                    }}
                    itemStyle={{ color: 'var(--color-text-primary)' }}
                  />
                  <Legend 
                    verticalAlign="bottom" 
                    align="center" 
                    iconType="circle"
                    wrapperStyle={{ fontSize: '11px', fontWeight: 700, paddingTop: '20px' }} 
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </>
  </div>
);
};
