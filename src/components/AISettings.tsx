import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Cpu, 
  Key, 
  CheckCircle, 
  XCircle, 
  Info, 
  Sparkles, 
  RefreshCw, 
  Play, 
  Eye, 
  EyeOff, 
  Sliders, 
  CheckCircle2, 
  Trash2, 
  Save,
  Server,
  Cloud
} from 'lucide-react';
import { testCustomAIConnection, testFuelixConnection } from '../lib/gemini';

const GEMINI_MODELS = [
  { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash (Recommended - Fastest & Highly Capable)', description: 'Best choice for general text analysis, summarization, and rapid extraction.' },
  { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro (Analytical - Complex Reasoning)', description: 'Best choice for deeply complex contracts, advanced reasoning, and fine-grained logic.' },
  { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite (Lightweight & Swift)', description: 'Fast, cost-effective model designed for basic extraction tasks.' }
];

const FUELIX_MODELS = [
  { id: 'gpt-4o', name: 'GPT-4o (Omni - Premium Reasoning)', description: 'High capability model for precise structural analysis and reasoning.' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Cost-Effective & Rapid)', description: 'Extremely fast, highly balanced model for high-throughput extractions.' },
  { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet (Elite Quality)', description: 'Outstanding comprehension of multi-layered contract terms and compliance guidelines.' }
];

export const AISettings: React.FC = () => {
  const [provider, setProvider] = useState<'gemini' | 'fuelix' | 'google-drive'>('gemini');
  
  // Gemini states
  const [geminiKey, setGeminiKey] = useState('');
  const [geminiModel, setGeminiModel] = useState('gemini-3.5-flash');
  const [customGeminiName, setCustomGeminiName] = useState('');
  
  // Fuelix states
  const [fuelixKey, setFuelixKey] = useState('');
  const [fuelixModel, setFuelixModel] = useState('gpt-4o');
  const [customFuelixName, setCustomFuelixName] = useState('');

  // Google Drive states
  const [googleDriveClientId, setGoogleDriveClientId] = useState('');

  const [showKey, setShowKey] = useState(false);
  const [useAlways, setUseAlways] = useState(false);
  const [useFallback, setUseFallback] = useState(true);
  
  // Environment Secret Presence states
  const [isFuelixEnvPresent, setIsFuelixEnvPresent] = useState(false);
  const [isGeminiEnvPresent, setIsGeminiEnvPresent] = useState(false);

  // Testing connection states
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  
  // Feedback states
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Load from localStorage and env on mount
  useEffect(() => {
    const savedProvider = (localStorage.getItem('custom_ai_provider') || 'gemini') as 'gemini' | 'fuelix' | 'google-drive';
    const savedGeminiKey = localStorage.getItem('custom_gemini_api_key') || '';
    const savedGeminiModel = localStorage.getItem('custom_gemini_model') || 'gemini-3.5-flash';
    const savedFuelixKey = localStorage.getItem('custom_fuelix_api_key') || '';
    const savedFuelixModel = localStorage.getItem('custom_fuelix_model') || 'gpt-4o';
    const savedGoogleDriveClientId = localStorage.getItem('google_drive_client_id') || '';
    const savedAlways = localStorage.getItem('use_custom_always') === 'true';
    const savedFallback = localStorage.getItem('use_custom_fallback') !== 'false'; // Defaults to true

    const envFuelixKey = (process.env as any).FUELIX_API_KEY || '';
    const envFuelixModel = (process.env as any).FUELIX_MODEL || '';
    const envGeminiKey = (process.env as any).GEMINI_API_KEY || '';

    setIsFuelixEnvPresent(!!envFuelixKey);
    setIsGeminiEnvPresent(!!envGeminiKey);

    setProvider(savedProvider);
    setGeminiKey(savedGeminiKey || envGeminiKey);
    setFuelixKey(savedFuelixKey || envFuelixKey);
    setGoogleDriveClientId(savedGoogleDriveClientId);
    setUseAlways(savedAlways);
    setUseFallback(savedFallback);

    // Parse Gemini model
    const activeGeminiModel = savedGeminiModel || 'gemini-3.5-flash';
    const geminiMatch = GEMINI_MODELS.find(m => m.id === activeGeminiModel);
    if (geminiMatch) {
      setGeminiModel(activeGeminiModel);
      setCustomGeminiName('');
    } else if (activeGeminiModel) {
      setGeminiModel('custom');
      setCustomGeminiName(activeGeminiModel);
    }

    // Parse Fuelix model
    const activeFuelixModel = savedFuelixModel || envFuelixModel || 'gpt-4o';
    const fuelixMatch = FUELIX_MODELS.find(m => m.id === activeFuelixModel);
    if (fuelixMatch) {
      setFuelixModel(activeFuelixModel);
      setCustomFuelixName('');
    } else if (activeFuelixModel) {
      setFuelixModel('custom');
      setCustomFuelixName(activeFuelixModel);
    }
  }, []);

  const handleSave = () => {
    localStorage.setItem('custom_ai_provider', provider);
    localStorage.setItem('use_custom_always', String(useAlways));
    localStorage.setItem('use_custom_fallback', String(useFallback));

    if (provider === 'gemini') {
      const finalModel = geminiModel === 'custom' ? customGeminiName : geminiModel;
      if (geminiKey.trim()) {
        localStorage.setItem('custom_gemini_api_key', geminiKey.trim());
        localStorage.setItem('custom_gemini_model', finalModel || 'gemini-3.5-flash');
      } else {
        localStorage.removeItem('custom_gemini_api_key');
        localStorage.removeItem('custom_gemini_model');
      }
    } else if (provider === 'fuelix') {
      const finalModel = fuelixModel === 'custom' ? customFuelixName : fuelixModel;
      if (fuelixKey.trim()) {
        localStorage.setItem('custom_fuelix_api_key', fuelixKey.trim());
        localStorage.setItem('custom_fuelix_model', finalModel || 'gpt-4o');
      } else {
        localStorage.removeItem('custom_fuelix_api_key');
        localStorage.removeItem('custom_fuelix_model');
      }
    } else if (provider === 'google-drive') {
      if (googleDriveClientId.trim()) {
        localStorage.setItem('google_drive_client_id', googleDriveClientId.trim());
      } else {
        localStorage.removeItem('google_drive_client_id');
      }
    }

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleClear = () => {
    if (provider === 'gemini') {
      localStorage.removeItem('custom_gemini_api_key');
      localStorage.removeItem('custom_gemini_model');
      setGeminiKey('');
      setGeminiModel('gemini-3.5-flash');
      setCustomGeminiName('');
    } else if (provider === 'fuelix') {
      localStorage.removeItem('custom_fuelix_api_key');
      localStorage.removeItem('custom_fuelix_model');
      setFuelixKey('');
      setFuelixModel('gpt-4o');
      setCustomGeminiName('');
    } else if (provider === 'google-drive') {
      localStorage.removeItem('google_drive_client_id');
      setGoogleDriveClientId('');
    }
    
    setTestResult(null);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleTestConnection = async () => {
    const activeKey = provider === 'gemini' ? geminiKey : fuelixKey;
    const activeModel = provider === 'gemini' 
      ? (geminiModel === 'custom' ? customGeminiName.trim() : geminiModel)
      : (fuelixModel === 'custom' ? customFuelixName.trim() : fuelixModel);

    if (!activeKey.trim()) {
      setTestResult({
        success: false,
        message: `An API Key or Token is required to test the ${provider === 'gemini' ? 'Gemini' : 'Fuelix'} connection.`
      });
      return;
    }

    if (!activeModel) {
      setTestResult({
        success: false,
        message: 'A model name is required to run a connection test.'
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      let response = '';
      if (provider === 'gemini') {
        response = await testCustomAIConnection(activeKey.trim(), activeModel);
      } else {
        response = await testFuelixConnection(activeKey.trim(), activeModel);
      }
      setTestResult({
        success: true,
        message: response
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Connection test failed. Please verify your credentials and model choice.'
      });
    } finally {
      setIsTesting(false);
    }
  };

  const activeKey = provider === 'gemini' ? geminiKey : provider === 'fuelix' ? fuelixKey : googleDriveClientId;

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <div className="flex items-center gap-4 border-b border-border-primary pb-6">
        <div className="p-3 bg-telus-purple/10 rounded-xl">
          <Cpu className="w-8 h-8 text-telus-purple" />
        </div>
        <div>
          <h1 className="text-3xl font-light text-text-primary">AI Custom Configuration</h1>
          <p className="text-text-secondary mt-1">Configure your custom Gemini or Fuelix credentials to expand quota or establish dedicated fallback pathways.</p>
        </div>
      </div>

      {/* Tabs for choosing AI Provider */}
      <div className="flex border-b border-border-primary gap-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => { setProvider('gemini'); setTestResult(null); }}
          className={`px-6 py-3 font-black text-sm border-b-2 transition-all flex items-center gap-2 shrink-0 ${
            provider === 'gemini' 
              ? 'border-telus-purple text-telus-purple' 
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          Google Gemini
        </button>
        <button
          type="button"
          onClick={() => { setProvider('fuelix'); setTestResult(null); }}
          className={`px-6 py-3 font-black text-sm border-b-2 transition-all flex items-center gap-2 shrink-0 ${
            provider === 'fuelix' 
              ? 'border-telus-purple text-telus-purple' 
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          <Server className="w-4 h-4" />
          Fuelix Platform
        </button>
        <button
          type="button"
          onClick={() => { setProvider('google-drive'); setTestResult(null); }}
          className={`px-6 py-3 font-black text-sm border-b-2 transition-all flex items-center gap-2 shrink-0 ${
            provider === 'google-drive' 
              ? 'border-telus-purple text-telus-purple' 
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          <Cloud className="w-4 h-4" />
          Google Drive
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Side: Form Controls */}
        <div className="lg:col-span-2 space-y-6">
          <div className="telus-card p-6 md:p-8 space-y-6">
            {provider === 'google-drive' ? (
              <>
                <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
                  <Cloud className="w-5 h-5 text-telus-purple" />
                  Google Workspace Client ID
                </h2>
                
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-text-secondary">
                    OAuth Client ID
                  </label>
                  <input
                    type="text"
                    value={googleDriveClientId}
                    onChange={(e) => setGoogleDriveClientId(e.target.value)}
                    placeholder="xxxxxxxx-xxxxxxxx.apps.googleusercontent.com"
                    className="w-full bg-bg-secondary text-text-primary border border-border-primary rounded-xl px-4 py-3 focus:outline-none focus:border-telus-purple transition-colors text-sm font-mono"
                  />
                  <p className="text-[11px] text-text-secondary/75 leading-relaxed">
                    Enter the Client ID generated from your Google Cloud Console. Your credential is stored completely locally in your browser's <code className="bg-[#4B286D0A] px-1 py-0.5 rounded text-telus-purple text-[10px] font-mono">localStorage</code>.
                  </p>
                </div>

                <div className="bg-bg-secondary border border-border-primary p-4 rounded-xl space-y-2">
                  <h4 className="text-xs font-bold text-text-primary flex items-center gap-1.5">
                    <Info className="w-4 h-4 text-telus-purple" />
                    Authorized Redirection Parameter
                  </h4>
                  <p className="text-[11px] text-text-secondary leading-relaxed">
                    When creating your OAuth Client ID in Google Cloud Console, select <strong>Web Application</strong> as the type and paste this exact URL into the <strong>Authorized JavaScript Origins</strong> section:
                  </p>
                  <code className="block bg-[#4B286D0A] p-2.5 rounded text-telus-purple font-mono text-[11px] border border-[#4B286D1A]">
                    {window.location.origin}
                  </code>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
                  <Key className="w-5 h-5 text-telus-purple" />
                  {provider === 'gemini' ? 'Gemini Credentials' : 'Fuelix Credentials'}
                </h2>

                {/* Custom API Key Input */}
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-text-secondary">
                    {provider === 'gemini' ? 'Google Gemini API Key' : 'Fuelix Authorization Bearer Token'}
                  </label>
                  <div className="relative">
                    <input
                      type={showKey ? "text" : "password"}
                      value={provider === 'gemini' ? geminiKey : fuelixKey}
                      onChange={(e) => provider === 'gemini' ? setGeminiKey(e.target.value) : setFuelixKey(e.target.value)}
                      placeholder={provider === 'gemini' ? "AIzaSy..." : "eyJhbGciOi..."}
                      className="w-full bg-bg-secondary text-text-primary border border-border-primary rounded-xl px-4 py-3 pr-12 focus:outline-none focus:border-telus-purple transition-colors text-sm font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-telus-purple transition-colors"
                    >
                      {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-text-secondary/75">
                    Your key is stored strictly locally in your browser's <code className="bg-[#4B286D0A] px-1 py-0.5 rounded text-telus-purple text-[10px] font-mono">localStorage</code>. It never leaves your browser, keeping your keys entirely private and secure.
                  </p>

                  {provider === 'fuelix' && isFuelixEnvPresent && (
                    <div className="flex items-center gap-2 text-xs text-[#2B6CB0] bg-[#EBF8FF] px-4 py-3 rounded-xl border border-[#BEE3F8] mt-3 font-medium">
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-[#3182CE]" />
                      <span><strong>Active Connection:</strong> Fuelix API Key is loaded from workspace secrets. You do not need to manually enter it!</span>
                    </div>
                  )}

                  {provider === 'gemini' && isGeminiEnvPresent && (
                    <div className="flex items-center gap-2 text-xs text-emerald-800 bg-emerald-50 px-4 py-3 rounded-xl border border-emerald-200 mt-3 font-medium">
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                      <span><strong>Active Connection:</strong> Google Gemini API Key is loaded from workspace secrets.</span>
                    </div>
                  )}
                </div>

                {/* API Model Selection */}
                <div className="space-y-4">
                  <label className="block text-sm font-bold text-text-secondary">Model Choice</label>
                  <div className="grid grid-cols-1 gap-3">
                    {provider === 'gemini' ? (
                      GEMINI_MODELS.map((model) => (
                        <div
                          key={model.id}
                          onClick={() => setGeminiModel(model.id)}
                          className={`p-4 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                            geminiModel === model.id 
                              ? 'bg-[#4B286D05] border-telus-purple/45 shadow-[0_4px_20px_rgba(75,40,109,0.05)]' 
                              : 'bg-bg-secondary border-border-primary hover:border-slate-300'
                          }`}
                        >
                          <input
                            type="radio"
                            name="gemini-model-select"
                            checked={geminiModel === model.id}
                            onChange={() => setGeminiModel(model.id)}
                            className="mt-1 text-telus-purple focus:ring-telus-purple"
                          />
                          <div>
                            <h4 className="text-sm font-bold text-text-primary">{model.name}</h4>
                            <p className="text-xs text-text-secondary mt-1">{model.description}</p>
                          </div>
                        </div>
                      ))
                    ) : (
                      FUELIX_MODELS.map((model) => (
                        <div
                          key={model.id}
                          onClick={() => setFuelixModel(model.id)}
                          className={`p-4 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                            fuelixModel === model.id 
                              ? 'bg-[#4B286D05] border-telus-purple/45 shadow-[0_4px_20px_rgba(75,40,109,0.05)]' 
                              : 'bg-bg-secondary border-border-primary hover:border-slate-300'
                          }`}
                        >
                          <input
                            type="radio"
                            name="fuelix-model-select"
                            checked={fuelixModel === model.id}
                            onChange={() => setFuelixModel(model.id)}
                            className="mt-1 text-telus-purple focus:ring-telus-purple"
                          />
                          <div>
                            <h4 className="text-sm font-bold text-text-primary">{model.name}</h4>
                            <p className="text-xs text-text-secondary mt-1">{model.description}</p>
                          </div>
                        </div>
                      ))
                    )}

                    {/* Custom Model Option */}
                    <div
                      onClick={() => provider === 'gemini' ? setGeminiModel('custom') : setFuelixModel('custom')}
                      className={`p-4 rounded-xl border cursor-pointer transition-all ${
                        (provider === 'gemini' ? geminiModel : fuelixModel) === 'custom'
                          ? 'bg-[#4B286D05] border-telus-purple/45 shadow-[0_4px_20px_rgba(75,40,109,0.05)]'
                          : 'bg-bg-secondary border-border-primary hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="radio"
                          name="custom-model-select"
                          checked={(provider === 'gemini' ? geminiModel : fuelixModel) === 'custom'}
                          onChange={() => provider === 'gemini' ? setGeminiModel('custom') : setFuelixModel('custom')}
                          className="mt-1 text-telus-purple focus:ring-telus-purple"
                        />
                        <div className="flex-1">
                          <h4 className="text-sm font-bold text-text-primary">Other / Custom Model Name</h4>
                          <p className="text-xs text-text-secondary mt-1">Specify an alternative valid model identifier supported by your chosen provider.</p>
                          
                          {provider === 'gemini' && geminiModel === 'custom' && (
                            <div className="mt-3">
                              <input
                                type="text"
                                value={customGeminiName}
                                onChange={(e) => setCustomGeminiName(e.target.value)}
                                placeholder="e.g. gemini-2.5-pro-preview-01-25"
                                className="w-full bg-bg-secondary text-text-primary border border-border-primary rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-telus-purple font-mono"
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                          )}

                          {provider === 'fuelix' && fuelixModel === 'custom' && (
                            <div className="mt-3">
                              <input
                                type="text"
                                value={customFuelixName}
                                onChange={(e) => setCustomFuelixName(e.target.value)}
                                placeholder="e.g. deepseek-chat"
                                className="w-full bg-bg-secondary text-text-primary border border-border-primary rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-telus-purple font-mono"
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Usage Preference Configuration */}
            {provider !== 'google-drive' && (
              <div className="space-y-4 border-t border-border-primary/50 pt-6">
                <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-telus-green" />
                  Activation Strategy
                </h3>

                <div className="space-y-3">
                  {/* Fallback Option */}
                  <label className="flex items-start gap-3 p-3 rounded-xl bg-bg-secondary border border-border-primary cursor-pointer hover:bg-slate-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={useFallback}
                      onChange={(e) => {
                        setUseFallback(e.target.checked);
                        if (e.target.checked) setUseAlways(false);
                      }}
                      className="mt-1 text-telus-purple rounded focus:ring-telus-purple"
                    />
                    <div>
                      <span className="text-xs font-bold text-text-primary block">Use as Fallback Mode (Recommended)</span>
                      <span className="text-[11px] text-text-secondary mt-0.5 block">
                        AXON uses the system default API keys. If those defaults exceed quota or trigger a rate limit (429 errors), AXON seamlessly falls back to your custom <span className="font-bold">{provider === 'gemini' ? 'Gemini' : 'Fuelix'}</span> key and model to continue the analysis uninterrupted.
                      </span>
                    </div>
                  </label>

                  {/* Always Use Option */}
                  <label className="flex items-start gap-3 p-3 rounded-xl bg-bg-secondary border border-border-primary cursor-pointer hover:bg-slate-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={useAlways}
                      onChange={(e) => {
                        setUseAlways(e.target.checked);
                        if (e.target.checked) setUseFallback(false);
                      }}
                      className="mt-1 text-telus-purple rounded focus:ring-telus-purple"
                    />
                    <div>
                      <span className="text-xs font-bold text-text-primary block">Force-Use Custom Configuration Always</span>
                      <span className="text-[11px] text-text-secondary mt-0.5 block font-medium">
                        Bypasses system default keys completely. Runs all Extractions, Chats, Smart Dashboards, and Reports directly under your own <span className="font-bold">{provider === 'gemini' ? 'Gemini' : 'Fuelix'}</span> API configuration.
                      </span>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {/* Actions Panel */}
            <div className="border-t border-border-primary/50 pt-6 flex flex-col sm:flex-row gap-3 justify-between">
              <button
                type="button"
                onClick={handleClear}
                disabled={!activeKey}
                className="px-5 py-3 rounded-full text-xs font-black text-red-600 hover:bg-red-50 hover:text-red-700 transition-all flex items-center justify-center gap-2 border border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4" />
                {provider === 'google-drive' ? 'Clear Client ID' : 'Clear Active Provider Settings'}
              </button>

              <div className="flex flex-col sm:flex-row gap-3">
                {provider !== 'google-drive' && (
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={isTesting || !activeKey.trim()}
                    className="px-5 py-3 rounded-full text-xs font-black text-text-primary bg-bg-secondary border border-border-primary hover:border-telus-purple transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isTesting ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4 text-telus-green" />
                    )}
                    {isTesting ? 'Testing Connection...' : 'Test Connection'}
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleSave}
                  disabled={provider === 'google-drive' ? !googleDriveClientId.trim() : !activeKey.trim()}
                  className="px-6 py-3 rounded-full text-xs font-black text-white bg-telus-purple hover:bg-telus-purple-dark transition-all flex items-center justify-center gap-2 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save className="w-4 h-4" />
                  {provider === 'google-drive' ? 'Save Client ID' : 'Save AI Configuration'}
                </button>
              </div>
            </div>

            {/* Success toast inside the card */}
            {saveSuccess && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-emerald-800"
              >
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                <span className="text-xs font-bold">Custom settings for {provider === 'google-drive' ? 'Google Drive' : provider === 'gemini' ? 'Google Gemini' : 'Fuelix'} updated successfully! All future connections will apply these configuration rules.</span>
              </motion.div>
            )}

            {/* Connection Test Outcomes */}
            {testResult && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-4 rounded-xl border flex items-start gap-3 ${
                  testResult.success 
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                    : 'bg-red-50 border-red-200 text-red-800'
                }`}
              >
                {testResult.success ? (
                  <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                )}
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider">
                    {testResult.success ? 'Connection Successful' : 'Connection Failed'}
                  </h4>
                  <p className="text-xs mt-1 leading-relaxed font-mono whitespace-pre-wrap">{testResult.message}</p>
                </div>
              </motion.div>
            )}

          </div>
        </div>

        {/* Right Side: Informational Sidebar */}
        <div className="space-y-6">
          <div className="telus-card p-6 border border-border-primary/50 space-y-6 bg-[#4B286D03]">
            <h3 className="text-lg font-bold text-telus-purple flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-telus-purple" />
              Strategic Advantage
            </h3>
            
            <p className="text-xs text-text-secondary leading-relaxed">
              AXON Contract Intelligence utilizes cutting-edge large language models to extract and analyze service line items, change orders, DAFs, and signature status. 
            </p>

            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="p-1.5 bg-bg-secondary border border-border-primary rounded-lg shrink-0 h-fit">
                  <Info className="w-4 h-4 text-telus-purple" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-text-primary">What is Fallback Mode?</h4>
                  <p className="text-[11px] text-text-secondary mt-1 leading-normal">
                    This keeps the platform zero-cost and lightweight. It only taps into your custom API quota as a backup if the server's pooled tokens hit high-concurrency rate limits.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="p-1.5 bg-bg-secondary border border-border-primary rounded-lg shrink-0 h-fit">
                  <Key className="w-4 h-4 text-telus-green" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-text-primary">
                    {provider === 'google-drive' ? 'How to configure Google Drive?' : 'How to obtain a Key?'}
                  </h4>
                  <p className="text-[11px] text-text-secondary mt-1 leading-normal font-medium">
                    {provider === 'google-drive' ? (
                      <span>Create an OAuth Client ID of type Web Application in Google Cloud Console. Set Authorized JavaScript Origins to your app url.</span>
                    ) : provider === 'gemini' ? (
                      <span>You can generate a free Gemini API Key in the <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" className="text-telus-purple underline font-semibold">Google AI Studio Console</a> in seconds.</span>
                    ) : (
                      <span>Obtain a Fuelix bearer token from your organization's Fuelix Dashboard or administrator console.</span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="p-1.5 bg-bg-secondary border border-border-primary rounded-lg shrink-0 h-fit">
                  <Cpu className="w-4 h-4 text-orange-500" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-text-primary">Choosing the Model</h4>
                  <p className="text-[11px] text-text-secondary mt-1 leading-normal">
                    {provider === 'gemini' ? (
                      <span><strong className="text-text-primary">3.5 Flash</strong> is optimized for rapid extraction. Use <strong className="text-text-primary">3.1 Pro</strong> for complex multi-clause compliance evaluations.</span>
                    ) : (
                      <span><strong className="text-text-primary">GPT-4o</strong> provides premium structural extraction. Use <strong className="text-text-primary">GPT-4o Mini</strong> for blazing fast executions.</span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
