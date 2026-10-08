import type { ClientDocument } from '../src/domain/types';
export function validateClientDocument(input: unknown): ClientDocument;
export function documentHtml(snapshot: ClientDocument): string;
export function logoDimensions(url: string): { width: number; height: number } | null;
export function signatureDimensions(url: string): { width: number; height: number } | null;
export function signatureUploadDimensions(
  bytes: Uint8Array,
  mime: string,
): { width: number; height: number };
