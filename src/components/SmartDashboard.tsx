import React, { useState, useRef, useEffect } from 'react';
import { ContractAnalysisResult, generateSmartDashboard, DashboardWidget, generateGlobalDashboard } from '../lib/gemini';
import { CustomerSummary, getPinnedWidgets, savePinnedWidget, deletePinnedWidget } from '../lib/db';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid } from 'recharts';
import { Send, Zap, Loader2, BarChart3, PieChartIcon, LineChartIcon, Info, Sparkles, LayoutGrid, Pin, PinOff, Heart } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface SmartDashboardProps {
  result?: ContractAnalysisResult;
  customers?: CustomerSummary[];
}

export const SmartDashboard: React.FC<SmartDashboardProps> = ({ result, customers }) => {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [widgets, setWidgets] = useState<DashboardWidget[]>([]);
  const [pinnedWidgets, setPinnedWidgets] = useState<DashboardWidget[]>([]);
  const isGlobal = !!customers && !result;
  
  const [message, setMessage] = useState<string>(
    isGlobal 
      ? 'Global Insights Mode: Ask me to analyze your entire portfolio. E.g., "Show revenue by customer" or "What is our most common service type?"'
      : 'Analyze this contract: Visualize service distributions, compare project types, or extract key milestones with natural language.'
  );
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadPinnedWidgets();
  }, []);

  const loadPinnedWidgets = async () => {
    try {
      const pinned = await getPinnedWidgets();
      setPinnedWidgets(Array.isArray(pinned) ? pinned : []);
    } catch (error) {
      console.error('Failed to load pinned widgets:', error);
      setPinnedWidgets([]);
    }
  };

  const handleTogglePin = async (widget: DashboardWidget) => {
    const isPinned = pinnedWidgets.some(pw => pw.id === widget.id);
    try {
      if (isPinned) {
        await deletePinnedWidget(widget.id);
      } else {
        await savePinnedWidget(widget, result?.customerName);
      }
      await loadPinnedWidgets();
    } catch (error) {
      console.error('Toggle pin failed:', error);
    }
  };

  const handleQuery = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim() || isLoading) return;

    if (isGlobal && (!customers || customers.length === 0)) {
      setMessage("I don't have any portfolio data to analyze yet. Please upload at least one contract ZIP file in the 'New Contract' tab.");
      return;
    }

    setIsLoading(true);
    setWidgets([]);
    try {
      const response = isGlobal && customers 
        ? await generateGlobalDashboard(query, customers)
        : await generateSmartDashboard(query, result!);
        
      setMessage(response.message);
      setWidgets(response.widgets);
      setQuery('');
    } catch (error) {
      console.error('Failed to generate smart dashboard:', error);
      setMessage('Sorry, I encountered an error while processing your request. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const COLORS = ['#4B286D', '#2B8000', '#D9B0FF', '#71BE44', '#2A2C2E', '#F2F2F2'];

  const renderWidget = (widget: DashboardWidget) => {
    // Sanitize widget data to ensure charting values are valid numbers, not strings like "$150,000"
    const dataKey = widget.config?.dataKey || "value";
    let sanitizedData = (widget.data || []).map(item => {
      const copy = { ...item };
      if (typeof copy[dataKey] === 'string') {
        // Attempt to parse out numbers from strings (removing $, spaces, commas)
        const parsed = parseFloat(copy[dataKey].replace(/[^0-9.-]+/g, ''));
        if (!isNaN(parsed)) {
          copy[dataKey] = parsed;
        }
      }
      return copy;
    });

    switch (widget.type) {
      case 'summary':
        const mainVal = sanitizedData[0]?.[dataKey] ?? sanitizedData[0]?.value;
        const displayVal = (typeof mainVal === 'number' && !isNaN(mainVal)) ? mainVal.toLocaleString() : (mainVal ?? '--');
        return (
          <div className="flex flex-col justify-center h-full">
            <div className="text-5xl font-black text-text-primary mb-2">
              <span className="text-3xl text-telus-purple mr-1">{widget.config?.prefix}</span>
              {displayVal}
              <span className="text-3xl text-telus-purple ml-1">{widget.config?.suffix}</span>
            </div>
            {widget.description && <p className="text-sm font-medium text-text-secondary">{widget.description}</p>}
          </div>
        );
      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={sanitizedData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border-primary)" opacity={0.5} />
              <XAxis dataKey={widget.config?.categoryKey || "name"} fontSize={10} tick={{ fill: 'var(--color-text-secondary)' }} axisLine={false} tickLine={false} />
              <YAxis fontSize={10} tick={{ fill: 'var(--color-text-secondary)' }} width={80} axisLine={false} tickLine={false} tickFormatter={(val) => `${widget.config?.prefix || ''}${val.toLocaleString()}${widget.config?.suffix || ''}`} />
              <Tooltip 
                contentStyle={{ borderRadius: '12px', border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)' }}
                formatter={(val: any) => [`${widget.config?.prefix || ''}${Number(val).toLocaleString()}${widget.config?.suffix || ''}`, widget.config?.dataKey || 'Value']}
              />
              <Bar dataKey={dataKey} fill={widget.config?.color || '#4B286D'} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        );
      case 'pie':
        return (
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={sanitizedData}
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey={dataKey}
                nameKey={widget.config?.categoryKey || "name"}
              >
                {sanitizedData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={widget.config?.colors?.[index % (widget.config?.colors?.length || 1)] || COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                 contentStyle={{ borderRadius: '12px', border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)' }}
                 formatter={(val: any) => [`${widget.config?.prefix || ''}${Number(val).toLocaleString()}${widget.config?.suffix || ''}`, widget.config?.dataKey || 'Value']} 
              />
            </PieChart>
          </ResponsiveContainer>
        );
      case 'line':
        return (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={sanitizedData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border-primary)" opacity={0.5} />
              <XAxis dataKey={widget.config?.categoryKey || "name"} fontSize={10} tick={{ fill: 'var(--color-text-secondary)' }} axisLine={false} tickLine={false} />
              <YAxis fontSize={10} tick={{ fill: 'var(--color-text-secondary)' }} width={80} axisLine={false} tickLine={false} tickFormatter={(val) => `${widget.config?.prefix || ''}${val.toLocaleString()}${widget.config?.suffix || ''}`} />
              <Tooltip 
                contentStyle={{ borderRadius: '12px', border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)' }}
                formatter={(val: any) => [`${widget.config?.prefix || ''}${Number(val).toLocaleString()}${widget.config?.suffix || ''}`, widget.config?.dataKey || 'Value']}
              />
              <Line type="monotone" dataKey={dataKey} stroke={widget.config?.color || '#4B286D'} strokeWidth={3} dot={{ r: 4, fill: '#4B286D' }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-250px)] min-h-[600px] gap-6">
      <div className="flex-1 overflow-y-auto pr-2 space-y-8">
        
        {/* Pinned Widgets Section */}
        <AnimatePresence>
          {Array.isArray(pinnedWidgets) && pinnedWidgets.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="space-y-4"
            >
              <div className="flex items-center gap-2 text-telus-purple mb-4">
                <Heart className="w-5 h-5 fill-telus-purple" />
                <h3 className="font-bold uppercase tracking-widest text-sm">Pinned Favorites</h3>
                <div className="flex-1 h-px bg-telus-purple/20 ml-2" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {pinnedWidgets.map((widget) => (
                  <motion.div
                    key={`pinned-${widget.id}`}
                    layoutId={`widget-${widget.id}`}
                    className="telus-card p-6 border border-telus-purple/20 bg-telus-purple/[0.02] relative group"
                  >
                    <button 
                      onClick={() => handleTogglePin(widget)}
                      className="absolute top-4 right-4 p-2 rounded-full bg-white shadow-sm border border-border-primary text-telus-purple hover:bg-telus-purple/10 transition-colors z-10"
                      title="Unpin Chart"
                    >
                      <PinOff className="w-4 h-4" />
                    </button>
                    <div className="flex items-center gap-2 mb-4 pr-10 border-b border-telus-purple/10 pb-2">
                      {widget.type === 'bar' && <BarChart3 className="w-4 h-4 text-telus-purple" />}
                      {widget.type === 'pie' && <PieChartIcon className="w-4 h-4 text-telus-purple" />}
                      {widget.type === 'line' && <LineChartIcon className="w-4 h-4 text-telus-purple" />}
                      {widget.type === 'summary' && <LayoutGrid className="w-4 h-4 text-telus-purple" />}
                      <h4 className="font-bold text-text-primary text-sm truncate">{widget.title}</h4>
                    </div>
                    <div className="h-[180px] flex items-center justify-center">
                      {renderWidget(widget)}
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Welcome/Response Message */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="telus-card p-6 border-l-4 border-l-telus-purple bg-telus-purple/5"
        >
          <div className="flex items-start gap-4">
            <div className="p-2 bg-bg-secondary rounded-full shadow-sm text-telus-purple border border-border-primary">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-telus-purple uppercase tracking-wider mb-1">
                {isGlobal ? 'AXON Global Intelligence' : 'AXON Intelligence'}
              </h3>
              <p className="text-text-primary leading-relaxed">{message}</p>
            </div>
          </div>
        </motion.div>

        {/* Widgets Grid */}
        <AnimatePresence mode="popLayout">
          {Array.isArray(widgets) && widgets.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {widgets.map((widget, idx) => {
                const isPinned = pinnedWidgets.some(pw => pw.id === widget.id);
                return (
                  <motion.div
                    key={widget.id}
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="telus-card p-6 hover:shadow-xl transition-all border border-border-primary/50 group relative"
                  >
                    <button 
                      onClick={() => handleTogglePin(widget)}
                      className={cn(
                        "absolute top-4 right-4 p-2 rounded-full shadow-sm border border-border-primary transition-all z-10 opacity-0 group-hover:opacity-100",
                        isPinned ? "bg-telus-purple text-white border-telus-purple" : "bg-white text-text-secondary hover:text-telus-purple"
                      )}
                      title={isPinned ? "Unpin Chart" : "Pin to Favorites"}
                    >
                      {isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                    </button>
                    <div className="flex items-center justify-between mb-4 pr-10 border-b border-border-primary/30 pb-2">
                      <h4 className="font-bold text-text-primary flex items-center gap-2">
                        {widget.type === 'bar' && <BarChart3 className="w-4 h-4 text-telus-purple" />}
                        {widget.type === 'pie' && <PieChartIcon className="w-4 h-4 text-telus-purple" />}
                        {widget.type === 'line' && <LineChartIcon className="w-4 h-4 text-telus-purple" />}
                        {widget.type === 'summary' && <LayoutGrid className="w-4 h-4 text-telus-purple" />}
                        {widget.title}
                      </h4>
                      {widget.description && (
                        <div className="text-text-secondary w-4 h-4 cursor-help" title={widget.description}>
                          <Info className="w-full h-full" />
                        </div>
                      )}
                    </div>
                    <div className="min-h-[200px] flex items-center justify-center">
                      {widget.data && widget.data.length > 0 ? (
                        renderWidget(widget)
                      ) : (
                        <div className="text-center p-8 bg-bg-secondary rounded-2xl w-full">
                          <Info className="w-8 h-8 text-text-secondary/30 mx-auto mb-2" />
                          <p className="text-xs text-text-secondary">No data matches this view</p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </AnimatePresence>

        {isLoading && (
          <div className="flex flex-col items-center justify-center p-12 space-y-4">
            <Loader2 className="w-8 h-8 text-telus-purple animate-spin" />
            <p className="text-sm font-bold text-text-secondary uppercase tracking-widest animate-pulse">Generating your dashboard...</p>
          </div>
        )}
        
        <div ref={chatEndRef} />
      </div>

      {/* Input Area */}
      <div className="space-y-4">
        {Array.isArray(pinnedWidgets) && pinnedWidgets.length === 0 && Array.isArray(widgets) && widgets.length === 0 && !isLoading && (
          <div className="flex flex-wrap gap-2 justify-center">
            {[
              "Show revenue by customer",
              "Service distribution by type",
              "Top 10 services by count",
              "Portfolio growth trends"
            ].map(q => (
              <button
                key={q}
                type="button"
                onClick={() => {
                  setQuery(q);
                  setTimeout(() => handleQuery(), 0);
                }}
                className="px-4 py-2 rounded-full bg-telus-purple/5 border border-telus-purple/10 text-telus-purple text-xs font-bold hover:bg-telus-purple/10 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        )}
        <div className="relative group">
        <div className="absolute -inset-1 bg-gradient-to-r from-telus-purple to-telus-green rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
        <form onSubmit={handleQuery} className="relative bg-bg-secondary border-2 border-border-primary rounded-2xl p-2 flex items-center gap-2 shadow-sm focus-within:border-telus-purple transition-colors">
          <div className="pl-3 text-telus-purple">
            <Zap className="w-5 h-5" />
          </div>
          <input 
            type="text" 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="E.g., Compare MS and PS revenue | List top 5 services by quantity..."
            className="flex-1 bg-transparent border-none focus:ring-0 text-text-primary px-2 py-2 placeholder:text-text-secondary/50 font-medium"
            disabled={isLoading}
          />
          <button 
            type="submit"
            disabled={isLoading || !query.trim()}
            className={cn(
              "p-2 rounded-xl transition-all",
              query.trim() ? "bg-telus-purple text-white shadow-lg hover:scale-105" : "bg-bg-secondary text-text-secondary"
            )}
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </form>
      </div>
    </div>
  </div>
  );
};
