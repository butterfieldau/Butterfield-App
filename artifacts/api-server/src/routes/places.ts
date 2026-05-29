import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

const PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY ?? '';

router.get("/autocomplete", requireAuth, async (req, res) => {
  const input = String(req.query.input ?? '').trim();
  if (!PLACES_KEY) {
    res.json({ predictions: [] });
    return;
  }
  if (input.length < 2) {
    res.json({ predictions: [] });
    return;
  }
  try {
    const url =
      `https://maps.googleapis.com/maps/api/place/autocomplete/json` +
      `?input=${encodeURIComponent(input)}` +
      `&key=${PLACES_KEY}` +
      `&components=country:au` +
      `&types=address` +
      `&language=en`;
    const upstream = await fetch(url);
    const json = await upstream.json() as { status: string; predictions: unknown[] };
    res.json({ predictions: json.status === 'OK' ? json.predictions : [] });
  } catch (err) {
    req.log.error({ err }, 'places autocomplete error');
    res.json({ predictions: [] });
  }
});

router.get("/details", requireAuth, async (req, res) => {
  const placeId = String(req.query.place_id ?? '').trim();
  if (!PLACES_KEY || !placeId) {
    res.status(400).json({ error: 'missing place_id' });
    return;
  }
  try {
    const url =
      `https://maps.googleapis.com/maps/api/place/details/json` +
      `?place_id=${encodeURIComponent(placeId)}` +
      `&key=${PLACES_KEY}` +
      `&fields=address_components,geometry,formatted_address`;
    const upstream = await fetch(url);
    const json = await upstream.json() as { status: string; result: unknown };
    if (json.status !== 'OK') {
      res.status(404).json({ error: 'place not found' });
      return;
    }
    res.json({ result: json.result });
  } catch (err) {
    req.log.error({ err }, 'places details error');
    res.status(500).json({ error: 'upstream error' });
  }
});

export default router;
