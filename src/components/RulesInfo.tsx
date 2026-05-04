import React from 'react';
import { motion } from 'motion/react';
import { BookOpen, FileText, SwitchCamera, CheckCircle, Shield, Calculator, Clock } from 'lucide-react';

export const RulesInfo: React.FC = () => {
  const sections = [
    {
      title: "Service Classification",
      icon: <FileText className="w-5 h-5 text-telus-purple" />,
      rules: [
        { name: "Managed Services (MS)", description: "Assigned when a service has a 'Monthly Fixed' or 'MRC' (Monthly Recurring Charge) amount. These are ongoing, recurring services." },
        { name: "Professional Services (PS)", description: "Assigned when a service has a 'Fixed One Time Charge' or 'NRC' (Non-Recurring Charge). These represent project-based, one-time work." },
        { name: "Transition Services (TS)", description: "Distinct from PS. Assigned to one-time charges specifically related to the phase of migrating or moving services to the vendor." }
      ]
    },
    {
      title: "Quantity & Change Orders (CO)",
      icon: <SwitchCamera className="w-5 h-5 text-telus-green" />,
      rules: [
        { name: "Total Quantity", description: "The new, final total quantity after the change is applied." },
        { name: "Previous Quantity", description: "The quantity that existed before the change order (e.g., 'SOW Qty'). If a new service is being added, this is 0." },
        { name: "Change Quantity", description: "The delta or difference (e.g., +50, -20) introduced by the change order." },
        { name: "Deletions", description: "If a change order deletes a service, the total quantity becomes 0, and the change quantity is the negative of the previous quantity." },
        { name: "Parent Linking", description: "Change orders are automatically linked to their parent SOW based on the Folder Name they are located in." },
        { name: "Non-PS CO Effective Dates", description: "Change Orders for Managed Services usually have an 'Effective Date' cell in the body. If it lists a date, billing starts then. If it says 'Upon DAF', a DAF is strictly required." },
        { name: "PS CO Invoicing", description: "Professional Services (PS) Change Orders typically state in the body that the amount will be invoiced the month following the signing date. Thus, the signature date acts as the billing trigger for PS COs." },
        { name: "Mixed CO Components", description: "A single Change Order can contain both PS and MS components. When this occurs, the logic is applied individually per service: MS components follow the MS effective date / DAF rules, while PS components use the signature date trigger." }
      ]
    },
    {
      title: "Deliverable Approval Forms (DAF)",
      icon: <CheckCircle className="w-5 h-5 text-blue-500" />,
      rules: [
        { name: "Onboarded Quantity", description: "Quantities approved in a DAF are extracted as 'onboardedQuantity', representing what has been officially delivered." },
        { name: "DAF Overrides", description: "If a service is on an SOW and a corresponding DAF exists, the onboarded quantity for that service is dictated by the DAF." },
        { name: "Missing DAFs", description: "If no DAF is present for an SOW service, the onboarded quantity is 0 (unless it is a fully billed PS/TS service)." }
      ]
    },
    {
      title: "Billing & Status Logic",
      icon: <Calculator className="w-5 h-5 text-orange-500" />,
      rules: [
        { name: "Unsigned Documents", description: "If the parent SOW or CO is not signed, the billing status is strictly set to 'Unsigned'." },
        { name: "DAF Triggers Billing", description: "If a DAF is present and signed, the status becomes 'Billed (DAF Received)', and the DAF start date is used to calculate billing." },
        { name: "Effective Date Triggers", description: "If no DAF is present, but an Effective Date exists, the status becomes 'Billed (Effective Date)'." },
        { name: "Pending DAF", description: "For Managed Services (MS), if there is no DAF and no explicit Effective Date, the status remains 'Pending DAF'." },
        { name: "PS/TS SOW Invoicing", description: "For Professional or Transition Services within any SOW (whether standalone or mixed with MS), unless an explicit date is mentioned in section 5.2 of the SOW, the amount is typically invoiced the month following the SOW's signing date." },
        { name: "PS/TS Completion", description: "If a PS or TS service indicates it has been 'Billed' or 'Completed', its onboarded quantity automatically matches its total quantity." }
      ]
    },
    {
      title: "Dates & Timelines",
      icon: <Clock className="w-5 h-5 text-teal-500" />,
      rules: [
        { name: "Effective vs. Signing", description: "The system strives to extract the actual operational 'Effective Date' rather than just the 'Date of signing'." },
        { name: "Expiry Calculation", description: "Expiry dates are calculated automatically by adding the 'Term' (e.g., 36 months) to the Effective Date or DAF Start Date." }
      ]
    },
    {
      title: "System & Security",
      icon: <Shield className="w-5 h-5 text-red-500" />,
      rules: [
        { name: "Local Storage (Privacy)", description: "All extracted contract data, PDFs, and results are stored locally in your browser's IndexedDB. No contract data is sent to external databases unless explicitly configured." },
        { name: "Role-Based Access (RBAC)", description: "Admin: Full control (Upload, Delete, Edit). Editor: Can upload and analyze, but cannot delete customers. Viewer: Read-only access to dashboards and insights." },
        { name: "AI Extraction constraints", description: "The AI is strictly constrained to extract every single row of a service table. Summarization or aggregation of line items is forbidden during extraction." }
      ]
    }
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <div className="flex items-center gap-4 border-b border-border-primary pb-6">
        <div className="p-3 bg-telus-purple/10 rounded-xl">
          <BookOpen className="w-8 h-8 text-telus-purple" />
        </div>
        <div>
          <h1 className="text-3xl font-light text-text-primary">System Rules & Logic</h1>
          <p className="text-text-secondary mt-1">Understanding the business logic driving the AXON extraction and analysis engine.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {sections.map((section, idx) => (
          <motion.div
            key={section.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="telus-card p-6 border border-border-primary/50 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border-primary/30">
              <div className="p-2 bg-bg-secondary rounded-lg">
                {section.icon}
              </div>
              <h2 className="text-xl font-bold text-text-primary">{section.title}</h2>
            </div>
            <div className="space-y-5">
              {section.rules.map((rule, ruleIdx) => (
                <div key={ruleIdx} className="flex gap-3">
                  <div className="mt-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-telus-purple/60" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-text-primary">{rule.name}</h3>
                    <p className="text-sm text-text-secondary leading-relaxed mt-0.5">{rule.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        ))}
      </div>
      
      <div className="telus-card p-6 bg-gradient-to-br from-telus-purple/5 to-telus-green/5 border-none mt-8 text-center">
        <h3 className="font-bold text-telus-purple mb-2">Need to adjust these rules?</h3>
        <p className="text-sm text-text-secondary">
          These rules are defined as prompts and algorithmic logic in the application's source code (e.g., <code className="bg-bg-secondary px-1 py-0.5 rounded text-xs">src/lib/gemini.ts</code>). 
          They ensure consistent extraction across all M&A, DAF, and Change Order documents.
        </p>
      </div>
    </div>
  );
};
