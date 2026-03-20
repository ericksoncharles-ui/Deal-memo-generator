const express   = require('express');
const path      = require('path');
const https     = require('https');
const rateLimit = require('express-rate-limit');

const app = express();
app.set('trust proxy', 1);

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname)));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many requests — please wait a moment and try again.' } },
});
app.use('/api/', limiter);

app.post('/api/messages', (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: { message: 'API key not configured on server.' } });
  }

  const body = JSON.stringify(req.body);

  const options = {
    hostname: 'api.anthropic.com',
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
  };

  const upstream = https.request(options, (upstreamRes) => {
    res.status(upstreamRes.statusCode);
    const ct = upstreamRes.headers['content-type'];
    if (ct) res.setHeader('Content-Type', ct);
    upstreamRes.pipe(res);
  });

  upstream.on('error', (err) => {
    console.error('Upstream error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: { message: 'Upstream connection error.' } });
    }
  });

  upstream.write(body);
  upstream.end();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
