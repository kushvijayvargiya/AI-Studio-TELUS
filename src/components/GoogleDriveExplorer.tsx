import React, { useState, useEffect, useCallback } from 'react';
import { 
  Cloud, 
  Folder, 
  File as FileIcon, 
  FileArchive, 
  FileText, 
  Loader2, 
  Search, 
  ChevronRight, 
  ArrowLeft, 
  LogOut, 
  AlertCircle, 
  CheckCircle2, 
  HelpCircle,
  X,
  Info
} from 'lucide-react';
import { 
  getDriveAuthUrl, 
  parseAuthHash, 
  getCachedAccessToken, 
  clearCachedAccessToken, 
  listDriveFiles, 
  downloadDriveFile, 
  GoogleDriveFile 
} from '../lib/drive';

interface GoogleDriveExplorerProps {
  onFileSelect: (file: File) => void;
  onClose?: () => void;
  isOpen: boolean;
}

export const GoogleDriveExplorer: React.FC<GoogleDriveExplorerProps> = ({ 
  onFileSelect, 
  onClose,
  isOpen
}) => {
  const [clientId, setClientId] = useState(() => {
    return localStorage.getItem('google_drive_client_id') || '';
  });
  
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [files, setFiles] = useState<GoogleDriveFile[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string>('root');
  const [folderPath, setFolderPath] = useState<{ id: string; name: string }[]>([
    { id: 'root', name: 'My Drive' }
  ]);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSetupHelp, setShowSetupHelp] = useState(false);

  // Listen for message events (from popup OAuth callback)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data && event.data.type === 'GOOGLE_DRIVE_TOKEN') {
        const token = event.data.accessToken;
        if (token) {
          setAccessToken(token);
          sessionStorage.setItem('google_drive_access_token', token);
          setError(null);
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Parse access token from URL hash (fallback handles direct redirect if needed)
  useEffect(() => {
    const token = parseAuthHash() || getCachedAccessToken();
    if (token) {
      setAccessToken(token);
    }
  }, []);

  // Fetch files when folder changes or search query is triggered
  const fetchFiles = useCallback(async (folderId: string, search: string) => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const driveFiles = await listDriveFiles(accessToken, folderId, search);
      setFiles(driveFiles);
    } catch (err: any) {
      console.error('Failed to load Google Drive files:', err);
      const msg = err.message || '';
      if (msg.includes('401') || msg.toLowerCase().includes('unauthorized')) {
        handleLogout();
        setError('Your Google Drive session has expired. Please sign in again.');
      } else if (msg.includes('403') || msg.toLowerCase().includes('access not configured') || msg.toLowerCase().includes('disabled')) {
        setError('Access Forbidden (403): Please ensure that the "Google Drive API" is enabled under "APIs & Services" in your Google Cloud Console for this project.');
      } else {
        setError(`Failed to retrieve files: ${msg || 'Unknown error'}. Please ensure your Google OAuth Client ID is correct, has the drive.readonly and drive.metadata.readonly scopes, and the Google Drive API is enabled on your project.`);
      }
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (accessToken && isOpen) {
      fetchFiles(currentFolderId, searchQuery);
    }
  }, [accessToken, currentFolderId, searchQuery, isOpen, fetchFiles]);

  // Handle Client ID Save
  const handleSaveClientId = (id: string) => {
    const cleaned = id.trim();
    setClientId(cleaned);
    if (cleaned) {
      localStorage.setItem('google_drive_client_id', cleaned);
    } else {
      localStorage.removeItem('google_drive_client_id');
    }
  };

  // Handle Sign-In via Popup
  const handleLogin = () => {
    if (!clientId.trim()) {
      setError('Please enter a valid Google Client ID first.');
      return;
    }
    setError(null);
    const authUrl = getDriveAuthUrl(clientId);
    const popup = window.open(
      authUrl,
      'google_oauth_popup',
      'width=600,height=600,menubar=no,toolbar=no,location=no,status=no'
    );
    if (!popup) {
      setError('Popup was blocked by your browser. Please allow popups for this site to complete Google sign-in.');
    }
  };

  // Handle Logout
  const handleLogout = () => {
    clearCachedAccessToken();
    setAccessToken(null);
    setFiles([]);
    setCurrentFolderId('root');
    setFolderPath([{ id: 'root', name: 'My Drive' }]);
  };

  // Handle Folder Click
  const handleFolderClick = (id: string, name: string) => {
    setCurrentFolderId(id);
    setFolderPath((prev) => [...prev, { id, name }]);
    setSearchQuery('');
  };

  // Handle Breadcrumb Navigation
  const handleBreadcrumbClick = (index: number) => {
    const target = folderPath[index];
    setCurrentFolderId(target.id);
    setFolderPath(folderPath.slice(0, index + 1));
    setSearchQuery('');
  };

  // Handle File Selection and Download
  const handleFileSelect = async (file: GoogleDriveFile) => {
    if (!accessToken) return;
    
    setIsDownloading(true);
    setError(null);
    try {
      const downloadedFile = await downloadDriveFile(
        accessToken,
        file.id,
        file.mimeType,
        file.name
      );
      
      onFileSelect(downloadedFile);
      if (onClose) onClose();
    } catch (err: any) {
      console.error('Failed to download from Google Drive:', err);
      setError(err.message || 'Failed to import the selected file. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-bg-primary border border-border-primary rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[85vh] animate-in slide-in-from-bottom-4 duration-300 overflow-hidden">
        
        {/* Header */}
        <div className="p-6 border-b border-border-primary flex items-center justify-between bg-gradient-to-r from-bg-secondary to-bg-primary">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-[#4B286D0D] rounded-xl border border-[#4B286D1A]">
              <Cloud className="w-6 h-6 text-telus-purple" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-telus-gray">Google Drive Integration</h3>
              <p className="text-xs text-text-secondary mt-0.5 font-medium">Select SOWs, Change Orders, DAFs or ZIP packages directly from your cloud storage.</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-bg-secondary rounded-lg transition-colors text-text-secondary hover:text-text-primary"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Setup Phase - Needs Client ID */}
        {!clientId ? (
          <div className="p-8 flex-1 overflow-y-auto space-y-6 flex flex-col justify-center items-center max-w-xl mx-auto text-center">
            <div className="p-4 bg-amber-50 rounded-full text-amber-600 border border-amber-200">
              <AlertCircle className="w-8 h-8" />
            </div>
            <div>
              <h4 className="text-lg font-bold text-text-primary">Google Client ID Required</h4>
              <p className="text-sm text-text-secondary mt-2 leading-relaxed">
                To connect SOW documents directly from Google Drive, you must enter a Google Cloud OAuth Client ID. 
                This Client ID coordinates secure workspace validation directly inside your browser.
              </p>
            </div>

            <div className="w-full space-y-3">
              <input
                type="text"
                placeholder="Paste Google Client ID here..."
                className="w-full bg-bg-secondary text-text-primary border border-border-primary rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-telus-purple font-mono"
                onChange={(e) => handleSaveClientId(e.target.value)}
              />
              <button
                onClick={() => setShowSetupHelp(!showSetupHelp)}
                className="text-xs text-telus-purple font-black hover:underline flex items-center justify-center gap-1 mx-auto"
              >
                <HelpCircle className="w-4 h-4" />
                {showSetupHelp ? 'Hide Setup Tutorial' : 'How do I get a Google Client ID?'}
              </button>
            </div>

            {showSetupHelp && (
              <div className="text-left text-xs bg-bg-secondary p-5 rounded-xl border border-border-primary space-y-3 max-w-full">
                <p className="font-bold text-text-primary">3-Step Console Configuration:</p>
                <ol className="list-decimal list-inside space-y-2 text-text-secondary leading-relaxed">
                  <li>Go to the <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" className="text-telus-purple underline font-semibold">Google Cloud Console</a> and create or select a project.</li>
                  <li>Go to <strong>APIs & Services &gt; Credentials</strong> and create an <strong>OAuth Client ID</strong> of type <em>Web Application</em>.</li>
                  <li>
                    Add your unique development origin as an <strong>Authorized JavaScript Origin</strong>:
                    <code className="block bg-[#4B286D0A] p-2 rounded text-telus-purple font-mono text-[10px] mt-1.5 border border-[#4B286D1A]">
                      {window.location.origin}
                    </code>
                  </li>
                </ol>
                <p className="text-[10px] text-text-secondary/70 italic mt-2">
                  Tip: Make sure the <strong>Google Drive API</strong> is enabled on your Cloud Project.
                </p>
              </div>
            )}
          </div>
        ) : !accessToken ? (
          /* Sign In Phase */
          <div className="p-12 flex-1 overflow-y-auto flex flex-col justify-center items-center text-center space-y-6">
            <div className="p-4 bg-[#4B286D0A] rounded-full text-telus-purple border border-[#4B286D1A]">
              <Cloud className="w-12 h-12" />
            </div>
            <div className="max-w-md">
              <h4 className="text-xl font-bold text-text-primary">Sign in to Access Google Drive</h4>
              <p className="text-sm text-text-secondary mt-2 leading-relaxed">
                Connect your account securely. SOW AXON will list SOW and Change Order documents to analyze. Your tokens are managed strictly in-memory.
              </p>
            </div>

            <button
              onClick={handleLogin}
              className="px-6 py-3.5 bg-white hover:bg-slate-50 text-slate-800 font-bold border border-slate-300 rounded-xl transition-all shadow-sm hover:shadow flex items-center space-x-3 cursor-pointer"
            >
              <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-5 h-5 shrink-0">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
              </svg>
              <span>Sign in with Google</span>
            </button>

            <button
              onClick={() => handleSaveClientId('')}
              className="text-xs text-text-secondary hover:text-red-500 font-bold transition-colors underline"
            >
              Change Google Client ID
            </button>
          </div>
        ) : (
          /* File Explorer Phase */
          <>
            {/* Search and Navigation Bar */}
            <div className="p-4 border-b border-border-primary bg-bg-secondary flex flex-col md:flex-row md:items-center justify-between gap-4">
              {/* Breadcrumbs */}
              <div className="flex items-center flex-wrap gap-1.5 text-xs text-text-secondary font-bold">
                {folderPath.map((folder, idx) => (
                  <React.Fragment key={folder.id}>
                    {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-text-secondary/40 shrink-0" />}
                    <button
                      onClick={() => handleBreadcrumbClick(idx)}
                      className={`hover:text-telus-purple hover:underline transition-colors ${
                        idx === folderPath.length - 1 ? 'text-text-primary font-black' : ''
                      }`}
                    >
                      {folder.name}
                    </button>
                  </React.Fragment>
                ))}
              </div>

              {/* Search Box & Controls */}
              <div className="flex items-center space-x-3 shrink-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary/60" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search documents..."
                    className="pl-9 pr-4 py-1.5 bg-bg-primary text-text-primary border border-border-primary rounded-xl text-xs focus:outline-none focus:border-telus-purple w-48 transition-all"
                  />
                </div>

                <button
                  onClick={handleLogout}
                  title="Disconnect Google Drive"
                  className="p-1.5 text-text-secondary hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Error banner inside explorer */}
            {error && (
              <div className="m-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-800 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                <div>
                  <span className="font-bold">Error:</span> {error}
                </div>
              </div>
            )}

            {/* Main File list */}
            <div className="flex-1 overflow-y-auto p-4 min-h-[300px]">
              {isLoading || isDownloading ? (
                <div className="h-full flex flex-col items-center justify-center space-y-4">
                  <Loader2 className="w-8 h-8 text-telus-purple animate-spin" />
                  <p className="text-xs text-text-secondary font-bold">
                    {isDownloading ? 'Downloading and converting file from Google Drive...' : 'Scanning workspace files...'}
                  </p>
                </div>
              ) : files.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-4 py-12">
                  <div className="p-3 bg-bg-secondary rounded-full text-text-secondary/50 border border-border-primary">
                    <FileIcon className="w-8 h-8" />
                  </div>
                  <div>
                    <h5 className="text-sm font-bold text-text-primary">No supported files found</h5>
                    <p className="text-xs text-text-secondary mt-1 max-w-sm mx-auto leading-relaxed">
                      This folder contains no supported files (.zip, .pdf, .docx, .txt, or Google Docs). Only contract files are shown.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {files.map((file) => {
                    const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
                    const isZip = file.mimeType === 'application/zip' || file.mimeType === 'application/x-zip-compressed';
                    const isDoc = file.mimeType === 'application/vnd.google-apps.document';
                    
                    return (
                      <div
                        key={file.id}
                        onClick={() => {
                          if (isFolder) {
                            handleFolderClick(file.id, file.name);
                          } else {
                            handleFileSelect(file);
                          }
                        }}
                        className={`p-3.5 rounded-xl border border-border-primary/80 flex items-center justify-between cursor-pointer transition-all hover:bg-bg-secondary hover:border-telus-purple/30 group ${
                          isFolder ? 'hover:shadow-sm bg-bg-primary/50' : 'bg-bg-primary'
                        }`}
                      >
                        <div className="flex items-center space-x-3 overflow-hidden">
                          <div className={`p-2.5 rounded-xl shrink-0 ${
                            isFolder 
                              ? 'bg-amber-50 text-amber-500 border border-amber-100' 
                              : isZip 
                              ? 'bg-[#4B286D08] text-telus-purple border border-[#4B286D10]' 
                              : isDoc 
                              ? 'bg-blue-50 text-blue-500 border border-blue-100' 
                              : 'bg-emerald-50 text-emerald-500 border border-emerald-100'
                          }`}>
                            {isFolder ? (
                              <Folder className="w-5 h-5 fill-current" />
                            ) : isZip ? (
                              <FileArchive className="w-5 h-5" />
                            ) : isDoc ? (
                              <FileText className="w-5 h-5" />
                            ) : (
                              <FileIcon className="w-5 h-5" />
                            )}
                          </div>
                          <div className="overflow-hidden text-left">
                            <span className="text-xs font-bold text-text-primary truncate block group-hover:text-telus-purple transition-colors">
                              {file.name}
                            </span>
                            <span className="text-[10px] text-text-secondary font-medium block mt-0.5">
                              {isFolder 
                                ? 'Folder' 
                                : isDoc 
                                ? 'Google Doc (Auto-PDF)' 
                                : file.size 
                                ? `${(parseInt(file.size) / (1024 * 1024)).toFixed(2)} MB` 
                                : 'File'}
                            </span>
                          </div>
                        </div>
                        
                        <div className="text-text-secondary/40 group-hover:text-telus-purple transition-colors shrink-0 pl-2">
                          {isFolder ? (
                            <ChevronRight className="w-4 h-4" />
                          ) : (
                            <span className="text-[10px] font-black uppercase tracking-wider text-telus-purple bg-telus-purple/5 px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity">
                              Import
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            
            {/* Instruction Footer */}
            <div className="p-4 border-t border-border-primary bg-bg-secondary flex items-center justify-between text-[11px] text-text-secondary font-medium">
              <span className="flex items-center gap-1">
                <Info className="w-3.5 h-3.5 text-telus-purple shrink-0" />
                Double click or click folders to navigate. Click a file to import and start SOW analysis.
              </span>
              <span className="hidden md:inline font-mono text-[10px] bg-bg-primary border border-border-primary rounded px-2 py-0.5">
                OAuth Active Connection
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
