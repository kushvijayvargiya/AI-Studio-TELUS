import { z } from 'zod';

export const CustomerSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, 'Customer name must be at least 2 characters'),
  cfnNumber: z.string().min(1, 'CFN Number is required'),
  billingAddress: z.string().min(5, 'Address is too short'),
  postalCode: z.string().min(3, 'Postal code is too short'),
  country: z.string().min(2, 'Country is required'),
  invoiceEmail: z.string().email('Invalid email address'),
  hardcopy: z.enum(['Yes', 'No']),
  wbsCode: z.string().optional(),
  wbsCodeOTC: z.string().optional(),
  partners: z.string().min(1, 'At least one partner must be assigned'),
});

export const PartnerSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, 'Partner name is too short'),
  matCodeMRC: z.string().min(1, 'MRC Material Code is required'),
  matCodeOTC: z.string().min(1, 'OTC Material Code is required'),
});

export const SowMetadataSchema = z.object({
  id: z.string().optional(),
  sowName: z.string().min(2, 'SOW Name is required'),
  carNumber: z.string().min(1, 'CAR Number is required'),
  customerName: z.string().optional(),
});

export const ActualsRowSchema = z.object({
  Customer: z.string().min(1, 'Customer name is required'),
  Service: z.string().min(1, 'Service name is required'),
  Quantity: z.union([z.number(), z.string()]).transform((val) => {
    const num = typeof val === 'string' ? parseFloat(val) : val;
    return isNaN(num) ? 0 : num;
  }),
});

export type CustomerInput = z.infer<typeof CustomerSchema>;
export type PartnerInput = z.infer<typeof PartnerSchema>;
export type SowMetadataInput = z.infer<typeof SowMetadataSchema>;
export type ActualsRowInput = z.infer<typeof ActualsRowSchema>;
