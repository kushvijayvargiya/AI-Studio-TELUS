import { GoogleGenAI, Type, GenerateContentResponse, ThinkingLevel } from '@google/genai';
import { ParsedDocument } from './zipParser';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const callWithRetry = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = 5,
  baseDelay: number = 2000
): Promise<T> => {
  let lastError: any = null;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const errorStr = typeof error === 'string' ? error : JSON.stringify(error);
      
      // Only retry on 429 (Rate Limit) or 5xx (Server Error)
      const isRateLimit = errorStr.includes("429") || errorStr.includes("RESOURCE_EXHAUSTED");
      const isServerError = errorStr.includes("500") || errorStr.includes("503") || errorStr.includes("INTERNAL") || errorStr.includes("Internal error encountered");
      
      if (isRateLimit || isServerError) {
        const retriesLeft = maxRetries - i - 1;
        if (retriesLeft > 0) {
          // Exponential backoff with jitter
          const delay = Math.min(baseDelay * Math.pow(2, i) + Math.random() * 1000, 30000);
          console.warn(`Gemini API error (${isRateLimit ? 'Rate Limit' : 'Server Error'}). Retrying in ${Math.round(delay)}ms... (${retriesLeft} retries left)`);
          await sleep(delay);
          continue;
        }
      }
      throw error;
    }
  }
  throw lastError;
};

/** Helper function to clean and parse JSON from Gemini's response */
const extractJson = (text: string) => {
  try {
    // Remove markdown formatting if present
    let cleanText = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    
    // Find first { to start the JSON object
    const start = cleanText.indexOf('{');
    if (start === -1) throw new Error("No JSON object found in response");
    
    // Attempt standard parse first
    let targetText = cleanText.substring(start);
    try {
      return JSON.parse(targetText);
    } catch (e) {
      // If full parse fails, try to find the last occurrence of '}' and parse from start to there
      const lastBrace = targetText.lastIndexOf('}');
      if (lastBrace !== -1) {
        try {
          return JSON.parse(targetText.substring(0, lastBrace + 1));
        } catch (e2) {
          // Fall through to reconstruction
        }
      }
    }

    // Advanced reconstruction: Use a stack-based approach to close unclosed objects/arrays
    let stack: string[] = [];
    let inString = false;
    let escaped = false;
    let resultText = "";
    
    for (let i = start; i < cleanText.length; i++) {
        const char = cleanText[i];
        
        if (escaped) {
            resultText += char;
            escaped = false;
            continue;
        }
        
        if (char === '\\') {
            resultText += char;
            escaped = true;
            continue;
        }
        
        if (char === '"') {
            inString = !inString;
            resultText += char;
            continue;
        }
        
        if (!inString) {
            if (char === '{') stack.push('}');
            else if (char === '[') stack.push(']');
            else if (char === '}' || char === ']') {
              if (stack.length > 0 && stack[stack.length - 1] === char) {
                stack.pop();
              } else {
                // Skip extra or mismatched closers
                continue;
              }
            }
        }
        
        resultText += char;
    }

    // Close any unclosed string
    if (inString) resultText += '"';
    
    // Close the stack in reverse order
    while (stack.length > 0) {
        resultText += stack.pop();
    }
    
    // Fix trailing commas: [1, 2,] -> [1, 2]
    resultText = resultText.replace(/,\s*([}\]])/g, '$1');
    
    // Final cleaning: remove non-printable characters except whitespace
    resultText = resultText.replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F-\u009F]/g, '');
    
    return JSON.parse(resultText);
  } catch (e) {
    if (e instanceof Error) {
        console.error(`JSON Extraction Error: ${e.message}`);
    } else {
        console.error("JSON Extraction Error:", e);
    }
    console.debug("JSON extraction failed on text length:", text.length);
    throw e;
  }
};

export interface ServiceDetail {
  sowName: string;
  serviceName: string;
  serviceType: string; // "PS" (One-time) | "MS" (Recurring) | "TS" (One-time) | "Other"
  description: string;
  isSigned: boolean;
  requiresDAF: boolean;
  hasDAF: boolean;
  dafStartDate: string;
  effectiveDate: string;
  term: string;
  expiryDate: string;
  potentialEndDate: string;
  billingTrigger: string;
  billingStatus: string;
  amount: string; // Added to track amount per service
  sourceDocument?: string; // The specific document name where this service was found
  totalQuantity?: string; // Total quantity from SOW/CO
  previousQuantity?: string; // For Change Orders: Quantity before the change
  changeQuantity?: string; // For Change Orders: The delta (e.g., "+50", "-20")
  onboardedQuantity?: string; // Quantity from DAF
  facing?: string; // "Vendor" or "Customer"
  manuallyActivated?: boolean; // Indicates if the user manually marked the DAF as received
  unitPrice?: string; // Added to track unit price per service
  manualVendorMatchName?: string; // Manually matched vendor service name
}

export interface ChangeOrder {
  changeOrderNumber: string;
  associatedSOW: string;
  changeDescription: string;
  date: string;
  isSigned: boolean;
  requiresDAF: boolean;
  hasDAF: boolean;
  facing: string; // "Vendor" or "Customer"
  amount: string; // e.g., "$0", "Zero dollar", "$500"
  services?: ServiceDetail[]; // Services added or modified by this CO
  manuallyActivated?: boolean; // Indicates if the user manually marked it as active
}

export interface ContractAnalysisResult {
  customerName: string;
  partnerName: string;
  contractExpiryDate: string;
  summary: string;
  totalBilledToCustomer: string;
  totalBilledByVendor: string;
  vendorServices: ServiceDetail[]; // Partner Services
  customerServices: ServiceDetail[]; // TELUS Partner Hub Services
  changeOrders: ChangeOrder[];
  unsignedDocuments: string[];
  customerAlias?: string;
  vendorAlias?: string;
}

export const chatWithContract = async (query: string, result: ContractAnalysisResult): Promise<string> => {
  return callWithRetry(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: `You are a contract expert. Based on the following analysis of a customer's contract, answer the user's question.
      
      ANALYSIS DATA:
      ${JSON.stringify(result, null, 2)}
      
      USER QUESTION:
      ${query}
      
      Provide a concise, professional answer based ONLY on the provided data. If the answer isn't in the data, say so.`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
      }
    });
    
    return response.text || "I couldn't generate an answer.";
  });
};

export interface DashboardWidget {
  id: string;
  type: 'summary' | 'bar' | 'pie' | 'line';
  title: string;
  description?: string;
  data: any[];
  config: {
    dataKey?: string;
    categoryKey?: string;
    color?: string;
    colors?: string[];
    prefix?: string;
    suffix?: string;
  };
}

export const generateSmartDashboard = async (query: string, result: ContractAnalysisResult): Promise<{ message: string, widgets: DashboardWidget[] }> => {
  return callWithRetry(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          role: 'user',
          parts: [{ text: `You are AXON, an Intelligence assistant. Your task is to create a dynamic dashboard based on the user's request.
          
CONTRACT DATA:
${JSON.stringify({ ...result, documents: undefined }, null, 2)}

USER REQUEST: ${query}

INSTRUCTIONS:
1. Analyze the contract data and the user request.
2. Provide a helpful textual response explaining what you are showing in the 'message' field.
3. Define 1 to 4 widgets that visualize the data requested.
4. If the data is not available, do not return a widget. Instead, use the 'message' field to explain why.
5. CRITICAL INSTRUCTION: You MUST output ONLY valid, raw JSON. Do NOT output markdown code blocks (e.g., \`\`\`json). Do NOT add conversational text outside of the JSON object. 

6. REVENUE CALCULATION RULES (CRITICAL):
   - MS (Managed Services): These are RECURRING monthly fees. Use for Monthly Recurring Revenue (MRR) metrics.
   - PS (Professional Services) / TS (Transition Services): These are ONE-TIME fees (e.g. project work, onboarding). Use for Total One-time Value metrics.
   - ONLY include services where 'isSigned' is true. Unsigned services are potential revenue, not actual revenue.
   - CANCELLATIONS (IMPORTANT): Check 'changeOrders' for any "Cancellation", "Termination", or "Removal" descriptions.
     - Example: If a change order says "Felix Schoeller cancellation" for a specific SOW, that SOW's revenue MUST be treated as 0 for any current/active revenue charts.
     - If a user asks for "total revenue", they mean the CURRENT active monthly revenue (MS) plus total project revenue (PS) that hasn't been cancelled.
   - LABELING: In your charts, clearly distinguish between "MS Revenue (Monthly)" and "PS Revenue (One-time)". Never mix them in the same bar/slice without clear labels.
   - CURRENCY: When parsing 'amount' strings (e.g., "$125,000 / month"), extract the raw number. "/ month" or "/ mo" always indicates MS.

WIDGET TYPES:
- 'summary': A single big number or text value.
- 'bar': A bar chart for comparisons.
- 'pie': A pie chart for distributions.
- 'line': A line chart for trends.

DATA FORMAT:
You MUST map the relevant metrics from the data into a standard array of objects format: 
e.g., [{ name: 'Item A', value: 100 }, { name: 'Item B', value: 200 }].
CRITICAL NUMBERS: The 'value' property MUST be a valid raw mathematical number (e.g., 500.50), NOT a string, and MUST NOT contain currency symbols or commas.
Use the widget config 'prefix' (e.g., "$") and 'suffix' to format the numbers on the frontend.
It is CRITICAL that you do not just provide empty arrays. You must populate the 'data' array with the requested information mapped to 'name' and 'value' properties.
You MUST provide 'dataKey' as "value" and 'categoryKey' as "name" in the widget config for consistency in visualization.` }]
        }
      ],
      config: {
        responseMimeType: "application/json",
        maxOutputTokens: 2048,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            message: { type: Type.STRING, description: "Your conversational response to the user. Keep it concise (under 500 characters)." },
            widgets: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  type: { type: Type.STRING, enum: ['summary', 'bar', 'pie', 'line'] },
                  title: { type: Type.STRING },
                  description: { type: Type.STRING },
                  data: { 
                    type: Type.ARRAY,
                    items: { 
                      type: Type.OBJECT,
                      properties: {
                        name: { type: Type.STRING },
                        value: { type: Type.NUMBER }
                      },
                      required: ["name", "value"]
                    }
                  },
                  config: {
                    type: Type.OBJECT,
                    properties: {
                      dataKey: { type: Type.STRING },
                      categoryKey: { type: Type.STRING },
                      color: { type: Type.STRING },
                      colors: { type: Type.ARRAY, items: { type: Type.STRING } },
                      prefix: { type: Type.STRING },
                      suffix: { type: Type.STRING }
                    }
                  }
                },
                required: ['id', 'type', 'title', 'data', 'config']
              }
            }
          },
          required: ['message', 'widgets']
        }
      }
    });

    try {
      const text = response.text;
      if (!text) throw new Error("Empty response from AI");
      return extractJson(text);
    } catch (e) {
      console.error("Failed to parse Gemini dashboard JSON:", e);
      return { message: "I encountered an error while generating the dashboard components. Please try a simpler query.", widgets: [] };
    }
  });
};

export const generateGlobalDashboard = async (query: string, customers: any[]): Promise<{ message: string, widgets: DashboardWidget[] }> => {
  return callWithRetry(async () => {
    // 1. Basic High-Level Metrics
    const totalCustomers = customers.length;
    const allServices = customers.flatMap(c => [
      ...(c.result.customerServices || []),
      ...(c.result.changeOrders || []).flatMap((co: any) => co.services || [])
    ]);
    
    // 2. Revenue by Customer (Top 10)
    const revenueByCustomer = customers.map(c => ({
      name: c.customerName,
      value: (c.result.customerServices || []).reduce((acc: number, s: any) => acc + (parseFloat(s.amount?.replace(/[^0-9.-]+/g, '')) || 0), 0) +
               (c.result.changeOrders || []).reduce((acc: number, co: any) => acc + (co.services || []).reduce((sub: number, s: any) => sub + (parseFloat(s.amount?.replace(/[^0-9.-]+/g, '')) || 0), 0), 0)
    })).sort((a, b) => b.value - a.value).slice(0, 10);

    // 3. Service Distribution by Type
    const typeDistributionMap: Record<string, number> = {};
    allServices.forEach(s => {
      const type = s.serviceType || 'Unknown';
      typeDistributionMap[type] = (typeDistributionMap[type] || 0) + 1;
    });
    const typeDistribution = Object.entries(typeDistributionMap).map(([type, count]) => ({ name: type, value: count }));

    // 4. Most Frequent Services
    const serviceFrequencyMap: Record<string, number> = {};
    allServices.forEach(s => {
      const name = s.serviceName || 'Unknown';
      serviceFrequencyMap[name] = (serviceFrequencyMap[name] || 0) + 1;
    });
    const topServices = Object.entries(serviceFrequencyMap)
      .map(([name, count]) => ({ name, value: count }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 15);

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          role: 'user',
          parts: [{ text: `You are AXON Global Intelligence. You are analyzing the entire contract portfolio.
          
PORTFOLIO AGGREGATED DATA:
- Total Customers: ${totalCustomers}
- Revenue by Customer (Top 10): ${JSON.stringify(revenueByCustomer, null, 2)}
- Service Distribution (by Type): ${JSON.stringify(typeDistribution, null, 2)}
- Most Common Services: ${JSON.stringify(topServices, null, 2)}

USER REQUEST: ${query}

5. REVENUE CALCULATION RULES (CRITICAL):
   - MS (Managed Services): These are RECURRING monthly fees. Use for Monthly Recurring Revenue (MRR) metrics.
   - PS (Professional Services) / TS (Transition Services): These are ONE-TIME fees (e.g. project work, onboarding). Use for Total One-time Value metrics.
   - ONLY include services where 'isSigned' is true.
   - CANCELLATIONS: Check 'changeOrders' for any "Cancellation", "Termination", or "Removal" descriptions.
     - Example: If a change order says "Felix Schoeller cancellation" for a specific SOW, that SOW's revenue MUST be treated as 0 for any current/active revenue charts.
   - LABELING: Clearly distinguish between "MS Revenue (Monthly)" and "PS Revenue (One-time)".
   - CURRENCY: Extract raw numbers from strings like "$125,000 / month". "/ month" or "/ mo" always indicates MS.

INSTRUCTIONS:
1. Create a dashboard that directly addresses the user request using the provided aggregated data.
2. Provide a helpful textual response explaining what you are showing in the 'message' field.
3. Define 1 to 4 widgets. For each widget:
   - 'summary': Key numbers or takeaways.
   - 'bar': Comparisons (e.g., revenue by customer).
   - 'pie': Parts of a whole (e.g., service type distribution).
   - 'line': Trends (if you can infer them, otherwise prefer bar).
4. If the data is not available, do not return a widget. Instead, use the 'message' field to explain why.
5. CRITICAL INSTRUCTION: You MUST output ONLY valid, raw JSON. Do NOT output markdown code blocks (e.g., \`\`\`json). Do NOT add conversational text outside of the JSON object. 

DATA FORMAT:
You MUST map the relevant metrics from the data into a standard array of objects format: 
e.g., [{ name: 'Item A', value: 100 }, { name: 'Item B', value: 200 }].
CRITICAL NUMBERS: The 'value' property MUST be a valid raw mathematical number (e.g., 500.50), NOT a string, and MUST NOT contain currency symbols or commas.
Use the widget config 'prefix' (e.g., "$") and 'suffix' to format the numbers on the frontend.
It is CRITICAL that you do not just provide empty arrays. You must populate the 'data' array with the requested information mapped to 'name' and 'value' properties.
You MUST provide 'dataKey' as "value" and 'categoryKey' as "name" in the widget config for consistency in visualization.
If the user asks for a comparison, prefer "bar" or "pie" widgets. If they ask for a single metric, use "summary".
ALWAYS include at least one widget if there is ANY applicable data from the PORTFOLIO AGGREGATED DATA.

WIDGET TYPES: 'summary', 'bar', 'pie', 'line'.` }]
        }
      ],
      config: {
        responseMimeType: "application/json",
        maxOutputTokens: 2048,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            message: { type: Type.STRING, description: "A concise summary of the insights (keep under 500 characters)." },
            widgets: {
              type: Type.ARRAY,
              maxItems: 4,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  type: { type: Type.STRING, enum: ['summary', 'bar', 'pie', 'line'] },
                  title: { type: Type.STRING },
                  description: { type: Type.STRING },
                  data: { 
                    type: Type.ARRAY, 
                    items: { 
                      type: Type.OBJECT, 
                      properties: {
                        name: { type: Type.STRING },
                        value: { type: Type.NUMBER }
                      },
                      required: ["name", "value"]
                    } 
                  },
                  config: {
                    type: Type.OBJECT,
                    properties: {
                      dataKey: { type: Type.STRING },
                      categoryKey: { type: Type.STRING },
                      color: { type: Type.STRING },
                      colors: { type: Type.ARRAY, items: { type: Type.STRING } },
                      prefix: { type: Type.STRING },
                      suffix: { type: Type.STRING }
                    }
                  }
                },
                required: ['id', 'type', 'title', 'data', 'config']
              }
            }
          },
          required: ['message', 'widgets']
        }
      }
    });

    try {
      const text = response.text;
      if (!text) throw new Error("Empty response from AI");
      return extractJson(text);
    } catch (e) {
      console.error("Failed to parse Global Gemini dashboard JSON:", e);
      return { message: "I encountered an error generating the global portfolio dashboard.", widgets: [] };
    }
  });
};

export const analyzeDocuments = async (docs: ParsedDocument[]): Promise<ContractAnalysisResult> => {
  const parts: any[] = [];

  // Add instructions
  parts.push({
    text: `You are an expert contract analyst. I am providing you with a set of documents related to a customer's contract.
These documents are organized into folders within a ZIP file.

CRITICAL RULES FOR ANALYSIS:
1. Folder-based Processing (MANDATORY):
   - TREAT EACH FOLDER AS A SINGLE UNIT (ONE SOW GROUP).
   - You MUST assess ALL folders provided. Do not skip any.
   - CRITICAL: You MUST use the exact Folder Name provided in the document header (e.g., "Folder: Felix Scholler") as the 'sowName' for all services and the 'associatedSOW' for all change orders found within that folder. HOWEVER, if a Change Order is in the "Main" or "Root" folder and does not have its own subfolder, you MUST consider it a Change Order of the main SOW. Extract the associated SOW name from the document text, or if there is only one main SOW, use that SOW's name as the 'associatedSOW'.
   - A folder typically contains one main SOW document and several associated Change Orders (COs) and Deliverable Approval Forms (DAFs).
   - CRITICAL: In folders dedicated to a Change Order, you may find a "Contract" or "SOW" document alongside the "Change Order" document. Do NOT mistake the "Contract" as a separate Change Order; it is the base contract corresponding to that specific Change Order. Only extract the Change Order details from the document explicitly labeled as a Change Order or CO.
   - NOTE: Documents may be in French. You are fully capable of reading and extracting data from French SOWs, Contracts, and Change Orders. Translate the extracted fields (like service names, descriptions) to English in your JSON output if possible, but ensure accuracy of the extracted data.
2. Providers (Vendor vs Customer): 
   - Extract the name of the partner/vendor providing the services into 'partnerName' (e.g., Jolera, or another partner).
   - The partner/vendor who bills TELUS goes into 'vendorServices'.
   - "TELUS Partner Hub Services" is what TELUS bills the customer. Put these in 'customerServices'.
   - IMPORTANT: Customer SOWs often have a "Managed Services" section just like Vendor SOWs. You MUST extract these into 'customerServices'.
3. Service Extraction (Line by Line) - 🚨 EXTREMELY IMPORTANT: 
   - You MUST extract EVERY individual service line item from the pricing/service tables in the SOWs AND the Change Orders.
   - You MUST list out each individual service line item found in the tables for BOTH parties. **DO NOT SUMMARIZE OR CONSOLIDATE SERVICES.**
   - For Managed Services (MS), list out each specific sub-service (e.g., "Service Desk - Tier 1", "Network Monitoring - Gold", "Endpoint Management - Windows") as a separate entry.
   - **CRITICAL**: Do NOT include the customer name in the \`serviceName\` field. For example, if the document says "Al Stober - User Defence", the \`serviceName\` should be "User Defence".
   - **CRITICAL**: Treat hardware models, license types, and specific variants as distinct services. For example, "Secure IT Firewall - F180" and "Secure IT Firewall - APOS - Meraki" MUST be extracted as two completely separate services, not merged into one.
   - Look for columns like "Service Element Description", "Description", "Service Name", or "Item" to identify individual services.
   - Extract the "Quantity" column from the SOW/CO tables into \`totalQuantity\`.
   - Cross-reference with DAF documents in the same folder. If a DAF lists a quantity for a service, put that in \`onboardedQuantity\`.
   - **MANDATORY**: Every row in a pricing table MUST be a separate entry in your JSON array. If a table has 45 rows, your array MUST have 45 objects. Never summarize them into one "Managed Services" entry.
   - If a Change Order adds or modifies services, list those services specifically within that Change Order's \`services\` array.
   - CRITICAL: DO NOT put the list of services in the \`summary\` field. The \`summary\` should only be a high-level overview of the contract. ALL individual service line items MUST be placed in the \`vendorServices\` or \`customerServices\` arrays.
   - For each service, provide the \`sourceDocument\` (the filename) where you found it.
   - CRITICAL: For services added or modified in a Change Order, you MUST prioritize the effective date listed in the Change Order document over any effective date listed in the original SOW document.
4. Billing & Signatures: 
   - Check signatures for EVERY document. Unsigned = Not Active.
   - CRITICAL NEW RULE (Signatures Page): You MUST explicitly check the "Signatures" page or signature block at the end of every document. If there are names, dates, DocuSign stamps, or any indication of signing on that page, the document IS SIGNED. Do not rely solely on the filename. If it has been signed on the signatures page, mark 'isSigned: true'.
   - CRITICAL NEW RULE (SOW Signatures): If a SOW is not explicitly named "signed", check the signatures section within the SOW document itself to verify if it has been signed. If you find signatures in the signature block, mark the SOW and its services as 'isSigned: true'.
   - CRITICAL NEW RULE (Combined Contracts): Sometimes multiple SOWs have their contracts combined into a single document. If a SOW appears to be missing a contract or signature, check if a combined contract document exists that covers it. If the combined contract is signed, consider the associated SOWs as signed.
   - CRITICAL NEW RULE ($0 SOWs): For a SOW that totals $0 to be considered active (isSigned = true), it MUST have BOTH the SOW document AND the Contract document signed.
   - CRITICAL NEW RULE (Effective July 2025 onwards): Any Change Order (CO) dated July 2025 or later with an amount > $0 DOES NOT need to be signed. For these specific >$0 COs, you MUST set 'isSigned' to true even if no signature is found. However, $0 COs or credit back COs (amount <= 0) MUST be signed to be effective (if unsigned, set 'isSigned' to false). COs before July 2025 must always be signed.
   - CRITICAL NEW RULE ($0 Vendor CR/CO): If a Vendor Change Request/Order is signed and is for $0, it is likely a SKU change. You MUST incorporate this change into your analysis and the evolution table, even if a corresponding Customer Change Order is missing or unsigned.
   - A service is only "Billed" if it is signed AND (if it's MS) it has a signed DAF.
   - MS services (for both Vendor and Customer) require a DAF. If no DAF is found in the folder, status is "Pending DAF".
    - CRITICAL NEW RULE (Change Order Number): You MUST extract the Change Order Number primarily from the FOLDER NUMBER/NAME (e.g., if the folder path contains "03 CO1", "CO-02", "CR004", use that exact string), and then fallback to the FILENAME. The folder number/name is the most reliable source of truth for the CO number. Only if both lack a CO number should you look inside the document text.
    - CRITICAL NEW RULE (Change Order Quantity & Price Logic): For Change Orders (COs), you MUST extract the 'SOW Qty' (or 'Current Qty'), 'Change', 'New Qty' (or 'Onboarded Qty'), AND 'Unit Price' (or 'Unit Charges') from the CO tables.
         - Specifically, look for 'Table 1' in 'Section B' of the Change Order document. Column headers might include:
           - Current Quantity / SOW Qty -> Map to 'previousQuantity'
           - Change -> Map to 'changeQuantity'
           - New Total Qty / New Qty -> Map to 'totalQuantity'
           - Unit Charge / Unit Charges / Unit Price / Rate -> Map to 'unitPrice'. THIS IS THE COST PER SINGLE UNIT.
         - Identify the columns by their semantic meaning. Extract the numbers EXACTLY as they appear.
         - For Professional Services (PS) in a CO, 'previousQuantity' should be "0" as they are typically net-new projects.
         - CRITICAL: Use the 'Unit Charge', 'Unit Charges' or 'Unit Price' column to populate the 'unitPrice' field for services within a Change Order. If you aren't able to find the unit charge amount explicitly in the table, you MUST calculate it by dividing the total line amount by the 'Change' quantity.
    - CRITICAL NEW RULE (Effective Date for COs):
         - For Managed Services (MS) in a CO: Extract the 'Effective Date' from the table. If it says "Upon DAF", set the effective date to "Upon DAF".
         - For One-Time Charges (PS or NRC in MS CO): The effective date is the first day of the month FOLLOWING the signing date of the CO.
    - CRITICAL NEW RULE (Service Name Consistency): Service names in COs should match the names in the original SOW. Use the Service Name as the primary key for matching updates to existing services.
    - CRITICAL NEW RULE (Effective Date for PS SOWs): For Professional Services (PS) SOWs, the effective date is the date of signing. You MUST read this date from "section 6 - signatures" of the SOW document. You MUST return the actual date (e.g., "2025-07-30") and NOT the phrase "date of signing" or "Upon DAF". If the date is not explicitly in the document, look for the date signed in the signature block. If absolutely no date can be found, use the SOW date.
    - CRITICAL NEW RULE (Effective Dates & DAFs): For Managed Services (MS), the DAF (Deliverable Approval Form) is the ULTIMATE source of truth for the 'effectiveDate'. Even if an SOW or Change Order table lists an 'Effective Date', if a DAF exists in the same folder, you MUST use the DAF date as the 'effectiveDate' for all MS services in that folder. If an SOW says "Upon DAF", the effective date is the DAF date. For Professional Services (PS) or Transition Services (TS), if they explicitly have an "Effective Date" in the document, use that date and NO DAF IS NEEDED. For these services, set 'requiresDAF' to false.
    - **CRITICAL CHANGE ORDER RULE**: If a Change Order (CO) document explicitly provides an "Effective Date" for a service or for the CO itself, then that service or CO does NOT require a DAF, **UNLESS** the Effective Date explicitly states "Upon DAF". If it says "Upon DAF", the service **STRICTLY REQUIRES** a DAF, and you must set 'requiresDAF: true' and 'billingStatus: "Pending DAF"' (unless a DAF is actually found in the folder). If a concrete date is provided (e.g. "Oct 1, 2024"), set 'requiresDAF: false' and 'billingStatus: "Billed"' (or "Active") for such services/COs.
    - **CRITICAL DAF MATCHING**: You MUST search all documents in a folder for any file named "DAF" or containing "Deliverable Approval Form". If such a document exists, you MUST extract the "Date of Acceptance" or "Effective Date" from it and apply it to ALL Managed Services in that SOW group. If you find a DAF, you MUST set 'hasDAF: true' and 'requiresDAF: true' for those services.
   - CRITICAL: The DAF (Deliverable Approval Form) is the source of truth for "Onboarded Quantity" and "effectiveDate" (Start Date) for Managed Services (MS).
   - Professional Services (PS) and Transition Services (TS) (including those in Change Orders) should have 'onboardedQuantity' equal to 'totalQuantity' if they are marked as "Billed", "Completed", or "Delivered". Otherwise, leave it as "0".
   - For every Managed Service (MS), look for a corresponding DAF in the same folder. Extract the quantity listed in the DAF into 'onboardedQuantity'.
   - The date on the DAF is BOTH the 'dafStartDate' AND the 'effectiveDate' for Managed Services (MS).
   - Calculate 'potentialEndDate' by adding the 'term' (e.g., 36 months) to the 'effectiveDate' (DAF date). You MUST perform this calculation.
   - The first DAF in a folder sets the 'effectiveDate' for all Managed Services (MS) in that SOW group.
5. TS vs MS Separation (🚨 MANDATORY):
   - You MUST ensure which services are **Transition Services (TS)** and which are **Managed Services (MS)**.
   - **CRITICAL**: Do NOT merge TS services with MS services. They MUST be separate line items. TS are usually one-time setup/migration tasks (NRC), while MS are recurring operational services (MRC).
   - Even if they appear next to each other in a table, they MUST be treated as distinct services with their own 'serviceType' ('TS' or 'MS').
6. Document Facing Awareness:
   - You MUST be aware of the document's origin. 
   - **TELUS Customer SOW**: A customer-facing document where TELUS bills the End Customer. These services go into 'customerServices'.
   - **Vendor SOW**: A document between a Partner/Vendor and TELUS where the Vendor bills TELUS. These services go into 'vendorServices'.
   - You can usually identify these by the "Agreement Between" section, the logos/branding on the front page, or the party names listed in the preamble.
7. Financials:
   - Extract the specific 'amount' for EVERY service and EVERY change order for BOTH parties.
   - CRITICAL: The 'amount' field MUST be the TOTAL COST for that line item (Quantity multiplied by Unit Price), NOT just the per-unit cost. If the table only provides a unit price and a quantity, you MUST perform the multiplication yourself to provide the total amount.
   - For French contracts or documents, numbers might be formatted with spaces as thousands separators (e.g., "57 600" instead of "57,600", or "1 234 567"). Ensure you accurately capture and calculate these amounts, and output them correctly.
   - **CRITICAL**: Always extract the 'unitPrice' if it is explicitly listed in the document. This is the cost per single unit (e.g., "$10.00 per user"). Ensure the extracted string is clean without empty lines.
   - For Customer SOWs, look very carefully for tables named "Managed Services", "Professional Services", "Pricing Schedule", "Fees", or "Investment". Extract each line item.
   - Look for columns like "Monthly Fixed", "MRC", "Fixed One Time Charge", or "NRC" to find the amounts.
   - Calculate totals for both Customer and Vendor facing items. Ensure 'totalBilledToCustomer' reflects the sum of all 'customerServices' and customer-facing 'changeOrders'.
   - If a service has a "Monthly Fixed" or "MRC" amount, it is a Managed Service (MS).
   - If a service has a "Fixed One Time Charge" or "NRC" amount, it is a Professional Service (PS) or Transition Service (TS).
   - CRITICAL: "Transition Services" (TS) are distinct from "Professional Services" (PS). TS specifically refers to the phase of moving services to the vendor. PS refers to project-based work. You MUST classify them as 'TS' or 'PS' respectively in the 'serviceType' field.
   - TS and PS are one-time only. They usually have an end date or completion date mentioned. MS is recurring.
   - Ensure you capture the "Quantity" from the SOW/CO tables as 'totalQuantity'.

    - For Change Orders: If the document specifies a "Previous Quantity" or "Current Quantity" (before the change), extract it into 'previousQuantity'. If it's a new service being added, 'previousQuantity' should be "0".
    - For Deliverable Approval Forms (DAFs): Extract the quantities being approved into 'onboardedQuantity'. This quantity represents what has been delivered/onboarded.
    - IMPORTANT: For Managed Services (Recurring), the 'totalQuantity' is the number of units (e.g., "500 Users", "10 Servers"). For One-time services (PS/TS), it might be "1" or a specific number of hours/units.
    - If a service is a Professional Service (PS) or Transition Service (TS) and the document indicates it has been "Billed" or "Completed", set its 'onboardedQuantity' equal to its 'totalQuantity'.
    - If a service is from an SOW and there is a corresponding DAF in the same folder, the 'onboardedQuantity' for that service should come from the DAF.
    - If no DAF is present for an SOW service, 'onboardedQuantity' should be "0" unless it's a billed PS/TS service.
    - CRITICAL: For Change Orders, use the exact Folder Name as the 'associatedSOW'. If the Change Order is in the "Main" or "Root" folder and doesn't have a specific subfolder, extract the associated SOW name from the document text to ensure it links to the correct main SOW.
    - For Change Orders: 'totalQuantity' is the NEW total quantity after the change. 'previousQuantity' is the quantity BEFORE the change. 'changeQuantity' is the delta (e.g., "+50", "-20").
    - If a Change Order only specifies the "Change" (e.g., "Add 50"), then 'changeQuantity' should be "+50" and 'totalQuantity' should be 'previousQuantity' + 50.
    - If a Change Order specifies "Increase from 100 to 150", then 'previousQuantity' is "100", 'changeQuantity' is "+50", and 'totalQuantity' is "150".
    - If a Change Order adds a brand new service, 'previousQuantity' is "0", 'changeQuantity' is the amount added, and 'totalQuantity' is the same.
    - If a Change Order deletes a service, 'totalQuantity' should be "0" and 'changeQuantity' should be the negative of the previous quantity.
IMPORTANT: Be extremely concise in descriptions (< 10 words). Use abbreviations.

Please analyze ALL folders and documents and extract the information in the specified JSON format.

Here are the documents:`
  });

  // Add documents
  for (const doc of docs) {
    const folderInfo = doc.folder ? ` (Folder: ${doc.folder})` : '';
    if (doc.isText) {
      parts.push({
        text: `--- Document: ${doc.name}${folderInfo} ---\n${doc.data}\n--- End of Document ---`
      });
    } else {
      parts.push({
        text: `--- Document: ${doc.name}${folderInfo} (See attached file) ---`
      });
      parts.push({
        inlineData: {
          mimeType: doc.mimeType,
          data: doc.data,
        }
      });
    }
  }

  const serviceSchema = {
    type: Type.OBJECT,
    properties: {
      sowName: { type: Type.STRING, description: "The name of the SOW document this service belongs to. CRITICAL: You MUST use the exact Folder Name as the sowName." },
      serviceName: { type: Type.STRING },
      serviceType: { type: Type.STRING, description: "'PS' (Professional Services), 'MS' (Managed Services), 'TS' (Transition Services), or 'Other'" },
      description: { type: Type.STRING },
      isSigned: { type: Type.BOOLEAN, description: "Whether the underlying SOW/CO is signed." },
      requiresDAF: { type: Type.BOOLEAN, description: "True if this service requires a DAF to trigger billing." },
      hasDAF: { type: Type.BOOLEAN, description: "True if the required DAF was found in the documents." },
      dafStartDate: { type: Type.STRING, description: "The date the DAF was signed or became effective." },
      effectiveDate: { type: Type.STRING, description: "The effective date of the service. You MUST return the actual date (e.g., '2025-07-30') and NOT the phrase 'Date of signing'." },
      term: { type: Type.STRING, description: "The service period or term of the service (e.g., '36 months')." },
      expiryDate: { type: Type.STRING, description: "The calculated expiry date based on effective date and term." },
      potentialEndDate: { type: Type.STRING, description: "The calculated end date based on dafStartDate and term." },
      billingTrigger: { type: Type.STRING, description: "The condition for billing (e.g., 'Next month after signature', 'Upon DAF')." },
      billingStatus: { type: Type.STRING, description: "e.g., 'Billed', 'Not Billed (Pending DAF)', 'Not Active (Unsigned)'" },
      amount: { type: Type.STRING, description: "The TOTAL amount for this service (Quantity * Unit Price), e.g., '$10,000', '$500/month'" },
      unitPrice: { type: Type.STRING, description: "The cost per single unit if explicitly listed (e.g., '$10.00 per user'). Clean the string and remove any raw newlines or carriage returns." },
      sourceDocument: { type: Type.STRING, description: "The name of the specific document (e.g., 'SOW_Managed_Services.pdf') where this service was found." },
      totalQuantity: { type: Type.STRING, description: "The total quantity specified in the SOW or Change Order." },
      previousQuantity: { type: Type.STRING, description: "For Change Orders: The quantity BEFORE the change (e.g., 'SOW Qty')." },
      changeQuantity: { type: Type.STRING, description: "For Change Orders: The delta (e.g., '+50', '-20')." },
      onboardedQuantity: { type: Type.STRING, description: "The quantity confirmed as onboarded in the DAF (Deliverable Approval Form)." },
      facing: { type: Type.STRING, description: "'Vendor' or 'Customer'" }
    }
  };

  const response = await callWithRetry(async () => {
    return await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: { parts },
      config: {
        systemInstruction: "You are a data extraction assistant. You MUST output ONLY valid JSON that conforms to the provided schema. Do NOT include any commentary, self-corrections, or thought processes in your output. IMPORTANT: Trim all extracted string fields to remove any excessive whitespace, carriage returns, or newline characters.\n\nCRITICAL: DO NOT SUMMARIZE SERVICE LISTS. You MUST extract EVERY SINGLE service line item from the document tables as a distinct object in your JSON arrays. If a table has 50 rows, you MUST generate 50 separate JSON objects in the 'customerServices' or 'vendorServices' arrays. SUMMARIZING OR AGGREGATING ROW ITEMS IS STRICTLY FORBIDDEN.",
        // Enable high reasoning for complex contract extraction
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            customerName: { type: Type.STRING, description: "The name of the customer." },
            partnerName: { type: Type.STRING, description: "The name of the partner or vendor providing the services (e.g., Jolera, or another partner)." },
            contractExpiryDate: { type: Type.STRING, description: "The overall expiry date of the contract." },
            summary: { type: Type.STRING, description: "A brief summary of the contract status." },
            totalBilledToCustomer: { type: Type.STRING, description: "The total amount billed to the customer across all services." },
            totalBilledByVendor: { type: Type.STRING, description: "The total amount billed by the vendor across all services." },
            vendorServices: {
              type: Type.ARRAY,
              description: "Services billed to TELUS by Jolera Professional Services.",
              items: serviceSchema
            },
            customerServices: {
              type: Type.ARRAY,
              description: "Services billed to the customer by TELUS Partner Hub Services.",
              items: serviceSchema
            },
            changeOrders: {
              type: Type.ARRAY,
              description: "A list of changes made through change orders.",
              items: {
                type: Type.OBJECT,
                properties: {
                  changeOrderNumber: { type: Type.STRING, description: "The change order number (e.g., 'CO-01', 'CR004292025'). CRITICAL: Extract this primarily from the filename. If the filename contains 'CO-01', use 'CO-01'." },
                  associatedSOW: { type: Type.STRING, description: "The SOW that this change order modifies. Use the Folder Name, or extract from text if in the 'Main' or 'Root' folder." },
                  changeDescription: { type: Type.STRING },
                  date: { type: Type.STRING },
                  isSigned: { type: Type.BOOLEAN },
                  requiresDAF: { type: Type.BOOLEAN },
                  hasDAF: { type: Type.BOOLEAN },
                  facing: { type: Type.STRING, description: "'Vendor' or 'Customer'" },
                  amount: { type: Type.STRING, description: "The TOTAL financial impact (Quantity * Unit Price), e.g., '$0', 'Zero dollar', '$500'" },
                  services: {
                    type: Type.ARRAY,
                    description: "List of services added or modified by this change order.",
                    items: serviceSchema
                  }
                }
              }
            },
            unsignedDocuments: {
              type: Type.ARRAY,
              description: "A list of document names that are missing signatures.",
              items: { type: Type.STRING }
            }
          },
          required: ["customerName", "partnerName", "vendorServices", "customerServices", "changeOrders", "unsignedDocuments", "contractExpiryDate", "summary", "totalBilledToCustomer", "totalBilledByVendor"]
        }
      }
    });
  });

  if (!response || !response.text) {
    throw new Error("The AI generated an empty response. Please try again.");
  }

  try {
    const parsedResult = extractJson(response.text) as ContractAnalysisResult;
    
    // Post-processing logic for DAF and Effective Dates
    const processService = (s: ServiceDetail) => {
      const hasEffectiveDate = s.effectiveDate && s.effectiveDate !== 'N/A' && s.effectiveDate.trim() !== '';
      const hasDafDate = s.dafStartDate && s.dafStartDate !== 'N/A' && s.dafStartDate.trim() !== '';
      const isMS = s.serviceType === 'MS' || s.serviceType?.toLowerCase().includes('managed');
      
      if (!s.isSigned) {
        s.billingStatus = 'Unsigned';
        s.requiresDAF = isMS;
        s.hasDAF = false;
      } else if (hasDafDate) {
        s.requiresDAF = true;
        s.hasDAF = true;
        s.billingStatus = 'Billed (DAF Received)';
        if (!hasEffectiveDate) {
          s.effectiveDate = s.dafStartDate;
        }
      } else if (hasEffectiveDate) {
        s.requiresDAF = false;
        s.hasDAF = false;
        s.billingStatus = 'Billed (Effective Date)';
      } else {
        if (isMS) {
          s.requiresDAF = true;
          s.hasDAF = false;
          s.billingStatus = 'Pending DAF';
        } else {
          s.requiresDAF = false;
          s.hasDAF = false;
          s.billingStatus = 'Pending';
        }
      }
    };

    parsedResult.customerServices?.forEach(processService);
    parsedResult.vendorServices?.forEach(processService);
    
    // Normalize CO associatedSOW to match existing SOWs
    const validSows = new Set<string>();
    parsedResult.customerServices?.forEach(s => validSows.add(s.sowName));
    parsedResult.vendorServices?.forEach(s => validSows.add(s.sowName));
    const validSowList = Array.from(validSows);

    parsedResult.changeOrders?.forEach(co => {
      co.services?.forEach(processService);
      
      if (validSowList.length > 0) {
        const coSow = co.associatedSOW || '';
        const coSowLower = coSow.toLowerCase();
        
        if (!validSows.has(coSow)) {
          if (validSowList.length === 1) {
            co.associatedSOW = validSowList[0];
          } else {
            const match = validSowList.find(sow => {
              const sowLower = sow.toLowerCase();
              return (sowLower.length > 3 && coSowLower.includes(sowLower)) ||
                     (coSowLower.length > 3 && sowLower.includes(coSowLower));
            });
            if (match) {
              co.associatedSOW = match;
            } else if (['main', 'root', 'sow', 'unknown', ''].includes(coSowLower)) {
              co.associatedSOW = validSowList[0];
            }
          }
        }
      }
    });

    return parsedResult;
  } catch (error) {
    console.error("Failed to parse JSON response:\n", response.text);
    throw new Error("The AI generated an incomplete or invalid response. This usually happens when the analysis is too long. Please try again with fewer documents.");
  }
};

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export const chatWithDocuments = async (
  docs: ParsedDocument[],
  history: ChatMessage[],
  newMessage: string
): Promise<string> => {
  const parts: any[] = [];

  // Add system instruction / context
  parts.push({
    text: `You are an expert contract analyst assistant. You are helping the user understand a set of customer contracts.
Answer the user's questions based ONLY on the provided documents. If the answer is not in the documents, say so.

Here are the documents:`
  });

  for (const doc of docs) {
    if (doc.isText) {
      parts.push({
        text: `--- Document: ${doc.name} ---\n${doc.data}\n--- End of Document ---`
      });
    } else {
      parts.push({
        text: `--- Document: ${doc.name} (See attached file) ---`
      });
      parts.push({
        inlineData: {
          mimeType: doc.mimeType,
          data: doc.data,
        }
      });
    }
  }

  // Add the user's new message at the end of the context
  parts.push({
    text: `User Question: ${newMessage}`
  });

  // We can use generateContent with the history formatted as text, or use the chats API.
  // Given we have attachments, generateContent is simpler to pass all context at once.
  
  // Let's format the history
  let historyText = "";
  if (history.length > 0) {
    historyText = "Previous Conversation History:\n" + history.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`).join('\n') + "\n\n";
  }

  if (historyText) {
    parts.push({ text: historyText });
  }

  const response = await callWithRetry(async () => {
    return await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts }
    });
  });

  return response.text || "I'm sorry, I couldn't generate a response.";
};
