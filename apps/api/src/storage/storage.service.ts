export const STORAGE_SERVICE = Symbol("STORAGE_SERVICE");

export interface StoredObject {
  body: Buffer;
  contentType: string | null;
}

export interface StoreObjectInput {
  body: Buffer;
  contentType: string;
  key: string;
  sha256: string;
}

export interface StorageService {
  checkHealth(): Promise<void>;
  deleteObject(key: string): Promise<void>;
  ensureBucket(): Promise<void>;
  getObject(key: string): Promise<StoredObject>;
  putObject(input: StoreObjectInput): Promise<void>;
}
