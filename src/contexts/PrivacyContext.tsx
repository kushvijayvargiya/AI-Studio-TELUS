import React, { createContext, useContext, useState, useEffect } from 'react';

interface PrivacyContextType {
  isPrivacyMode: boolean;
  togglePrivacyMode: () => void;
  maskValue: (value: string | number | undefined, type?: 'email' | 'cfn' | 'text') => string;
}

const PrivacyContext = createContext<PrivacyContextType | undefined>(undefined);

export const PrivacyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isPrivacyMode, setIsPrivacyMode] = useState(() => {
    const saved = localStorage.getItem('privacy-mode');
    return saved === 'true';
  });

  useEffect(() => {
    localStorage.setItem('privacy-mode', String(isPrivacyMode));
  }, [isPrivacyMode]);

  const togglePrivacyMode = () => setIsPrivacyMode(prev => !prev);

  const maskValue = (value: string | number | undefined, type: 'email' | 'cfn' | 'text' = 'text'): string => {
    if (!value) return 'N/A';
    if (!isPrivacyMode) return String(value);

    const str = String(value);
    
    if (type === 'email') {
      const [user, domain] = str.split('@');
      if (!domain) return '••••••••';
      return `${user[0]}••••@${domain}`;
    }

    if (type === 'cfn') {
      return str.replace(/./g, '•').slice(0, 8);
    }

    if (str.length <= 4) return '••••';
    return `${str.slice(0, 2)}••••${str.slice(-2)}`;
  };

  return (
    <PrivacyContext.Provider value={{ isPrivacyMode, togglePrivacyMode, maskValue }}>
      {children}
    </PrivacyContext.Provider>
  );
};

export const usePrivacy = () => {
  const context = useContext(PrivacyContext);
  if (context === undefined) {
    throw new Error('usePrivacy must be used within a PrivacyProvider');
  }
  return context;
};
