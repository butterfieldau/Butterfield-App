import { Storage, type File } from "@google-cloud/storage";
import { Readable } from "stream";
import { randomUUID } from "crypto";
import {
  ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl";

type StorageCtorOptions = ConstructorParameters<typeof Storage>[0];

function parseJsonEnv(name: string): Record<string, unknown> | null {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    throw new Error(`Invalid JSON in ${name}: ${(err as Error).message}`);
  }
}

function getStorageOptions(): StorageCtorOptions {
  const credentials =
    parseJsonEnv("GOOGLE_APPLICATION_CREDENTIALS_JSON") ??
    parseJsonEnv("GCP_SERVICE_ACCOUNT_JSON") ??
    parseJsonEnv("OBJECT_STORAGE_SERVICE_ACCOUNT_JSON");

  const projectId =
    (credentials?.project_id as string | undefined)?.trim() ||
    process.env.GCP_PROJECT_ID?.trim() ||
    process.env.GOOGLE_CLOUD_PROJECT?.trim() ||
    process.env.GOOGLE_PROJECT_ID?.trim();

  const options: any = {};
  if (credentials) {
    options.credentials = credentials;
  }
  if (projectId) {
    options.projectId = projectId;
  }
  return options as StorageCtorOptions;
}

export const objectStorageClient = new Storage(getStorageOptions());

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  constructor() {}

  getPublicObjectSearchPaths(): Array<string> {
    const pathsStr =
      process.env.OBJECT_STORAGE_PUBLIC_SEARCH_PATHS ||
      process.env.PUBLIC_OBJECT_SEARCH_PATHS ||
      "";
    const paths = Array.from(
      new Set(
        pathsStr
          .split(",")
          .map((path) => path.trim())
          .filter((path) => path.length > 0)
      )
    );
    if (paths.length === 0) {
      throw new Error(
        "OBJECT_STORAGE_PUBLIC_SEARCH_PATHS is not set. Configure one or more public bucket prefixes as a comma-separated list."
      );
    }
    return paths;
  }

  getPrivateObjectDir(): string {
    const dir =
      process.env.OBJECT_STORAGE_PRIVATE_DIR ||
      process.env.PRIVATE_OBJECT_DIR ||
      "";
    if (!dir) {
      throw new Error(
        "OBJECT_STORAGE_PRIVATE_DIR is not set. Configure a private bucket prefix for uploads."
      );
    }
    return dir;
  }

  async searchPublicObject(filePath: string): Promise<File | null> {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/${filePath}`;
      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      const [exists] = await file.exists();
      if (exists) {
        return file;
      }
    }

    return null;
  }

  async downloadObject(file: File, cacheTtlSec: number = 3600): Promise<Response> {
    const [metadata] = await file.getMetadata();
    const aclPolicy = await getObjectAclPolicy(file);
    const isPublic = aclPolicy?.visibility === "public";

    const nodeStream = file.createReadStream();
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    const headers: Record<string, string> = {
      "Content-Type": (metadata.contentType as string) || "application/octet-stream",
      "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
    };
    if (metadata.size) {
      headers["Content-Length"] = String(metadata.size);
    }

    return new Response(webStream, { headers });
  }

  async uploadBuffer(
    buffer: Buffer,
    contentType: string,
    aclPolicy: ObjectAclPolicy
  ): Promise<{ objectPath: string; servingUrl: string }> {
    const privateObjectDir = this.getPrivateObjectDir();
    const objectId = randomUUID();
    const fullPath = `${privateObjectDir}/uploads/${objectId}`;
    const gcsFile = await this.writeObject(fullPath, buffer, contentType);

    await setObjectAclPolicy(gcsFile, aclPolicy);

    const objectPath = `/objects/uploads/${objectId}`;
    return { objectPath, servingUrl: this.getServingUrl(objectPath) };
  }

  async uploadToPath(
    buffer: Buffer,
    contentType: string,
    subPath: string,
    aclPolicy: ObjectAclPolicy
  ): Promise<{ objectPath: string; servingUrl: string }> {
    const privateObjectDir = this.getPrivateObjectDir();
    const fullPath = `${privateObjectDir}/${subPath}`;
    const gcsFile = await this.writeObject(fullPath, buffer, contentType);

    await setObjectAclPolicy(gcsFile, aclPolicy);

    const objectPath = `/objects/${subPath}`;
    return { objectPath, servingUrl: this.getServingUrl(objectPath) };
  }

  async deleteObjectByPath(objectPath: string): Promise<void> {
    if (!objectPath.startsWith("/objects/")) throw new Error("Invalid object path");
    const parts = objectPath.slice(1).split("/");
    const entityId = parts.slice(1).join("/");
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) entityDir = `${entityDir}/`;
    const fullPath = `${entityDir}${entityId}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const gcsFile = bucket.file(objectName);
    const [exists] = await gcsFile.exists();
    if (exists) await gcsFile.delete();
  }

  async getObjectEntityUploadURL(): Promise<string> {
    const privateObjectDir = this.getPrivateObjectDir();
    const objectId = randomUUID();
    const fullPath = `${privateObjectDir}/uploads/${objectId}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    return signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900,
    });
  }

  async getObjectEntityFile(objectPath: string): Promise<File> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }

    const entityId = parts.slice(1).join("/");
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) {
      entityDir = `${entityDir}/`;
    }
    const objectEntityPath = `${entityDir}${entityId}`;
    const { bucketName, objectName } = parseObjectPath(objectEntityPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const objectFile = bucket.file(objectName);
    const [exists] = await objectFile.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return objectFile;
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (!rawPath.startsWith("https://storage.googleapis.com/")) {
      return rawPath;
    }

    const url = new URL(rawPath);
    const rawObjectPath = url.pathname;

    let objectEntityDir = this.getPrivateObjectDir();
    if (!objectEntityDir.endsWith("/")) {
      objectEntityDir = `${objectEntityDir}/`;
    }

    if (!rawObjectPath.startsWith(objectEntityDir)) {
      return rawObjectPath;
    }

    const entityId = rawObjectPath.slice(objectEntityDir.length);
    return `/objects/${entityId}`;
  }

  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) {
      return normalizedPath;
    }

    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: File;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }

  private async writeObject(
    fullPath: string,
    buffer: Buffer,
    contentType: string
  ): Promise<File> {
    const { bucketName, objectName } = parseObjectPath(fullPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const gcsFile = bucket.file(objectName);

    await new Promise<void>((resolve, reject) => {
      const writeStream = gcsFile.createWriteStream({
        contentType,
        resumable: false,
      });
      writeStream.on("finish", resolve);
      writeStream.on("error", reject);
      writeStream.end(buffer);
    });

    return gcsFile;
  }

  private getServingUrl(objectPath: string): string {
    const apiBaseUrl =
      process.env.OBJECT_STORAGE_API_BASE_URL?.trim() ||
      process.env.EXPO_PUBLIC_API_BASE_URL?.trim() ||
      process.env.EXPO_PUBLIC_DOMAIN?.trim() ||
      "";
    const normalizedBaseUrl = apiBaseUrl
      ? apiBaseUrl.startsWith("http")
        ? apiBaseUrl.replace(/\/+$/, "")
        : `https://${apiBaseUrl.replace(/\/+$/, "")}`
      : "";
    const originUrl = normalizedBaseUrl
      ? normalizedBaseUrl.replace(/\/api$/, "")
      : "";

    return originUrl
      ? `${originUrl}/api/storage${objectPath}`
      : `/api/storage${objectPath}`;
  }
}

function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }

  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");

  return {
    bucketName,
    objectName,
  };
}

async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
}: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
}): Promise<string> {
  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);
  const [signedUrl] = await file.getSignedUrl({
    version: "v4",
    action:
      method === "PUT"
        ? "write"
        : method === "GET"
          ? "read"
          : method === "DELETE"
            ? "delete"
            : "read",
    expires: Date.now() + ttlSec * 1000,
  });
  return signedUrl;
}
