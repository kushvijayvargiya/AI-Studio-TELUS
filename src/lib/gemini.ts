import { GoogleGenAI, Type, GenerateContentResponse, ThinkingLevel } from '@google/genai';
import { ParsedDocument } from './zipParser';
import { normalizeSow, cleanServiceName, fuzzyMatch } from './utils';
import { validateContractWithZod, contractAnalysisResultSchema } from './validators';

const ai = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

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

export const getAIClientInstance = (forceCustom: boolean = false): { client: GoogleGenAI; model: string | null } => {
  if (typeof window === 'undefined') {
    return { client: ai, model: null };
  }

  const customKey = localStorage.getItem('custom_gemini_api_key');
  const customModel = localStorage.getItem('custom_gemini_model');
  const useAlways = localStorage.getItem('use_custom_always') === 'true';
  const customProvider = localStorage.getItem('custom_ai_provider') || 'gemini';

  if (customKey && (forceCustom || useAlways) && customProvider === 'gemini') {
    const customAi = new GoogleGenAI({
      apiKey: customKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
    return { client: customAi, model: customModel || 'gemini-3.5-flash' };
  }

  return { client: ai, model: null };
};

export const testCustomAIConnection = async (apiKey: string, modelName: string): Promise<string> => {
  try {
    const testAi = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
    
    const response = await testAi.models.generateContent({
      model: modelName,
      contents: "Say 'AXON API Connection Successful! Your custom key and model are properly configured.' in a single short sentence.",
    });
    
    return response.text || "No response received, but connection did not throw an error.";
  } catch (error: any) {
    throw new Error(error?.message || "Failed to connect to the Gemini API with the provided key and model.");
  }
};

/** Helper to convert Gemini content structures to OpenAI/Fuelix chat messages format */
export function convertGeminiToOpenAIMessages(contents: any, config: any): { role: string; content: string }[] {
  const messages: { role: string; content: string }[] = [];
  
  // Handle system instruction from config (if present)
  if (config && config.systemInstruction) {
    let sysText = "";
    if (typeof config.systemInstruction === 'string') {
      sysText = config.systemInstruction;
    } else if (typeof config.systemInstruction === 'object') {
      if (Array.isArray(config.systemInstruction.parts)) {
        sysText = config.systemInstruction.parts.map((p: any) => p.text || "").join("\n");
      } else if (config.systemInstruction.text) {
        sysText = config.systemInstruction.text;
      }
    }
    if (sysText) {
      messages.push({ role: 'system', content: sysText });
    }
  }

  // Helper to extract text from a part
  const getPartText = (part: any): string => {
    if (typeof part === 'string') return part;
    if (part && part.text) return part.text;
    if (part && part.inlineData) {
      return `[Inline data: ${part.inlineData.mimeType || 'unknown'}]`;
    }
    return "";
  };

  // Convert contents
  if (typeof contents === 'string') {
    messages.push({ role: 'user', content: contents });
  } else if (Array.isArray(contents)) {
    contents.forEach((item: any) => {
      if (item && item.role) {
        let contentStr = "";
        if (Array.isArray(item.parts)) {
          contentStr = item.parts.map(getPartText).join("\n");
        } else {
          contentStr = getPartText(item.parts);
        }
        messages.push({ role: item.role === 'model' ? 'assistant' : item.role, content: contentStr });
      } else {
        messages.push({ role: 'user', content: getPartText(item) });
      }
    });
  } else if (contents && typeof contents === 'object') {
    if (contents.parts) {
      let contentStr = "";
      if (Array.isArray(contents.parts)) {
        contentStr = contents.parts.map(getPartText).join("\n");
      } else {
        contentStr = getPartText(contents.parts);
      }
      messages.push({ role: contents.role === 'model' ? 'assistant' : 'user', content: contentStr });
    } else if (contents.text) {
      messages.push({ role: 'user', content: contents.text });
    }
  }

  return messages;
}

/** Calls the Fuelix API chat completions endpoint */
export const callFuelixChatCompletions = async (
  contents: any,
  config: any,
  apiKey: string,
  modelName: string
): Promise<any> => {
  const messages = convertGeminiToOpenAIMessages(contents, config);
  
  console.log(`[Fuelix API] Requesting chat completions with model: ${modelName}`);
  
  const response = await fetch('https://api.fuelix.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelName,
      messages: messages
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Fuelix API Error [${response.status}]: ${errorText || response.statusText}`);
  }

  const data = await response.json();
  const choiceText = data.choices?.[0]?.message?.content || "";
  
  return {
    text: choiceText
  };
};

/** Tests the Fuelix API connection */
export const testFuelixConnection = async (apiKey: string, modelName: string): Promise<string> => {
  try {
    const res = await callFuelixChatCompletions(
      "Say 'AXON API Connection Successful! Your Fuelix custom key and model are properly configured.' in a single short sentence.",
      null,
      apiKey,
      modelName
    );
    return res.text || "No response received, but connection did not throw an error.";
  } catch (error: any) {
    throw new Error(error?.message || "Failed to connect to the Fuelix API with the provided key and model.");
  }
};

/**
 * Executes an AI request with an automatic model fallback chain
 * to absorb structural rate limits or quota exhausted errors, and supports custom Gemini or Fuelix fallbacks.
 */
export const generateContentWithModelChain = async (
  contents: any,
  config: any,
  modelsChain: string[] = ['gemini-3.5-flash', 'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite']
): Promise<GenerateContentResponse> => {
  let lastError: any = null;
  
  const provider = typeof window !== 'undefined' ? (localStorage.getItem('custom_ai_provider') || 'gemini') : 'gemini';
  const useAlways = typeof window !== 'undefined' && localStorage.getItem('use_custom_always') === 'true';

  // If Fuelix is forced as the constant provider, bypass Gemini entirely
  if (provider === 'fuelix' && useAlways) {
    const fuelixKey = (typeof window !== 'undefined' ? localStorage.getItem('custom_fuelix_api_key') : null) || (process.env as any).FUELIX_API_KEY;
    const fuelixModel = (typeof window !== 'undefined' ? localStorage.getItem('custom_fuelix_model') : null) || (process.env as any).FUELIX_MODEL || 'gpt-4o';
    if (fuelixKey) {
      try {
        const res = await callFuelixChatCompletions(contents, config, fuelixKey, fuelixModel);
        return res as GenerateContentResponse;
      } catch (err: any) {
        console.error(`[Fuelix API] Forced mode execution failed:`, err);
        throw err;
      }
    }
  }

  const { client: activeClient, model: customModelName } = getAIClientInstance();
  
  let activeChain = [...modelsChain];
  if (customModelName && useAlways && provider === 'gemini') {
    activeChain = [customModelName];
  }

  for (const modelName of activeChain) {
    let cleanConfig = { ...config };
    
    try {
      console.log(`[Gemini API] Requesting generateContent with model: ${modelName} on client: ${activeClient === ai ? 'Default' : 'Custom'}`);
      return await callWithRetry(async () => {
        return await activeClient.models.generateContent({
          model: modelName,
          contents,
          config: cleanConfig,
        });
      });
    } catch (error: any) {
      lastError = error;
      const errorStr = typeof error === 'string' ? error : JSON.stringify(error);
      const isQuotaExceeded = errorStr.includes("429") || errorStr.includes("RESOURCE_EXHAUSTED") || errorStr.includes("quota") || errorStr.includes("LimitExceeded");
      const isConfigError = errorStr.includes("thinking") || errorStr.includes("thinkingConfig") || errorStr.includes("400");
      
      if (isQuotaExceeded) {
        console.warn(`[Gemini API] Model ${modelName} hit quota limit (429/RESOURCE_EXHAUSTED). Moving to next model in chain...`);
        continue;
      }
      
      if (isConfigError && cleanConfig.thinkingConfig) {
        console.warn(`[Gemini API] Model ${modelName} configuration error. Retrying without thinkingConfig...`);
        delete cleanConfig.thinkingConfig;
        try {
          return await callWithRetry(async () => {
            return await activeClient.models.generateContent({
              model: modelName,
              contents,
              config: cleanConfig,
            });
          });
        } catch (retryErr: any) {
          lastError = retryErr;
          const retryErrStr = typeof retryErr === 'string' ? retryErr : JSON.stringify(retryErr);
          const isRetryQuota = retryErrStr.includes("429") || retryErrStr.includes("RESOURCE_EXHAUSTED") || retryErrStr.includes("quota");
          if (isRetryQuota) continue;
          throw retryErr;
        }
      }
      
      throw error;
    }
  }
  
  // If we reach here and hit quota/limits, check if we should fall back to custom API Key & model!
  const useFallback = typeof window !== 'undefined' ? localStorage.getItem('use_custom_fallback') === 'true' : false;
  
  if (useFallback && activeClient === ai) {
    if (provider === 'fuelix') {
      const fuelixKey = (typeof window !== 'undefined' ? localStorage.getItem('custom_fuelix_api_key') : null) || (process.env as any).FUELIX_API_KEY;
      const fuelixModel = (typeof window !== 'undefined' ? localStorage.getItem('custom_fuelix_model') : null) || (process.env as any).FUELIX_MODEL || 'gpt-4o';
      if (fuelixKey) {
        console.log(`[Fuelix API] Default models exhausted or rate-limited. Falling back to CUSTOM Fuelix API Key & model: ${fuelixModel}`);
        try {
          const res = await callFuelixChatCompletions(contents, config, fuelixKey, fuelixModel);
          return res as GenerateContentResponse;
        } catch (fallbackErr: any) {
          console.error(`[Fuelix API] Fallback execution failed:`, fallbackErr);
          throw fallbackErr;
        }
      }
    } else {
      const customKey = typeof window !== 'undefined' ? localStorage.getItem('custom_gemini_api_key') : null;
      const customModel = (typeof window !== 'undefined' ? localStorage.getItem('custom_gemini_model') : null) || 'gemini-3.5-flash';
      if (customKey) {
        console.log(`[Gemini API] Default models exhausted or rate-limited. Falling back to CUSTOM API Key & model: ${customModel}`);
        const { client: fallbackClient } = getAIClientInstance(true); // forceCustom
        let cleanConfig = { ...config };
        try {
          return await callWithRetry(async () => {
            return await fallbackClient.models.generateContent({
              model: customModel,
              contents,
              config: cleanConfig,
            });
          });
        } catch (fallbackErr: any) {
          const isConfigError = String(fallbackErr).includes("thinking") || String(fallbackErr).includes("thinkingConfig") || String(fallbackErr).includes("400");
          if (isConfigError && cleanConfig.thinkingConfig) {
            delete cleanConfig.thinkingConfig;
            try {
              return await callWithRetry(async () => {
                return await fallbackClient.models.generateContent({
                  model: customModel,
                  contents,
                  config: cleanConfig,
                });
              });
            } catch (fallbackRetryErr) {
              throw fallbackRetryErr;
            }
          }
          throw fallbackErr;
        }
      }
    }
  }
  
  throw lastError;
};

/** Helper function to clean and parse JSON from Gemini's response */
const closeJsonStack = (text: string): string => {
  let stack: string[] = [];
  let inString = false;
  let escaped = false;
  let resultText = "";
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    
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
  
  if (inString) resultText += '"';
  
  // Close stack in reverse
  while (stack.length > 0) {
    resultText += stack.pop();
  }
  
  // Fix trailing commas: [1, 2,] -> [1, 2]
  resultText = resultText.replace(/,\s*([}\]])/g, '$1');
  
  // Final cleaning: remove non-printable characters except whitespace
  resultText = resultText.replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F-\u009F]/g, '');
  
  return resultText;
};

const extractJson = (text: string) => {
  try {
    // Remove markdown formatting if present
    let cleanText = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    
    // Find first { to start the JSON object
    const start = cleanText.indexOf('{');
    if (start === -1) throw new Error("No JSON object found in response");
    
    let targetText = cleanText.substring(start);
    
    // Attempt standard parse first
    try {
      return JSON.parse(targetText);
    } catch (e) {
      // If full parse fails, try to find the last occurrence of '}' and parse from start to there
      const lastBrace = targetText.lastIndexOf('}');
      if (lastBrace !== -1) {
        try {
          return JSON.parse(targetText.substring(0, lastBrace + 1));
        } catch (e2) {
          // Fall through
        }
      }
    }

    // Attempt standard closed stack first
    try {
      const closed = closeJsonStack(targetText);
      return JSON.parse(closed);
    } catch (e) {
      console.warn("[JSON Parser] Initial closed stack failed to parse. Starting deep repair scan...");
    }

    // Advanced backtracking and repair scan
    // Search backwards for structural boundaries: Comma, Curly, Bracket, etc.
    for (let i = targetText.length - 1; i >= 0; i--) {
      const char = targetText[i];
      if (char === ',' || char === '{' || char === '[' || char === '}' || char === ']') {
        // Drop the last comma, or keep the bracket/brace
        const sliceEnd = (char === ',') ? i : i + 1;
        const candidateString = targetText.substring(0, sliceEnd).trim();
        try {
          const closed = closeJsonStack(candidateString);
          const parsed = JSON.parse(closed);
          console.log(`[JSON Parser] Successfully repaired truncated JSON at index ${i} (character '${char}')!`);
          return parsed;
        } catch (err) {
          // keep searching
        }
      }
    }

    // Try heavy brute force subtraction
    const maxSubtract = Math.min(1000, targetText.length);
    for (let d = 1; d <= maxSubtract; d++) {
      const candidateString = targetText.substring(0, targetText.length - d).trim();
      try {
        const closed = closeJsonStack(candidateString);
        const parsed = JSON.parse(closed);
        console.log(`[JSON Parser] Successfully repaired truncated JSON by subtracting ${d} trailing characters.`);
        return parsed;
      } catch (err) {
        // keep subtraction
      }
    }

    throw new Error("Failed to extract JSON after exhaustive backtracking attempts.");
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

export interface SchemaViolation {
  path: string;
  message: string;
}

export const validateContractSchema = (data: any): SchemaViolation[] => {
  const violations: SchemaViolation[] = [];
  if (!data || typeof data !== 'object') {
    violations.push({ path: 'root', message: 'Result is not a valid JSON object.' });
    return violations;
  }

  const requiredFields = [
    "customerName", "partnerName", "vendorServices", "customerServices", 
    "changeOrders", "unsignedDocuments", "contractExpiryDate", "summary", 
    "totalBilledToCustomer", "totalBilledByVendor"
  ];

  for (const field of requiredFields) {
    if (!(field in data)) {
      violations.push({ path: `root.${field}`, message: `Missing required field: '${field}'` });
    }
  }

  if (data.vendorServices !== undefined && !Array.isArray(data.vendorServices)) {
    violations.push({ path: 'root.vendorServices', message: 'vendorServices must be an array' });
  } else if (Array.isArray(data.vendorServices)) {
    data.vendorServices.forEach((service: any, idx: number) => {
      if (typeof service !== 'object' || service === null) {
        violations.push({ path: `root.vendorServices[${idx}]`, message: 'Service must be an object' });
      } else {
        if (!service.sowName) violations.push({ path: `root.vendorServices[${idx}].sowName`, message: 'Missing sowName' });
        if (!service.serviceName) violations.push({ path: `root.vendorServices[${idx}].serviceName`, message: 'Missing serviceName' });
      }
    });
  }

  if (data.customerServices !== undefined && !Array.isArray(data.customerServices)) {
    violations.push({ path: 'root.customerServices', message: 'customerServices must be an array' });
  } else if (Array.isArray(data.customerServices)) {
    data.customerServices.forEach((service: any, idx: number) => {
      if (typeof service !== 'object' || service === null) {
        violations.push({ path: `root.customerServices[${idx}]`, message: 'Service must be an object' });
      } else {
        if (!service.sowName) violations.push({ path: `root.customerServices[${idx}].sowName`, message: 'Missing sowName' });
        if (!service.serviceName) violations.push({ path: `root.customerServices[${idx}].serviceName`, message: 'Missing serviceName' });
      }
    });
  }

  if (data.changeOrders !== undefined && !Array.isArray(data.changeOrders)) {
    violations.push({ path: 'root.changeOrders', message: 'changeOrders must be an array' });
  } else if (Array.isArray(data.changeOrders)) {
    data.changeOrders.forEach((co: any, idx: number) => {
      if (typeof co !== 'object' || co === null) {
        violations.push({ path: `root.changeOrders[${idx}]`, message: 'Change order must be an object' });
      } else {
        if (!co.changeOrderNumber) {
          violations.push({ path: `root.changeOrders[${idx}].changeOrderNumber`, message: 'Missing changeOrderNumber' });
        }
        if (!co.associatedSOW) {
          violations.push({ path: `root.changeOrders[${idx}].associatedSOW`, message: 'Missing associatedSOW' });
        }
        if (co.services !== undefined && !Array.isArray(co.services)) {
          violations.push({ path: `root.changeOrders[${idx}].services`, message: 'services must be an array' });
        } else if (Array.isArray(co.services)) {
          co.services.forEach((service: any, sIdx: number) => {
            if (typeof service !== 'object' || service === null) {
              violations.push({ path: `root.changeOrders[${idx}].services[${sIdx}]`, message: 'Service must be an object' });
            } else {
              if (!service.sowName) violations.push({ path: `root.changeOrders[${idx}].services[${sIdx}].sowName`, message: 'Missing sowName' });
              if (!service.serviceName) violations.push({ path: `root.changeOrders[${idx}].services[${sIdx}].serviceName`, message: 'Missing serviceName' });
            }
          });
        }
      }
    });
  }

  if (data.unsignedDocuments !== undefined && !Array.isArray(data.unsignedDocuments)) {
    violations.push({ path: 'root.unsignedDocuments', message: 'unsignedDocuments must be an array' });
  }

  return violations;
};

export const applyCorrectionSnippet = (original: any, snippet: any): any => {
  if (!snippet || typeof snippet !== 'object') {
    return original;
  }

  const result = JSON.parse(JSON.stringify(original)); // deep copy

  const setPathValue = (obj: any, pathStr: string, value: any) => {
    const parts = pathStr.replace(/\]/g, '').split(/[.\[]/).filter(Boolean);
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (current[part] === undefined) {
        const nextPart = parts[i + 1];
        current[part] = /^\d+$/.test(nextPart) ? [] : {};
      }
      current = current[part];
    }
    if (parts.length > 0) {
      const lastPart = parts[parts.length - 1];
      current[lastPart] = value;
    }
  };

  const deepMerge = (target: any, source: any) => {
    if (!source || typeof source !== 'object') return;
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object') {
        if (Array.isArray(source[key])) {
          if (!Array.isArray(target[key])) {
            target[key] = [];
          }
          if (source[key].length === target[key].length) {
            for (let i = 0; i < source[key].length; i++) {
              if (typeof source[key][i] === 'object' && typeof target[key][i] === 'object') {
                deepMerge(target[key][i], source[key][i]);
              } else {
                target[key][i] = source[key][i];
              }
            }
          } else {
            source[key].forEach((item: any, idx: number) => {
              if (item && typeof item === 'object') {
                const match = target[key].find((t: any) => 
                  (t.serviceName && t.serviceName === item.serviceName && t.sowName === item.sowName) ||
                  (t.changeOrderNumber && t.changeOrderNumber === item.changeOrderNumber && t.associatedSOW === item.associatedSOW)
                );
                if (match) {
                  deepMerge(match, item);
                } else if (idx < target[key].length) {
                  deepMerge(target[key][idx], item);
                } else {
                  target[key].push(item);
                }
              } else {
                target[key].push(item);
              }
            });
          }
        } else {
          if (!target[key] || typeof target[key] !== 'object') {
            target[key] = {};
          }
          deepMerge(target[key], source[key]);
        }
      } else {
        target[key] = source[key];
      }
    }
  };

  let hasFlatPaths = false;
  for (const key of Object.keys(snippet)) {
    if (key.includes('.') || key.includes('[')) {
      hasFlatPaths = true;
      setPathValue(result, key, snippet[key]);
    }
  }

  if (!hasFlatPaths) {
    deepMerge(result, snippet);
  }

  return result;
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
  const response = await generateContentWithModelChain(
    `You are a contract expert. Based on the following analysis of a customer's contract, answer the user's question.
    
    ANALYSIS DATA:
    ${JSON.stringify(result, null, 2)}
    
    USER QUESTION:
    ${query}
    
    Provide a concise, professional answer based ONLY on the provided data. If the answer isn't in the data, say so.`,
    {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
    }
  );
  
  return response.text || "I couldn't generate an answer.";
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
  try {
    const response = await generateContentWithModelChain(
      [
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
      {
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
    );

    const text = response.text;
    if (!text) throw new Error("Empty response from AI");
    return extractJson(text);
  } catch (e) {
    console.error("Failed to parse Gemini dashboard JSON:", e);
    return { message: "I encountered an error while generating the dashboard components. Please try a simpler query.", widgets: [] };
  }
};

export const generateGlobalDashboard = async (query: string, customers: any[]): Promise<{ message: string, widgets: DashboardWidget[] }> => {
  try {
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

    const response = await generateContentWithModelChain(
      [
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
      {
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
    );

    const text = response.text;
    if (!text) throw new Error("Empty response from AI");
    return extractJson(text);
  } catch (e) {
    console.error("Failed to parse Global Gemini dashboard JSON:", e);
    return { message: "I encountered an error generating the global portfolio dashboard.", widgets: [] };
  }
};

const analyzeDocumentsSingle = async (docs: ParsedDocument[]): Promise<ContractAnalysisResult> => {
  const parts: any[] = [];

  // Add instructions
  parts.push({
    text: `You are an expert contract analyst. I am providing you with a set of documents related to a customer's contract.
These documents are organized into folders within a ZIP file.

CRITICAL RULES FOR ANALYSIS:
1. Folder-based Processing & Descriptive SOW Naming (MANDATORY):
   - TREAT EACH FOLDER AS A SINGLE UNIT (ONE SOW GROUP).
   - You MUST assess ALL folders provided. Do not skip any.
   - CRITICAL SOW NAME RULE: If a folder is named 'Root', 'Main', 'SOW', 'sow', or has any other generic, empty, or placeholder name, you MUST NOT use that placeholder. Instead, extract the actual, real descriptive name of the SOW contract/customer (e.g., 'Felix Schoeller', 'Al Stober', or another specific customer branding) from the document content or SOW header. All services and change orders from this SOW group must use this exact same descriptive name as the 'sowName' or 'associatedSOW' so they display under a proper SOW portfolio in the UI.
   - If a Change Order is in the "Main" or "Root" folder and does not have its own subfolder, calculate its 'associatedSOW' based on the descriptive contract name of the main SOW document it accompanies.
   - A folder typically contains one main SOW document and several associated Change Orders (COs) and Deliverable Approval Forms (DAFs).
   - CRITICAL: In folders dedicated to a Change Order, you may find a "Contract" or "SOW" document alongside the "Change Order" document. Do NOT mistake the "Contract" as a separate Change Order; it is the base contract corresponding to that specific Change Order. Only extract the Change Order details from the document explicitly labeled as a Change Order or CO.
   - NOTE: Documents may be in French. You are fully capable of reading and extracting data from French SOWs, Contracts, and Change Orders. Translate the extracted fields (like service names, descriptions) to English in your JSON output if possible, but ensure accuracy of the extracted data.
2. Providers (Vendor vs Customer) & Strict Alignment (MANDATORY):
   - You MUST carefully separate services billed to TELUS by the vendor/partner (such as "Jolera") and services billed to the Customer by TELUS ("TELUS Partner Hub Services"). Under no circumstances should they be mixed up, duplicated, or merged.
   - The partner/vendor who bills TELUS goes into 'vendorServices'.
   - "TELUS Partner Hub Services" (services that TELUS bills to the end customer) goes into 'customerServices'.
   - Verify signatures: If a document has TELUS and End Customer signatures or is a Customer SOW, its services belong strictly to 'customerServices'. If it is between TELUS and Jolera (or another vendor/partner), those services belong strictly to 'vendorServices'.
3. Service Extraction (Line by Line) - 🚨 EXTREMELY IMPORTANT: 
   - You MUST extract EVERY individual service line item from the pricing/service tables in the SOWs AND the Change Orders.
   - You MUST list out each individual service line item found in the tables for BOTH parties. **DO NOT SUMMARIZE OR CONSOLIDATE SERVICES.**
   - For Managed Services (MS), YOU ABSOLUTELY MUST list out each specific sub-service (e.g., "Service Desk - Tier 1", "Network Monitoring - Gold", "Endpoint Management - Windows") as a separate, individual entry. DO NOT output a single consolidated "Managed Services" item. Look closely at the pricing or service descriptions tables in the document and extract every single row as its own 'serviceName'.
   - **CRITICAL SECTION 5 / 5.1 RULE (MANDATORY)**: Section 5, especially Section 5.1, of a SOW specifies the Managed Services (recurring services) and their quantities. You MUST thoroughly analyze Section 5.1 and output every service description and quantity listed there as a distinct service item with \`serviceType: "MS"\`. Even if listed as formatted text, bullets, or paragraphs, extract them with their quantities. Do not ignore them.
   - **CRITICAL**: Do NOT include the customer name in the \`serviceName\` field. For example, if the document says "Al Stober - User Defence", the \`serviceName\` should be "User Defence".
   - **CRITICAL**: Treat hardware models, license types, and specific variants as distinct services. For example, "Secure IT Firewall - F180" and "Secure IT Firewall - APOS - Meraki" MUST be extracted as two completely separate services, not merged into one.
   - Look for columns like "Service Element Description", "Description", "Service Name", or "Item" to identify individual services.
   - Extract the "Quantity" column from the SOW/CO tables into \`totalQuantity\`.
   - Cross-reference with DAF documents in the same folder. If a DAF lists a quantity for a service, put that in \`onboardedQuantity\`.
   - **MANDATORY**: Every row in a pricing table MUST be a separate entry in your JSON array. DO NOT BE LAZY. If a table has 150 rows, your array MUST have 150 objects. You MUST NOT skip any rows, stop halfway, or summarize them into a single entry. Extract every single one to the end of the document.
   - **CRITICAL EXCEPTION FOR HEADER AND TOTAL/SUMMARY/FOOTER ROWS (MANDATORY)**: You MUST NOT extract table headings, table headers, column labels, section headers/sub-headers (e.g., "Managed Services:", "One-Time Charges:"), or summary/total rows (e.g., "Total", "Grand Total", "Total SLA Charges", "Monthly Recurring Total", "One-Time Charges Total") as individual services. You MUST ignore these lines completely to avoid creating extra duplicate, dummy, or empty services in your JSON response.
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
     - **MULTI-FILE DAF PARSING & CONTEXT AGGREGATION**:
          - A single contract folder can contain multiple separate Deliverable Approval Form (DAF) documents (e.g., approving services in multiple waves, or separate files for different items). They are crucial because they serve as the ultimate billing trigger and source of truth for 'effectiveDate', 'dafStartDate', and 'onboardedQuantity'.
          - You MUST identify and aggregate the details from ALL matching DAF documents in the folder BEFORE generating your final JSON output:
               - Sum 'onboardedQuantity' across all DAF files where they approve portions of the same service (e.g., if DAF 1 approves 150 users and DAF 2 approves 50 users of the same service, sum them to a total 'onboardedQuantity' of 200).
               - Standardize dates from DAF files into 'YYYY-MM-DD'. If multiple DAF files have different sign-off dates, establish 'dafStartDate' and 'effectiveDate' accordingly.
               - For EACH service line approved in EACH DAF file, you MUST ALSO export a corresponding service object in 'customerServices' or 'vendorServices' with its 'sourceDocument' set to the exact DAF filename and 'onboardedQuantity' set to the approved amount. This prevents any loss of precision, allowing our system-level post-processing algorithm to reconcile all files flawlessly with 100% precision.
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
      sowName: { type: Type.STRING, description: "The name of the SOW document this service belongs to. CRITICAL SOW NAME RULE: If folder names are empty, 'Root', 'Main', 'SOW', 'sow', or generic, you MUST instead extract the actual, real descriptive SOW contract/customer name (e.g. 'Felix Schoeller' or 'Al Stober') from the document content and use that." },
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

  const response = await generateContentWithModelChain({ parts }, {
    systemInstruction: "You are a data extraction assistant. You MUST output ONLY valid JSON that strictly conforms to the provided schema. Do NOT include any commentary, self-corrections, or thought processes in your output. IMPORTANT: Trim all extracted string fields to remove any excessive whitespace, carriage returns, or newline characters.\n\nCRITICAL: DO NOT SUMMARIZE SERVICE LISTS. You MUST extract EVERY SINGLE service line item from the document tables as a distinct object in your JSON arrays conforming to the standardized schema.\n\nCRITICAL EXCLUSIONS: Do NOT extract table header rows, sub-headers, section titles, or total/subtotal/summary/footer rows (e.g. 'Total', 'Subtotal', 'Grand Total', 'Total SLA Charges', 'Monthly Recurring Total', 'One-Time Charges Total'). You MUST ignore these lines completely to avoid creating extra dummy service objects.\n\nCRITICAL SOW NAME RULE: If folder names are empty, 'Root', 'Main', 'SOW', 'sow', or generic, you MUST NOT use these generic names as the sowName or associatedSOW. Instead, extract the actual, real descriptive customer/SOW contract name (e.g. 'Felix Schoeller' or 'Al Stober') from the document content or SOW header and use it.\n\nCRITICAL SPLITTING: You MUST strictly separate Customer-facing services and Vendor-facing services based on contracting parties and signature sections. Do NOT mix them up, duplicate them, or combine them.\n\nCRITICAL MULTI-FILE DAF AGGREGATION: When analyzing a group with multiple Deliverable Approval Forms (DAFs), you MUST aggregate their context before final output generation. Sum up all approved quantities for the same service across different DAF files into the core service's 'onboardedQuantity', and ensure you output separate service lines for each DAF file under its exact filename to resolve and preserve all fine-grain acceptance facts with 100% precision.",
    // Enable high reasoning for complex contract extraction
    thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    responseMimeType: 'application/json',
    maxOutputTokens: 8192,
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        customerName: { type: Type.STRING, description: "The name of the customer." },
        partnerName: { type: Type.STRING, description: "The name of the partner or vendor providing the services (e.g., Jolera, or another partner)." },
        contractExpiryDate: { type: Type.STRING, description: "The overall expiry date of the contract." },
        summary: { type: Type.STRING, description: "A highly concise, 2-3 sentence business-oriented overview of the contract status. Highlight the overall active MRR vs. setup/NRC investment, whether SOWs or COs are currently signed/unsigned, and overall contract health. Keep it brief, small, and extremely meaningful." },
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
              associatedSOW: { type: Type.STRING, description: "The SOW that this change order modifies. CRITICAL SOW NAME RULE: If the folder name is 'Root', 'Main', 'SOW', 'sow', or generic, you MUST extract the actual real descriptive customer/SOW contract name and use that." },
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
  });

  if (!response || !response.text) {
    throw new Error("The AI generated an empty response. Please try again.");
  }

  let parsedResult: ContractAnalysisResult | null = null;
  let attempts = 1;
  const maxAttempts = 3;
  let currentResponseText = response.text;
  let lastValidationErrors: string[] = [];

  while (attempts <= maxAttempts) {
    try {
      const candidateResult = extractJson(currentResponseText) as ContractAnalysisResult;
      
      const zodParsed = contractAnalysisResultSchema.safeParse(candidateResult);
      const violations = validateContractWithZod(candidateResult);
      const rawZodIssues = !zodParsed.success ? zodParsed.error.issues : [];

      if (violations.length === 0) {
        parsedResult = candidateResult;
        console.log(`[Schema Validation] Success on attempt ${attempts}!`);
        break;
      }

      lastValidationErrors = violations.map(v => `${v.path}: ${v.message}`);
      console.warn(`[Schema Validation] Attempt ${attempts} failed with ${violations.length} violations:`, lastValidationErrors);

      if (attempts === maxAttempts) {
        console.warn(`[Schema Validation] Max attempts reached. Fallback to candidate result.`);
        parsedResult = candidateResult;
        break;
      }

      attempts++;
      console.log(`[Schema Validation] Retrying (Attempt ${attempts}/${maxAttempts}) by asking Gemini in 'schema-correction' mode to repair specific violations...`);
      
      const rawZodIssuesStr = JSON.stringify(rawZodIssues, null, 2);
      
      const repairPromptParts = [
        ...parts,
        {
          text: `Here is the current parsed JSON object that failed schema validation:\n\n${JSON.stringify(candidateResult, null, 2)}`
        },
        {
          text: `CRITICAL SCHEMA RETRY - You are now running in 'schema-correction' prompt mode. 
The object failed validation with the following raw Zod 'issues' array:
\`\`\`json
${rawZodIssuesStr}
\`\`\`

Based on these specific path violations and messages, you MUST provide ONLY the corrected JSON snippet (a partial JSON object or correction map containing only the fields or nested structures that need to be corrected) that resolves these errors. For example, if a service item in "customerServices[1]" had an invalid type or was missing a value, reply with only the corrected fields for that item, or the minimal JSON structure needed to patch and satisfy those specific failed fields. Do not write any conversational prefix or suffix. Provide ONLY valid JSON.`
        }
      ];

      const repairResponse = await generateContentWithModelChain({ parts: repairPromptParts }, {
        systemInstruction: "You are a data extraction assistant. You MUST resolve validation/schema errors under 'schema-correction' prompt mode and output ONLY the corrected JSON snippet/patch. Do NOT include any commentary, self-corrections, or thought processes in your output.",
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        maxOutputTokens: 8192
      });

      if (repairResponse && repairResponse.text) {
        const snippetText = repairResponse.text;
        try {
          const correctionSnippet = extractJson(snippetText);
          const correctedResult = applyCorrectionSnippet(candidateResult, correctionSnippet);
          currentResponseText = JSON.stringify(correctedResult, null, 2);
          console.log(`[Schema Validation] Applied schema correction snippet successfully, proceeding to re-verify.`);
        } catch (mergeErr) {
          console.warn(`[Schema Validation] Failed to parse/apply repair snippet, falling back to treating repairResponse.text as full JSON. Error:`, mergeErr);
          currentResponseText = snippetText;
        }
      } else {
        throw new Error("Repair response was empty.");
      }

    } catch (err: any) {
      console.error(`[Schema Validation Error] Error during attempt ${attempts}:`, err);
      if (attempts === maxAttempts) {
        throw err;
      }
      attempts++;
    }
  }

  if (!parsedResult) {
    throw new Error(`Failed to parse and validate contract document after ${maxAttempts} attempts. Errors: ${lastValidationErrors.join(', ')}`);
  }

  try {
    const activeDocName = (docs && docs.length > 0) ? docs[0].name : '';
    const activeDocNameLower = activeDocName.toLowerCase();
    const activeDocText = (docs && docs.length > 0 && docs[0].data) ? docs[0].data.toLowerCase() : '';

    if (activeDocName) {
      parsedResult.customerServices?.forEach(s => {
        if (s) s.sourceDocument = activeDocName;
      });
      parsedResult.vendorServices?.forEach(s => {
        if (s) s.sourceDocument = activeDocName;
      });
    }

    // Post-processing logic for DAF and Effective Dates
    const processService = (s: ServiceDetail) => {
      if (s) {
        const docNameLower = (s.sourceDocument || '').toLowerCase();
        const sowNameLower = (s.sowName || '').toLowerCase();
        const hasUnsignedKeyword = 
          docNameLower.includes('unsigned') || docNameLower.includes('un-signed') || docNameLower.includes('draft') || docNameLower.includes('non-signe') || docNameLower.includes('non_signe') || docNameLower.includes('proposed') || docNameLower.includes('review') ||
          sowNameLower.includes('unsigned') || sowNameLower.includes('un-signed') || sowNameLower.includes('draft') || sowNameLower.includes('non-signe') || sowNameLower.includes('non_signe') || sowNameLower.includes('proposed') || sowNameLower.includes('review');
        if (hasUnsignedKeyword) {
          s.isSigned = false;
        }
      }

      const hasEffectiveDate = s.effectiveDate && s.effectiveDate !== 'N/A' && s.effectiveDate.trim() !== '';
      const hasDafDate = s.dafStartDate && s.dafStartDate !== 'N/A' && s.dafStartDate.trim() !== '';
      const isMS = s.serviceType === 'MS' || s.serviceType?.toLowerCase().includes('managed');
      
      if (!s.isSigned) {
        s.billingStatus = 'Unsigned';
        s.requiresDAF = isMS;
        s.hasDAF = false;
        s.onboardedQuantity = '0';
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
          s.onboardedQuantity = '0';
        } else {
          s.requiresDAF = false;
          s.hasDAF = false;
          s.billingStatus = 'Pending';
          s.onboardedQuantity = '0';
        }
      }
    };

    parsedResult.customerServices?.forEach(processService);
    parsedResult.vendorServices?.forEach(processService);
    
    // Normalize CO associatedSOW to match existing SOWs
    const validSows = new Set<string>();
    parsedResult.customerServices?.forEach(s => {
      if (s && typeof s.sowName === 'string' && s.sowName.trim()) {
        validSows.add(s.sowName.trim());
      }
    });
    parsedResult.vendorServices?.forEach(s => {
      if (s && typeof s.sowName === 'string' && s.sowName.trim()) {
        validSows.add(s.sowName.trim());
      }
    });
    const validSowList = Array.from(validSows);

    parsedResult.changeOrders?.forEach(co => {
      if (!co) return;

      // Associate Change Order source document
      if (activeDocName) {
        (co as any).sourceDocument = activeDocName;
        co.services?.forEach(s => {
          if (s) s.sourceDocument = activeDocName;
        });
      }

      // Heuristic to distinguish Vendor CO vs Customer/Telus CO
      let detectedFacing: 'Vendor' | 'Customer' | null = null;
      if (activeDocNameLower.includes('jolera') || activeDocNameLower.includes('vendor') || activeDocNameLower.includes('partner')) {
        detectedFacing = 'Vendor';
      } else if (activeDocNameLower.includes('customer') || activeDocNameLower.includes('client') || activeDocNameLower.includes('telus co')) {
        detectedFacing = 'Customer';
      }
      
      if (!detectedFacing) {
        // Fallback to text content checks
        if (activeDocText.includes('jolera') && !activeDocText.includes('al stober') && !activeDocText.includes('felix schoeller')) {
          detectedFacing = 'Vendor';
        } else if (activeDocText.includes('customer signed') || activeDocText.includes('client signed') || activeDocText.includes('endorsement')) {
          detectedFacing = 'Customer';
        }
      }

      if (detectedFacing) {
        co.facing = detectedFacing;
        co.services?.forEach(s => {
          if (s) {
            s.facing = detectedFacing!;
          }
        });
      }
      
      const coNumLower = (co.changeOrderNumber || '').toLowerCase();
      const coSowLower = (co.associatedSOW || '').toLowerCase();
      const coUnsigned = 
        coNumLower.includes('unsigned') || coNumLower.includes('un-signed') || coNumLower.includes('draft') || coNumLower.includes('non-signe') || coNumLower.includes('non_signe') || coNumLower.includes('proposed') || coNumLower.includes('review') ||
        coSowLower.includes('unsigned') || coSowLower.includes('un-signed') || coSowLower.includes('draft') || coSowLower.includes('non-signe') || coSowLower.includes('non_signe') || coSowLower.includes('proposed') || coSowLower.includes('review');
      
      if (coUnsigned) {
        co.isSigned = false;
        co.services?.forEach(s => { s.isSigned = false; });
      }

      co.services?.forEach(processService);
      
      if (validSowList.length > 0) {
        const coSow = (co.associatedSOW || '').trim();
        const coSowLower = coSow.toLowerCase();
        
        if (!validSows.has(coSow)) {
          if (validSowList.length === 1) {
            co.associatedSOW = validSowList[0];
          } else {
            const match = validSowList.find(sow => {
              if (typeof sow !== 'string') return false;
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

const processServiceGlobal = (s: ServiceDetail) => {
  if (s) {
    const docNameLower = (s.sourceDocument || '').toLowerCase();
    const sowNameLower = (s.sowName || '').toLowerCase();
    const hasUnsignedKeyword = 
      docNameLower.includes('unsigned') || docNameLower.includes('un-signed') || docNameLower.includes('draft') || docNameLower.includes('non-signe') || docNameLower.includes('non_signe') || docNameLower.includes('proposed') || docNameLower.includes('review') ||
      sowNameLower.includes('unsigned') || sowNameLower.includes('un-signed') || sowNameLower.includes('draft') || sowNameLower.includes('non-signe') || sowNameLower.includes('non_signe') || sowNameLower.includes('proposed') || sowNameLower.includes('review');
    if (hasUnsignedKeyword) {
      s.isSigned = false;
    }
  }

  const hasEffectiveDate = s.effectiveDate && s.effectiveDate !== 'N/A' && s.effectiveDate.trim() !== '';
  const hasDafDate = s.dafStartDate && s.dafStartDate !== 'N/A' && s.dafStartDate.trim() !== '';
  const isMS = s.serviceType === 'MS' || s.serviceType?.toLowerCase().includes('managed');
  
  if (!s.isSigned) {
    s.billingStatus = 'Unsigned';
    s.requiresDAF = isMS;
    s.hasDAF = false;
    s.onboardedQuantity = '0';
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
      s.onboardedQuantity = '0';
    } else {
      s.requiresDAF = false;
      s.hasDAF = false;
      s.billingStatus = 'Pending';
      s.onboardedQuantity = '0';
    }
  }
};

const deduplicateResultServices = (result: ContractAnalysisResult): ContractAnalysisResult => {
  if (!result) return result;

  const parseAmountNumLocal = (amtStr: string): number => {
    if (!amtStr) return 0;
    const clean = amtStr.replace(/[$,\s\u00a0\u202f]/g, '').replace(',', '.');
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  };

  const parseQtyLocal = (qtyStr: string): number => {
    if (!qtyStr) return 0;
    const clean = qtyStr.replace(/[$,\s]/g, '');
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  };

  const scoreNameLocal = (name: string): number => {
    if (!name) return 0;
    const s = name.toLowerCase();
    let score = name.length;
    if (s.includes('partner') || s.includes('hub') || s.includes('generic') || s.includes('telus') || s.includes('billing') || s.includes('service') || s.includes('facing')) {
      score -= 30;
    }
    if (s.includes('place') || s.includes('ressource') || s.includes('technique') || s.includes('support') || s.includes('engineer') || s.includes('license') || s.includes('professionnels') || s.includes('uniques')) {
      score += 40;
    }
    return score;
  };

  const mergeTwoServices = (s1: ServiceDetail, s2: ServiceDetail): ServiceDetail => {
    const isSigned = s1.isSigned || s2.isSigned;
    
    const name1 = s1.serviceName || '';
    const name2 = s2.serviceName || '';
    const serviceName = scoreNameLocal(name1) >= scoreNameLocal(name2) ? name1 : name2;
    
    const desc1 = s1.description || '';
    const desc2 = s2.description || '';
    const description = desc1.length >= desc2.length ? desc1 : desc2;
    
    const effectiveDate = (s1.effectiveDate && s1.effectiveDate !== 'N/A') ? s1.effectiveDate : s2.effectiveDate;
    const term = (s1.term && s1.term !== 'N/A') ? s1.term : s2.term;
    const hasDAF = s1.hasDAF || s2.hasDAF;
    const requiresDAF = s1.requiresDAF || s2.requiresDAF;
    const dafStartDate = (s1.dafStartDate && s1.dafStartDate !== 'N/A') ? s1.dafStartDate : s2.dafStartDate;
    
    const sourceDocument = (serviceName === name1) ? s1.sourceDocument : s2.sourceDocument;
    
    return {
      ...s1,
      serviceName,
      description,
      isSigned,
      effectiveDate,
      term,
      hasDAF,
      requiresDAF,
      dafStartDate,
      sourceDocument
    };
  };

  const isDafDocLocal = (docName: string): boolean => {
    if (!docName) return false;
    const lower = docName.toLowerCase();
    return lower.includes('daf') || 
           lower.includes('deliverable approval') || 
           lower.includes('deliverable_approval') ||
           lower.includes('acceptance') ||
           lower.includes('réception') ||
           lower.includes('reception') ||
           lower.includes('livrable') ||
           lower.includes('approbation');
  };

  const cleanNameChar = (name: string): string => {
    return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  };

  const isHeadingOrTotal = (service: ServiceDetail): boolean => {
    if (!service || !service.serviceName) return true;
    const name = service.serviceName.toLowerCase().trim();
    const desc = (service.description || '').toLowerCase().trim();

    if (!name || name === 'unknown service' || name === 'service heading') {
      return true;
    }

    // Total / Subtotal checks
    if (
      name === 'total' || 
      name === 'subtotal' || 
      name === 'grand total' ||
      name === 'totals' ||
      name === 'monthly recurring total' ||
      name === 'one-time charges total' ||
      name === 'total charges' ||
      name === 'total cost' ||
      name === 'total price' ||
      name === 'total recurring' ||
      name === 'total one-time' ||
      name.startsWith('total ') || 
      name.endsWith(' total') ||
      name.includes('sub-total') ||
      name.includes('monthly total') ||
      name.includes('one-time total') ||
      desc === 'grand total' ||
      desc === 'total' ||
      desc === 'subtotal'
    ) {
      return true;
    }

    // Service headings checks
    if (
      name === 'managed services' ||
      name === 'professional services' ||
      name === 'transition services' ||
      name === 'optional services' ||
      name === 'additional services' ||
      name === 'service element description' ||
      name === 'description' ||
      name === 'service name' ||
      name === 'service description' ||
      name === 'service element' ||
      name === 'managed service description' ||
      name === 'professional service description' ||
      name === 'service detail' ||
      name === 'service details' ||
      name === 'telus partner hub' || 
      name === 'partner hub services' || 
      name === 'services index' || 
      name === 'one-time charges' || 
      name === 'one-time services' || 
      name === 'recurring charges' || 
      name === 'recurring services' ||
      name === 'monthly recurring charges'
    ) {
      return true;
    }

    return false;
  };

  // Find a matching service in a collection
  const findBestMatchLocal = (
    dafSvc: ServiceDetail, 
    preferredCandidates: ServiceDetail[], 
    fallbackCandidates: ServiceDetail[] = []
  ): ServiceDetail | undefined => {
    const dafCleaned = cleanServiceName(dafSvc.serviceName, result.customerName);
    const dafKey = cleanNameChar(dafCleaned);
    if (!dafKey) return undefined;

    // Filter candidate lists to ONLY those in the same SOW folder / group to guarantee correct grouping
    const dafSowNorm = normalizeSow(dafSvc.sowName || '');
    
    const sameSowPreferred = preferredCandidates.filter(c => normalizeSow(c.sowName || '') === dafSowNorm);
    const sameSowFallback = fallbackCandidates.filter(c => normalizeSow(c.sowName || '') === dafSowNorm);

    // Try finding a matching service in the same SOW group + preferred facing first
    let searchPool = sameSowPreferred;
    let match: ServiceDetail | undefined = undefined;

    const runMatchInPool = (pool: ServiceDetail[]): ServiceDetail | undefined => {
      // 1. Try exact cleaned name match
      let m = pool.find(c => {
        const cCleaned = cleanServiceName(c.serviceName, result.customerName);
        return cleanNameChar(cCleaned) === dafKey;
      });
      if (m) return m;

      // 2. Try substring match
      m = pool.find(c => {
        const cCleaned = cleanNameChar(cleanServiceName(c.serviceName, result.customerName));
        return cCleaned.length > 3 && (dafKey.includes(cCleaned) || cCleaned.includes(dafKey));
      });
      if (m) return m;

      // 3. Try fuzzy/lenient match
      m = pool.find(c => {
        const cCleaned = cleanServiceName(c.serviceName, result.customerName);
        return fuzzyMatch(dafCleaned, cCleaned, 0.6);
      });
      return m;
    };

    match = runMatchInPool(searchPool);
    if (match) return match;

    // Fallback 1: Look in the same SOW group, fallback (other facing) candidates
    // This is vital when the AI puts the DAF service on the wrong facing because DAFs can look generic.
    if (sameSowFallback.length > 0) {
      match = runMatchInPool(sameSowFallback);
      if (match) {
        console.log(`[Gemini Post-process] Found a cross-facing match in the same SOW group for DAF service "${dafSvc.serviceName}": mapping from original facing "${dafSvc.facing}" to matched facing "${match.facing}"`);
        return match;
      }
    }

    // Fallback 2: Look at all preferred candidates globally as a final safety fallback
    if (preferredCandidates.length > 0) {
      match = runMatchInPool(preferredCandidates);
      if (match) return match;
    }

    return undefined;
  };

  // Pre-clean name of all service items to ensure uniformity
  result.customerServices?.forEach(s => {
    if (s) s.serviceName = cleanServiceName(s.serviceName, result.customerName);
  });
  result.vendorServices?.forEach(s => {
    if (s) s.serviceName = cleanServiceName(s.serviceName, result.customerName);
  });
  result.changeOrders?.forEach(co => {
    co.services?.forEach(s => {
      if (s) s.serviceName = cleanServiceName(s.serviceName, result.customerName);
    });
  });

  // Reconcile Customer DAF Services onto SOW and CO Services
  const custSowServices = result.customerServices?.filter(s => s && !isDafDocLocal(s.sourceDocument || '')) || [];
  const custDafServices = result.customerServices?.filter(s => s && isDafDocLocal(s.sourceDocument || '')) || [];
  const custCoServices: ServiceDetail[] = [];
  result.changeOrders?.forEach(co => {
    if (co.facing === 'Customer' && co.services) {
      custCoServices.push(...co.services);
    }
  });
  const allCustCandidates = [...custSowServices, ...custCoServices];

  // Also build all vendor candidates for back-facing fallback
  const vendSowServices = result.vendorServices?.filter(s => s && !isDafDocLocal(s.sourceDocument || '')) || [];
  const vendDafServices = result.vendorServices?.filter(s => s && isDafDocLocal(s.sourceDocument || '')) || [];
  const vendCoServices: ServiceDetail[] = [];
  result.changeOrders?.forEach(co => {
    if (co.facing === 'Vendor' && co.services) {
      vendCoServices.push(...co.services);
    }
  });
  const allVendCandidates = [...vendSowServices, ...vendCoServices];

  custDafServices.forEach(dafSvc => {
    const match = findBestMatchLocal(dafSvc, allCustCandidates, allVendCandidates);
    if (match) {
      match.hasDAF = true;
      match.requiresDAF = true;
      const qty = dafSvc.onboardedQuantity || dafSvc.totalQuantity || match.totalQuantity;
      if (qty && qty !== '0') {
        match.onboardedQuantity = qty;
      }
      if (dafSvc.dafStartDate && dafSvc.dafStartDate !== 'N/A') {
        match.dafStartDate = dafSvc.dafStartDate;
      }
      if (dafSvc.effectiveDate && dafSvc.effectiveDate !== 'N/A') {
        match.effectiveDate = dafSvc.effectiveDate;
        if (!match.dafStartDate) {
          match.dafStartDate = dafSvc.effectiveDate;
        }
      }
      match.billingStatus = 'Billed (DAF Received)';
    }
  });

  vendDafServices.forEach(dafSvc => {
    const match = findBestMatchLocal(dafSvc, allVendCandidates, allCustCandidates);
    if (match) {
      match.hasDAF = true;
      match.requiresDAF = true;
      const qty = dafSvc.onboardedQuantity || dafSvc.totalQuantity || match.totalQuantity;
      if (qty && qty !== '0') {
        match.onboardedQuantity = qty;
      }
      if (dafSvc.dafStartDate && dafSvc.dafStartDate !== 'N/A') {
        match.dafStartDate = dafSvc.dafStartDate;
      }
      if (dafSvc.effectiveDate && dafSvc.effectiveDate !== 'N/A') {
        match.effectiveDate = dafSvc.effectiveDate;
        if (!match.dafStartDate) {
          match.dafStartDate = dafSvc.effectiveDate;
        }
      }
      match.billingStatus = 'Billed (DAF Received)';
    }
  });

  const deduplicateArray = (services: ServiceDetail[]): ServiceDetail[] => {
    if (!services || services.length <= 1) return services || [];
    
    const deduped: ServiceDetail[] = [];
    
    for (const incoming of services) {
      if (!incoming) continue;
      
      let foundIndex = -1;
      for (let i = 0; i < deduped.length; i++) {
        const existing = deduped[i];
        
        // 1. Compare SOW Groups dynamically (using normalizeSow and sourceDocument mapping)
        const sow1 = normalizeSow(existing.sowName || '');
        const sow2 = normalizeSow(incoming.sowName || '');
        let sowsMatch = sow1 === sow2 || !sow1 || !sow2;
        
        if (!sowsMatch) {
          const doc1 = (existing.sourceDocument || '').toLowerCase();
          const doc2 = (incoming.sourceDocument || '').toLowerCase();
          if (doc1 && doc2 && (doc1 === doc2 || doc1.includes(doc2) || doc2.includes(doc1))) {
            sowsMatch = true;
          }
        }
        if (!sowsMatch) continue;
        
        // 2. Compare Service Types with lenient matching
        const type1 = (existing.serviceType || '').trim().toUpperCase();
        const type2 = (incoming.serviceType || '').trim().toUpperCase();
        const typesMatch = type1 === type2 || !type1 || !type2 || 
                           (type1 === 'OTHER' || type2 === 'OTHER') ||
                           ((type1 === 'PS' || type1 === 'TS') && (type2 === 'PS' || type2 === 'TS'));
        if (!typesMatch) continue;
        
        // 3. Name comparison (Fuzzy/Cleaned)
        const name1 = (existing.serviceName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const name2 = (incoming.serviceName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const namesMatch = name1 === name2 || (name1.length > 5 && name2.length > 5 && (name1.includes(name2) || name2.includes(name1)));

        // 4. Exact matching for price/amount
        const amt1 = parseAmountNumLocal(existing.amount || '');
        const amt2 = parseAmountNumLocal(incoming.amount || '');
        const amountsMatch = Math.abs(amt1 - amt2) < 0.01;
        
        // 5. Exact quantity matching
        const q1 = parseQtyLocal(existing.totalQuantity || '');
        const q2 = parseQtyLocal(incoming.totalQuantity || '');
        const qtysMatch = q1 === q2;

        // CRITICAL: If Name, Amount, and Qty all match, it's definitely the same service
        // Even if Amount is 0, if Names and Qty match, we merge.
        if (namesMatch && amountsMatch && qtysMatch) {
          foundIndex = i;
          break;
        }

        // Alternative: If Names are exactly same and amounts are exactly same (even if 0), merge
        if (name1 === name2 && amountsMatch) {
          foundIndex = i;
          break;
        }
      }
      
      if (foundIndex >= 0) {
        deduped[foundIndex] = mergeTwoServices(deduped[foundIndex], incoming);
      } else {
        deduped.push(incoming);
      }
    }
    
    return deduped;
  };

  // Re-deduplicate and filter heading elements out of only the contractual services lists
  result.customerServices = deduplicateArray(custSowServices.filter(s => s && !isHeadingOrTotal(s)));
  result.vendorServices = deduplicateArray(vendSowServices.filter(s => s && !isHeadingOrTotal(s)));
  
  result.changeOrders?.forEach(co => {
    if (co.services) {
      co.services = deduplicateArray(co.services.filter(s => s && !isHeadingOrTotal(s)));
    }
  });

  return result;
};

const mergeResults = (results: ContractAnalysisResult[], defaultSowName = 'Main SOW'): ContractAnalysisResult => {
  if (results.length === 0) {
    throw new Error("No analysis results to merge.");
  }

  let bestCustomerName = '';
  for (const r of results) {
    if (r.customerName && r.customerName.trim() && r.customerName !== 'Unknown' && r.customerName !== 'Customer') {
      if (!bestCustomerName || r.customerName.length > bestCustomerName.length) {
        bestCustomerName = r.customerName.trim();
      }
    }
  }
  if (!bestCustomerName) {
    const firstVal = results.find(r => r.customerName && r.customerName.trim());
    bestCustomerName = firstVal?.customerName || 'Al Stober';
  }

  let bestPartnerName = 'Jolera';
  for (const r of results) {
    if (r.partnerName && r.partnerName.trim() && r.partnerName.toLowerCase() !== 'unknown') {
      bestPartnerName = r.partnerName.trim();
      break;
    }
  }

  let bestExpiry = '';
  for (const r of results) {
    if (r.contractExpiryDate && r.contractExpiryDate.trim() && r.contractExpiryDate !== 'N/A') {
      if (!bestExpiry || r.contractExpiryDate > bestExpiry) {
        bestExpiry = r.contractExpiryDate.trim();
      }
    }
  }
  if (!bestExpiry) bestExpiry = 'N/A';

  const summaries = results
    .map(r => r.summary?.trim())
    .filter(s => s && s !== '' && s !== 'N/A');
  const combinedSummary = summaries.length > 0 
    ? summaries.join('\n\n') 
    : 'Contract analysis completed.';

  const vendorServices: ServiceDetail[] = [];
  const customerServices: ServiceDetail[] = [];
  const changeOrders: ChangeOrder[] = [];
  const unsignedDocuments: string[] = [];

  const normalizeKey = (str: string) => (str || '').trim().toLowerCase();
  const seenServiceKeys = new Set<string>();
  const seenCoKeys = new Set<string>();

  for (const r of results) {
    r.vendorServices?.forEach(s => {
      if (!s) return;
      const key = `${normalizeKey(s.sowName)}|${normalizeKey(s.serviceName)}|${normalizeKey(s.serviceType)}|${normalizeKey(s.facing)}`;
      if (!seenServiceKeys.has(key)) {
        seenServiceKeys.add(key);
        vendorServices.push(s);
      }
    });

    r.customerServices?.forEach(s => {
      if (!s) return;
      const key = `${normalizeKey(s.sowName)}|${normalizeKey(s.serviceName)}|${normalizeKey(s.serviceType)}|${normalizeKey(s.facing)}`;
      if (!seenServiceKeys.has(key)) {
        seenServiceKeys.add(key);
        customerServices.push(s);
      }
    });

    r.changeOrders?.forEach(co => {
      if (!co) return;
      const key = `${normalizeKey(co.associatedSOW)}|${normalizeKey(co.changeOrderNumber)}|${normalizeKey(co.facing)}`;
      if (!seenCoKeys.has(key)) {
        seenCoKeys.add(key);
        changeOrders.push(co);
      } else {
        const existing = changeOrders.find(existCo => 
          normalizeKey(existCo.associatedSOW) === normalizeKey(co.associatedSOW) && 
          normalizeKey(existCo.changeOrderNumber) === normalizeKey(co.changeOrderNumber) && 
          normalizeKey(existCo.facing) === normalizeKey(co.facing)
        );
        if (existing && co.services) {
          if (!existing.services) existing.services = [];
          co.services.forEach(newService => {
            if (!existing.services.some((es: any) => normalizeKey(es.serviceName) === normalizeKey(newService.serviceName))) {
              existing.services.push(newService);
            }
          });
        }
      }
    });

    r.unsignedDocuments?.forEach(doc => {
      if (!unsignedDocuments.includes(doc)) {
        unsignedDocuments.push(doc);
      }
    });
  }

  const parseAmountNum = (amtStr: string): number => {
    if (!amtStr) return 0;
    const clean = amtStr.replace(/[$,\s]/g, '');
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  };

  const formatCurrency = (val: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(val);
  };

  // Re-run global post-processing for all services & change orders
  vendorServices.forEach(processServiceGlobal);
  customerServices.forEach(processServiceGlobal);
  changeOrders.forEach(co => {
    co.services?.forEach(processServiceGlobal);
  });

  // Normalize CO associatedSOW globally based on compiled SOWs
  const isDafDocOrFolder = (name: string): boolean => {
    if (!name) return false;
    const lower = name.toLowerCase();
    return lower === 'daf' || 
           lower === 'dafs' || 
           lower.includes('deliverable approval form') || 
           lower.includes('deliverable_approval_form') ||
           lower.includes('added documents') ||
           lower.includes('added_documents') ||
           lower.includes('réception') ||
           lower.includes('reception') ||
           lower.includes('livrable') ||
           lower.includes('approbation');
  };

  const validSows = new Set<string>();
  const realSows = new Set<string>();
  
  customerServices.forEach(s => {
    if (s && typeof s.sowName === 'string' && s.sowName.trim()) {
      const name = s.sowName.trim();
      validSows.add(name);
      if (!isChangeOrderDoc(name) && !isDafDocOrFolder(name)) realSows.add(name);
    }
  });
  vendorServices.forEach(s => {
    if (s && typeof s.sowName === 'string' && s.sowName.trim()) {
      const name = s.sowName.trim();
      validSows.add(name);
      if (!isChangeOrderDoc(name) && !isDafDocOrFolder(name)) realSows.add(name);
    }
  });
  
  const validSowList = Array.from(validSows);
  const realSowList = Array.from(realSows);
  const primarySow = realSowList[0] || validSowList[0];

  const getNormalizedSow = (currentSow: string): string => {
    const s = (currentSow || '').trim();
    if (!s || !primarySow) return s || defaultSowName;
    
    // If it's already a valid/real SOW, keep it
    if (realSows.has(s)) return s;
    
    const sLower = s.toLowerCase();
    
    // Fuzzy match against real SOWs
    const match = realSowList.find(rs => {
      const rsLower = rs.toLowerCase();
      return (rsLower.length > 3 && sLower.includes(rsLower)) ||
             (sLower.length > 3 && rsLower.includes(sLower));
    });
    if (match) return match;

    // Check with brand-wide normalizeSow
    const sNorm = normalizeSow(s);
    const matchNorm = realSowList.find(rs => normalizeSow(rs) === sNorm);
    if (matchNorm) return matchNorm;
    
    // Fallback for COs, DAFs or generic directory names – align everything to primary real SOW
    if (isChangeOrderDoc(s) || isDafDocOrFolder(s) || ['main', 'root', 'sow', 'unknown', '', 'added documents', 'added_documents', 'temp', 'drafts'].includes(sLower)) {
      if (primarySow) return primarySow;
    }
    
    // If we have a real SOW, merge other non-real folders to it to keep SOW lists perfectly clean
    if (primarySow && !realSows.has(s)) {
      return primarySow;
    }
    
    return s;
  };

  // Re-align all services to real SOWs
  customerServices.forEach(s => { s.sowName = getNormalizedSow(s.sowName); });
  vendorServices.forEach(s => { s.sowName = getNormalizedSow(s.sowName); });
  changeOrders.forEach(co => {
    if (!co) return;
    co.associatedSOW = getNormalizedSow(co.associatedSOW);
    co.services?.forEach(s => { s.sowName = co.associatedSOW; });
  });

  // Global alignment: Mark isSigned = true/false strictly based on the explicit unsignedDocuments list.
  // Services & COs are signed (isSigned = true) unless their document name matches one listed in unsignedDocuments.
  const lowerUnsignedDocs = unsignedDocuments.map(d => d.toLowerCase());
  
  const alignServiceSignature = (s: ServiceDetail, isCoService = false) => {
    const docName = (s.sourceDocument || '').toLowerCase();
    const sowName = (s.sowName || '').toLowerCase();
    
    if (isCoService) {
      return;
    }
    
    const isDocNameCo = docName.includes('co') || docName.includes('change') || docName.includes('cr') || docName.includes('amendment');
    
    const matchesUnsigned = lowerUnsignedDocs.some(ud => {
      // If the service's sourceDocument is explicitly related to a Change Order,
      // only mark unsigned if the unsigned doc explicitly matches that CO document name
      if (isDocNameCo) {
        return docName && (ud.includes(docName) || docName.includes(ud));
      }
      
      // Standard main SOW service checking
      return (docName && (ud.includes(docName) || docName.includes(ud))) ||
             (sowName && (ud.includes(sowName) || sowName.includes(ud)));
    });
    
    if (matchesUnsigned) {
      s.isSigned = false;
    } else {
      s.isSigned = true; // Decoupled: SOW document is signed, so service signature is true regardless of onboarding status
    }
    
    // Re-run global billing status mapping to reflect the aligned signature state
    processServiceGlobal(s);
  };

  customerServices.forEach(s => alignServiceSignature(s, false));
  vendorServices.forEach(s => alignServiceSignature(s, false));
  
  changeOrders.forEach(co => {
    const coName = (co.changeOrderNumber || '').toLowerCase();
    const sName = (co.associatedSOW || '').toLowerCase();
    
    // Collect all source documents associated with this Change Order's services
    const serviceDocs = co.services?.map(s => (s.sourceDocument || '').toLowerCase()) || [];
    
    // A Change Order is unsigned only if there has been an explicit matching unsigned doc
    const matchesUnsigned = lowerUnsignedDocs.some(ud => {
      // 1. Check if the unsigned doc explicitly matches the service source document in this CO
      if (serviceDocs.some(sd => sd && (ud.includes(sd) || sd.includes(ud)))) {
        return true;
      }
      
      // 2. Check if the unsigned doc explicitly matches the CO Number/Name
      if (coName) {
        const cleanUd = ud.replace(/[^a-z0-9]/g, '');
        const cleanCoName = coName.replace(/[^a-z0-9]/g, '');
        
        // Ensure that we only match Change Order documents (to avoid a base SOW "Felix Scholler" matching "CO Felix Scholler")
        const isCoUd = ud.includes('co') || ud.includes('change') || ud.includes('cr') || ud.includes('amendment');
        if (isCoUd && cleanCoName.length > 0 && (cleanUd.includes(cleanCoName) || cleanCoName.includes(cleanUd))) {
          return true;
        }
      }
      
      return false;
    });
    
    if (matchesUnsigned) {
      co.isSigned = false;
    } else {
      co.isSigned = true;
    }
    
    // Align all of its services' signatures to match the Change Order status
    co.services?.forEach(s => {
      s.isSigned = co.isSigned;
      processServiceGlobal(s);
    });
  });

  // Re-sum total billed
  let totalBilledCust = 0;
  customerServices.forEach(s => {
    totalBilledCust += parseAmountNum(s.amount);
  });
  changeOrders.filter(co => co.facing === 'Customer').forEach(co => {
    totalBilledCust += parseAmountNum(co.amount);
  });

  let totalBilledVend = 0;
  vendorServices.forEach(s => {
    totalBilledVend += parseAmountNum(s.amount);
  });
  changeOrders.filter(co => co.facing === 'Vendor').forEach(co => {
    totalBilledVend += parseAmountNum(co.amount);
  });

  const firstWithCustomerAlias = results.find(r => r.customerAlias);
  const firstWithVendorAlias = results.find(r => r.vendorAlias);

  return {
    customerName: bestCustomerName,
    partnerName: bestPartnerName,
    contractExpiryDate: bestExpiry,
    summary: combinedSummary,
    totalBilledToCustomer: formatCurrency(totalBilledCust),
    totalBilledByVendor: formatCurrency(totalBilledVend),
    vendorServices,
    customerServices,
    changeOrders,
    unsignedDocuments,
    customerAlias: firstWithCustomerAlias?.customerAlias || 'Customer',
    vendorAlias: firstWithVendorAlias?.vendorAlias || 'Vendor'
  };
};

const isChangeOrderDoc = (name: string): boolean => {
  if (!name) return false;
  const lower = name.toLowerCase();
  
  // SOWCO-01 is usually the main SOW, but SOWCO-02, SOWCO-03, SOWCO-04 etc. are Change Orders
  const isSowcoChangeOrder = /sowco[-_]?0*([2-9]|\d{2,})/i.test(lower);
  
  return lower.includes('change order') || 
         lower.includes('change_order') || 
         lower.includes('co-') || 
         lower.includes('co_') ||
         isSowcoChangeOrder ||
         /\bco\b/i.test(lower) || 
         lower.includes('change request') || 
         lower.includes('change_request') || 
         lower.includes('cr-') || 
         /\bcr\b/i.test(lower) || 
         lower.includes('amendment');
};

const createFolderBuckets = (folderDocs: ParsedDocument[]): ParsedDocument[][] => {
  const isDafDocLocal = (docName: string): boolean => {
    if (!docName) return false;
    const lower = docName.toLowerCase();
    return lower.includes('daf') || 
           lower.includes('deliverable approval') || 
           lower.includes('deliverable_approval') ||
           lower.includes('acceptance') ||
           lower.includes('réception') ||
           lower.includes('reception') ||
           lower.includes('livrable') ||
           lower.includes('approbation');
  };

  const dafDocs = folderDocs.filter(d => isDafDocLocal(d.name) || (d.folder && isDafDocLocal(d.folder)));
  const coDocs = folderDocs.filter(d => isChangeOrderDoc(d.name) && !dafDocs.includes(d));
  
  // SOW documents are anything else that is not a CO or a DAF
  const sowDocs = folderDocs.filter(d => !coDocs.includes(d) && !dafDocs.includes(d));

  const buckets: ParsedDocument[][] = [];

  // Base bucket combines SOWs and DAFs so the AI can cross-reference them in a single prompt context
  const baseBucket = [...sowDocs, ...dafDocs];
  if (baseBucket.length > 0) {
    buckets.push(baseBucket);
  }

  // To provide 8192 output tokens of capacity for each Change Order and guarantee they don't get mixed up
  // or truncated, process each Change Order document in its own sequential bucket.
  coDocs.forEach(coDoc => {
    buckets.push([coDoc]);
  });

  // Fallback: if somehow buckets is empty, return everything in one bucket
  if (buckets.length === 0 && folderDocs.length > 0) {
    return [folderDocs];
  }

  return buckets;
};

export const analyzeDocuments = async (docs: ParsedDocument[]): Promise<ContractAnalysisResult> => {
  let defaultSowName = 'Main SOW';
  if (Array.isArray(docs) && docs.length > 0) {
    const sowDoc = docs.find(d => {
      const nLower = d.name.toLowerCase();
      return (nLower.includes('sow') || nLower.includes('statement of work')) && !nLower.includes('daf') && !isChangeOrderDoc(d.name);
    }) || docs.find(d => !isChangeOrderDoc(d.name) && !d.name.toLowerCase().includes('daf'));
    
    if (sowDoc) {
      const base = sowDoc.name.split('/').pop() || '';
      defaultSowName = base.replace(/\.[^/.]+$/, '').trim();
    }
  }

  // Group documents by folder to process structured multi-folder structures in isolation
  const folderGroups: Record<string, ParsedDocument[]> = {};
  for (const doc of docs) {
    let fName = doc.folder || 'Root';
    
    // Normalize folder name: strip trailing /daf, /dafs, /change orders, /cos etc. to group with parent folder SOW
    const pTrim = fName.trim().replace(/[\/\\]+$/, '');
    let cleaned = pTrim.replace(/[\/\\]+(dafs?|deliverable\s*approval\s*forms?|added\s*documents?|added_documents?|unsigned|signed|co|cos|change\s*orders?)$/i, '');
    
    // Safety guard: if the folder name is standalone (e.g., literally "daf", "cos", etc. with no parent segment), map it to 'Root'
    if (cleaned === pTrim) {
      if (/^(dafs?|deliverable\s*approval\s*forms?|added\s*documents?|added_documents?|unsigned|signed|co|cos|change\s*orders?)$/i.test(pTrim)) {
        cleaned = 'Root';
      }
    }
    fName = cleaned || 'Root';
    
    // Update doc's folder representation so Gemini uses the correct parent folder
    doc.folder = fName;
    
    if (!folderGroups[fName]) {
      folderGroups[fName] = [];
    }
    folderGroups[fName].push(doc);
  }

  const folderNames = Object.keys(folderGroups);
  const allSubpartsResults: ContractAnalysisResult[] = [];

  for (const folderName of folderNames) {
    const folderDocs = folderGroups[folderName];
    // Create optimized sub-buckets for this folder to fit perfectly under Gemini prompt limitations
    const buckets = createFolderBuckets(folderDocs);
    console.log(`[Gemini API] Processing folder "${folderName}" split into ${buckets.length} sequential buckets to ensure no data truncation and 100% extraction accuracy without hitting rate limits.`);

    const bucketResults: ContractAnalysisResult[] = [];
    for (let idx = 0; idx < buckets.length; idx++) {
      const bucketDocs = buckets[idx];
      try {
        console.log(`[Gemini API] Processing bucket ${idx + 1}/${buckets.length} for folder "${folderName}" with ${bucketDocs.length} files.`);
        const res = await analyzeDocumentsSingle(bucketDocs);
        bucketResults.push(res);
      } catch (err) {
        console.error(`Error analyzing bucket ${idx + 1} of folder "${folderName}":`, err);
        bucketResults.push({
          customerName: '',
          partnerName: 'Jolera',
          contractExpiryDate: 'N/A',
          summary: `Error analyzing bucket ${idx + 1} of folder ${folderName}: ${err instanceof Error ? err.message : String(err)}`,
          totalBilledToCustomer: '$0',
          totalBilledByVendor: '$0',
          vendorServices: [],
          customerServices: [],
          changeOrders: [],
          unsignedDocuments: []
        } as ContractAnalysisResult);
      }
    }
    
    allSubpartsResults.push(...bucketResults);
  }

  let finalResult: ContractAnalysisResult;
  if (allSubpartsResults.length === 1) {
    finalResult = allSubpartsResults[0];
  } else {
    finalResult = mergeResults(allSubpartsResults, defaultSowName);
  }

  // Create document-to-folder mapping based on parsed documents
  const cleanFolderName = (fName: string): string => {
    if (!fName) return '';
    let s = fName.trim().replace(/\\/g, '/');
    
    // Strip trailing category paths or document types first
    s = s.replace(/[\/\\\s]+(dafs?|deliverable\s*approval\s*forms?|added\s*documents?|added_documents?|unsigned|signed|co|cos|change\s*orders?)([\/\\\s]+|$)/gi, '');
    
    const parts = s.split('/').map(p => p.trim()).filter(Boolean);
    const genericFolders = [
      'customer sows', 'customer sow', 'vendor sows', 'vendor sow', 'root', 
      'added documents', 'added_documents', 'temp', 'unknown', 'drafts', 
      'daf', 'dafs', 'co', 'cos', 'change orders', 'change_orders', 'sow', 'sows',
      'archive', 'out', 'dist', 'src', 'files', 'documents', 'uploads', 'tmp'
    ];
    
    const specificParts = parts.filter(p => !genericFolders.includes(p.toLowerCase()));
    
    let res = '';
    if (specificParts.length > 0) {
      res = specificParts[specificParts.length - 1];
    } else if (parts.length > 0) {
      res = parts[parts.length - 1];
    }
    
    const sLower = res.toLowerCase().trim();
    if (!sLower || genericFolders.includes(sLower) ||
        /^(dafs?|deliverable\s*approval\s*forms?|added\s*documents?|added_documents?|unsigned|signed|co|cos|change\s*orders?)$/i.test(sLower)) {
      return '';
    }
    return res.trim();
  };

  const actualSowFolders = Array.from(new Set(
    docs.map(doc => cleanFolderName(doc.folder || ''))
        .filter(f => f !== '')
  ));

  const getSowForDoc = (docName: string): string => {
    const isGenericVal = (name: string): boolean => {
      if (!name) return true;
      const ln = name.toLowerCase().trim();
      return ['root', 'added documents', 'added_documents', 'temp', 'unknown', 'sow', 'sows', 'daf', 'dafs', 'co', 'cos', ''].includes(ln);
    };

    if (!docName || typeof docName !== 'string') {
      return actualSowFolders[0] || defaultSowName;
    }

    if (actualSowFolders.length === 0) {
      for (const doc of docs) {
        if (doc && doc.name === docName) {
          const cleaned = cleanFolderName(doc.folder || '');
          if (cleaned && !isGenericVal(cleaned)) return cleaned;
        }
      }
      return defaultSowName;
    }
    
    const doc = docs.find(d => d && d.name === docName);
    const docFolder = doc ? (doc.folder || '') : '';
    
    const cleanedFolder = cleanFolderName(docFolder);
    if (cleanedFolder && actualSowFolders.includes(cleanedFolder) && !isGenericVal(cleanedFolder)) {
      return cleanedFolder;
    }
    
    const cleanFnBase = docName.split('/').pop() || '';
    const baseDoc = docs.find(d => d && (d.name.split('/').pop() || '') === cleanFnBase);
    if (baseDoc) {
      const baseCleaned = cleanFolderName(baseDoc.folder || '');
      if (baseCleaned && actualSowFolders.includes(baseCleaned) && !isGenericVal(baseCleaned)) {
        return baseCleaned;
      }
    }

    const nameLower = docName.toLowerCase();
    const matched = actualSowFolders.find(f => {
      if (!f) return false;
      const fLower = f.toLowerCase();
      return (nameLower.includes(fLower) || fLower.includes(nameLower)) && !isGenericVal(f);
    });
    if (matched) return matched;
    
    return actualSowFolders[0] || defaultSowName;
  };

  const realSows = new Set(actualSowFolders.map(f => normalizeSow(f)));

  // Re-map all services & change orders to their clean SOW folders strictly
  finalResult.customerServices?.forEach(s => {
    s.sowName = normalizeSow(getSowForDoc(s.sourceDocument || ''));
  });
  finalResult.vendorServices?.forEach(s => {
    s.sowName = normalizeSow(getSowForDoc(s.sourceDocument || ''));
  });
  finalResult.changeOrders?.forEach(co => {
    let resolvedSow = '';
    if (co.associatedSOW) {
      const normalized = normalizeSow(co.associatedSOW);
      if (realSows.has(normalized)) {
        resolvedSow = normalized;
      }
    }
    
    if (!resolvedSow) {
      let docName = (co as any).sourceDocument || '';
      if (!docName && co.services && co.services.length > 0) {
        docName = co.services[0].sourceDocument || '';
      }
      if (!docName) {
        docName = co.changeOrderNumber || '';
      }
      resolvedSow = getSowForDoc(docName);
    }
    
    co.associatedSOW = normalizeSow(resolvedSow);
    co.services?.forEach(s => {
      s.sowName = co.associatedSOW;
    });
  });

  finalResult = deduplicateResultServices(finalResult);

  return finalResult;
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

  const response = await generateContentWithModelChain({ parts }, {});

  return response.text || "I'm sorry, I couldn't generate a response.";
};
