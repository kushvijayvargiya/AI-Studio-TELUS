import JSZip from 'jszip';
import mammoth from 'mammoth';
import PostalMime from 'postal-mime';
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

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

  return parsedDocs;
};

export const parseZipFile = async (file: File): Promise<ParsedDocument[]> => {
  const zip = new JSZip();
  const contents = await zip.loadAsync(file);
  const parsedDocs: ParsedDocument[] = [];

  // Determine if all files share a common root folder
  const allFiles = Object.keys(contents.files).map(f => f.replace(/\\/g, '/')).filter(f => {
    const originalKey = Object.keys(contents.files).find(k => k.replace(/\\/g, '/') === f);
    const isDir = originalKey ? contents.files[originalKey].dir : false;
    const isHidden = f.split('/').pop()?.startsWith('.');
    const isMacOs = f.includes('__MACOSX/');
    const isArchive = f.toLowerCase().includes('archive');
    return !isDir && !isHidden && !isMacOs && !isArchive && !f.endsWith('/');
  });

  let commonRoot = '';
  if (allFiles.length > 0) {
    const firstParts = allFiles.map(f => f.split('/')[0]);
    const allSameRoot = firstParts.every(p => p === firstParts[0]);
    if (allSameRoot && allFiles.some(f => f.split('/').length > 1)) {
      commonRoot = firstParts[0];
    }
  }

  for (const [originalFilename, zipEntry] of Object.entries(contents.files)) {
    const filename = originalFilename.replace(/\\/g, '/');
    console.log(`Processing zip entry: ${filename}, dir: ${zipEntry.dir}`);
    if (zipEntry.dir || filename.endsWith('/')) continue;
    // Skip hidden files like .DS_Store or __MACOSX
    if (filename.includes('__MACOSX/') || filename.split('/').pop()?.startsWith('.')) {
      console.log(`Skipped hidden or system file: ${filename}`);
      continue;
    }

    const pathParts = filename.split('/');

    // Ignore archived folders
    if (pathParts.some(part => part.toLowerCase().includes('archive'))) {
      console.log(`Skipped archived file: ${filename}`);
      continue;
    }

    // Determine the base SOW folder
    let folder = 'Root';
    if (pathParts.length > 1) {
      if (commonRoot) {
        if (pathParts.length > 2) {
          // e.g. "Customer/SOW/Subfolder/file.pdf" -> "SOW"
          folder = pathParts[1];
        } else {
          // e.g. "Customer/file.pdf" -> "Main"
          folder = "Main";
        }
      } else {
        // No common root, so the first folder is the SOW folder
        // e.g. "SOW/Subfolder/file.pdf" -> "SOW"
        folder = pathParts[0];
      }
    }

    const ext = filename.split('.').pop()?.toLowerCase();
    console.log(`File: ${filename}, Extension: ${ext}`);

    if (ext === 'docx' || ext === 'doc') {
      // Extract text from DOCX
      const arrayBuffer = await zipEntry.async('arraybuffer');
      const result = await mammoth.extractRawText({ arrayBuffer });
      parsedDocs.push({
        name: filename,
        folder,
        mimeType: 'text/plain',
        data: result.value,
        isText: true,
      });
    } else if (ext === 'pdf') {
      try {
        const base64 = await zipEntry.async('base64');
        parsedDocs.push({
          name: filename,
          folder,
          mimeType: 'application/pdf',
          data: base64,
          isText: false,
        });
        console.log(`PDF ${filename} sent as native base64 for layout preservation`);
      } catch (err) {
        console.warn(`Failed to process PDF ${filename}`, err);
      }
    } else if (ext === 'eml') {
      // Extract text from EML
      const text = await zipEntry.async('text');
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
            console.log(`EML PDF attachment ${attachName} sent as native base64`);
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
      const text = await zipEntry.async('text');
      parsedDocs.push({
        name: filename,
        folder,
        mimeType: getMimeType(filename),
        data: text,
        isText: true,
      });
    } else if (['png', 'jpg', 'jpeg'].includes(ext || '')) {
      // Read as base64
      const base64 = await zipEntry.async('base64');
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
        // Optional: mark it as unsupported internally if needed, but here we just return a placeholder text
      });
    }
  }

  return parsedDocs;
};
