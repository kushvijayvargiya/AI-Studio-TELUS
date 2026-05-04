import React, { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastContextType {
  showToast: (message: string, type: ToastType, duration?: number) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within a ToastProvider');
  return context;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType, duration = 5000) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type, duration }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col space-y-3 pointer-events-none">
        <AnimatePresence mode="popLayout">
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
              className={cn(
                "pointer-events-auto flex items-center p-4 rounded-2xl shadow-2xl border min-w-[320px] max-w-md",
                toast.type === 'success' && "bg-emerald-50 border-emerald-100 text-emerald-800",
                toast.type === 'error' && "bg-rose-50 border-rose-100 text-rose-800",
                toast.type === 'info' && "bg-blue-50 border-blue-100 text-blue-800",
                toast.type === 'warning' && "bg-amber-50 border-amber-100 text-amber-800"
              )}
            >
              <div className="mr-3 shrink-0">
                {toast.type === 'success' && <CheckCircle className="w-5 h-5 text-emerald-500" />}
                {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-500" />}
                {toast.type === 'info' && <Info className="w-5 h-5 text-blue-500" />}
                {toast.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-500" />}
              </div>
              <p className="text-sm font-bold flex-1 pr-4">{toast.message}</p>
              <button
                onClick={() => removeToast(toast.id)}
                className="p-1 hover:bg-[#0000000D] rounded-full transition-colors shrink-0"
              >
                <X className="w-4 h-4 text-[#00000066]" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};
