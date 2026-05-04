import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { ContractAnalysisResult, DashboardWidget } from './gemini';
import { ParsedDocument } from './zipParser';

export interface SavedCustomer {
  id: string; // e.g., UUID or timestamp
  customerName: string;
  createdAt: number;
  result: ContractAnalysisResult;
  documents: ParsedDocument[];
}

export interface CustomerSummary {
  id: string;
  customerName: string;
  partnerName?: string;
  createdAt: number;
  result: ContractAnalysisResult;
  documentCount: number;
}

export interface CustomerDocuments {
  id: string;
  documents: ParsedDocument[];
}

export interface MonthlyActuals {
  id: string; // Format: `${customerId}_${monthStr}`
  customerId: string;
  month: string; // Format: 'yyyy-MM'
  actuals: Record<string, number>; // Map of serviceName to actual quantity
}

interface ContractDB extends DBSchema {
  customers: {
    key: string;
    value: CustomerSummary;
    indexes: { 'by-date': number };
  };
  'customer-documents': {
    key: string;
    value: CustomerDocuments;
  };
  'customer-details': {
    key: string;
    value: {
      customerId: string;
      billingAddress: string;
      postalCode: string;
      country: string;
      invoiceEmail: string;
      hardcopy: string;
      cfnNumber: string;
      wbsCode: string;
      wbsCodeOTC: string;
    };
  };
  'partner-details': {
    key: string;
    value: {
      partnerId: string;
      matCodeMRC: string;
      matCodeOTC: string;
    };
  };
  'monthly-actuals': {
    key: string;
    value: MonthlyActuals;
  };
  'portfolio-budgets': {
    key: string;
    value: {
      id: string; // Format: `${partnerName}_${monthStr}`
      partnerName: string;
      month: string; // Format: 'yyyy-MM'
      budget: number;
    };
  };
  'audit-logs': {
    key: string;
    value: AuditLog;
    indexes: { 'by-customer': string, 'by-timestamp': number };
  };
  'registry-customers': {
    key: string;
    value: {
      id: string;
      name: string;
      cfnNumber: string;
      billingAddress: string;
      postalCode: string;
      country: string;
      invoiceEmail: string;
      hardcopy: string;
      wbsCode: string;
      wbsCodeOTC: string;
      partners: string;
    };
  };
  'registry-partners': {
    key: string;
    value: {
      id: string;
      name: string;
      matCodeMRC: string;
      matCodeOTC: string;
    };
  };
  'registry-sows': {
    key: string;
    value: {
      id: string;
      sowName: string;
      carNumber: string;
      customerName?: string;
    };
  };
  'pinned-widgets': {
    key: string;
    value: DashboardWidget & { pinnedAt: number, customerId?: string };
  };
}

export interface AuditLog {
  id: string;
  customerId: string;
  timestamp: number;
  userEmail: string;
  action: string;
  details: string;
  month?: string;
}

let dbPromise: Promise<IDBPDatabase<ContractDB>> | null = null;

const getDB = () => {
  if (!dbPromise) {
    dbPromise = openDB<ContractDB>('contract-analyzer-db', 9, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const store = db.createObjectStore('customers', {
            keyPath: 'id',
          });
          store.createIndex('by-date', 'createdAt');
        }
        if (oldVersion < 2) {
          db.createObjectStore('customer-documents', {
            keyPath: 'id',
          });
        }
        if (oldVersion < 3) {
          db.createObjectStore('customer-details', {
            keyPath: 'customerId',
          });
          db.createObjectStore('partner-details', {
            keyPath: 'partnerId',
          });
        }
        if (oldVersion < 4) {
          db.createObjectStore('monthly-actuals', {
            keyPath: 'id',
          });
        }
        if (oldVersion < 5) {
          const store = db.createObjectStore('audit-logs', {
            keyPath: 'id',
          });
          store.createIndex('by-customer', 'customerId');
          store.createIndex('by-timestamp', 'timestamp');
        }
        if (oldVersion < 6) {
          db.createObjectStore('registry-customers', { keyPath: 'id' });
          db.createObjectStore('registry-partners', { keyPath: 'id' });
          db.createObjectStore('registry-sows', { keyPath: 'id' });
        }
        if (oldVersion < 8) {
          if (!db.objectStoreNames.contains('portfolio-budgets')) {
            db.createObjectStore('portfolio-budgets', { keyPath: 'id' });
          }
        }
        if (oldVersion < 9) {
          if (!db.objectStoreNames.contains('pinned-widgets')) {
            db.createObjectStore('pinned-widgets', { keyPath: 'id' });
          }
        }
      },
    });
  }
  return dbPromise;
};

export async function saveCustomer(customer: SavedCustomer): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['customers', 'customer-documents'], 'readwrite');
  
  const summary: CustomerSummary = {
    id: customer.id,
    customerName: customer.customerName,
    partnerName: customer.result.partnerName,
    createdAt: customer.createdAt,
    result: customer.result,
    documentCount: customer.documents.length,
  };
  
  const documents: CustomerDocuments = {
    id: customer.id,
    documents: customer.documents,
  };

  await Promise.all([
    tx.objectStore('customers').put(summary),
    tx.objectStore('customer-documents').put(documents),
  ]);
  await tx.done;
}

export async function getAllCustomers(): Promise<CustomerSummary[]> {
  const db = await getDB();
  return db.getAllFromIndex('customers', 'by-date');
}

export async function getCustomer(id: string): Promise<SavedCustomer | undefined> {
  const db = await getDB();
  const [summary, docs] = await Promise.all([
    db.get('customers', id),
    db.get('customer-documents', id),
  ]);
  
  console.log(`getCustomer - ID: ${id}, Summary found: ${!!summary}, Docs found: ${!!docs}`);
  if (docs) {
    console.log(`getCustomer - Docs length: ${docs.documents?.length}`);
  }
  
  if (!summary) return undefined;
  
  return {
    ...summary,
    documents: docs?.documents || [],
  };
}

export async function deleteCustomer(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['customers', 'customer-documents'], 'readwrite');
  await Promise.all([
    tx.objectStore('customers').delete(id),
    tx.objectStore('customer-documents').delete(id),
  ]);
  await tx.done;
}

export interface CustomerDetails {
  customerId: string;
  billingAddress: string;
  postalCode: string;
  country: string;
  invoiceEmail: string;
  hardcopy: string;
  cfnNumber: string;
  wbsCode: string;
  wbsCodeOTC: string;
}

export interface PartnerDetails {
  partnerId: string;
  matCodeMRC: string;
  matCodeOTC: string;
}

export const saveCustomerDetails = async (details: CustomerDetails) => {
  const db = await getDB();
  return db.put('customer-details', details);
};

export const getCustomerDetails = async (customerId: string) => {
  const db = await getDB();
  return db.get('customer-details', customerId);
};

export const savePartnerDetails = async (details: PartnerDetails) => {
  const db = await getDB();
  return db.put('partner-details', details);
};

export const getPartnerDetails = async (partnerId: string) => {
  const db = await getDB();
  return db.get('partner-details', partnerId);
};

export const saveMonthlyActuals = async (actuals: MonthlyActuals) => {
  const db = await getDB();
  return db.put('monthly-actuals', actuals);
};

export const getMonthlyActuals = async (customerId: string, monthStr: string) => {
  const db = await getDB();
  return db.get('monthly-actuals', `${customerId}_${monthStr}`);
};

export const savePortfolioBudget = async (partnerName: string, monthStr: string, budget: number) => {
  const db = await getDB();
  return db.put('portfolio-budgets', {
    id: `${partnerName}_${monthStr}`,
    partnerName,
    month: monthStr,
    budget
  });
};

export const getPortfolioBudget = async (partnerName: string, monthStr: string) => {
  const db = await getDB();
  return db.get('portfolio-budgets', `${partnerName}_${monthStr}`);
};

export const getAllPortfolioBudgets = async () => {
  const db = await getDB();
  return db.getAll('portfolio-budgets');
};

export const saveAuditLog = async (log: AuditLog) => {
  const db = await getDB();
  return db.put('audit-logs', log);
};

export const getAuditLogs = async (customerId: string) => {
  const db = await getDB();
  return db.getAllFromIndex('audit-logs', 'by-customer', customerId);
};

// Registry helpers
export const getRegistryCustomers = async () => {
  const db = await getDB();
  return db.getAll('registry-customers');
};

export const saveRegistryCustomer = async (customer: any) => {
  const db = await getDB();
  return db.put('registry-customers', customer);
};

export const deleteRegistryCustomer = async (id: string) => {
  const db = await getDB();
  return db.delete('registry-customers', id);
};

export const getRegistryPartners = async () => {
  const db = await getDB();
  return db.getAll('registry-partners');
};

export const saveRegistryPartner = async (partner: any) => {
  const db = await getDB();
  return db.put('registry-partners', partner);
};

export const deleteRegistryPartner = async (id: string) => {
  const db = await getDB();
  return db.delete('registry-partners', id);
};

export const getRegistrySows = async () => {
  const db = await getDB();
  return db.getAll('registry-sows');
};

export const saveRegistrySow = async (sow: any) => {
  const db = await getDB();
  return db.put('registry-sows', sow);
};

export const deleteRegistrySow = async (id: string) => {
  const db = await getDB();
  return db.delete('registry-sows', id);
};

export const clearAllRegistries = async () => {
  const db = await getDB();
  const tx = db.transaction(['registry-customers', 'registry-partners', 'registry-sows'], 'readwrite');
  await Promise.all([
    tx.objectStore('registry-customers').clear(),
    tx.objectStore('registry-partners').clear(),
    tx.objectStore('registry-sows').clear(),
  ]);
  await tx.done;
};

// Pinned Widgets helpers
export const getPinnedWidgets = async () => {
  try {
    const db = await getDB();
    const widgets = await db.getAll('pinned-widgets');
    return Array.isArray(widgets) ? widgets : [];
  } catch (error) {
    console.error('Error fetching pinned widgets:', error);
    return [];
  }
};

export const savePinnedWidget = async (widget: DashboardWidget, customerId?: string) => {
  const db = await getDB();
  return db.put('pinned-widgets', {
    ...widget,
    pinnedAt: Date.now(),
    customerId
  });
};

export const deletePinnedWidget = async (id: string) => {
  const db = await getDB();
  return db.delete('pinned-widgets', id);
};
