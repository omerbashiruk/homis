/** Typed application errors. Carry an HTTP status so the API layer can map them directly. */
export class ApiError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus = 400) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export const notFound = (message: string): ApiError => new ApiError('not_found', message, 404);
export const validation = (message: string): ApiError => new ApiError('validation', message, 400);
export const conflict = (message: string): ApiError => new ApiError('conflict', message, 409);
