import { z } from 'zod';

export const serviceDetailSchema = z.object({
  sowName: z.string().min(1, "SOW Name is required"),
  serviceName: z.string().min(1, "Service Name is required"),
  serviceType: z.string().min(1, "Service Type (e.g. MS, PS, TS) is required"),
  description: z.string().default(""),
  isSigned: z.boolean().default(false),
  requiresDAF: z.boolean().default(false),
  hasDAF: z.boolean().default(false),
  dafStartDate: z.string().default("N/A"),
  effectiveDate: z.string().default("N/A"),
  term: z.string().default("N/A"),
  expiryDate: z.string().default("N/A"),
  potentialEndDate: z.string().default("N/A"),
  billingTrigger: z.string().default("N/A"),
  billingStatus: z.string().default("N/A"),
  amount: z.string().default("$0"),
  sourceDocument: z.string().optional(),
  totalQuantity: z.string().optional().default("0"),
  previousQuantity: z.string().optional().default("0"),
  changeQuantity: z.string().optional().default("0"),
  onboardedQuantity: z.string().optional().default("0"),
  facing: z.string().optional(),
  manuallyActivated: z.boolean().optional(),
  unitPrice: z.string().optional(),
  manualVendorMatchName: z.string().optional()
});

export const changeOrderSchema = z.object({
  changeOrderNumber: z.string().min(1, "Change order number is required"),
  associatedSOW: z.string().min(1, "Associated SOW name is required"),
  changeDescription: z.string().default(""),
  date: z.string().default("N/A"),
  isSigned: z.boolean().default(false),
  requiresDAF: z.boolean().default(false),
  hasDAF: z.boolean().default(false),
  facing: z.string().default("Customer"),
  amount: z.string().default("$0"),
  services: z.array(serviceDetailSchema).optional().default([]),
  manuallyActivated: z.boolean().optional()
});

export const contractAnalysisResultSchema = z.object({
  customerName: z.string().min(1, "Customer Name is required"),
  partnerName: z.string().min(1, "Partner Name is required"),
  contractExpiryDate: z.string().default("N/A"),
  summary: z.string().min(1, "Summary is required"),
  totalBilledToCustomer: z.string().default("$0"),
  totalBilledByVendor: z.string().default("$0"),
  vendorServices: z.array(serviceDetailSchema).default([]),
  customerServices: z.array(serviceDetailSchema).default([]),
  changeOrders: z.array(changeOrderSchema).default([]),
  unsignedDocuments: z.array(z.string()).default([]),
  customerAlias: z.string().optional(),
  vendorAlias: z.string().optional()
});

export interface ValidationResult {
  success: boolean;
  data?: any;
  errors?: string[];
  issues?: { path: string; message: string; code: string }[];
}

/**
 * Validates contract analysis JSON data returned from Gemini against the Zod schema.
 * Returns parsed/coerced data or specific detailed errors for correction.
 */
export function validateContractAnalysis(data: any): ValidationResult {
  if (!data || typeof data !== 'object') {
    return {
      success: false,
      errors: ["Invalid JSON output: Root element must be an object"]
    };
  }

  // Gracefully coerce some common type-mismatches before validation to make it more robust
  const coerced = { ...data };
  if (coerced.unsignedDocuments && !Array.isArray(coerced.unsignedDocuments)) {
    coerced.unsignedDocuments = typeof coerced.unsignedDocuments === 'string'
      ? [coerced.unsignedDocuments]
      : [];
  }
  
  const result = contractAnalysisResultSchema.safeParse(coerced);
  
  if (result.success) {
    return {
      success: true,
      data: result.data
    };
  } else {
    const errors: string[] = [];
    const issues = result.error.issues.map(issue => {
      const pathStr = issue.path.join('.');
      const msg = `Field "${pathStr}": ${issue.message} (Value had error code: ${issue.code})`;
      errors.push(msg);
      return {
        path: pathStr,
        message: issue.message,
        code: issue.code
      };
    });

    return {
      success: false,
      errors,
      issues
    };
  }
}

/**
 * Compatibility wrapper that returns issues in { path, message } format.
 */
export function validateContractWithZod(data: any): { path: string; message: string }[] {
  const result = validateContractAnalysis(data);
  if (result.success) {
    return [];
  }
  return (result.issues || []).map(issue => ({
    path: issue.path,
    message: issue.message
  }));
}
