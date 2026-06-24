/**
 * Helper library for interacting with Google Drive API and managing OAuth 2.0 Implicit Flow.
 */

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  thumbnailLink?: string;
}

// Default scopes required for accessing files on Google Drive
const DEFAULT_SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.metadata.readonly'
];

/**
 * Builds the OAuth 2.0 authentication URL.
 */
export const getDriveAuthUrl = (clientId: string): string => {
  const redirectUri = window.location.origin;
  const scopes = DEFAULT_SCOPES.join(' ');
  const state = 'google_drive_oauth';
  
  return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=${encodeURIComponent(scopes)}&state=${encodeURIComponent(state)}&prompt=consent`;
};

/**
 * Parses the access token from the URL hash fragment.
 * Saves the token to sessionStorage and clears the hash to keep the URL clean.
 */
export const parseAuthHash = (): string | null => {
  if (typeof window === 'undefined') return null;

  const hash = window.location.hash;
  if (!hash) return null;

  const params = new URLSearchParams(hash.substring(1));
  const accessToken = params.get('access_token');
  const state = params.get('state');

  if (accessToken && state === 'google_drive_oauth') {
    // Save in sessionStorage (non-persistent across sessions for security)
    sessionStorage.setItem('google_drive_access_token', accessToken);
    
    // Clear URL hash without reloading page
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    return accessToken;
  }

  return null;
};

/**
 * Retrieves the cached access token from sessionStorage.
 */
export const getCachedAccessToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem('google_drive_access_token');
};

/**
 * Removes the cached access token (Logout).
 */
export const clearCachedAccessToken = () => {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem('google_drive_access_token');
};

/**
 * Lists files and folders from Google Drive.
 * Supports filtering, folder traversal, and file search.
 */
export const listDriveFiles = async (
  accessToken: string,
  folderId: string = 'root',
  searchQuery: string = ''
): Promise<GoogleDriveFile[]> => {
  let query = `'${folderId}' in parents and trashed = false`;
  
  // Exclude uncommon files, focus on ZIP, PDF, Word, TXT, Google Docs, and folders
  const allowedMimeTypes = [
    "mimeType = 'application/vnd.google-apps.folder'",
    "mimeType = 'application/zip'",
    "mimeType = 'application/x-zip-compressed'",
    "mimeType = 'application/pdf'",
    "mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'",
    "mimeType = 'text/plain'",
    "mimeType = 'application/vnd.google-apps.document'" // Google Docs
  ];
  
  query += ` and (${allowedMimeTypes.join(' or ')})`;

  if (searchQuery.trim()) {
    // Search filter across the entire drive if user is searching
    query = `name contains '${searchQuery.replace(/'/g, "\\'")}' and trashed = false and (${allowedMimeTypes.join(' or ')})`;
  }

  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,size,modifiedTime,thumbnailLink)&orderBy=folder,name&pageSize=100`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Google Drive API error [${response.status}]: ${errText || response.statusText}`);
  }

  const data = await response.json();
  return data.files || [];
};

/**
 * Downloads a binary file from Google Drive or exports a Google Doc to PDF.
 * Returns a standard File object.
 */
export const downloadDriveFile = async (
  accessToken: string,
  fileId: string,
  mimeType: string,
  fileName: string
): Promise<File> => {
  const isGoogleDoc = mimeType === 'application/vnd.google-apps.document';
  
  let downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  let targetMimeType = mimeType;
  let finalFileName = fileName;

  // Google Docs cannot be downloaded directly; they must be exported (e.g. as PDF)
  if (isGoogleDoc) {
    downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/pdf`;
    targetMimeType = 'application/pdf';
    if (!fileName.toLowerCase().endsWith('.pdf')) {
      finalFileName = `${fileName}.pdf`;
    }
  }

  const response = await fetch(downloadUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to download file from Google Drive [${response.status}]: ${errText || response.statusText}`);
  }

  const blob = await response.blob();
  return new File([blob], finalFileName, { type: targetMimeType });
};
