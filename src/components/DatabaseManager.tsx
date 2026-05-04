import React, { useState, useEffect } from 'react';
import { Customer, Partner, SowMetadata } from '../types';
import { CustomerSummary, getRegistryCustomers, saveRegistryCustomer, deleteRegistryCustomer, getRegistryPartners, saveRegistryPartner, deleteRegistryPartner, getRegistrySows, saveRegistrySow, deleteRegistrySow, clearAllRegistries } from '../lib/db';
import { cn } from '../lib/utils';
import { Database, Users, Building2, Upload, Save, Edit2, Plus, X, FileText, Search, Trash2, ShieldCheck, ShieldOff } from 'lucide-react';
import { useToast } from './ui/Toast';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { usePrivacy } from '../contexts/PrivacyContext';
import { CustomerSchema, PartnerSchema, SowMetadataSchema } from '../lib/schemas';
import { z } from 'zod';

interface DatabaseManagerProps {
  savedCustomers?: CustomerSummary[];
}

export const DatabaseManager: React.FC<DatabaseManagerProps> = ({ savedCustomers = [] }) => {
  const { showToast } = useToast();
  const { maskValue, isPrivacyMode } = usePrivacy();
  const [activeView, setActiveView] = useState<'customers' | 'partners' | 'sows'>('customers');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [sows, setSows] = useState<SowMetadata[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newRecord, setNewRecord] = useState<any>({});
  const [confirmClear, setConfirmClear] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setConfirmClear(false);
    setSearchQuery('');
  }, [activeView]);

  useEffect(() => {
    const loadData = async () => {
      // Migration logic
      const savedCustomersLocal = localStorage.getItem('customers');
      const savedPartnersLocal = localStorage.getItem('partners');
      const savedSowsLocal = localStorage.getItem('sows');

      if (savedCustomersLocal || savedPartnersLocal || savedSowsLocal) {
        console.log('Migrating localStorage data to IndexedDB...');
        if (savedCustomersLocal) {
          const parsed = JSON.parse(savedCustomersLocal);
          for (const c of parsed) await saveRegistryCustomer(c);
          localStorage.removeItem('customers');
        }
        if (savedPartnersLocal) {
          const parsed = JSON.parse(savedPartnersLocal);
          for (const p of parsed) await saveRegistryPartner(p);
          localStorage.removeItem('partners');
        }
        if (savedSowsLocal) {
          const parsed = JSON.parse(savedSowsLocal);
          for (const s of parsed) await saveRegistrySow(s);
          localStorage.removeItem('sows');
        }
        showToast('Data migrated to IndexedDB successfully.', 'success');
      }

      const [dbCustomers, dbPartners, dbSows] = await Promise.all([
        getRegistryCustomers(),
        getRegistryPartners(),
        getRegistrySows()
      ]);
      
      setCustomers(dbCustomers as any as Customer[]);
      setPartners(dbPartners as any as Partner[]);
      setSows(dbSows as any as SowMetadata[]);
    };
    loadData();
  }, []);

  // Auto-discover SOWs from analyzed records
  const discoveredSows = React.useMemo(() => {
    const sowMap = new Map<string, { sowName: string, customerName: string }>();
    savedCustomers.forEach(customer => {
      if (customer.result?.customerServices) {
        customer.result.customerServices.forEach(s => {
          if (s.sowName) {
            const cleanName = s.sowName.replace(/^.*?\//, '');
            sowMap.set(cleanName, { sowName: cleanName, customerName: customer.customerName });
          }
        });
      }
      if (customer.result?.changeOrders) {
        customer.result.changeOrders.forEach(co => {
          if (co.associatedSOW) {
            const cleanName = co.associatedSOW.replace(/^.*?\//, '');
            sowMap.set(cleanName, { sowName: cleanName, customerName: customer.customerName });
          }
        });
      }
    });
    return Array.from(sowMap.values());
  }, [savedCustomers]);

  const allSows = React.useMemo(() => {
    const combined = [...sows];
    discoveredSows.forEach(ds => {
      const existingIdx = combined.findIndex(s => s.sowName === ds.sowName);
      if (existingIdx === -1) {
        combined.push({
          id: `discovered-${ds.sowName}`,
          sowName: ds.sowName,
          carNumber: '',
          customerName: ds.customerName
        });
      } else {
        // Update customer name if it's missing in the registry but found in records
        if (!combined[existingIdx].customerName) {
          combined[existingIdx] = { ...combined[existingIdx], customerName: ds.customerName };
        }
      }
    });
    
    if (!searchQuery.trim()) return combined;
    const q = searchQuery.toLowerCase();
    return combined.filter(s => 
      s.sowName.toLowerCase().includes(q) || 
      s.carNumber.toLowerCase().includes(q) ||
      s.customerName?.toLowerCase().includes(q)
    );
  }, [discoveredSows, sows, searchQuery]);

  const filteredCustomers = React.useMemo(() => {
    if (!searchQuery.trim()) return customers;
    const q = searchQuery.toLowerCase();
    return customers.filter(c => 
      c.name.toLowerCase().includes(q) || 
      c.cfnNumber.toLowerCase().includes(q)
    );
  }, [customers, searchQuery]);

  const filteredPartners = React.useMemo(() => {
    if (!searchQuery.trim()) return partners;
    const q = searchQuery.toLowerCase();
    return partners.filter(p => p.name.toLowerCase().includes(q));
  }, [partners, searchQuery]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'customers' | 'partners' | 'sows') => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const rows = text.split(/\r?\n/).filter(row => row.trim());
      const data = rows.slice(1).map(row => {
        // Better CSV split that handles quoted values with commas
        const cols: string[] = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < row.length; i++) {
          const char = row[i];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            cols.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        cols.push(current.trim());

        if (type === 'customers') return { 
          id: Date.now().toString() + Math.random(), 
          cfnNumber: cols[0] || '',
          name: cols[1] || '', 
          billingAddress: cols[2] || '', 
          postalCode: cols[3] || '',
          country: cols[4] || '',
          invoiceEmail: cols[5] || '',
          hardcopy: cols[6] || '',
          wbsCode: cols[7] || '', 
          wbsCodeOTC: cols[8] || '',
          partners: cols[9] || ''
        };
        if (type === 'partners') return { 
          id: Date.now().toString() + Math.random(), 
          name: cols[0] || '', 
          matCodeMRC: cols[1] || '', 
          matCodeOTC: cols[2] || '' 
        };
        return {
          id: Date.now().toString() + Math.random(),
          sowName: cols[0] || '',
          carNumber: cols[1] || '',
          customerName: cols[2] || ''
        };
      }).filter(item => (item as any).name || (item as any).sowName);
      
      if (type === 'customers') {
        const newData = data as any as Customer[];
        for (const item of newData) await saveRegistryCustomer(item);
        setCustomers([...customers, ...newData]);
      } else if (type === 'partners') {
        const newData = data as any as Partner[];
        for (const item of newData) await saveRegistryPartner(item);
        setPartners([...partners, ...newData]);
      } else {
        const newData = data as any as SowMetadata[];
        for (const item of newData) await saveRegistrySow(item);
        setSows([...sows, ...newData]);
      }
      window.dispatchEvent(new Event('registry-updated'));
      showToast(`Successfully imported ${data.length} records.`, 'success');
    };
    reader.readAsText(file);
  };

  const clearData = async (type: 'customers' | 'partners' | 'sows') => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    
    // For simplicity, clearAllRegistries clears everything, but here we might want specific clear
    // Let's implement specific clear if needed, or just clear all for now as per original logic
    if (type === 'customers') {
      const all = await getRegistryCustomers();
      for (const c of all) await deleteRegistryCustomer(c.id);
      setCustomers([]);
    } else if (type === 'partners') {
      const all = await getRegistryPartners();
      for (const p of all) await deleteRegistryPartner(p.id);
      setPartners([]);
    } else {
      const all = await getRegistrySows();
      for (const s of all) await deleteRegistrySow(s.id);
      setSows([]);
    }
    window.dispatchEvent(new Event('registry-updated'));
    showToast(`Cleared all ${type} records.`, 'success');
    setConfirmClear(false);
  };

  const deleteRecord = async (id: string, type: 'customers' | 'partners' | 'sows') => {
    if (type === 'customers') {
      await deleteRegistryCustomer(id);
      setCustomers(customers.filter(c => c.id !== id));
    } else if (type === 'partners') {
      await deleteRegistryPartner(id);
      setPartners(partners.filter(p => p.id !== id));
    } else {
      await deleteRegistrySow(id);
      setSows(sows.filter(s => s.id !== id));
    }
    window.dispatchEvent(new Event('registry-updated'));
    showToast('Record deleted.', 'success');
  };

  const startEdit = (item: any) => {
    setEditingId(item.id);
    setEditForm(item);
  };

  const saveRecord = async (record: any, isNew: boolean = false) => {
    try {
      const finalRecord = isNew ? { ...record, id: Date.now().toString() } : record;
      
      if (activeView === 'customers') {
        CustomerSchema.parse(finalRecord);
        await saveRegistryCustomer(finalRecord);
        if (isNew) {
          setCustomers([...customers, finalRecord]);
        } else {
          setCustomers(customers.map(c => c.id === editingId ? finalRecord : c));
        }
      } else if (activeView === 'partners') {
        PartnerSchema.parse(finalRecord);
        await saveRegistryPartner(finalRecord);
        if (isNew) {
          setPartners([...partners, finalRecord]);
        } else {
          setPartners(partners.map(p => p.id === editingId ? finalRecord : p));
        }
      } else {
        SowMetadataSchema.parse(finalRecord);
        await saveRegistrySow(finalRecord);
        if (isNew) {
          setSows([...sows, finalRecord]);
        } else {
          setSows(sows.map(s => s.id === editingId ? finalRecord : s));
        }
      }
      
      window.dispatchEvent(new Event('registry-updated'));
      showToast(isNew ? 'New record added.' : 'Changes saved.', 'success');
      setEditingId(null);
      setEditForm(null);
      setIsAdding(false);
      setNewRecord({});
    } catch (err) {
      if (err instanceof z.ZodError) {
        showToast(err.issues[0].message, 'error');
      } else {
        console.error('Save error:', err);
        showToast('Failed to save record.', 'error');
      }
    }
  };

  return (
    <div className="space-y-6">
      <Card padding="lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
          <div className="flex items-center">
            <div className="p-3 bg-[#4B286D1A] rounded-2xl mr-4">
              <Database className="w-6 h-6 text-telus-purple" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-telus-gray tracking-tight">
                Database Management
              </h1>
              <p className="text-xs font-bold text-[#2A2C2E66] uppercase tracking-widest mt-0.5">
                Registry & Master Records
              </p>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-[#2A2C2E66]" />
              <input 
                type="text" 
                placeholder={`Search ${activeView}...`} 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-2.5 bg-bg-secondary border border-border-primary rounded-xl text-sm font-bold text-text-primary focus:outline-none focus:ring-2 focus:ring-telus-purple/30 transition-all placeholder:text-text-secondary/50"
              />
            </div>
            <div className="flex p-1 bg-bg-secondary rounded-xl border border-border-primary w-full sm:w-auto">
              <button 
                onClick={() => setActiveView('customers')} 
                className={cn(
                  "flex-1 sm:flex-none px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                  activeView === 'customers' ? "bg-bg-primary text-telus-purple shadow-sm" : "text-text-secondary hover:text-text-primary"
                )}
              >
                <Users className="w-3.5 h-3.5 inline mr-2" /> Customers
              </button>
              <button 
                onClick={() => setActiveView('partners')} 
                className={cn(
                  "flex-1 sm:flex-none px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                  activeView === 'partners' ? "bg-bg-primary text-telus-purple shadow-sm" : "text-text-secondary hover:text-text-primary"
                )}
              >
                <Building2 className="w-3.5 h-3.5 inline mr-2" /> Partners
              </button>
              <button 
                onClick={() => setActiveView('sows')} 
                className={cn(
                  "flex-1 sm:flex-none px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                  activeView === 'sows' ? "bg-bg-primary text-telus-purple shadow-sm" : "text-text-secondary hover:text-text-primary"
                )}
              >
                <FileText className="w-3.5 h-3.5 inline mr-2" /> SOWs
              </button>
            </div>
          </div>
        </div>

        <div className="bg-bg-secondary rounded-2xl border border-border-primary overflow-hidden">
          <div className="px-6 py-4 border-b border-border-primary flex items-center justify-between bg-bg-primary/50">
            <h2 className="text-[10px] font-black text-[#2A2C2E99] uppercase tracking-widest">
              {activeView === 'customers' ? 'Customer Records' : activeView === 'partners' ? 'Partner Records' : 'SOW & CAR Registry'}
            </h2>
            <div className="flex items-center space-x-3">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => clearData(activeView)}
                className={cn(
                  "text-red-500 hover:bg-red-50",
                  confirmClear && "bg-red-600 text-white hover:bg-red-700"
                )}
              >
                <Trash2 className="w-3.5 h-3.5 mr-2" />
                {confirmClear ? 'Confirm Clear?' : 'Clear All'}
              </Button>
              {confirmClear && (
                <Button variant="ghost" size="sm" onClick={() => setConfirmClear(false)}>
                  Cancel
                </Button>
              )}
              <Button size="sm" onClick={() => { setIsAdding(true); setNewRecord({}); }}>
                <Plus className="w-3.5 h-3.5 mr-2" /> Add Manually
              </Button>
              <label className="cursor-pointer">
                <Button variant="outline" size="sm" className="pointer-events-none">
                  <span className="flex items-center">
                    <Upload className="w-3.5 h-3.5 mr-2" /> Bulk Upload
                  </span>
                </Button>
                <input type="file" accept=".csv" className="hidden" onChange={(e) => handleFileUpload(e, activeView)} />
              </label>
            </div>
          </div>
          
          {isAdding && (
            <div className="p-6 bg-bg-secondary border-b border-border-primary grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-top-2 duration-200">
              {activeView === 'customers' 
                ? ['cfnNumber', 'name', 'billingAddress', 'postalCode', 'country', 'invoiceEmail', 'hardcopy', 'wbsCode', 'wbsCodeOTC', 'partners'].map(field => (
                    <Input
                      key={field}
                      label={field === 'cfnNumber' ? 'CFN' : field === 'invoiceEmail' ? 'Email to Send Invoice' : field.replace(/([A-Z])/g, ' $1').trim()}
                      placeholder={`Enter ${field}...`}
                      value={newRecord[field] || ''}
                      onChange={e => setNewRecord({...newRecord, [field]: e.target.value})}
                    />
                  ))
                : activeView === 'partners' 
                ? ['name', 'matCodeMRC', 'matCodeOTC'].map(field => (
                    <Input
                      key={field}
                      label={field === 'matCodeMRC' ? 'MAT Code MRC' : field === 'matCodeOTC' ? 'MAT Code OTC' : field.replace(/([A-Z])/g, ' $1').trim()}
                      placeholder={`Enter ${field}...`}
                      value={newRecord[field] || ''}
                      onChange={e => setNewRecord({...newRecord, [field]: e.target.value})}
                    />
                  ))
                : ['sowName', 'carNumber', 'customerName'].map(field => (
                    <Input
                      key={field}
                      label={field === 'sowName' ? 'SOW Name' : field === 'carNumber' ? 'CAR Number' : 'Customer Name'}
                      placeholder={`Enter ${field}...`}
                      value={newRecord[field] || ''}
                      onChange={e => setNewRecord({...newRecord, [field]: e.target.value})}
                    />
                  ))
              }
              <div className="sm:col-span-2 lg:col-span-3 flex justify-end space-x-3 pt-4 border-t border-[#4B286D0D]">
                <Button variant="ghost" onClick={() => setIsAdding(false)}>Cancel</Button>
                <Button onClick={() => saveRecord(newRecord, true)}>Save Record</Button>
              </div>
            </div>
          )}
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border-primary">
              <thead className="bg-bg-primary/50">
                <tr>
                  {activeView === 'customers' 
                    ? ['CFN', 'Legal Name', 'Address', 'Postal Code', 'Country', 'Email', 'Hardcopy', 'WBS', 'WBS OTC', 'Partners', 'Actions'].map(h => <th key={h} className="px-6 py-4 text-left text-[10px] font-black text-text-secondary uppercase tracking-widest whitespace-nowrap">{h}</th>)
                    : activeView === 'partners'
                    ? ['Name', 'MAT Code MRC', 'MAT Code OTC', 'Actions'].map(h => <th key={h} className="px-6 py-4 text-left text-[10px] font-black text-text-secondary uppercase tracking-widest whitespace-nowrap">{h}</th>)
                    : ['SOW Name', 'Customer Name', 'CAR Number', 'Actions'].map(h => <th key={h} className="px-6 py-4 text-left text-[10px] font-black text-text-secondary uppercase tracking-widest whitespace-nowrap">{h}</th>)
                  }
                </tr>
              </thead>
              <tbody className="divide-y divide-border-primary bg-bg-secondary">
                {activeView === 'customers' ? filteredCustomers.map(c => (
                  <tr key={c.id} className="hover:bg-bg-primary transition-colors">
                    {editingId === c.id ? (
                      <>
                        {['cfnNumber', 'name', 'billingAddress', 'postalCode', 'country', 'invoiceEmail', 'hardcopy', 'wbsCode', 'wbsCodeOTC', 'partners'].map(field => (
                          <td key={field} className="px-6 py-3 min-w-[150px]"><input className="w-full bg-bg-secondary border border-border-primary rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-telus-purple/30" value={editForm[field]} onChange={e => setEditForm({...editForm, [field]: e.target.value})} /></td>
                        ))}
                        <td className="px-6 py-3"><button onClick={() => saveRecord(editForm, false)} className="text-telus-green font-bold text-xs flex items-center hover:text-telus-green/80 transition-colors"><Save className="w-3.5 h-3.5 mr-1.5" /> Save</button></td>
                      </>
                    ) : (
                      <>
                        <td className="px-6 py-4 text-sm font-mono text-slate-400">
                          {maskValue(c.cfnNumber, 'cfn')}
                        </td>
                        <td className="px-6 py-4 text-sm font-bold text-telus-gray">
                          {maskValue(c.name, 'text')}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-500">
                          {maskValue(c.billingAddress, 'text')}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-500">{c.postalCode}</td>
                        <td className="px-6 py-4 text-sm text-slate-500">{c.country}</td>
                        <td className="px-6 py-4 text-sm text-slate-500">
                          {maskValue(c.invoiceEmail, 'email')}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-500">{c.hardcopy}</td>
                        <td className="px-6 py-4 text-sm font-mono text-slate-400">{c.wbsCode}</td>
                        <td className="px-6 py-4 text-sm font-mono text-slate-400">{c.wbsCodeOTC}</td>
                        <td className="px-6 py-4 text-sm text-slate-500">
                          <div className="flex flex-wrap gap-1">
                            {c.partners?.split(',').map((p, i) => (
                              <span key={i} className="bg-[#4B286D0D] text-telus-purple px-2 py-0.5 rounded-full text-[10px] font-bold">
                                {p.trim()}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-3">
                            <button onClick={() => startEdit(c)} className="text-telus-purple font-bold text-xs flex items-center hover:text-[#4B286DCC] transition-colors">
                              <Edit2 className="w-3.5 h-3.5 mr-1.5" /> Edit
                            </button>
                            <button onClick={() => deleteRecord(c.id, 'customers')} className="text-rose-500 font-bold text-xs flex items-center hover:text-rose-600 transition-colors">
                              <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                )) : activeView === 'partners' ? filteredPartners.map(p => (
                  <tr key={p.id} className="hover:bg-bg-primary transition-colors">
                    {editingId === p.id ? (
                      <>
                        {['name', 'matCodeMRC', 'matCodeOTC'].map(field => (
                          <td key={field} className="px-6 py-3"><input className="w-full bg-bg-secondary border border-border-primary rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-telus-purple/30" value={editForm[field]} onChange={e => setEditForm({...editForm, [field]: e.target.value})} /></td>
                        ))}
                        <td className="px-6 py-3"><button onClick={() => saveRecord(editForm, false)} className="text-telus-green font-bold text-xs flex items-center hover:text-telus-green/80 transition-colors"><Save className="w-3.5 h-3.5 mr-1.5" /> Save</button></td>
                      </>
                    ) : (
                      <>
                        <td className="px-6 py-4 text-sm font-bold text-telus-gray">{p.name}</td>
                        <td className="px-6 py-4 text-sm font-mono text-slate-400">{p.matCodeMRC}</td>
                        <td className="px-6 py-4 text-sm font-mono text-slate-400">{p.matCodeOTC}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-3">
                            <button onClick={() => startEdit(p)} className="text-telus-purple font-bold text-xs flex items-center hover:text-[#4B286DCC] transition-colors">
                              <Edit2 className="w-3.5 h-3.5 mr-1.5" /> Edit
                            </button>
                            <button onClick={() => deleteRecord(p.id, 'partners')} className="text-rose-500 font-bold text-xs flex items-center hover:text-rose-600 transition-colors">
                              <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                )) : allSows.map(s => (
                  <tr key={s.id} className="hover:bg-bg-primary transition-colors">
                    {editingId === s.id ? (
                      <>
                        {['sowName', 'customerName', 'carNumber'].map(field => (
                          <td key={field} className="px-6 py-3"><input className="w-full bg-bg-secondary border border-border-primary rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-telus-purple/30" value={editForm[field] || ''} onChange={e => setEditForm({...editForm, [field]: e.target.value})} /></td>
                        ))}
                        <td className="px-6 py-3"><button onClick={() => saveRecord(editForm, false)} className="text-telus-green font-bold text-xs flex items-center hover:text-telus-green/80 transition-colors"><Save className="w-3.5 h-3.5 mr-1.5" /> Save</button></td>
                      </>
                    ) : (
                      <>
                        <td className="px-6 py-4 text-sm font-bold text-telus-gray">{s.sowName}</td>
                        <td className="px-6 py-4 text-sm text-slate-500">{s.customerName || 'N/A'}</td>
                        <td className="px-6 py-4 text-sm font-mono text-slate-400">{s.carNumber || '[Pending]'}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-3">
                            <button onClick={() => startEdit(s)} className="text-telus-purple font-bold text-xs flex items-center hover:text-[#4B286DCC] transition-colors">
                              <Edit2 className="w-3.5 h-3.5 mr-1.5" /> Edit
                            </button>
                            <button onClick={() => deleteRecord(s.id, 'sows')} className="text-rose-500 font-bold text-xs flex items-center hover:text-rose-600 transition-colors">
                              <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    </div>
  );
};
