import { Router } from 'express';
import { handleLinklyTransactionNotification } from '../lib/linklyCloud.js';

const router = Router();

router.post('/notifications/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  try {
    const result = await handleLinklyTransactionNotification(sessionId, req.body ?? {});
    req.log.info(
      {
        sessionId,
        handled: Boolean(result),
        status: result?.status,
        responseCode: result?.responseCode,
      },
      'Linkly transaction notification received',
    );
    return res.json({ success: true });
  } catch (err: any) {
    req.log.warn({ sessionId, err: err?.message }, 'Linkly transaction notification failed');
    return res.status(400).json({ error: err?.message ?? 'Failed to process Linkly notification.' });
  }
});

export default router;
