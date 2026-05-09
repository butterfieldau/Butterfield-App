import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage.js";
import { requireRole } from "../middlewares/auth.js";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for direct-to-GCS upload (kept for backwards compat).
 */
router.post("/storage/uploads/request-url", async (req: Request, res: Response) => {
  const { name, size, contentType } = req.body ?? {};
  if (!name || typeof contentType !== "string") {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }
  try {
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
    res.json({ uploadURL, objectPath, metadata: { name, size, contentType } });
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * POST /storage/uploads
 *
 * Server-side file upload via multipart/form-data.
 * Accepts a single "file" field and streams it directly to GCS.
 * Returns { objectPath, servingUrl }.
 */
router.post("/storage/uploads", upload.single("file"), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: "No file provided — send multipart/form-data with a 'file' field." });
    return;
  }
  try {
    const contentType = req.file.mimetype || "application/octet-stream";
    const result = await objectStorageService.uploadBuffer(req.file.buffer, contentType);
    res.json(result);
  } catch (error) {
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
      const result = await objectStorageService.uploadToPath(req.file.buffer, req.file.mimetype, subPath);
      res.json(result);
    } catch (error) {
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
 * Serve private assets.
 */
router.get("/storage/objects/*filePath", async (req: Request, res: Response) => {
  const objectPath = `/objects/${(req.params as any).filePath}`;
  try {
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
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
