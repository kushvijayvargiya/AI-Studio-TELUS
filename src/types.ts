export interface Customer {
  id: string;
  name: string;
  billingAddress: string;
  postalCode: string;
  country: string;
  invoiceEmail: string;
  hardcopy: string;
  cfnNumber: string;
  wbsCode: string;
  wbsCodeOTC: string;
  partners: string; // Comma-separated partner names
}

export interface Partner {
  id: string;
  name: string;
  matCodeMRC: string;
  matCodeOTC: string;
}

export interface SowMetadata {
  id: string;
  sowName: string;
  carNumber: string;
  customerName?: string;
  facing?: 'Customer' | 'Vendor';
  isSigned?: boolean;
}
