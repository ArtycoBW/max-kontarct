export const STORAGE_SERVICE = Symbol("STORAGE_SERVICE");

export interface StorageService {
  checkHealth(): Promise<void>;
  ensureBucket(): Promise<void>;
}
