import React, { useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { UploadCloud, ChevronRight, FileSpreadsheet } from 'lucide-react';
import { CustomSelect } from '../ui/CustomSelect';
import { useToast } from '../ui/Toast';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { cn } from '../../lib/utils';

interface UploadActualsSectionProps {
  isUploadExpanded: boolean;
  setIsUploadExpanded: (expanded: boolean) => void;
  uploadMonth: number;
  setUploadMonth: (month: number) => void;
  uploadYear: number;
  setUploadYear: (year: number) => void;
  uploadPartner: string;
  setUploadPartner: (partner: string) => void;
  isUploadingActuals: boolean;
  onUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  months: string[];
  years: number[];
  uploadPartners: string[];
}

export const UploadActualsSection: React.FC<UploadActualsSectionProps> = ({
  isUploadExpanded,
  setIsUploadExpanded,
  uploadMonth,
  setUploadMonth,
  uploadYear,
  setUploadYear,
  uploadPartner,
  setUploadPartner,
  isUploadingActuals,
  onUpload,
  months,
  years,
  uploadPartners
}) => {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className={cn(
      "telus-card transition-all duration-300",
      isUploadExpanded ? "ring-2 ring-[#3B82F61A] border-[#3B82F633]" : "hover:border-[#4B286D33]"
    )}>
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={cn(
              "p-2 rounded-xl transition-colors",
              isUploadExpanded ? "bg-blue-50 text-blue-600" : "bg-telus-light text-[#2A2C2E66]"
            )}>
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-telus-gray tracking-tight">Upload Actuals</h3>
              <p className="text-[10px] font-black text-[#2A2C2E66] uppercase tracking-widest">
                {isUploadExpanded ? 'Select Partner & File' : 'Expand to Process'}
              </p>
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={(e) => { e.stopPropagation(); setIsUploadExpanded(!isUploadExpanded); }}
            className="p-1 h-auto rounded-full text-[#2A2C2E66] hover:text-telus-purple"
          >
            {isUploadExpanded ? <ChevronRight className="w-4 h-4 rotate-90" /> : <ChevronRight className="w-4 h-4" />}
          </Button>
        </div>

        <AnimatePresence>
          {isUploadExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="pt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <Badge variant="info" size="sm" className="text-[10px] font-black uppercase tracking-widest">
                    Partner Specific
                  </Badge>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-[#2A2C2E66] uppercase tracking-widest ml-1">Month</label>
                    <CustomSelect
                      value={uploadMonth}
                      onChange={setUploadMonth}
                      options={months.map((month, index) => ({ label: month, value: index }))}
                      className="w-full"
                      buttonClassName="w-full p-2.5"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-[#2A2C2E66] uppercase tracking-widest ml-1">Year</label>
                    <CustomSelect
                      value={uploadYear}
                      onChange={setUploadYear}
                      options={years.map(year => ({ label: String(year), value: year }))}
                      className="w-full"
                      buttonClassName="w-full p-2.5"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-[#2A2C2E66] uppercase tracking-widest ml-1">Partner Record</label>
                  <CustomSelect
                    value={uploadPartner}
                    onChange={setUploadPartner}
                    options={[
                      { label: 'Select Partner...', value: '' },
                      ...uploadPartners.map(p => ({ label: p, value: p }))
                    ]}
                    className="w-full"
                    buttonClassName="w-full p-2.5"
                  />
                </div>

                <input 
                  type="file" 
                  accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" 
                  className="hidden" 
                  ref={fileInputRef}
                  onChange={(e) => {
                    onUpload(e);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                />

                <Button 
                  onClick={() => {
                    if (!uploadPartner) {
                      showToast('Please select a partner before uploading actuals.', 'warning');
                      return;
                    }
                    fileInputRef.current?.click();
                  }}
                  disabled={isUploadingActuals}
                  className="w-full py-6 shadow-lg shadow-blue-600/20"
                >
                  {isUploadingActuals ? (
                    <div className="w-5 h-5 border-2 border-[#FFFFFF4D] border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <UploadCloud className="w-5 h-5 mr-2" />
                      <span className="font-black uppercase tracking-widest text-xs">Process Actuals File</span>
                    </>
                  )}
                </Button>
                
                <p className="text-[10px] text-[#2A2C2E66] text-center leading-relaxed">
                  Upload Excel/CSV with columns for Customer, Service, and Quantity. 
                  Only records for the selected partner will be updated.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
