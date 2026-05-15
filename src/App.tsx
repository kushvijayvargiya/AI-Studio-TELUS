/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { PartnerDropdown } from './components/PartnerDropdown';
import { FileUpload } from './components/FileUpload';
import { ResultsDisplay } from './components/ResultsDisplay';
import { Chatbot } from './components/Chatbot';
import { BillingReport } from './components/BillingReport';
import { BudgetVsActuals } from './components/BudgetVsActuals';
import { DatabaseManager } from './components/DatabaseManager';
import { ContractTimeline } from './components/ContractTimeline';
import { parseZipFile, parseSingleFile, ParsedDocument } from './lib/zipParser';
import { analyzeDocuments, ContractAnalysisResult } from './lib/gemini';
import { saveCustomer, getAllCustomers, deleteCustomer, SavedCustomer, CustomerSummary, getCustomer } from './lib/db';
import { format, addMonths, setYear, getYear } from 'date-fns';
import { calculateRevenueForMonth } from './lib/contractUtils';
import { FileText, AlertTriangle, Database, Search, HardDrive, Trash2, ArrowLeft, Cloud, RefreshCw, XCircle, Clock, Waypoints, TrendingUp, ShieldCheck, BrainCircuit, Sparkles, ChevronDown, ChevronRight, Menu, X, Lock, Unlock } from 'lucide-react';
import { cn, parseAmount } from './lib/utils';
import { usePrivacy } from './contexts/PrivacyContext';

import { PortfolioIntelligence } from './components/PortfolioIntelligence';
import { ProductIntelligenceDashboard } from './components/ProductIntelligenceDashboard';
import { SmartDashboard } from './components/SmartDashboard';
import { WatchFolder } from './components/WatchFolder';
import { RulesInfo } from './components/RulesInfo';

import { SkeletonCard } from './components/ui/Skeleton';
import { saveAuditLog } from './lib/db';

export type UserRole = 'ADMIN' | 'EDITOR' | 'VIEWER';

export default function App() {
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Role management
  const [userRole, setUserRole] = useState<UserRole>(() => {
    const saved = localStorage.getItem('axon_user_role');
    return (saved as UserRole) || 'ADMIN';
  });

  useEffect(() => {
    localStorage.setItem('axon_user_role', userRole);
  }, [userRole]);

  // State for active view
  const [activeCustomer, setActiveCustomer] = useState<SavedCustomer | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'new' | 'timeline' | 'billing' | 'budget-vs-actuals' | 'intelligence-portfolio' | 'intelligence-marketing' | 'intelligence-analytics' | 'database' | 'smart-insights' | 'rules'>('dashboard');
  const [resultsInitialTab, setResultsInitialTab] = useState<'overview' | 'monthly_billing' | 'timeline' | 'evolution' | 'intelligence' | 'margin_analysis' | 'risk_dashboard' | 'revenue_forecast' | 'daf'>('overview');
  const [savedCustomers, setSavedCustomers] = useState<CustomerSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPartner, setSelectedPartner] = useState<string>('All Partners');
  const [customerToDelete, setCustomerToDelete] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isChatbotUploading, setIsChatbotUploading] = useState(false);
  const [isChatbotExpanded, setIsChatbotExpanded] = useState(true);

  useEffect(() => {
    loadSavedCustomers();
    const isDark = localStorage.getItem('axon_dark_mode') === 'true';
    if (isDark) {
      document.documentElement.classList.add('dark');
    }
  }, []);

  const loadSavedCustomers = async () => {
    try {
      const customers = await getAllCustomers();
      // Map partner names
      const mappedCustomers = customers.map(c => {
        let partnerName = c.partnerName || 'Jolera';
        const lowerPartner = partnerName.toLowerCase();
        if (c.customerName === 'Felix Scholler' || lowerPartner.includes('group informatique') || lowerPartner.includes('present')) {
          partnerName = 'Present';
        }
        return { ...c, partnerName };
      });
      // Sort by newest first
      setSavedCustomers(mappedCustomers.sort((a, b) => b.createdAt - a.createdAt));
    } catch (err) {
      console.error("Failed to load saved customers:", err);
      setError("Failed to load your local contract data. Please try refreshing or checking browser storage permissions.");
    }
  };

  const handleRefresh = async () => {
    if (!activeCustomer) return;

    if (!activeCustomer.documents || activeCustomer.documents.length === 0) {
      setError("No documents available to analyze.");
      return;
    }

    setIsRefreshing(true);
    setError(null);

    try {
      // Re-send existing documents to Gemini for analysis
      const analysisResult = await analyzeDocuments(activeCustomer.documents);
      
      // Update in database
      const updatedCustomer: SavedCustomer = {
        ...activeCustomer,
        customerName: analysisResult.customerName || activeCustomer.customerName,
        result: analysisResult,
        createdAt: Date.now() // Update timestamp to show it was refreshed
      };
      
      await saveCustomer(updatedCustomer);
      await loadSavedCustomers();
      
      // Update active view
      setActiveCustomer(updatedCustomer);
      setResultsInitialTab('overview');
    } catch (err) {
      console.error("Refresh error:", err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred during refresh.");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleChatbotFileUpload = async (file: File) => {
    if (!activeCustomer) return;
    
    setIsChatbotUploading(true);
    setError(null);
    try {
      // 1. Parse the single file
      const newDocs = await parseSingleFile(file);
      if (newDocs.length === 0) {
        throw new Error("Unable to read the uploaded document.");
      }
      
      const updatedDocuments = [...activeCustomer.documents, ...newDocs];
      
      // 2. Re-analyze with new documents
      const analysisResult = await analyzeDocuments(updatedDocuments);
      
      // Update partnerName constraint
      let partnerName = analysisResult.partnerName || activeCustomer.result.partnerName || 'Jolera';
      if (analysisResult.customerName === 'Felix Scholler' || partnerName.toLowerCase().includes('group informatique') || partnerName.toLowerCase().includes('present')) {
        partnerName = 'Present';
      }
      analysisResult.partnerName = partnerName;
      
      const updatedCustomer: SavedCustomer = {
        ...activeCustomer,
        customerName: analysisResult.customerName || activeCustomer.customerName,
        createdAt: Date.now(),
        result: analysisResult,
        documents: updatedDocuments
      };
      
      await saveCustomer(updatedCustomer);
      await loadSavedCustomers();
      
      setActiveCustomer(updatedCustomer);
    } catch (err) {
      console.error("Single file upload error:", err);
      setError(err instanceof Error ? err.message : "Failed to process the uploaded file.");
    } finally {
      setIsChatbotUploading(false);
    }
  };

  const handleFileSelect = async (file: File, existingCustomerId?: string) => {
    setIsLoading(true);
    setError(null);
    
    // Pre-flight validation
    if (file.size > 50 * 1024 * 1024) { // 50MB limit
      setError("File is too large. Please upload a ZIP file smaller than 50MB.");
      setIsLoading(false);
      return;
    }

    if (!file.name.toLowerCase().endsWith('.zip')) {
      setError("Invalid file format. Please upload a ZIP file containing your contract documents.");
      setIsLoading(false);
      return;
    }

    let existingCustomer: SavedCustomer | undefined;
    if (existingCustomerId) {
      existingCustomer = await getCustomer(existingCustomerId);
    }

    if (!existingCustomerId) {
      setActiveCustomer(null);
    }

    try {
      // 1. Parse the ZIP file
      const parsedDocs = await parseZipFile(file);
      
      if (parsedDocs.length === 0) {
        throw new Error("No supported documents found in the ZIP file. Please ensure it contains PDFs, Word documents, or text files.");
      }

      // 2. Send to Gemini for analysis
      const analysisResult = await analyzeDocuments(parsedDocs);
      
      // Override partnerName based on customerName
      let partnerName = analysisResult.partnerName || 'Jolera';
      const lowerPartner = partnerName.toLowerCase();
      if (analysisResult.customerName === 'Felix Scholler' || lowerPartner.includes('group informatique') || lowerPartner.includes('present')) {
        partnerName = 'Present';
      }
      
      // 3. Save to database
      const customerId = existingCustomerId || crypto.randomUUID();
      const customerData: SavedCustomer = {
        id: customerId,
        customerName: analysisResult.customerName || (existingCustomer?.customerName || 'Unknown Customer'),
        createdAt: existingCustomer?.createdAt || Date.now(),
        result: { ...analysisResult, partnerName },
        documents: parsedDocs
      };
      
      await saveCustomer(customerData);
      
      // Create Audit Log
      await saveAuditLog({
        id: crypto.randomUUID(),
        customerId,
        timestamp: Date.now(),
        userEmail: 'kushagra.vijayvargiya@telus.com',
        action: existingCustomerId ? 'RE_ANALYZE_CONTRACT' : 'NEW_CONTRACT_ANALYSIS',
        details: `Analyzed ${parsedDocs.length} documents for ${customerData.customerName}`,
        month: format(new Date(), 'yyyy-MM')
      });

      await loadSavedCustomers();
      
      // 4. Display results
      setActiveCustomer(customerData);
      setResultsInitialTab('overview');
    } catch (err) {
      console.error("Analysis error:", err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred during analysis.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteCustomer = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCustomerToDelete(id);
  };

  const confirmDeleteCustomer = async () => {
    if (customerToDelete) {
      await deleteCustomer(customerToDelete);
      await loadSavedCustomers();
      if (activeCustomer?.id === customerToDelete) {
        setActiveCustomer(null);
      }
      setCustomerToDelete(null);
    }
  };

  const handleUpdateResult = async (updatedResult: ContractAnalysisResult) => {
    if (!activeCustomer) return;
    
    // Ensure partnerName is mapped correctly
    const partnerName = updatedResult.customerName === 'Felix Scholler' ? 'Present' : (updatedResult.partnerName || 'Jolera');
    const resultWithPartner = { ...updatedResult, partnerName };
    
    const updatedCustomer = { ...activeCustomer, result: resultWithPartner };
    setActiveCustomer(updatedCustomer);
    await saveCustomer(updatedCustomer);
    await loadSavedCustomers();
  };

  const uniquePartners = ['All Partners', 'Jolera', 'Present'];

  const filteredCustomers = savedCustomers.filter(c => {
    const matchesSearch = c.customerName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPartner = selectedPartner === 'All Partners' || c.partnerName === selectedPartner;
    return matchesSearch && matchesPartner;
  });

  const totalDocuments = savedCustomers.reduce((acc, curr) => acc + curr.documentCount, 0);
  
  const currentMonthRevenue = useMemo(() => {
    const now = new Date();
    return savedCustomers.reduce((acc, customer) => {
      if (!customer.result) return acc;
      // Assume 'Customer' facing for dashboard revenue
      return acc + calculateRevenueForMonth(customer.result, now, 'Customer');
    }, 0);
  }, [savedCustomers]);

  const { isPrivacyMode, togglePrivacyMode } = usePrivacy();

  return (
    <div className="min-h-screen bg-bg-primary text-telus-gray font-sans selection:bg-telus-purple/10 selection:text-telus-purple">
      {/* Delete Confirmation Modal */}
      {customerToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-bg-secondary rounded-2xl shadow-2xl max-w-md w-full p-8 animate-in zoom-in-95 duration-200 border border-border-primary">
            <div className="w-12 h-12 bg-rose-500/10 rounded-full flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6 text-rose-600" />
            </div>
            <h3 className="text-xl font-bold text-telus-gray mb-2">Delete Customer Data</h3>
            <p className="text-text-secondary mb-8 leading-relaxed">Are you sure you want to delete this customer's data? This action is permanent and cannot be undone.</p>
            <div className="flex justify-end space-x-3">
              <button 
                onClick={() => setCustomerToDelete(null)}
                className="px-6 py-2.5 text-sm font-bold text-text-secondary hover:bg-bg-primary rounded-full transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDeleteCustomer}
                className="px-6 py-2.5 text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-full transition-all shadow-sm hover:shadow-md"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Bar */}
      <div className="fixed top-20 left-0 w-full z-[90] px-4 md:px-10">
        {error && (
          <div className="max-w-4xl mx-auto mt-4 p-4 bg-rose-500/10 text-rose-600 rounded-2xl border border-rose-500/20 flex items-center justify-between shadow-lg">
            <div className="flex items-center">
              <AlertTriangle className="w-5 h-5 mr-3" />
              <p className="text-sm font-bold">{error}</p>
            </div>
            <button onClick={() => setError(null)}><X className="w-5 h-5" /></button>
          </div>
        )}
      </div>

      <nav className="bg-bg-secondary/95 backdrop-blur-md border-b border-border-primary fixed top-0 left-0 w-full z-[100] shadow-[0_10px_40px_rgba(75,40,109,0.05)] h-20">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-10 h-full flex items-center justify-between">
          
          {/* Left: Logo/Back Section */}
          <div className="flex items-center min-w-[240px]">
            {activeCustomer ? (
              <button 
                onClick={() => setActiveCustomer(null)}
                className="flex items-center text-xs font-black text-telus-purple hover:bg-telus-purple/10 transition-all bg-bg-secondary px-5 py-2.5 rounded-full border border-border-primary shadow-sm group"
              >
                <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
                BACK TO DASHBOARD
              </button>
            ) : (
              <div className="flex items-center space-x-3 cursor-pointer group" onClick={() => { setActiveCustomer(null); setActiveTab('dashboard'); }}>
                <div className="relative flex items-center justify-center w-12 h-12 rounded-xl bg-white shadow-sm ring-1 ring-border-primary group-hover:shadow-md group-hover:-translate-y-0.5 transition-all duration-300 overflow-hidden">
                  <img src="/telus-logo.png" alt="TELUS" className="w-full h-full object-contain p-1" />
                </div>
                <div className="flex flex-col">
                  <span className="font-extrabold text-xl tracking-tight text-telus-purple leading-none">AXON</span>
                </div>
              </div>
            )}
          </div>

          {/* Center: Navigation Tabs */}
          <div className="flex-1 flex justify-center px-4">
            <div className="hidden md:flex items-center space-x-1">
              
              {/* Insights Dropdown */}
              <div className="relative group">
                <button 
                  onClick={() => { setActiveCustomer(null); setActiveTab('dashboard'); }}
                  className={`px-6 py-2.5 rounded-full text-sm font-black transition-all duration-200 flex items-center ${activeTab.startsWith('intelligence') || activeTab === 'dashboard' || activeTab === 'smart-insights' ? 'text-telus-purple bg-telus-purple/10' : 'text-text-secondary hover:text-telus-purple hover:bg-bg-secondary'}`}
                >
                  Insights <ChevronDown className="w-4 h-4 ml-1 group-hover:rotate-180 transition-transform" />
                </button>
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-64 bg-bg-secondary/95 backdrop-blur-md rounded-2xl shadow-[0_20px_50px_rgba(75,40,109,0.15)] border border-border-primary py-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-[110] translate-y-2 group-hover:translate-y-0">
                  <button onClick={() => { setActiveCustomer(null); setActiveTab('dashboard'); }} className="w-full text-left px-6 py-3 text-sm font-black text-text-secondary hover:bg-bg-primary hover:text-telus-purple transition-colors">Dashboard</button>
                  <button onClick={() => { setActiveCustomer(null); setActiveTab('smart-insights'); }} className="w-full text-left px-6 py-3 text-sm font-black text-text-secondary hover:bg-bg-primary hover:text-telus-purple transition-colors flex items-center">
                    <Sparkles className="w-4 h-4 mr-2 text-telus-purple" />
                    Smart Insights
                  </button>
                  
                  {/* Nested Portfolio Dropdown */}
                  <div className="relative group/portfolio">
                    <button 
                      onClick={() => { setActiveCustomer(null); setActiveTab('intelligence-portfolio'); }}
                      className="w-full text-left px-6 py-3 text-sm font-black text-text-secondary hover:bg-bg-primary hover:text-telus-purple transition-colors flex items-center justify-between"
                    >
                      Portfolio <ChevronRight className="w-4 h-4" />
                    </button>
                    <div className="absolute left-full top-0 ml-2 w-48 bg-bg-secondary/95 backdrop-blur-md rounded-2xl shadow-[0_20px_50px_rgba(75,40,109,0.15)] border border-border-primary py-3 opacity-0 invisible group-hover/portfolio:opacity-100 group-hover/portfolio:visible transition-all z-[120] translate-x-2 group-hover/portfolio:translate-x-0">
                      <button onClick={() => { setActiveCustomer(null); setActiveTab('intelligence-portfolio'); }} className="w-full text-left px-6 py-3 text-sm font-black text-text-secondary hover:bg-bg-primary hover:text-telus-purple transition-colors">Overview</button>
                      <button onClick={() => { setActiveCustomer(null); setActiveTab('intelligence-marketing'); }} className="w-full text-left px-6 py-3 text-sm font-black text-text-secondary hover:bg-bg-primary hover:text-telus-purple transition-colors">Marketing Analytics</button>
                      <button onClick={() => { setActiveCustomer(null); setActiveTab('intelligence-analytics'); }} className="w-full text-left px-6 py-3 text-sm font-black text-text-secondary hover:bg-bg-primary hover:text-telus-purple transition-colors">Product Intelligence</button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Analyze Dropdown */}
              <div className="relative group">
                <button className={`px-6 py-2.5 rounded-full text-sm font-black transition-all duration-200 flex items-center ${activeTab === 'new' || activeTab === 'timeline' ? 'text-telus-purple bg-telus-purple/10' : 'text-text-secondary hover:text-telus-purple hover:bg-bg-secondary'}`}>
                  Analyze <ChevronDown className="w-4 h-4 ml-1 group-hover:rotate-180 transition-transform" />
                </button>
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-64 bg-bg-secondary/95 backdrop-blur-md rounded-2xl shadow-[0_20px_50px_rgba(75,40,109,0.15)] border border-border-primary py-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-[110] translate-y-2 group-hover:translate-y-0">
                  <button onClick={() => { setActiveCustomer(null); setActiveTab('new'); }} className="w-full text-left px-6 py-3 text-sm font-black text-text-secondary hover:bg-bg-primary hover:text-telus-purple transition-colors">New Analysis</button>
                  <button onClick={() => { setActiveCustomer(null); setActiveTab('timeline'); }} className="w-full text-left px-6 py-3 text-sm font-black text-text-secondary hover:bg-bg-primary hover:text-telus-purple transition-colors">Combined Timeline</button>
                </div>
              </div>

              {/* Manage Dropdown */}
              <div className="relative group">
                <button className={`px-6 py-2.5 rounded-full text-sm font-black transition-all duration-200 flex items-center ${activeTab === 'billing' || activeTab === 'budget-vs-actuals' || activeTab === 'database' ? 'text-telus-purple bg-telus-purple/10' : 'text-text-secondary hover:text-telus-purple hover:bg-bg-secondary'}`}>
                  Manage <ChevronDown className="w-4 h-4 ml-1 group-hover:rotate-180 transition-transform" />
                </button>
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-64 bg-bg-secondary/95 backdrop-blur-md rounded-2xl shadow-[0_20px_50px_rgba(75,40,109,0.15)] border border-border-primary py-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-[110] translate-y-2 group-hover:translate-y-0">
                  <button onClick={() => { setActiveCustomer(null); setActiveTab('billing'); }} className="w-full text-left px-6 py-3 text-sm font-black text-text-secondary hover:bg-bg-primary hover:text-telus-purple transition-colors">Billing</button>
                  <button onClick={() => { setActiveCustomer(null); setActiveTab('budget-vs-actuals'); }} className="w-full text-left px-6 py-3 text-sm font-black text-text-secondary hover:bg-bg-primary hover:text-telus-purple transition-colors">Budget vs Actuals</button>
                  <button onClick={() => { setActiveCustomer(null); setActiveTab('database'); }} className="w-full text-left px-6 py-3 text-sm font-black text-text-secondary hover:bg-bg-primary hover:text-telus-purple transition-colors">Database</button>
                  <button onClick={() => { setActiveCustomer(null); setActiveTab('rules'); }} className="w-full text-left px-6 py-3 text-sm font-black text-text-secondary hover:bg-bg-primary hover:text-telus-purple transition-colors border-t border-border-primary/50 mt-2 pt-4">System Rules</button>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Actions Section */}
          <div className="flex items-center space-x-4 min-w-[200px] justify-end">
            {/* Mobile Menu Toggle */}
            <button 
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 text-telus-purple hover:bg-[#4B286D0D] rounded-xl transition-all"
            >
              {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>

            <button 
              className="group flex items-center space-x-2 text-sm font-bold text-telus-purple bg-[#4B286D0D] hover:bg-[#4B286D1A] transition-all px-5 py-2.5 rounded-full border border-[#4B286D1A]"
              onClick={() => alert("Google Drive integration coming soon!")}
            >
              <Cloud className="w-4 h-4" />
              <span className="hidden sm:inline">Import</span>
            </button>

            {/* Settings Dropdown */}
            <div className="relative group/settings">
              <div className="hidden sm:flex items-center justify-center w-10 h-10 rounded-full border border-border-primary bg-bg-secondary text-telus-purple font-bold text-sm cursor-pointer hover:border-telus-purple transition-colors shadow-sm">
                KV
              </div>
              <div className="absolute top-full right-0 mt-2 w-48 bg-bg-secondary/95 backdrop-blur-md rounded-2xl shadow-[0_20px_50px_rgba(75,40,109,0.15)] border border-border-primary py-2 opacity-0 invisible group-hover/settings:opacity-100 group-hover/settings:visible transition-all z-[130] translate-y-2 group-hover/settings:translate-y-0 overflow-hidden">
                {/* Privacy Mode */}
                <button 
                  onClick={togglePrivacyMode}
                  className="w-full text-left px-4 py-2 text-[10px] font-bold text-text-secondary hover:bg-bg-primary hover:text-telus-purple flex items-center justify-between"
                >
                  Privacy Mode {isPrivacyMode ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                </button>
                
                {/* Dark Mode */}
                <button 
                  onClick={() => {
                    const isDark = document.documentElement.classList.toggle('dark');
                    localStorage.setItem('axon_dark_mode', isDark ? 'true' : 'false');
                  }}
                  className="w-full text-left px-4 py-2 text-[10px] font-bold text-text-secondary hover:bg-bg-primary hover:text-telus-purple flex items-center justify-between"
                >
                  Dark Mode <span className="w-3 h-3 rounded-full bg-slate-800"></span>
                </button>

                {/* Role Switcher */}
                <div className="border-t border-[#4B286D1A] my-1"></div>
                <p className="px-4 py-1 text-[9px] font-black text-[#2A2C2E66] uppercase tracking-widest">Role</p>
                {(['ADMIN', 'EDITOR', 'VIEWER'] as UserRole[]).map(role => (
                  <button 
                    key={role}
                    onClick={() => setUserRole(role)}
                    className={cn(
                      "w-full text-left px-4 py-2 text-[10px] font-bold transition-colors",
                      userRole === role ? "text-telus-purple bg-[#4B286D0D]" : "text-slate-500 hover:bg-slate-50"
                    )}
                  >
                    {role}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[90] bg-bg-secondary pt-24 px-6 animate-in slide-in-from-top duration-300 md:hidden overflow-y-auto">
          <div className="space-y-8 pb-10">
            <div className="space-y-4">
              <p className="text-[10px] font-black text-text-secondary/50 uppercase tracking-widest px-4">Insights</p>
              <button onClick={() => { setActiveCustomer(null); setActiveTab('dashboard'); setIsMobileMenuOpen(false); }} className="w-full text-left px-6 py-4 text-lg font-bold text-text-secondary hover:bg-bg-primary hover:text-telus-purple rounded-2xl transition-all">Dashboard</button>
              <button onClick={() => { setActiveCustomer(null); setActiveTab('smart-insights'); setIsMobileMenuOpen(false); }} className="w-full text-left px-6 py-4 text-lg font-bold text-text-secondary hover:bg-bg-primary hover:text-telus-purple rounded-2xl transition-all flex items-center">
                <Sparkles className="w-5 h-5 mr-3 text-telus-purple" />
                Smart Insights
              </button>
              <div className="pl-6 space-y-2">
                <p className="text-[10px] font-black text-text-secondary/30 uppercase tracking-widest px-4">Portfolio</p>
                <button onClick={() => { setActiveCustomer(null); setActiveTab('intelligence-portfolio'); setIsMobileMenuOpen(false); }} className="w-full text-left px-6 py-3 text-base font-bold text-text-secondary hover:text-telus-purple transition-all">Overview</button>
                <button onClick={() => { setActiveCustomer(null); setActiveTab('intelligence-marketing'); setIsMobileMenuOpen(false); }} className="w-full text-left px-6 py-3 text-base font-bold text-text-secondary hover:text-telus-purple transition-all">Marketing Analytics</button>
                <button onClick={() => { setActiveCustomer(null); setActiveTab('intelligence-analytics'); setIsMobileMenuOpen(false); }} className="w-full text-left px-6 py-3 text-base font-bold text-text-secondary hover:text-telus-purple transition-all">Product Intelligence</button>
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-[10px] font-black text-text-secondary/50 uppercase tracking-widest px-4">Analyze</p>
              <button onClick={() => { setActiveCustomer(null); setActiveTab('new'); setIsMobileMenuOpen(false); }} className="w-full text-left px-6 py-4 text-lg font-bold text-text-secondary hover:bg-bg-primary hover:text-telus-purple rounded-2xl transition-all">New Analysis</button>
              <button onClick={() => { setActiveCustomer(null); setActiveTab('timeline'); setIsMobileMenuOpen(false); }} className="w-full text-left px-6 py-4 text-lg font-bold text-text-secondary hover:bg-bg-primary hover:text-telus-purple rounded-2xl transition-all">Combined Timeline</button>
            </div>

            <div className="space-y-4">
              <p className="text-[10px] font-black text-text-secondary/50 uppercase tracking-widest px-4">Manage</p>
              <button onClick={() => { setActiveCustomer(null); setActiveTab('billing'); setIsMobileMenuOpen(false); }} className="w-full text-left px-6 py-4 text-lg font-bold text-text-secondary hover:bg-bg-primary hover:text-telus-purple rounded-2xl transition-all">Billing</button>
              <button onClick={() => { setActiveCustomer(null); setActiveTab('budget-vs-actuals'); setIsMobileMenuOpen(false); }} className="w-full text-left px-6 py-4 text-lg font-bold text-text-secondary hover:bg-bg-primary hover:text-telus-purple rounded-2xl transition-all">Budget vs Actuals</button>
              <button onClick={() => { setActiveCustomer(null); setActiveTab('database'); setIsMobileMenuOpen(false); }} className="w-full text-left px-6 py-4 text-lg font-bold text-text-secondary hover:bg-bg-primary hover:text-telus-purple rounded-2xl transition-all">Database</button>
              <button onClick={() => { setActiveCustomer(null); setActiveTab('rules'); setIsMobileMenuOpen(false); }} className="w-full text-left px-6 py-4 text-lg font-bold text-text-secondary hover:bg-bg-primary hover:text-telus-purple rounded-2xl transition-all border-t border-border-primary/50 mt-2">System Rules</button>
            </div>
          </div>
        </div>
      )}

      <div className="w-full px-4 pt-32 pb-20 sm:px-6 lg:px-10 bg-bg-primary min-h-screen">
        
        {/* Main Views */}
        {!activeCustomer && (
          <div className="space-y-16 animate-in fade-in duration-700">
            {/* Header */}
            <div className="text-center max-w-4xl mx-auto pt-8 flex flex-col items-center">
              <div className="mb-6 text-telus-purple uppercase tracking-[0.2em] text-xs font-bold leading-tight flex items-center justify-center bg-telus-purple/10 px-4 py-1.5 rounded-full border border-telus-purple/20">
                <Sparkles className="w-3.5 h-3.5 mr-2 text-telus-purple" />
                AI-Powered Contract Intelligence
              </div>
              <h1 className="text-5xl sm:text-7xl font-extrabold tracking-tight text-telus-gray mb-8 leading-tight">
                Analyze & Manage <br/><span className="text-telus-purple">Your Contracts</span>
              </h1>
              <p className="max-w-2xl text-xl text-text-secondary leading-relaxed mx-auto">
                Transform complex Statements of Work (SOW) and Change Orders into actionable insights with our Advanced eXtraction of Obligations and Negotiations (AXON) engine.
              </p>
            </div>

            <div className="w-full">
              {/* Rules Info Section */}
              {activeTab === 'rules' && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <RulesInfo />
                </div>
              )}

              {/* Upload Section */}
              {activeTab === 'new' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300 max-w-5xl mx-auto">
                  <div className="telus-card p-10">
                    <h2 className="text-2xl font-bold text-telus-gray mb-8 flex items-center justify-center">
                      <HardDrive className="w-6 h-6 mr-3 text-telus-green" />
                      Upload New Contract
                    </h2>
                    <FileUpload onFileSelect={handleFileSelect} isLoading={isLoading} />
                    
                    {error && (
                      <div className="mt-8 p-5 bg-[#EF44440D] border border-[#EF444433] rounded-2xl flex items-start space-x-4 text-red-800">
                        <AlertTriangle className="w-6 h-6 shrink-0 mt-0.5 text-red-500" />
                        <div>
                          <h3 className="text-sm font-bold text-red-900">Analysis Failed</h3>
                          <p className="text-sm text-red-700 mt-1.5 leading-relaxed">{error}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Billing Report Section */}
              {activeTab === 'billing' && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <BillingReport customers={savedCustomers} />
                </div>
              )}

              {/* Budget vs Actuals Section */}
              {activeTab === 'budget-vs-actuals' && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 max-w-[1600px] mx-auto">
                  <BudgetVsActuals customers={savedCustomers} />
                </div>
              )}

              {/* Combined Timeline Section */}
              {activeTab === 'timeline' && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 max-w-[1600px] mx-auto">
                  <ContractTimeline customers={savedCustomers} />
                </div>
              )}

              {/* Database Manager Section */}
              {activeTab === 'database' && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <DatabaseManager savedCustomers={savedCustomers} />
                </div>
              )}

              {/* Intelligence Section */}
              {activeTab === 'smart-insights' && (
                <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-300 max-w-[1600px] mx-auto">
                  <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 max-w-[1600px] mx-auto">
                    <div className="text-center md:text-left flex-1">
                      <h2 className="text-4xl font-extrabold tracking-tight text-telus-gray sm:text-5xl mb-4 leading-tight">
                        Smart <span className="text-telus-purple">Insights</span>
                      </h2>
                      <p className="text-lg text-slate-600 leading-relaxed max-w-2xl">
                        AI-powered portfolio analytics and natural language data exploration across all customer contracts.
                      </p>
                    </div>
                  </div>
                  <SmartDashboard customers={savedCustomers} />
                </div>
              )}

              {activeTab.startsWith('intelligence') && (
                <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-300 max-w-[1600px] mx-auto">
                  <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 max-w-[1600px] mx-auto">
                    <div className="text-center md:text-left flex-1">
                      <h2 className="text-4xl font-extrabold tracking-tight text-telus-gray sm:text-5xl mb-4 leading-tight">
                        Portfolio <span className="text-telus-purple">
                          {activeTab === 'intelligence-portfolio' ? 'Overview' : 
                           activeTab === 'intelligence-marketing' ? 'Marketing' : 'Intelligence'}
                        </span>
                      </h2>
                      <p className="text-lg text-slate-600 leading-relaxed max-w-2xl">
                        {activeTab === 'intelligence-portfolio' && "Strategic automation framework for proactive revenue intelligence and portfolio-wide risk management."}
                        {activeTab === 'intelligence-marketing' && "Advanced marketing analytics to identify upsell, cross-sell, and growth opportunities across your portfolio."}
                        {activeTab === 'intelligence-analytics' && "Deep-dive product intelligence and intensity metrics to understand service adoption and health."}
                      </p>
                    </div>
                    <div className="w-full md:w-48 shrink-0">
                      <p className="text-[10px] font-black text-[#2A2C2E66] uppercase tracking-widest mb-2 px-1">Filter by Partner</p>
                      <PartnerDropdown
                        value={selectedPartner}
                        onChange={setSelectedPartner}
                        options={uniquePartners}
                      />
                    </div>
                  </div>
                  
                  {(activeTab === 'intelligence-portfolio' || activeTab === 'intelligence-marketing') && (
                    <PortfolioIntelligence 
                      customers={filteredCustomers} 
                      view={activeTab === 'intelligence-portfolio' ? 'portfolio' : 
                            activeTab === 'intelligence-marketing' ? 'marketing' : 'analytics'} 
                      onViewChange={(view) => {
                        if (view === 'portfolio') setActiveTab('intelligence-portfolio');
                        else if (view === 'marketing') setActiveTab('intelligence-marketing');
                        else if (view === 'analytics') setActiveTab('intelligence-analytics');
                      }}
                      onSelectCustomer={async (customer) => {
                        setIsLoading(true);
                        const fullCustomer = await getCustomer(customer.id);
                        if (fullCustomer) {
                          setActiveCustomer(fullCustomer);
                          setResultsInitialTab('intelligence');
                          setActiveTab('dashboard');
                        }
                        setIsLoading(false);
                      }}
                    />
                  )}

                  {activeTab === 'intelligence-analytics' && (
                    <ProductIntelligenceDashboard customers={filteredCustomers} />
                  )}

                  {activeTab === 'intelligence-portfolio' && (
                    <>
                      {/* Renewal Health Strategy Section */}
                      <div className="w-full telus-card p-8 max-w-[1600px] mx-auto bg-bg-secondary border-border-primary">
                        <div className="flex items-center space-x-3 mb-6">
                          <div className="p-2 bg-[#1e0027] rounded-lg border border-border-primary">
                            <ShieldCheck className="w-5 h-5 text-telus-green" />
                          </div>
                          <div>
                            <h3 className="text-lg font-bold text-text-primary">Renewal Health Strategy</h3>
                            <p className="text-sm text-text-secondary font-medium italic">How we assess the probability of a successful renewal</p>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                          <div className="p-4 rounded-2xl bg-bg-primary border border-border-primary">
                            <div className="text-2xl font-black text-text-primary mb-1">40%</div>
                            <div className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-2">Contract Expiry</div>
                            <p className="text-xs text-text-secondary leading-relaxed">Proximity to end date and notice period compliance.</p>
                          </div>
                          <div className="p-4 rounded-2xl bg-bg-primary border border-border-primary">
                            <div className="text-2xl font-black text-text-primary mb-1">30%</div>
                            <div className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-2">Product Intensity</div>
                            <p className="text-xs text-text-secondary leading-relaxed">Depth of feature adoption and active user growth trends.</p>
                          </div>
                          <div className="p-4 rounded-2xl bg-bg-primary border border-border-primary">
                            <div className="text-2xl font-black text-text-primary mb-1">20%</div>
                            <div className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-2">Billing Health</div>
                            <p className="text-xs text-text-secondary leading-relaxed">Payment consistency, margin leakage, and upsell history.</p>
                          </div>
                          <div className="p-4 rounded-2xl bg-bg-primary border border-border-primary">
                            <div className="text-2xl font-black text-text-primary mb-1">10%</div>
                            <div className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-2">Risk Flags</div>
                            <p className="text-xs text-text-secondary leading-relaxed">Manual overrides, support escalations, and sentiment analysis.</p>
                          </div>
                        </div>
                      </div>
                      
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <WatchFolder />
                        <div className="bg-bg-secondary p-8 rounded-3xl shadow-xl relative overflow-hidden group border border-border-primary">
                          <div className="absolute top-0 right-0 w-64 h-64 bg-telus-purple/5 rounded-bl-full -z-10 transition-transform group-hover:scale-110"></div>
                          <h3 className="text-xl font-black text-text-primary mb-6 flex items-center">
                            <TrendingUp className="w-6 h-6 mr-3 text-telus-purple" />
                            Executive Summary
                          </h3>
                          <div className="space-y-6 text-text-secondary">
                            <div className="p-4 rounded-2xl bg-bg-primary/50 border border-border-primary hover:bg-bg-primary transition-colors">
                              <p className="text-xs font-bold text-telus-purple uppercase tracking-widest mb-2">Cost Rationalization</p>
                              <p className="text-sm leading-relaxed">Directly targeting the reduction of "bleeding" running costs from legacy platforms that currently block New Product Introduction (NPI).</p>
                            </div>
                            <div className="p-4 rounded-2xl bg-bg-primary/50 border border-border-primary hover:bg-bg-primary transition-colors">
                              <p className="text-xs font-bold text-emerald-500 uppercase tracking-widest mb-2">Human-Centric AI</p>
                              <p className="text-sm leading-relaxed">Operates on a "Human-in-the-Middle" philosophy—AI handles the heavy lifting, while humans provide the final 100% verification.</p>
                            </div>
                            <div className="p-4 rounded-2xl bg-bg-primary/50 border border-border-primary hover:bg-bg-primary transition-colors">
                              <p className="text-xs font-bold text-amber-500 uppercase tracking-widest mb-2">MSP Replacement</p>
                              <p className="text-sm leading-relaxed">Positioned to eventually replace significant portions of multi-million dollar, multi-year Managed Service Provider (MSP) initiatives.</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Saved Customers Section */}
              {activeTab === 'dashboard' && (
                <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-[1800px] mx-auto">
                  
                  {savedCustomers.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                      <div className="telus-card p-8 flex items-center space-x-6">
                        <div className="p-4 bg-bg-primary rounded-2xl text-telus-purple border border-border-primary">
                          <Database className="w-8 h-8" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-text-secondary uppercase tracking-widest mb-1">Total Customers</p>
                          <p className="text-4xl font-black text-text-primary">{savedCustomers.length}</p>
                        </div>
                      </div>
                      <div className="telus-card p-8 flex items-center space-x-6">
                        <div className="p-4 bg-bg-primary rounded-2xl text-telus-green border border-border-primary">
                          <FileText className="w-8 h-8" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-text-secondary uppercase tracking-widest mb-1">Documents Processed</p>
                          <p className="text-4xl font-black text-text-primary">{totalDocuments}</p>
                        </div>
                      </div>
                      <div className="telus-card p-8 flex items-center space-x-6">
                        <div className="p-4 bg-bg-primary rounded-2xl text-telus-purple border border-border-primary">
                          <TrendingUp className="w-8 h-8" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-text-secondary uppercase tracking-widest mb-1">Current Month's Revenue</p>
                          <p className="text-4xl font-black text-text-primary">{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(currentMonthRevenue)}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {savedCustomers.length === 0 ? (
                    <div className="text-center py-32 px-6 bg-bg-secondary rounded-[32px] shadow-[0_10px_40px_rgba(75,40,109,0.05)] relative overflow-hidden">
                      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-3xl h-80 bg-telus-purple/5 blur-[120px] rounded-full pointer-events-none"></div>
                      <div className="w-32 h-32 bg-white rounded-[40px] shadow-2xl border border-border-primary flex items-center justify-center mx-auto mb-10 relative z-10 rotate-3 hover:rotate-6 transition-all duration-500 overflow-hidden">
                        <img src="/telus-logo.png" alt="TELUS" className="w-full h-full object-contain p-4" />
                      </div>
                      <h3 className="text-4xl font-black text-telus-gray tracking-tight mb-6 relative z-10">Welcome to Contract Intelligence</h3>
                      <p className="text-xl text-slate-500 mb-12 max-w-2xl mx-auto relative z-10 leading-relaxed">
                        Your intelligent contract analysis hub. Upload your first ZIP file containing Statements of Work, Change Orders, and Deliverable Approval Forms to get started.
                      </p>
                      <button 
                        onClick={() => setActiveTab('new')}
                        className="telus-button-primary relative z-10 px-10 py-4 text-base"
                      >
                        <HardDrive className="w-5 h-5 mr-3" />
                        Upload First Contract
                      </button>
                    </div>
                  ) : (
                    <div className="telus-card p-10 h-full flex flex-col">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-10">
                        <div>
                          <h2 className="text-3xl font-black text-text-primary flex items-center">
                            <FileText className="w-8 h-8 mr-4 text-telus-green" />
                            Saved Customers
                          </h2>
                          <p className="text-text-secondary mt-1 font-medium">Manage and explore your analyzed contract portfolios</p>
                        </div>
                        <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
                          <div className="relative w-full sm:w-48">
                            <PartnerDropdown
                              value={selectedPartner}
                              onChange={setSelectedPartner}
                              options={uniquePartners}
                            />
                          </div>
                          <div className="relative w-full sm:w-80">
                            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary" />
                            <input 
                              type="text" 
                              placeholder="Search customers..." 
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              className="w-full pl-11 pr-4 py-3 bg-bg-primary border border-border-primary rounded-full text-sm font-bold focus:outline-none focus:ring-2 focus:ring-telus-purple/20 focus:bg-bg-secondary transition-all placeholder:text-text-secondary/50"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex-1 overflow-y-auto">
                        {filteredCustomers.length === 0 ? (
                          <div className="text-center py-24 text-text-secondary/50 text-sm bg-bg-primary/50 rounded-3xl border-2 border-dashed border-border-primary font-bold uppercase tracking-widest">
                            No customers match your search.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {filteredCustomers.map(customer => (
                              <div 
                                key={customer.id}
                                onClick={async () => {
                                  setIsLoading(true);
                                  const fullCustomer = await getCustomer(customer.id);
                                  if (fullCustomer) {
                                    setActiveCustomer(fullCustomer);
                                    setResultsInitialTab('overview');
                                  }
                                  setIsLoading(false);
                                }}
                                className="group p-8 telus-card cursor-pointer flex flex-col justify-between h-52 relative overflow-hidden"
                              >
                                <div className="absolute top-0 right-0 w-24 h-24 bg-telus-purple/5 rounded-bl-full -mr-12 -mt-12 group-hover:scale-150 transition-transform duration-500"></div>
                                
                                <div className="relative z-10">
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="flex flex-col">
                                      <h3 className="font-black text-telus-gray line-clamp-2 text-xl leading-[1.2] group-hover:text-telus-purple transition-colors">{customer.customerName}</h3>
                                      {customer.partnerName && (
                                        <span className="text-[10px] font-black text-telus-purple/70 mt-1 bg-telus-purple/10 px-2 py-0.5 rounded-full uppercase tracking-widest">{customer.partnerName}</span>
                                      )}
                                    </div>
                                    <button 
                                      onClick={(e) => handleDeleteCustomer(customer.id, e)}
                                      className="p-2 text-text-secondary/30 hover:text-rose-600 hover:bg-rose-500/10 rounded-xl opacity-0 group-hover:opacity-100 transition-all shrink-0"
                                      title="Delete customer"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                                
                                <div className="relative z-10 flex items-center justify-between mt-6">
                                  <div className="flex flex-col">
                                    <span className="text-[10px] font-black text-text-secondary uppercase tracking-widest mb-1">Documents</span>
                                    <span className="text-sm font-black text-telus-purple">
                                      {customer.documentCount} Files
                                    </span>
                                  </div>
                                  <div className="flex flex-col items-end">
                                    <span className="text-[10px] font-black text-text-secondary uppercase tracking-widest mb-1">Last Analyzed</span>
                                    <span className="text-sm font-bold text-text-secondary">
                                      {new Date(customer.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Active Customer View */}
        {activeCustomer && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-[1600px] mx-auto">
            <div className="flex items-center justify-between mb-8 py-4 border-b border-border-primary">
              <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
                {activeCustomer.customerName}
              </h2>
              <div className="flex items-center space-x-3">
                <span className="text-xs font-medium text-text-secondary bg-bg-secondary px-3 py-1.5 rounded-lg border border-border-primary shadow-sm">
                  Analyzed on {new Date(activeCustomer.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
            </div>
            
            <div className={cn(
              "grid gap-8 items-start transition-all duration-500 relative",
              isChatbotExpanded ? "grid-cols-1 xl:grid-cols-3" : "grid-cols-1"
            )}>
              {/* Results Display */}
              <div className={cn(
                "space-y-6 transition-all duration-500",
                isChatbotExpanded ? "xl:col-span-2" : "col-span-1"
              )}>
                {error && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start space-x-3 text-red-800 animate-in fade-in slide-in-from-top-2 duration-200">
                    <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-red-500" />
                    <div>
                      <h3 className="text-sm font-medium text-red-800">Refresh Failed</h3>
                      <p className="text-sm text-red-700 mt-1">{error}</p>
                    </div>
                    <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                )}
                <ResultsDisplay 
                  result={activeCustomer.result} 
                  onRefresh={handleRefresh}
                  isRefreshing={isRefreshing}
                  initialTab={resultsInitialTab}
                  onUpdateResult={handleUpdateResult}
                  onFileSelect={handleFileSelect}
                  customerId={activeCustomer.id}
                  userRole={userRole}
                />
              </div>
              
              {/* Chatbot */}
              <div className={cn(
                "transition-all duration-500 z-50",
                isChatbotExpanded 
                  ? "xl:col-span-1 xl:sticky xl:top-24 w-full" 
                  : "fixed bottom-6 right-6 w-[350px] xl:bottom-10 xl:right-10"
              )}>
                <Chatbot 
                  documents={activeCustomer.documents} 
                  onFileUpload={handleChatbotFileUpload}
                  isUploading={isChatbotUploading}
                  isExpanded={isChatbotExpanded}
                  onToggleExpand={() => setIsChatbotExpanded(!isChatbotExpanded)}
                />
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
