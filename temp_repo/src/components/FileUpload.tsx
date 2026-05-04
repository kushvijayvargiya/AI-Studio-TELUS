import React, { useCallback, useState } from 'react';
import { UploadCloud, FileArchive, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

import { Skeleton } from './ui/Skeleton';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  isLoading: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect, isLoading }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.type === 'application/zip' || file.name.endsWith('.zip')) {
        onFileSelect(file);
      } else {
        alert('Please upload a ZIP file containing your documents.');
      }
    }
  }, [onFileSelect]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (file.type === 'application/zip' || file.name.endsWith('.zip')) {
        onFileSelect(file);
      } else {
        alert('Please upload a ZIP file containing your documents.');
      }
    }
  }, [onFileSelect]);

  if (isLoading) {
    return (
      <div className="w-full h-80 telus-card p-8 flex flex-col items-center justify-center space-y-6 animate-in fade-in duration-500 bg-bg-secondary border-border-primary">
        <div className="relative">
          <div className="absolute inset-0 bg-telus-purple/10 rounded-full animate-ping opacity-70"></div>
          <div className="relative p-5 bg-bg-secondary rounded-full shadow-sm border border-border-primary">
            <Loader2 className="w-10 h-10 text-telus-purple animate-spin" />
          </div>
        </div>
        <div className="space-y-4 w-full max-w-xs">
          <Skeleton className="h-6 w-3/4 mx-auto bg-border-primary" />
          <Skeleton className="h-4 w-full bg-border-primary" />
          <Skeleton className="h-4 w-5/6 mx-auto bg-border-primary" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center w-full h-80 border-2 border-dashed transition-all duration-300 ease-in-out group telus-card bg-bg-secondary",
        isDragging ? "border-telus-purple bg-telus-purple/5 scale-[1.02] shadow-lg shadow-telus-purple/10" : "border-border-primary hover:border-telus-purple/40 hover:bg-bg-primary hover:shadow-md",
        isLoading && "opacity-70 pointer-events-none scale-100"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />
      
      <input
        type="file"
        accept=".zip,application/zip"
        onChange={handleFileInput}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
        disabled={isLoading}
      />
      
      <div className="flex flex-col items-center justify-center space-y-6 text-center p-8 z-10 relative">
        <div className="relative group-hover:-translate-y-2 transition-transform duration-300">
          <div className="absolute inset-0 bg-telus-purple/10 rounded-full blur-xl group-hover:bg-telus-purple/20 transition-colors"></div>
          <div className="relative p-5 bg-gradient-to-br from-telus-purple/5 to-bg-secondary rounded-2xl shadow-sm border border-border-primary rotate-3 group-hover:rotate-6 transition-transform">
            <UploadCloud className="w-10 h-10 text-telus-purple -rotate-3 group-hover:-rotate-6 transition-transform" />
          </div>
        </div>
        
        <div className="space-y-2 max-w-sm">
          <p className="text-xl font-bold text-telus-gray tracking-tight">
            Upload Contract Documents
          </p>
          <p className="text-[15px] text-text-secondary font-medium leading-relaxed">
            Drag and drop a ZIP file containing SOWs, Change Orders, and DAFs
          </p>
        </div>

        <div className="flex items-center space-x-2 text-xs text-text-secondary font-bold uppercase tracking-wider bg-bg-primary/80 backdrop-blur-sm px-4 py-2 rounded-xl border border-border-primary shadow-sm group-hover:bg-bg-secondary transition-colors">
          <FileArchive className="w-4 h-4 text-telus-purple" />
          <span>Supports .zip files</span>
        </div>
      </div>
    </div>
);
};
