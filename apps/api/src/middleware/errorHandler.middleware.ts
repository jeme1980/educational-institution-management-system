import type { ErrorRequestHandler } from 'express';

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code = 'HTTP_ERROR',
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

type DatabaseError = Error & { code?: string; statusCode?: number; details?: unknown };

export const errorHandler: ErrorRequestHandler = (error: DatabaseError, req, res, _next) => {
  const isHttpError = error instanceof HttpError;
  const explicitStatusCode = Number(error.statusCode);
  const isKnownApplicationError = Number.isInteger(explicitStatusCode) && explicitStatusCode >= 400 && explicitStatusCode < 500;
  const isInvalidJson = error instanceof SyntaxError && 'body' in error;
  const isCorsError = error.message === 'Origin is not allowed by CORS';
  const isUniqueViolation = error.code === '23505';
  const isForeignKeyViolation = error.code === '23503';
  const isInvalidUuid = error.code === 'P2023';
  const isPrismaConflict = error.code === 'P2002';
  const isPrismaForeignKeyViolation = error.code === 'P2003';
  const isPayloadTooLarge = error.code === 'entity.too.large' || error.message === 'request entity too large';
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  const isJsonPayloadTooLarge = isPayloadTooLarge && (contentType.includes('application/json') || contentType.includes('+json'));

  const statusCode = isPayloadTooLarge
    ? 413
    : isHttpError || isKnownApplicationError
    ? explicitStatusCode
    : isInvalidJson
      ? 400
      : isCorsError
        ? 403
    : isUniqueViolation || isForeignKeyViolation || isPrismaConflict || isPrismaForeignKeyViolation
      ? 409
      : isInvalidUuid
        ? 400
      : 500;

  const code = isPayloadTooLarge
    ? isJsonPayloadTooLarge
      ? 'REQUEST_BODY_TOO_LARGE'
      : 'PAYLOAD_TOO_LARGE'
    : isHttpError || isKnownApplicationError
    ? (error.code || 'HTTP_ERROR')
    : isInvalidJson
      ? 'INVALID_JSON'
      : isCorsError
        ? 'CORS_ORIGIN_DENIED'
        : isUniqueViolation || isPrismaConflict
            ? 'RESOURCE_CONFLICT'
        : isForeignKeyViolation || isPrismaForeignKeyViolation
            ? 'REFERENCE_CONFLICT'
            : isInvalidUuid
              ? 'INVALID_CONTEXT'
            : 'INTERNAL_SERVER_ERROR';

  const message = isPayloadTooLarge
    ? isJsonPayloadTooLarge
      ? 'حجم بيانات الطلب أكبر من الحد المسموح.'
      : 'The uploaded file exceeds the 10 MB limit.'
    : statusCode >= 500
    ? 'An unexpected server error occurred.'
    : isUniqueViolation || isPrismaConflict
      ? 'A record with the same unique value already exists.'
    : isForeignKeyViolation || isPrismaForeignKeyViolation
      ? 'The requested operation conflicts with a related record.'
    : isInvalidUuid
      ? 'سياق المؤسسة أو السنة الدراسية غير صالح. أعد تحميل الصفحة.'
    : error.message;

  if (statusCode >= 500) {
    console.error(`[${req.method} ${req.originalUrl}]`, error);
  }

  res.status(statusCode).json({
    error: {
      code,
      message,
      ...((isHttpError || isKnownApplicationError) && statusCode < 500 && error.details !== undefined ? { details: error.details } : {}),
    },
  });
};
