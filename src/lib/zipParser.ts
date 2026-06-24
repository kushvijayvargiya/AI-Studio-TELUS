import JSZip from 'jszip';
import mammoth from 'mammoth';
import PostalMime from 'postal-mime';
import * as pdfjsLib from 'pdfjs-dist';
import * as XLSX from 'xlsx';
// @ts-ignore
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const parseExcel = (arrayBuffer: ArrayBuffer): string => {
  try {
    const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
    let text = '';
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      // Convert sheet to CSV
      const csv = XLSX.utils.sheet_to_csv(sheet);
      if (csv.trim()) {
        text += `--- Sheet: ${sheetName} ---\n${csv}\n\n`;
      }
    }
    return text || '[Empty Excel Document]';
  } catch (err) {
    console.error('Error parsing Excel sheet:', err);
    return `[Error: Failed to parse Excel sheet - ${err instanceof Error ? err.message : String(err)}]`;
  }
};

export interface ParsedDocument {
  name: string;
  folder: string; // The folder path within the ZIP
  mimeType: string;
  data: string; // Base64 encoded data for inlineData, or raw text if isText is true
  isText: boolean;
}

const getMimeType = (filename: string): string => {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf': return 'application/pdf';
    case 'png': return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'txt': return 'text/plain';
    case 'csv': return 'text/csv';
    case 'eml': return 'message/rfc822';
    case 'html':
    case 'htm': return 'text/html';
    default: return 'application/octet-stream';
  }
};

const parsePdf = async (arrayBuffer: ArrayBuffer): Promise<string> => {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item: any) => item.str).join(' ') + '\n';
  }
  return text;
};

const uint8ArrayToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

export const parseSingleFile = async (file: File, targetFolder: string = 'Added Documents'): Promise<ParsedDocument[]> => {
  const parsedDocs: ParsedDocument[] = [];
  const ext = file.name.split('.').pop()?.toLowerCase();
  const filename = file.name;
  const folder = targetFolder;

  const arrayBuffer = await file.arrayBuffer();

  if (ext === 'docx' || ext === 'doc') {
    const result = await mammoth.extractRawText({ arrayBuffer });
    parsedDocs.push({
      name: filename,
      folder,
      mimeType: 'text/plain',
      data: result.value,
      isText: true,
    });
  } else if (ext === 'xlsx' || ext === 'xls') {
    try {
      const text = parseExcel(arrayBuffer);
      parsedDocs.push({
        name: filename,
        folder,
        mimeType: 'text/plain',
        data: text,
        isText: true,
      });
    } catch (err) {
      console.warn(`Failed to process Excel ${filename}`, err);
    }
  } else if (ext === 'pdf') {
    try {
      const bytes = new Uint8Array(arrayBuffer);
      const base64 = uint8ArrayToBase64(bytes);
      parsedDocs.push({
        name: filename,
        folder,
        mimeType: 'application/pdf',
        data: base64,
        isText: false,
      });
    } catch (err) {
      console.warn(`Failed to process PDF ${filename}`, err);
    }
  } else if (ext === 'eml') {
    const text = await file.text();
    const parser = new PostalMime();
    const parsed = await parser.parse(text);
    parsedDocs.push({
      name: filename,
      folder,
      mimeType: 'text/plain',
      data: parsed.text || parsed.html || '',
      isText: true,
    });

    if (parsed.attachments && parsed.attachments.length > 0) {
      for (const attachment of parsed.attachments) {
        const attachExt = attachment.filename?.split('.').pop()?.toLowerCase();
        const attachName = `${filename} - ${attachment.filename}`;
        
        let contentBytes: Uint8Array | null = null;
        if (attachment.content instanceof Uint8Array) {
          contentBytes = attachment.content;
        } else if (attachment.content instanceof ArrayBuffer) {
          contentBytes = new Uint8Array(attachment.content);
        } else if (typeof attachment.content === 'string') {
          const encoder = new TextEncoder();
          contentBytes = encoder.encode(attachment.content);
        }

        if (contentBytes && attachExt === 'pdf') {
          parsedDocs.push({
            name: attachName,
            folder,
            mimeType: 'application/pdf',
            data: uint8ArrayToBase64(contentBytes),
            isText: false,
          });
        } else if (contentBytes && ['png', 'jpg', 'jpeg'].includes(attachExt || '')) {
          parsedDocs.push({
            name: attachName,
            folder,
            mimeType: getMimeType(attachment.filename || 'image.png'),
            data: uint8ArrayToBase64(contentBytes),
            isText: false,
          });
        }
      }
    }
  } else if (['txt', 'csv', 'html', 'htm'].includes(ext || '')) {
    const text = await file.text();
    parsedDocs.push({
      name: filename,
      folder,
      mimeType: getMimeType(filename),
      data: text,
      isText: true,
    });
  } else if (['png', 'jpg', 'jpeg'].includes(ext || '')) {
    const bytes = new Uint8Array(arrayBuffer);
    const base64 = uint8ArrayToBase64(bytes);
    parsedDocs.push({
      name: filename,
      folder,
      mimeType: getMimeType(filename),
      data: base64,
      isText: false,
    });
  } else {
    parsedDocs.push({
      name: filename,
      folder,
      mimeType: 'application/octet-stream',
      data: `[Unsupported file format: ${ext}]`,
      isText: true,
    });
  }

  return parsedDocs.filter(doc => {
    const folderLower = doc.folder.toLowerCase();
    const nameLower = doc.name.toLowerCase();
    const isArchive = folderLower.split(/[\/\\]/).some(segment => segment.includes('archive')) ||
                      nameLower.split(/[\/\\]/).some(segment => segment.includes('archive'));
    return !isArchive;
  });
};

export const parseZipFile = async (file: File): Promise<ParsedDocument[]> => {
  const zip = new JSZip();
  const contents = await zip.loadAsync(file);
  const parsedDocs: ParsedDocument[] = [];

  interface VirtualNode {
    name: string;
    fullPath: string;
    isDir: boolean;
    entry?: any;
    children: Map<string, VirtualNode>;
  }

  const rootNode: VirtualNode = {
    name: '',
    fullPath: '',
    isDir: true,
    children: new Map()
  };

  // Build the hierarchical tree of files and directories
  for (const [originalFilename, zipEntry] of Object.entries(contents.files)) {
    const filename = originalFilename.replace(/\\/g, '/');
    const parts = filename.split('/').filter(p => p !== '');
    if (parts.length === 0) continue;

    const isDir = zipEntry.dir;
    
    // Skip hidden files or system folders like .DS_Store or __MACOSX
    const isHiddenOrMac = parts.some(part => part.startsWith('.') || part === '__MACOSX' || part.toLowerCase().includes('archive'));
    if (isHiddenOrMac) {
      console.log(`Skipped hidden, system, or archived part: ${filename}`);
      continue;
    }

    // Traverse and build nodes
    let currentNode = rootNode;
    let pathAcc = '';
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      pathAcc = pathAcc ? `${pathAcc}/${part}` : part;
      const isLast = (i === parts.length - 1);
      
      let childNode = currentNode.children.get(part);
      if (!childNode) {
        childNode = {
          name: part,
          fullPath: pathAcc,
          isDir: !isLast || isDir,
          children: new Map()
        };
        currentNode.children.set(part, childNode);
      }
      
      // If it is the last part and it is a file, store the zipEntry reference
      if (isLast && !childNode.isDir) {
        childNode.entry = zipEntry;
      }
      
      currentNode = childNode;
    }
  }

  // Find the common start node (to strip off a single top-level wrapper directory if it contains no files itself)
  let currentStartNode = rootNode;
  while (currentStartNode.isDir && currentStartNode.children.size === 1) {
    const onlyChild = Array.from(currentStartNode.children.values())[0];
    if (onlyChild.isDir) {
      // Check if this child itself contains files directly. If it does, do not strip it!
      const containsDirectFiles = Array.from(onlyChild.children.values()).some(c => !c.isDir);
      // Also, check if it's a generic or archive folder name
      const isGenericWrapper = ['archive', 'out', 'dist', 'src', 'files', 'documents', 'uploads', 'temp', 'tmp'].includes(onlyChild.name.toLowerCase());
      
      if (!containsDirectFiles || isGenericWrapper) {
        currentStartNode = onlyChild;
      } else {
        break;
      }
    } else {
      break;
    }
  }

  // Recursive traversal function
  const traverse = async (node: VirtualNode, parentFolderPath: string) => {
    if (!node.isDir) {
      // This is a file, process it!
      if (!node.entry) return;
      const filename = node.fullPath;
      const ext = filename.split('.').pop()?.toLowerCase();
      
      const pathParts = filename.split('/');
      pathParts.pop();
      const folder = pathParts.join('/') || 'Root';
      
      try {
        if (ext === 'docx' || ext === 'doc') {
          // Extract text from DOCX
          const arrayBuffer = await node.entry.async('arraybuffer');
          const result = await mammoth.extractRawText({ arrayBuffer });
          parsedDocs.push({
            name: filename,
            folder,
            mimeType: 'text/plain',
            data: result.value,
            isText: true,
          });
        } else if (ext === 'xlsx' || ext === 'xls') {
          try {
            const arrayBuffer = await node.entry.async('arraybuffer');
            const text = parseExcel(arrayBuffer);
            parsedDocs.push({
              name: filename,
              folder,
              mimeType: 'text/plain',
              data: text,
              isText: true,
            });
            console.log(`Excel ${filename} processed, length: ${text.length} chars`);
          } catch (err) {
            console.warn(`Failed to process Excel ${filename}`, err);
          }
        } else if (ext === 'pdf') {
          try {
            const base64 = await node.entry.async('base64');
            parsedDocs.push({
              name: filename,
              folder,
              mimeType: 'application/pdf',
              data: base64,
              isText: false,
            });
            console.log(`PDF ${filename} processed from virtual tree layer: ${folder}`);
          } catch (err) {
            console.warn(`Failed to process PDF ${filename}`, err);
            parsedDocs.push({
              name: filename,
              folder,
              mimeType: 'text/plain',
              data: `[Error: Parsing failed for PDF - ${err instanceof Error ? err.message : String(err)}]`,
              isText: true,
            });
          }
        } else if (ext === 'eml') {
          // Extract text from EML
          const text = await node.entry.async('text');
          const parser = new PostalMime();
          const parsed = await parser.parse(text);
          parsedDocs.push({
            name: filename,
            folder,
            mimeType: 'text/plain',
            data: parsed.text || parsed.html || '',
            isText: true,
          });

          // Extract PDF or Image attachments from EML
          if (parsed.attachments && parsed.attachments.length > 0) {
            for (const attachment of parsed.attachments) {
              const attachExt = attachment.filename?.split('.').pop()?.toLowerCase();
              const attachName = `${filename} - ${attachment.filename}`;
              
              let contentBytes: Uint8Array | null = null;
              if (attachment.content instanceof Uint8Array) {
                contentBytes = attachment.content;
              } else if (attachment.content instanceof ArrayBuffer) {
                contentBytes = new Uint8Array(attachment.content);
              } else if (typeof attachment.content === 'string') {
                const encoder = new TextEncoder();
                contentBytes = encoder.encode(attachment.content);
              }

              if (contentBytes && attachExt === 'pdf') {
                parsedDocs.push({
                  name: attachName,
                  folder,
                  mimeType: 'application/pdf',
                  data: uint8ArrayToBase64(contentBytes),
                  isText: false,
                });
                console.log(`EML PDF attachment ${attachName} processed into layer ${folder}`);
              } else if (contentBytes && ['png', 'jpg', 'jpeg'].includes(attachExt || '')) {
                parsedDocs.push({
                  name: attachName,
                  folder,
                  mimeType: getMimeType(attachment.filename || 'image.png'),
                  data: uint8ArrayToBase64(contentBytes),
                  isText: false,
                });
              }
            }
          }
        } else if (['txt', 'csv', 'html', 'htm'].includes(ext || '')) {
          // Read as text
          const text = await node.entry.async('text');
          parsedDocs.push({
            name: filename,
            folder,
            mimeType: getMimeType(filename),
            data: text,
            isText: true,
          });
        } else if (['png', 'jpg', 'jpeg'].includes(ext || '')) {
          // Read as base64
          const base64 = await node.entry.async('base64');
          parsedDocs.push({
            name: filename,
            folder,
            mimeType: getMimeType(filename),
            data: base64,
            isText: false,
          });
        } else {
          console.warn(`Unsupported file type skipped: ${filename}`);
          parsedDocs.push({
            name: filename,
            folder,
            mimeType: 'application/octet-stream',
            data: `[Unsupported file format: ${ext}]`,
            isText: true,
          });
        }
      } catch (err) {
        console.error(`Error parsing SOW/document ${filename}:`, err);
        parsedDocs.push({
          name: filename,
          folder,
          mimeType: 'text/plain',
          data: `[Error: Parsing failed for this file - ${err instanceof Error ? err.message : String(err)}]`,
          isText: true,
        });
      }
    } else {
      // It is a directory, recursively process children!
      for (const childNode of node.children.values()) {
        let childFolderPath = parentFolderPath;
        if (!childFolderPath && node !== currentStartNode) {
          // This establishes the top-level SOW folder name
          childFolderPath = node.name;
        }
        await traverse(childNode, childFolderPath);
      }
    }
  };

  // Start traversing the virtual tree
  if (currentStartNode.isDir) {
    for (const childNode of currentStartNode.children.values()) {
      await traverse(childNode, '');
    }
  } else {
    // Single file at root
    await traverse(currentStartNode, '');
  }

  return parsedDocs.filter(doc => {
    const folderLower = doc.folder.toLowerCase();
    const nameLower = doc.name.toLowerCase();
    const isArchive = folderLower.split(/[\/\\]/).some(segment => segment.includes('archive')) ||
                      nameLower.split(/[\/\\]/).some(segment => segment.includes('archive'));
    if (isArchive) {
      console.log(`Explicitly excluded from parsing/viewing (archive policy): filename="${doc.name}" folder="${doc.folder}"`);
    }
    return !isArchive;
  });
};
