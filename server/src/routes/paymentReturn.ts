import type { RequestHandler } from 'express';

/**
 * GET /payment-return
 * Chapa redirects the user here after a payment attempt.
 *
 * - On mobile (Expo Go / native): auto-opens the deep link → app handles verification.
 * - On desktop browser: deep links don't work, so we show clear instructions instead.
 */
export const paymentReturnHandler: RequestHandler = (req, res) => {
  const tx_ref = ((req.query.trx_ref ?? req.query.tx_ref ?? '') as string).replace(/[<>"'&]/g, '');
  const status  = ((req.query.status as string | undefined) ?? 'success').replace(/[<>"'&]/g, '');

  const deepLink = tx_ref
    ? `mental-health-mobile://payment-return?tx_ref=${encodeURIComponent(tx_ref)}&status=${encodeURIComponent(status)}`
    : `mental-health-mobile://`;

  const refHtml = tx_ref
    ? `<div class="ref">Transaction ref: <strong>${tx_ref}</strong></div>`
    : '';

  // CSP-safe: no inline scripts, no inline event handlers.
  // The JS lives in a <script src> served from the same origin.
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Deep-Link', deepLink); // readable by the script below via meta tag
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="deep-link" content="${deepLink}">
  <title>Payment Complete — SelamMind</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
         display:flex;align-items:center;justify-content:center;
         min-height:100vh;background:#f0fdf4;padding:20px;color:#111827}
    .card{background:#fff;border-radius:24px;padding:40px 32px;text-align:center;
          box-shadow:0 8px 40px rgba(0,0,0,.12);max-width:400px;width:100%}
    .icon{font-size:60px;margin-bottom:18px;line-height:1}
    h1{color:#16a34a;font-size:22px;font-weight:800;margin-bottom:10px}
    .sub{color:#6b7280;font-size:15px;line-height:1.65;margin-bottom:20px}
    .ref{font-size:11px;color:#9ca3af;background:#f9fafb;border:1px solid #e5e7eb;
         border-radius:8px;padding:10px 14px;margin-bottom:22px;word-break:break-all}
    .ref strong{color:#374151}
    .btn{display:block;width:100%;background:#16a34a;color:#fff;border:none;
         padding:15px 20px;border-radius:14px;font-size:16px;font-weight:700;
         cursor:pointer;margin-bottom:10px;text-align:center;transition:opacity .15s}
    .btn:hover{opacity:.9}
    .btn:active{opacity:.75}
    .notice{display:none;margin-top:18px;background:#fefce8;
            border:1px solid #fde68a;border-radius:14px;padding:18px;text-align:left}
    .notice h2{font-size:14px;font-weight:700;color:#92400e;margin-bottom:8px}
    .notice ol{padding-left:18px;color:#78350f;font-size:13px;line-height:1.8}
    .hint{font-size:12px;color:#9ca3af;margin-top:16px;line-height:1.6}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✅</div>
    <h1>Payment Complete!</h1>
    <p class="sub">Your payment was received and your booking is confirmed.</p>
    ${refHtml}
    <button class="btn" id="openBtn">Open SelamMind App →</button>
    <div class="notice" id="notice">
      <h2>Cannot open app from this browser</h2>
      <ol>
        <li>Open <strong>Expo Go</strong> on your phone</li>
        <li>Go back to the <strong>payment screen</strong></li>
        <li>Tap <strong>"I've Paid — Verify Now"</strong></li>
      </ol>
    </div>
    <p class="hint">Your session is saved. You can safely close this tab.</p>
  </div>
  <script src="/payment-return.js"></script>
</body>
</html>`);
};

/**
 * GET /payment-return.js
 * Tiny CSP-safe script served from the same origin.
 * Reads the deep link from the <meta> tag and attempts to open it.
 */
export const paymentReturnScript: RequestHandler = (_req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(`
(function () {
  var meta = document.querySelector('meta[name="deep-link"]');
  var link = meta ? meta.getAttribute('content') : null;
  var btn  = document.getElementById('openBtn');
  var note = document.getElementById('notice');

  function tryOpen() {
    if (!link) { note.style.display = 'block'; return; }
    window.location.href = link;
    // If page is still visible after 2s, the deep link didn't open the app
    setTimeout(function () {
      if (!document.hidden) {
        note.style.display = 'block';
        btn.textContent = 'Try Again →';
      }
    }, 2000);
  }

  if (btn) btn.addEventListener('click', tryOpen);

  // Auto-open on real mobile devices
  var isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isMobile) setTimeout(tryOpen, 500);
})();
`);
};
