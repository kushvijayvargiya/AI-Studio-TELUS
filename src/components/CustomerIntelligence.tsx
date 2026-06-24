import React, { useMemo } from 'react';
import { ContractAnalysisResult } from '../lib/gemini';
import { Target, Zap, ShieldAlert, Cloud, Database, TrendingUp, CheckCircle2, AlertCircle, ArrowRight, Activity } from 'lucide-react';
import { cn } from '../lib/utils';

interface CustomerIntelligenceProps {
  result: ContractAnalysisResult;
}

export const CustomerIntelligence: React.FC<CustomerIntelligenceProps> = ({ result }) => {
  // Filter out Transition Services (TS) from calculations as requested
  const services = useMemo(() => 
    (result.customerServices || []).filter(s => s.serviceType !== 'TS'),
    [result.customerServices]
  );
  
  const serviceNames = services.map(s => (s.serviceName || '').toLowerCase());

  // Deep categorization for PS Services
  const psTrends = useMemo(() => {
    const psServices = services.filter(s => s.serviceType === 'PS');
    const categories: Record<string, { count: number; amount: number; services: string[] }> = {
      'Cloud & Infrastructure': { count: 0, amount: 0, services: [] },
      'Security & Compliance': { count: 0, amount: 0, services: [] },
      'Modern Workplace': { count: 0, amount: 0, services: [] },
      'Strategic Consulting': { count: 0, amount: 0, services: [] },
      'Other Projects': { count: 0, amount: 0, services: [] }
    };

    psServices.forEach(s => {
      const name = (s.serviceName || '').toLowerCase();
      const desc = (s.description || '').toLowerCase();
      const amt = parseFloat((s.amount || '').replace(/[^0-9.]/g, '')) || 0;

      let cat = 'Other Projects';
      if (name.includes('cloud') || name.includes('azure') || name.includes('aws') || name.includes('migration') || name.includes('server')) {
        cat = 'Cloud & Infrastructure';
      } else if (name.includes('security') || name.includes('audit') || name.includes('pen') || name.includes('firewall') || name.includes('compliance')) {
        cat = 'Security & Compliance';
      } else if (name.includes('m365') || name.includes('office') || name.includes('teams') || name.includes('email') || name.includes('collaboration')) {
        cat = 'Modern Workplace';
      } else if (name.includes('consulting') || name.includes('roadmap') || name.includes('assessment') || name.includes('advisory')) {
        cat = 'Strategic Consulting';
      }

      categories[cat].count++;
      categories[cat].amount += amt;
      categories[cat].services.push(s.serviceName);
    });

    return Object.entries(categories)
      .filter(([_, data]) => data.count > 0)
      .sort((a, b) => b[1].amount - a[1].amount);
  }, [services]);

  // Managed Services Descriptions
  const msInfo: Record<string, string> = {
    'Service Desk': '24/7 technical support and incident management for end-users.',
    'Network Monitoring': 'Proactive oversight of connectivity, bandwidth, and hardware health.',
    'Endpoint Management': 'Automated patching, software deployment, and security for user devices.',
    'Security Services': 'Managed firewall, EDR, and SOC monitoring for threat protection.',
    'Cloud Management': 'Governance, cost optimization, and scaling of cloud infrastructure.',
    'Backup & DR': 'Automated data protection and disaster recovery orchestration.'
  };

  const opportunities = useMemo(() => {
    const opps = [];
    
    // Security Gaps
    const hasBasicSecurity = serviceNames.some(n => n.includes('antivirus') || n.includes('firewall'));
    const hasAdvancedSecurity = serviceNames.some(n => n.includes('endpoint') || n.includes('edr') || n.includes('soc'));
    
    if (!hasAdvancedSecurity) {
      opps.push({
        category: 'Security',
        title: hasBasicSecurity ? 'Advanced Security Uplift' : 'Security Foundation',
        description: hasBasicSecurity 
          ? 'Upgrade to EDR/SOC for proactive threat hunting and 24/7 monitoring.' 
          : 'Implement essential firewall and endpoint protection.',
        icon: <ShieldAlert className="w-5 h-5 text-telus-purple" />,
        potentialMRR: 450,
        priority: 'High'
      });
    }

    // Cloud Gaps
    const hasCloud = serviceNames.some(n => n.includes('cloud') || n.includes('azure') || n.includes('aws'));
    if (!hasCloud) {
      opps.push({
        category: 'Cloud',
        title: 'Cloud Infrastructure Migration',
        description: 'Migrate legacy on-prem workloads to Azure/AWS for better scalability.',
        icon: <Cloud className="w-5 h-5 text-telus-purple" />,
        potentialMRR: 800,
        priority: 'Medium'
      });
    }

    // Backup Gaps
    const hasBackup = serviceNames.some(n => n.includes('backup') || n.includes('dr') || n.includes('recovery'));
    if (!hasBackup) {
      opps.push({
        category: 'Backup',
        title: 'Business Continuity & DR',
        description: 'Implement off-site cloud backup and disaster recovery planning.',
        icon: <Database className="w-5 h-5 text-telus-purple" />,
        potentialMRR: 350,
        priority: 'High'
      });
    }

    // Productivity Gaps
    const hasM365 = serviceNames.some(n => n.includes('m365') || n.includes('office 365'));
    if (!hasM365) {
      opps.push({
        category: 'Productivity',
        title: 'Modern Workplace (M365)',
        description: 'Consolidate email and collaboration tools into the Microsoft 365 ecosystem.',
        icon: <Zap className="w-5 h-5 text-telus-purple" />,
        potentialMRR: 200,
        priority: 'Medium'
      });
    }

    return opps;
  }, [serviceNames]);

  const intensityScore = useMemo(() => {
    const totalPossible = 10;
    let score = 0;
    if (serviceNames.some(n => n.includes('managed'))) score += 3;
    if (serviceNames.some(n => n.includes('security'))) score += 2;
    if (serviceNames.some(n => n.includes('cloud'))) score += 2;
    if (serviceNames.some(n => n.includes('backup'))) score += 2;
    if (services.length > 5) score += 1;
    
    return Math.min(score, totalPossible);
  }, [serviceNames, services.length]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Top Summary Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="telus-card p-5 relative overflow-hidden group bg-bg-secondary border-border-primary">
          <div className="absolute top-0 right-0 w-32 h-32 bg-telus-purple/5 rounded-bl-full -z-10 transition-transform group-hover:scale-110"></div>
          <p className="text-[10px] font-black text-text-secondary uppercase tracking-widest mb-1.5">Product Intensity</p>
          <div className="flex items-end space-x-2">
            <p className="text-3xl font-black text-telus-gray">{intensityScore}/10</p>
            <div className="mb-1.5 flex-1 h-2 bg-bg-primary rounded-full overflow-hidden border border-border-primary">
              <div 
                className="h-full bg-telus-purple transition-all duration-1000 ease-out" 
                style={{ width: `${(intensityScore / 10) * 100}%` }}
              ></div>
            </div>
          </div>
          <p className="text-[9px] text-text-secondary/50 mt-2 font-bold uppercase tracking-wider">Based on service mix and depth</p>
        </div>

        <div className="telus-card p-5 relative overflow-hidden group bg-bg-secondary border-border-primary">
          <div className="absolute top-0 right-0 w-32 h-32 bg-telus-green/5 rounded-bl-full -z-10 transition-transform group-hover:scale-110"></div>
          <p className="text-[10px] font-black text-text-secondary uppercase tracking-widest mb-1.5">Growth Potential</p>
          <p className="text-3xl font-black text-telus-green tracking-tight">
            ${opportunities.reduce((sum, o) => sum + o.potentialMRR, 0)}
          </p>
          <p className="text-[9px] text-text-secondary/50 mt-2 font-bold uppercase tracking-wider">Estimated monthly revenue gap</p>
        </div>

        <div className="telus-card p-5 relative overflow-hidden group bg-bg-secondary border-border-primary">
          <div className="absolute top-0 right-0 w-32 h-32 bg-telus-purple/5 rounded-bl-full -z-10 transition-transform group-hover:scale-110"></div>
          <p className="text-[10px] font-black text-text-secondary uppercase tracking-widest mb-1.5">Open Leads</p>
          <p className="text-3xl font-black text-telus-purple">{opportunities.length}</p>
          <p className="text-[9px] text-text-secondary/50 mt-2 font-bold uppercase tracking-wider">Identified cross-sell opportunities</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Opportunity List */}
        <div className="telus-card p-6 bg-bg-secondary border-border-primary">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-black text-telus-gray flex items-center tracking-tight">
              <div className="p-2 bg-telus-purple/10 rounded-xl mr-3 border border-telus-purple/20 shadow-sm">
                <Target className="w-5 h-5 text-telus-purple" />
              </div>
              Strategic Growth Leads
            </h3>
            <span className="text-[9px] font-black text-white bg-telus-purple px-2 py-1 rounded-md uppercase tracking-widest shadow-lg shadow-telus-purple/20">AI-Generated</span>
          </div>

          <div className="space-y-4">
            {opportunities.length === 0 ? (
              <div className="text-center py-10 bg-bg-primary/50 rounded-2xl border-2 border-dashed border-border-primary">
                <div className="w-12 h-12 bg-telus-green/10 rounded-full flex items-center justify-center mx-auto mb-3 border border-telus-green/20">
                  <CheckCircle2 className="w-6 h-6 text-telus-green" />
                </div>
                <p className="text-base font-black text-telus-gray">Portfolio Fully Optimized</p>
                <p className="text-xs text-text-secondary/50 mt-1 font-medium">No immediate service gaps identified.</p>
              </div>
            ) : (
              opportunities.map((opp, idx) => (
                <div key={idx} className="p-4 rounded-2xl border border-border-primary bg-bg-primary/50 hover:bg-bg-secondary hover:border-telus-purple/30 hover:shadow-xl hover:shadow-telus-purple/5 transition-all group">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center">
                      <div className="p-2 bg-bg-secondary rounded-xl shadow-sm border border-border-primary mr-3 group-hover:scale-110 transition-transform">
                        {opp.icon}
                      </div>
                      <div>
                        <p className="text-[9px] font-black text-text-secondary uppercase tracking-widest mb-0.5">{opp.category}</p>
                        <h4 className="text-sm font-black text-telus-gray group-hover:text-telus-purple transition-colors">{opp.title}</h4>
                      </div>
                    </div>
                    <span className={cn(
                      "px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest shadow-sm",
                      opp.priority === 'High' ? "bg-telus-purple text-white" : "bg-telus-green text-white"
                    )}>
                      {opp.priority} Priority
                    </span>
                  </div>
                  <p className="text-xs text-text-secondary leading-relaxed mb-4 pl-12">{opp.description}</p>
                  <div className="flex items-center justify-between pt-4 border-t border-border-primary ml-12">
                    <div className="text-[10px] font-black text-telus-green uppercase tracking-widest">
                      Est. MRR: <span className="text-base">+${opp.potentialMRR}</span>
                    </div>
                    <button className="flex items-center text-[9px] font-black text-telus-purple uppercase tracking-widest hover:translate-x-2 transition-transform bg-bg-secondary px-3 py-1.5 rounded-lg border border-border-primary shadow-sm">
                      Generate Proposal
                      <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Intelligence Insights */}
        <div className="space-y-6">
          <div className="bg-bg-secondary p-6 rounded-2xl shadow-2xl relative overflow-hidden group border border-border-primary">
            <div className="absolute top-0 right-0 w-80 h-80 bg-telus-purple/5 rounded-bl-full -z-10 transition-transform group-hover:scale-110"></div>
            <h3 className="text-lg font-black text-telus-gray mb-6 flex items-center tracking-tight">
              <div className="p-2 bg-telus-purple/10 rounded-xl mr-3 border border-telus-purple/20">
                <Zap className="w-5 h-5 text-telus-purple" />
              </div>
              Account Intelligence
            </h3>
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-bg-primary/50 border border-border-primary hover:bg-bg-primary transition-all hover:translate-x-2">
                <div className="flex items-center mb-2">
                  <TrendingUp className="w-4 h-4 text-telus-green mr-2" />
                  <p className="text-[10px] font-black text-telus-gray uppercase tracking-widest">Upsell Path</p>
                </div>
                <p className="text-xs text-text-secondary leading-relaxed">
                  {result.customerAlias || 'Customer'} has high Managed Services adoption but low security depth. Transitioning them to a "Security-First" bundle could increase account value by <span className="text-telus-gray font-black">25%</span>.
                </p>
              </div>
              <div className="p-4 rounded-2xl bg-bg-primary/50 border border-border-primary hover:bg-bg-primary transition-all hover:translate-x-2">
                <div className="flex items-center mb-2">
                  <AlertCircle className="w-4 h-4 text-telus-accent mr-2" />
                  <p className="text-[10px] font-black text-telus-gray uppercase tracking-widest">Retention Risk</p>
                </div>
                <p className="text-xs text-text-secondary leading-relaxed">
                  Lack of off-site backup creates a single point of failure. Addressing this gap not only adds revenue but significantly improves long-term retention and stickiness.
                </p>
              </div>
            </div>
          </div>

          <div className="telus-card p-6 bg-bg-secondary border-border-primary">
            <h3 className="text-lg font-black text-telus-gray mb-6 flex items-center tracking-tight">
              <div className="p-2 bg-telus-purple/10 rounded-xl mr-3 border border-telus-purple/20 shadow-sm">
                <TrendingUp className="w-5 h-5 text-telus-purple" />
              </div>
              PS Service Trends
            </h3>
            <div className="space-y-3">
              {psTrends.length === 0 ? (
                <p className="text-xs text-text-secondary/50 italic text-center py-4">No Professional Services data found.</p>
              ) : (
                psTrends.map(([cat, data], idx) => (
                  <div key={idx} className="p-3 rounded-xl bg-bg-primary/50 border border-border-primary hover:bg-bg-secondary hover:shadow-md transition-all">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] font-black text-telus-gray uppercase tracking-widest">{cat}</span>
                      <span className="text-[10px] font-black text-telus-green">${data.amount.toLocaleString()}</span>
                    </div>
                    <div className="w-full h-1 bg-border-primary rounded-full overflow-hidden mb-2">
                      <div 
                        className="h-full bg-telus-purple" 
                        style={{ width: `${Math.min((data.amount / 5000) * 100, 100)}%` }}
                      ></div>
                    </div>
                    <p className="text-[8px] text-text-secondary/50 truncate">
                      {data.services.join(', ')}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="telus-card p-6 bg-bg-secondary border-border-primary">
            <h3 className="text-lg font-black text-telus-gray mb-6 flex items-center tracking-tight">
              <div className="p-2 bg-telus-purple/10 rounded-xl mr-3 border border-telus-purple/20 shadow-sm">
                <Activity className="w-5 h-5 text-telus-purple" />
              </div>
              Managed Services Portfolio
            </h3>
            <div className="grid grid-cols-1 gap-3">
              {Object.entries(msInfo).map(([label, desc], idx) => {
                const isActive = serviceNames.some(n => n.toLowerCase().includes(label.toLowerCase().split(' ')[0]));
                return (
                  <div key={idx} className="p-3 rounded-xl bg-bg-primary/50 border border-border-primary flex items-start group hover:bg-bg-secondary hover:shadow-lg transition-all">
                    <div className={cn(
                      "w-2 h-2 rounded-full mt-1.5 mr-3 shadow-sm shrink-0", 
                      isActive ? "bg-telus-green shadow-telus-green/20" : "bg-text-secondary/30"
                    )}></div>
                    <div>
                      <div className="flex items-center justify-between mb-0.5">
                        <p className="text-[10px] font-black text-telus-gray uppercase tracking-widest">{label}</p>
                        <span className={cn(
                          "text-[8px] font-black uppercase tracking-widest",
                          isActive ? "text-telus-green" : "text-text-secondary/50"
                        )}>{isActive ? 'Active' : 'Missing'}</span>
                      </div>
                      <p className="text-[9px] text-text-secondary/50 leading-tight">{desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
