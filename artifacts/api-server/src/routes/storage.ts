import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import jwt from "jsonwebtoken";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage.js";
import { getObjectAclPolicy, setObjectAclPolicy } from "../lib/objectAcl.js";
import { requireAuth, requireRole, type AuthUser } from "../middlewares/auth.js";

const UPLOAD_INTENT_SECRET =
  process.env.SESSION_SECRET ?? "butterfield-dev-only-not-for-production";
const AUTH_SECRET =
  process.env.SESSION_SECRET ?? "butterfield-dev-only-not-for-production";

interface UploadIntentPayload {
  objectPath: string;
  userId: string;
}

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

function storageConfigError(error: unknown): string | null {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("PRIVATE_OBJECT_DIR") || message.includes("PUBLIC_OBJECT_SEARCH_PATHS")) {
    return message;
  }
  return null;
}

function optionalAuth(req: Request, res: Response, next: () => void): void {
  const header = req.headers.authorization;
  if (!header) {
    next();
    return;
  }
  if (!header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    req.user = jwt.verify(header.slice(7), AUTH_SECRET) as AuthUser;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for direct-to-GCS upload (kept for backwards compat).
 * Returns an uploadToken (15-min JWT) that must be passed to
 * POST /storage/uploads/confirm after the GCS PUT completes.
 */
router.post("/storage/uploads/request-url", requireAuth, async (req: Request, res: Response) => {
  const { name, size, contentType } = req.body ?? {};
  if (!name || typeof contentType !== "string") {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }
  try {
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
    const uploadToken = jwt.sign(
      { objectPath, userId: req.user!.id } satisfies UploadIntentPayload,
      UPLOAD_INTENT_SECRET,
      { expiresIn: "15m" }
    );
    res.json({ uploadURL, objectPath, metadata: { name, size, contentType }, uploadToken });
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * POST /storage/uploads/confirm
 *
 * After a presigned-URL upload completes, call this endpoint with the
 * uploadToken received from request-url to bind ACL ownership. The token
 * is verified to ensure the caller is the same user who requested the URL
 * and that it has not been tampered with or expired. ACL overwrites by
 * non-owners are rejected.
 */
router.post("/storage/uploads/confirm", requireAuth, async (req: Request, res: Response) => {
  const { objectPath, visibility = "private", uploadToken } = (req.body ?? {}) as {
    objectPath?: string;
    visibility?: "public" | "private";
    uploadToken?: string;
  };

  if (!objectPath || typeof objectPath !== "string") {
    res.status(400).json({ error: "objectPath is required." });
    return;
  }
  if (visibility !== "public" && visibility !== "private") {
    res.status(400).json({ error: "visibility must be 'public' or 'private'." });
    return;
  }
  if (!uploadToken || typeof uploadToken !== "string") {
    res.status(400).json({ error: "uploadToken is required." });
    return;
  }

  let intent: UploadIntentPayload;
  try {
    intent = jwt.verify(uploadToken, UPLOAD_INTENT_SECRET) as UploadIntentPayload;
  } catch {
    res.status(401).json({ error: "Invalid or expired upload token." });
    return;
  }

  if (intent.userId !== req.user!.id || intent.objectPath !== objectPath) {
    res.status(403).json({ error: "Upload token does not match the request." });
    return;
  }

  try {
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

    const existingAcl = await getObjectAclPolicy(objectFile);
    if (existingAcl !== null && existingAcl.owner !== req.user!.id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    await setObjectAclPolicy(objectFile, { owner: req.user!.id, visibility });
    res.json({ success: true, objectPath, visibility });
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Object not found — ensure the presigned upload completed first." });
    } else {
      req.log.error({ err: error }, "Error confirming upload ACL");
      res.status(500).json({ error: "Failed to confirm upload" });
    }
  }
});

/**
 * POST /storage/uploads
 *
 * Server-side file upload via multipart/form-data.
 * Accepts a single "file" field and streams it directly to GCS.
 * Returns { objectPath, servingUrl }.
 */
router.post("/storage/uploads", requireAuth, upload.single("file"), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: "No file provided — send multipart/form-data with a 'file' field." });
    return;
  }
  try {
    const contentType = req.file.mimetype || "application/octet-stream";
    const result = await objectStorageService.uploadBuffer(req.file.buffer, contentType, {
      owner: req.user!.id,
      visibility: "private",
    });
    res.json(result);
  } catch (error) {
    const configMessage = storageConfigError(error);
    if (configMessage) {
      res.status(500).json({ error: configMessage });
      return;
    }
    req.log.error({ err: error }, "Error uploading file");
    res.status(500).json({ error: "Failed to upload file" });
  }
});

/**
 * POST /storage/products/upload
 *
 * Upload a product hero image to a structured path:
 * products/{category}/{slug}-{shortId}.{ext}
 * Requires JWT auth (director/manager).
 */
router.post(
  "/storage/products/upload",
  requireRole("director", "manager"),
  upload.single("file"),
  async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: "No file provided — send multipart/form-data with a 'file' field." });
      return;
    }

    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"];
    if (!allowed.includes(req.file.mimetype)) {
      res.status(400).json({ error: "Invalid file type. Only JPEG, PNG, WebP and HEIC/HEIF are allowed." });
      return;
    }

    if (req.file.size > 8 * 1024 * 1024) {
      res.status(400).json({ error: "File too large. Maximum size is 8 MB." });
      return;
    }

    const rawCategory = String(req.body.category || "products");
    const rawName = String(req.body.productName || "product");
    const category = rawCategory.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/^-+|-+$/g, "");
    const slug = rawName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
    const ext = req.file.mimetype === "image/png" ? "png"
      : req.file.mimetype === "image/webp" ? "webp"
      : "jpg";
    const shortId = Date.now().toString().slice(-6);
    const subPath = `products/${category}/${slug}-${shortId}.${ext}`;

    try {
      const result = await objectStorageService.uploadToPath(req.file.buffer, req.file.mimetype, subPath, {
        owner: req.user!.id,
        visibility: "public",
      });
      res.json(result);
    } catch (error) {
      const configMessage = storageConfigError(error);
      if (configMessage) {
        res.status(500).json({ error: configMessage });
        return;
      }
      req.log.error({ err: error }, "Error uploading product image");
      res.status(500).json({ error: "Failed to upload image" });
    }
  }
);

/**
 * DELETE /storage/product-image
 *
 * Delete a product image from storage by its objectPath.
 * Requires JWT auth (director/manager).
 */
router.delete(
  "/storage/product-image",
  requireRole("director", "manager"),
  async (req: Request, res: Response) => {
    const { objectPath } = (req.body ?? {}) as { objectPath?: string };
    if (!objectPath || typeof objectPath !== "string") {
      res.status(400).json({ error: "objectPath is required." });
      return;
    }
    try {
      await objectStorageService.deleteObjectByPath(objectPath);
      res.json({ success: true });
    } catch (error) {
      req.log.error({ err: error }, "Error deleting product image");
      res.status(500).json({ error: "Failed to delete image" });
    }
  }
);

/**
 * GET /storage/public-objects/:filePath*
 *
 * Serve public assets.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const objectFile = await objectStorageService.searchPublicObject((req.params as any).filePath);
    if (!objectFile) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    const [metadata] = await objectFile.getMetadata();
    res.setHeader("Content-Type", (metadata.contentType as string) || "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=3600");
    if (metadata.size) res.setHeader("Content-Length", String(metadata.size));
    objectFile.createReadStream().pipe(res);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
    } else {
      req.log.error({ err: error }, "Error serving public object");
      res.status(500).json({ error: "Failed to serve object" });
    }
  }
});

/**
 * GET /storage/objects/:filePath*
 *
 * Serve stored assets. Public objects can be read without authentication.
 * Private objects require authentication and an explicit ACL policy granting
 * the caller read access (deny-by-default). Objects with no ACL policy are
 * treated as unauthorised.
 *
 * Note on visibility: objects uploaded with visibility="public" ACL are
 * readable by anyone, which lets public product images load in the customer
 * catalog and TestFlight builds before a customer signs in.
 */
router.get("/storage/objects/*filePath", optionalAuth, async (req: Request, res: Response) => {
  const objectPath = `/objects/${(req.params as any).filePath}`;
  try {
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

    const allowed = await objectStorageService.canAccessObjectEntity({
      userId: req.user?.id,
      objectFile,
    });
    if (!allowed) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const [metadata] = await objectFile.getMetadata();
    res.setHeader("Content-Type", (metadata.contentType as string) || "application/octet-stream");
    res.setHeader("Cache-Control", "private, max-age=3600");
    if (metadata.size) res.setHeader("Content-Length", String(metadata.size));
    objectFile.createReadStream().pipe(res);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
    } else {
      req.log.error({ err: error }, "Error serving object");
      res.status(500).json({ error: "Failed to serve object" });
    }
  }
});

export default router;
