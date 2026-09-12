import assert from 'node:assert/strict';
import test from 'node:test';
import { errorHandler } from './errorHandler.middleware';

function handlePayloadTooLarge(contentType: string): { status: number; body: any } {
  const output: { status: number; body: any } = { status: 0, body: null };
  const req = { headers: { 'content-type': contentType }, method: 'POST', originalUrl: '/api/exams/id/results' };
  const res = {
    status(code: number) { output.status = code; return this; },
    json(body: any) { output.body = body; return this; },
  };
  const error = Object.assign(new Error('request entity too large'), { code: 'entity.too.large' });
  errorHandler(error, req as any, res as any, (() => undefined) as any);
  return output;
}

test('maps oversized JSON requests without referring to a file upload', () => {
  const result = handlePayloadTooLarge('application/json; charset=utf-8');
  assert.equal(result.status, 413);
  assert.deepEqual(result.body, {
    error: {
      code: 'REQUEST_BODY_TOO_LARGE',
      message: 'حجم بيانات الطلب أكبر من الحد المسموح.',
    },
  });
  assert.doesNotMatch(result.body.error.message, /file|upload/i);
});

test('keeps the 10 MB file message for real spreadsheet uploads', () => {
  const result = handlePayloadTooLarge('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.equal(result.status, 413);
  assert.deepEqual(result.body, {
    error: {
      code: 'PAYLOAD_TOO_LARGE',
      message: 'The uploaded file exceeds the 10 MB limit.',
    },
  });
});
