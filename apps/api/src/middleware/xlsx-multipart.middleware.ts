import express, { type Request, type RequestHandler } from 'express';
import { HttpError } from './errorHandler.middleware';
import { MAX_SPREADSHEET_FILE_BYTES, XLSX_MIME } from '../security/spreadsheet-security';

const MULTIPART_OVERHEAD_BYTES = 64 * 1024;
const CRLF = Buffer.from('\r\n');
const HEADER_SEPARATOR = Buffer.from('\r\n\r\n');

type MultipartFile = { fieldName: string; fileName: string; contentType: string; buffer: Buffer };

export const xlsxMultipartBody: RequestHandler = express.raw({
  type: 'multipart/form-data',
  limit: MAX_SPREADSHEET_FILE_BYTES + MULTIPART_OVERHEAD_BYTES,
});

const uploadError = (statusCode: number, code: string, message: string): never => {
  throw new HttpError(statusCode, message, code);
};

function boundaryFrom(contentType: string): string | null {
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) return null;
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i);
  return (match?.[1] || match?.[2] || '').trim() || null;
}

function dispositionValue(disposition: string, name: string): string | null {
  const match = disposition.match(new RegExp(`(?:^|;)\\s*${name}="([^"]*)"`, 'i'));
  return match?.[1] ?? null;
}

function parseMultipartFiles(body: Buffer, boundary: string): MultipartFile[] {
  const delimiter = Buffer.from(`--${boundary}`);
  const nextDelimiter = Buffer.from(`\r\n--${boundary}`);
  const files: MultipartFile[] = [];
  let cursor = 0;

  while (cursor < body.length) {
    const delimiterStart = body.indexOf(delimiter, cursor);
    if (delimiterStart < 0) break;
    let partStart = delimiterStart + delimiter.length;
    if (body.subarray(partStart, partStart + 2).equals(Buffer.from('--'))) break;
    if (!body.subarray(partStart, partStart + 2).equals(CRLF)) uploadError(400, 'INVALID_MULTIPART_UPLOAD', 'The multipart upload is malformed.');
    partStart += CRLF.length;
    const headerEnd = body.indexOf(HEADER_SEPARATOR, partStart);
    if (headerEnd < 0) uploadError(400, 'INVALID_MULTIPART_UPLOAD', 'The multipart upload is malformed.');
    const contentStart = headerEnd + HEADER_SEPARATOR.length;
    const contentEnd = body.indexOf(nextDelimiter, contentStart);
    if (contentEnd < 0) uploadError(400, 'INVALID_MULTIPART_UPLOAD', 'The multipart upload is malformed.');

    const headers = body.subarray(partStart, headerEnd).toString('latin1');
    const disposition = headers.split('\r\n').find((line) => /^content-disposition:/i.test(line)) || '';
    const contentTypeHeader = headers.split('\r\n').find((line) => /^content-type:/i.test(line)) || '';
    const fieldName = dispositionValue(disposition, 'name');
    const fileName = dispositionValue(disposition, 'filename');
    if (fieldName !== null && fileName !== null) {
      files.push({
        fieldName,
        fileName,
        contentType: contentTypeHeader.replace(/^content-type:\s*/i, '').trim().toLowerCase(),
        buffer: body.subarray(contentStart, contentEnd),
      });
    }
    cursor = contentEnd + CRLF.length;
  }
  return files;
}

export function requireSingleXlsxFile(req: Request): Buffer {
  const contentType = String(req.headers['content-type'] || '');
  const boundary = boundaryFrom(contentType) ?? uploadError(400, 'MULTIPART_FORM_DATA_REQUIRED', 'Upload one XLSX file using multipart/form-data.');
  if (!Buffer.isBuffer(req.body)) uploadError(400, 'SURVEY_EXCEL_FILE_REQUIRED', 'The file field is required.');
  const files = parseMultipartFiles(req.body, boundary);
  if (!files.length || !files.some((file) => file.fieldName === 'file')) uploadError(400, 'SURVEY_EXCEL_FILE_REQUIRED', 'The file field is required.');
  if (files.length !== 1) uploadError(400, 'MULTIPLE_FILES_NOT_ALLOWED', 'Upload exactly one XLSX file.');
  const file = files[0];
  if (file.fieldName !== 'file') uploadError(400, 'SURVEY_EXCEL_FILE_REQUIRED', 'The file field is required.');
  if (!file.fileName.toLowerCase().endsWith('.xlsx') || file.contentType !== XLSX_MIME) uploadError(400, 'UNSUPPORTED_SPREADSHEET_TYPE', 'Only XLSX files are supported.');
  if (file.buffer.length > MAX_SPREADSHEET_FILE_BYTES) uploadError(413, 'PAYLOAD_TOO_LARGE', 'The uploaded file exceeds the 10 MB limit.');
  return file.buffer;
}
