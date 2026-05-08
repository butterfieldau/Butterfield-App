import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage.js";
import { ObjectPermission } from "../lib/objectAcl.js";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 */
router.post("/storage/uploads/request-url", async (req: Request, res: Response) => {
  const { name, size, contentType } = req.body ?? {};
  if (!name || typeof contentType !== 'string') {
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
 * GET /storage/public-objects/:filePath*
 *
 * Serve public assets. These are unconditionally public — no auth checks.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  const objectPath = `/public-objects/${(req.params as any).filePath}`;
  try {
    const { stream, contentType } = await objectStorageService.getObjectStream(objectPath, ObjectPermission.Public);
    res.setHeader("Content-Type", contentType);
    (stream as Readable).pipe(res);
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
 * Serve private/authenticated assets.
 */
router.get("/storage/objects/*filePath", async (req: Request, res: Response) => {
  const objectPath = `/objects/${(req.params as any).filePath}`;
  try {
    const { stream, contentType } = await objectStorageService.getObjectStream(objectPath, ObjectPermission.Private);
    res.setHeader("Content-Type", contentType);
    (stream as Readable).pipe(res);
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
