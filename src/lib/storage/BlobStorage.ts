// npm install @vercel/blob — not yet in package.json; install when deploying to Vercel

import { list as blobList, head, put, del } from "@vercel/blob";
import type { VaultFile, VaultStorage } from "./VaultStorage.ts";

export class BlobStorage implements VaultStorage {
  private token: string | undefined;

  constructor(token?: string) {
    this.token = token ?? process.env.BLOB_READ_WRITE_TOKEN;
  }

  async list(prefix?: string): Promise<VaultFile[]> {
    const result = await blobList({ prefix, token: this.token });
    type BlobEntry = { pathname: string; uploadedAt: Date; url: string };
    return (result.blobs as BlobEntry[])
      .filter((blob) => blob.pathname.endsWith(".md"))
      .map((blob) => ({
        path: blob.pathname,
        content: "",
        updatedAt: blob.uploadedAt.toISOString(),
      }));
  }

  async read(filePath: string): Promise<string | null> {
    try {
      const metadata = await head(filePath, { token: this.token });
      const response = await fetch(metadata.url);
      return await response.text();
    } catch (err: unknown) {
      if (isBlobNotFoundError(err)) return null;
      throw err;
    }
  }

  async write(filePath: string, content: string): Promise<void> {
    await put(filePath, content, { access: "private", token: this.token });
  }

  async delete(filePath: string): Promise<void> {
    await del(filePath, { token: this.token });
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await head(filePath, { token: this.token });
      return true;
    } catch (err: unknown) {
      if (isBlobNotFoundError(err)) return false;
      throw err;
    }
  }
}

function isBlobNotFoundError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes("not found") ||
      msg.includes("404") ||
      ("status" in err && (err as { status?: number }).status === 404)
    );
  }
  return false;
}
