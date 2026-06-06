import { Router } from 'express';
import { db, productsTable } from '@workspace/db';
import { eq } from 'drizzle-orm';

const router = Router();

function getPublicBaseUrl(): string {
  const domain = (process.env.REPLIT_DOMAINS ?? process.env.REPLIT_DEV_DOMAIN ?? '')
    .split(',')
    .map((d) => d.trim())
    .find(Boolean);
  return domain ? `https://${domain}` : '';
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

router.get('/:productId', async (req, res) => {
  try {
    const [product] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, req.params.productId));

    if (!product) {
      res
        .status(404)
        .set('Content-Type', 'text/html; charset=utf-8')
        .send(
          '<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px;color:#1C1C1E"><h2>Product not found</h2><p style="margin-top:8px;color:#6B7280">This product may no longer be available.</p></body></html>',
        );
      return;
    }

    const base = getPublicBaseUrl();
    const deepLink = `butterfield://product?id=${encodeURIComponent(product.id)}`;
    const price = product.salePriceCents ?? product.priceCents;
    const priceStr = price ? `AUD ${(price / 100).toFixed(2)}` : '';
    const description = product.shortDescription ?? product.description ?? '';

    let imageUrl = product.imageUrl ?? '';
    if (imageUrl && !/^https?:\/\//i.test(imageUrl) && base) {
      imageUrl = `${base}${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}`;
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${esc(product.name)} \u2014 Butterfield Cookies</title>
  <meta property="og:site_name" content="Butterfield Cookies">
  <meta property="og:title" content="${esc(product.name)}">
  <meta property="og:description" content="${esc(description || 'Premium cookies \u0026 desserts from Sydney')}">
  ${imageUrl ? `<meta property="og:image" content="${esc(imageUrl)}">` : ''}
  <meta property="og:type" content="product">
  <meta name="theme-color" content="#40C0F2">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{
      font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue','Inter',system-ui,sans-serif;
      background:#F5F6FA;
      min-height:100dvh;
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:center;
      padding:24px 16px;
    }
    .card{
      background:#fff;
      border-radius:24px;
      overflow:hidden;
      max-width:400px;
      width:100%;
      box-shadow:0 8px 48px rgba(0,0,0,0.13);
    }
    .hero{
      width:100%;
      aspect-ratio:1.4/1;
      background:linear-gradient(135deg,#D9EEF9,#B8DDF5);
      overflow:hidden;
    }
    .hero img{width:100%;height:100%;object-fit:cover;display:block}
    .body{padding:24px}
    .brand{
      font-size:11px;
      font-weight:700;
      color:#40C0F2;
      letter-spacing:0.10em;
      text-transform:uppercase;
      margin-bottom:10px;
    }
    h1{
      font-size:24px;
      font-weight:800;
      color:#1C1C1E;
      line-height:1.2;
      margin-bottom:8px;
    }
    .desc{
      font-size:14px;
      color:#6B7280;
      line-height:1.65;
      margin-bottom:16px;
    }
    .price{
      font-size:20px;
      font-weight:800;
      color:#1C1C1E;
      margin-bottom:24px;
    }
    .price-sub{font-size:13px;font-weight:400;color:#9CA3AF;margin-left:4px}
    .btn{
      display:block;
      width:100%;
      padding:16px;
      font-size:16px;
      font-weight:700;
      text-align:center;
      text-decoration:none;
      border-radius:16px;
      border:none;
      cursor:pointer;
      -webkit-tap-highlight-color:transparent;
      transition:opacity 0.15s,transform 0.1s;
      letter-spacing:0.01em;
    }
    .btn:active{opacity:0.85;transform:scale(0.98)}
    .btn-open{background:#D20001;color:#fff;margin-bottom:10px}
    .btn-download{background:#EFF6FF;color:#40C0F2;display:none}
    .btn-download.show{display:block}
    .footer{
      text-align:center;
      margin-top:20px;
      font-size:12px;
      color:#9CA3AF;
      line-height:1.5;
    }
  </style>
</head>
<body>
  <div class="card">
    ${
      imageUrl
        ? `<div class="hero"><img src="${esc(imageUrl)}" alt="${esc(product.name)}" loading="eager"></div>`
        : '<div class="hero"></div>'
    }
    <div class="body">
      <div class="brand">Butterfield Cookies &middot; Sydney</div>
      <h1>${esc(product.name)}</h1>
      ${description ? `<p class="desc">${esc(description)}</p>` : ''}
      ${priceStr ? `<div class="price">${esc(priceStr)}<span class="price-sub">incl. GST</span></div>` : ''}
      <a class="btn btn-open" id="openBtn" href="${esc(deepLink)}" onclick="tryOpen(event)">Open in Butterfield App</a>
      <a class="btn btn-download" id="dlBtn" href="https://apps.apple.com/au/app/butterfield-cookies" target="_blank" rel="noopener noreferrer">Download the App</a>
    </div>
  </div>
  <p class="footer">Butterfield Cookies &mdash; Premium cookies, coffee &amp; desserts</p>
  <script>
    var deepLink = '${deepLink}';
    var timer;
    function showFallback() {
      document.getElementById('dlBtn').classList.add('show');
      document.getElementById('openBtn').style.display = 'none';
    }
    function tryOpen(e) {
      if (e) e.preventDefault();
      clearTimeout(timer);
      window.location.href = deepLink;
      timer = setTimeout(showFallback, 1500);
    }
    document.addEventListener('DOMContentLoaded', function () {
      tryOpen(null);
    });
  </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch {
    res
      .status(500)
      .set('Content-Type', 'text/html; charset=utf-8')
      .send(
        '<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px;color:#1C1C1E"><h2>Something went wrong</h2></body></html>',
      );
  }
});

export default router;
