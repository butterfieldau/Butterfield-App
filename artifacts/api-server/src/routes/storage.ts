import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage.js";

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
