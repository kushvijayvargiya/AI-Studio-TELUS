import React from 'react';

interface TelusLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const TelusLogo: React.FC<TelusLogoProps> = ({ className = '', size = 'md' }) => {
  const [imgError, setImgError] = React.useState(false);
  const [useFallback, setUseFallback] = React.useState(false);

  const sizeClasses = {
    sm: 'w-6 h-6 text-[8px]',
    md: 'w-12 h-12 text-[10px]',
    lg: 'w-32 h-32 text-xl'
  };

  const handleInitialError = () => {
    // If local logo fails, try the first external SVG
    setImgError(true);
  };

  const handleFinalError = () => {
    // If all images fail, use text fallback
    setUseFallback(true);
  };

  if (useFallback) {
    return (
      <div className={`flex flex-col items-center justify-center font-bold text-telus-purple border border-telus-purple/20 rounded-lg ${sizeClasses[size]} ${className}`}>
        <span className="leading-none">TELUS</span>
      </div>
    );
  }

  // Priority: 
  // 1. Local /logo.png
  // 2. Local /telus-logo.svg
  // 3. VectorLogo SVGs
  // 4. Wikimedia Fallback
  const getSrc = () => {
    if (!imgError) return "/logo.png";
    return "/telus-logo.svg";
  };

  return (
    <div className={`relative flex items-center justify-center ${sizeClasses[size]} ${className}`}>
      <img 
        src={getSrc()}
        alt="TELUS" 
        className="w-full h-full object-contain p-1"
        onError={(e) => {
          const target = e.target as HTMLImageElement;
          if (target.src.includes("/logo.png")) {
            // Try telus-logo.svg if png fails
            target.src = "/telus-logo.svg";
          } else if (target.src.includes("/telus-logo.svg")) {
            // Try external SVG if all local fail
            target.src = "https://www.vectorlogo.zone/logos/telus/telus-ar21.svg";
          } else if (target.src.includes("vectorlogo.zone")) {
            // Try Wiki fallback
            target.src = "https://upload.wikimedia.org/wikipedia/commons/d/d4/TELUS_logo.svg";
          } else {
            handleFinalError();
          }
        }}
      />
    </div>
  );
};
