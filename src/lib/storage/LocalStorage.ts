import {
  readdir,
  readFile,
  writeFile,
  unlink,
  mkdir,
  stat,
} from "node:fs/promises";
import path from "node:path";
import type { VaultFile, VaultStorage } from "./VaultStorage.ts";

export class LocalStorage implements VaultStorage {
  constructor(private docsDir: string) {}

  private toAbs(relPath: string): string {
    const abs = path.resolve(this.docsDir, relPath);
    if (!abs.startsWith(this.docsDir + path.sep) && abs !== this.docsDir) {
      throw new Error(`Path traversal detected: ${relPath}`);
    }
    return abs;
  }

  async list(prefix?: string): Promise<VaultFile[]> {
    const results: VaultFile[] = [];
    await this.walk(this.docsDir, this.docsDir, prefix ?? "", results);
    return results;
  }

  private async walk(
    dir: string,
    base: string,
    prefix: string,
    out: VaultFile[],
  ): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await this.walk(full, base, prefix, out);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        const rel = path.relative(base, full);
        if (prefix && !rel.startsWith(prefix)) continue;
        const fileStat = await stat(full);
        out.push({
          path: rel,
          content: "",
          updatedAt: fileStat.mtime.toISOString(),
        });
      }
    }
  }

  async read(filePath: string): Promise<string | null> {
    try {
      const abs = this.toAbs(filePath);
      return await readFile(abs, "utf8");
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === "ENOENT") return null;
      throw err;
    }
  }

  async write(filePath: string, content: string): Promise<void> {
    const abs = this.toAbs(filePath);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, content, "utf8");
  }

  async delete(filePath: string): Promise<void> {
    try {
      const abs = this.toAbs(filePath);
      await unlink(abs);
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === "ENOENT") return;
      throw err;
    }
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      const abs = this.toAbs(filePath);
      await stat(abs);
      return true;
    } catch {
      return false;
    }
  }
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}
