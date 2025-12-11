const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Ensure logs directory exists
const LOG_DIR = path.join(__dirname, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'results.json');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);
if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, '[]');

/**
 * Stream endpoint:
 * - Query param: mb (number) -> megabytes to stream. If 0 or missing -> infinite stream until client disconnects.
 * Example: /stream?mb=5
 */
app.get('/stream', (req, res) => {
  const mbParam = parseFloat(req.query.mb);
  const CHUNK_SIZE = 64 * 1024; // 64KB per chunk
  const totalBytes = (isNaN(mbParam) || mbParam <= 0) ? Infinity : Math.floor(mbParam * 1024 * 1024);

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-cache');

  const chunk = Buffer.alloc(CHUNK_SIZE, 'a'); // reuse same buffer
  let sent = 0;
  let aborted = false;

  req.on('close', () => {
    aborted = true;
  });

  function sendNext() {
    if (aborted) return;
    if (sent >= totalBytes) {
      res.end();
      return;
    }
    const remaining = totalBytes === Infinity ? CHUNK_SIZE : Math.min(CHUNK_SIZE, totalBytes - sent);
    if (!res.write(chunk.slice(0, remaining))) {
      res.once('drain', () => {
        sent += remaining;
        setImmediate(sendNext);
      });
    } else {
      sent += remaining;
      setImmediate(sendNext);
    }
  }

  sendNext();
});

// Save log endpoint: accepts JSON body and appends entry to logs/results.json
app.post('/log', (req, res) => {
  try {
    const entry = req.body;
    if (!entry) return res.status(400).json({error: 'No JSON body provided'});
    const current = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8')) || [];
    current.push(entry);
    fs.writeFileSync(LOG_FILE, JSON.stringify(current, null, 2));
    res.json({status: 'ok'});
  } catch (err) {
    console.error('Failed to save log', err);
    res.status(500).json({error: 'Failed to save log'});
  }
});

// Expose logs (read-only) for convenience
app.get('/logs', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.sendFile(LOG_FILE);
});

// Serve index.html from / (static folder)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Waster-data server listening on http://localhost:${PORT}`));