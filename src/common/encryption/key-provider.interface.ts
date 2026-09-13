export interface KeyProvider {
  getKey(): Promise<Buffer>;
}
