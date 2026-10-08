export class ServiceError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status?: number);
}
export function configuration(env?: NodeJS.ProcessEnv): any;
export function gumroadVerify(
  config: any,
  key: string,
  plan: string,
  options?: any,
): Promise<{ purchaseId: string; adverse: boolean }>;
export class LicenseService {
  constructor(config: any, options?: any);
  [key: string]: any;
  close(): void;
}
