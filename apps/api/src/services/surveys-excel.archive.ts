import yauzl from 'yauzl';

// A four-sheet, 5,000-row workbook with 80-character codes and distinct
// 1,024-character Arabic/Hebrew notes measured 26,205,322 expanded bytes,
// 21,560,718 bytes in its largest member, and 19 ZIP entries. These ceilings
// leave more than twice that measured capacity without trusting ZIP metadata.
export const MAX_SURVEY_XLSX_EXPANDED_BYTES = 64 * 1024 * 1024;
export const MAX_SURVEY_XLSX_SINGLE_ENTRY_BYTES = 48 * 1024 * 1024;
export const MAX_SURVEY_XLSX_ARCHIVE_ENTRIES = 128;

export interface SurveyXlsxArchiveLimits {
  expandedBytes: number;
  singleEntryBytes: number;
  entries: number;
}

export interface SurveyXlsxArchiveMeasurement {
  expandedBytes: number;
  largestEntryBytes: number;
  entries: number;
}

const defaultLimits: SurveyXlsxArchiveLimits = {
  expandedBytes: MAX_SURVEY_XLSX_EXPANDED_BYTES,
  singleEntryBytes: MAX_SURVEY_XLSX_SINGLE_ENTRY_BYTES,
  entries: MAX_SURVEY_XLSX_ARCHIVE_ENTRIES,
};

export class SurveyXlsxArchiveError extends Error {
  constructor(public readonly kind: 'LIMIT' | 'INVALID') {
    super(kind === 'LIMIT' ? 'Survey XLSX archive exceeds resource limits.' : 'Invalid Survey XLSX archive.');
  }
}

export async function validateSurveyXlsxArchiveSafety(
  buffer: Uint8Array,
  limits: SurveyXlsxArchiveLimits = defaultLimits,
): Promise<SurveyXlsxArchiveMeasurement> {
  let archive: yauzl.ZipFile | undefined;
  let expandedBytes = 0;
  let largestEntryBytes = 0;
  let entries = 0;
  try {
    const input = Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    archive = await yauzl.fromBufferPromise(input, { lazyEntries: true, validateEntrySizes: true });
    for await (const entry of archive.eachEntry()) {
      entries += 1; // Directory entries also consume central-directory resources.
      if (entries > limits.entries) throw new SurveyXlsxArchiveError('LIMIT');
      if (entry.fileName.endsWith('/')) continue;

      const stream = await archive.openReadStreamPromise(entry);
      let entryBytes = 0;
      try {
        for await (const chunk of stream) {
          entryBytes += chunk.length;
          expandedBytes += chunk.length;
          if (entryBytes > limits.singleEntryBytes || expandedBytes > limits.expandedBytes) {
            stream.destroy();
            throw new SurveyXlsxArchiveError('LIMIT');
          }
        }
      } finally {
        if (!stream.destroyed) stream.destroy();
      }
      largestEntryBytes = Math.max(largestEntryBytes, entryBytes);
    }
    return { expandedBytes, largestEntryBytes, entries };
  } catch (error) {
    if (error instanceof SurveyXlsxArchiveError) throw error;
    throw new SurveyXlsxArchiveError('INVALID');
  } finally {
    archive?.close();
  }
}
