// Basic client to request /stream?mb=... and count bytes received. Also supports saving logs to server
const mbInput = document.getElementById('mbInput');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const saveBtn = document.getElementById('saveBtn');
const wastedMbEl = document.getElementById('wastedMb');
const speedEl = document.getElementById('speedMbps');

let controller = null;
let running = false;
let stats = {
  requestedMb: 0,
  bytes: 0,
  startTime: 0,
  endTime: 0
};

startBtn.addEventListener('click', start);
stopBtn.addEventListener('click', stop);
saveBtn.addEventListener('click', saveLog);

function start() {
  if (running) return;
  const mb = Number(mbInput.value) || 0;
  stats.requestedMb = mb;
  stats.bytes = 0;
  stats.startTime = performance.now();
  stats.endTime = 0;

  controller = new AbortController();
  running = true;
  startBtn.classList.add('hidden');
  stopBtn.classList.remove('hidden');

  wastedMbEl.textContent = '0';
  speedEl.textContent = '0';

  const url = `/stream?mb=${encodeURIComponent(mb)}`;
  fetch(url, {signal: controller.signal})
    .then(resp => {
      if (!resp.body) throw new Error('ReadableStream not supported in this browser');
      const reader = resp.body.getReader();
      let bytes = 0;
      let lastBytes = 0;
      let lastTime = performance.now();

      // update speed every 500ms
      const speedTimer = setInterval(() => {
        const now = performance.now();
        const deltaBytes = bytes - lastBytes;
        const deltaSec = (now - lastTime) / 1000;
        const mbps = deltaSec > 0 ? (deltaBytes * 8) / (1024*1024) / deltaSec : 0;
        speedEl.textContent = mbps.toFixed(2);
        lastBytes = bytes;
        lastTime = now;
      }, 500);

      function readLoop() {
        return reader.read().then(({done, value}) => {
          if (done) {
            clearInterval(speedTimer);
            stats.endTime = performance.now();
            stats.bytes = bytes;
            running = false;
            startBtn.classList.remove('hidden');
            stopBtn.classList.add('hidden');
            return;
          }
          bytes += value.length;
          wastedMbEl.textContent = (bytes / (1024*1024)).toFixed(2);
          // continue
          return readLoop();
        });
      }

      return readLoop();
    })
    .catch(err => {
      if (err.name === 'AbortError') {
        // expected
      } else {
        console.error(err);
        alert('Error: ' + err.message);
      }
      stop();
    });
}

function stop() {
  if (!running) return;
  running = false;
  startBtn.classList.remove('hidden');
  stopBtn.classList.add('hidden');
  if (controller) controller.abort();
  controller = null;
  stats.endTime = performance.now();
  // update final stats
  const bytes = Number(wastedMbEl.textContent) * 1024 * 1024;
  stats.bytes = bytes;
}

function computeSummary() {
  const durationSec = ((stats.endTime || performance.now()) - stats.startTime) / 1000;
  const mb = (stats.bytes || 0) / (1024*1024);
  const avgMbps = durationSec > 0 ? ((stats.bytes*8)/(1024*1024)) / durationSec : 0;
  return {requestedMb: stats.requestedMb, wastedMb: Number(mb.toFixed(3)), durationSec: Number(durationSec.toFixed(3)), avgMbps: Number(avgMbps.toFixed(3)), timestamp: new Date().toISOString()};
}

function saveLog() {
  const summary = computeSummary();
  fetch('/log', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(summary)
  }).then(r => r.json()).then(j => {
    if (j && j.status === 'ok') {
      alert('Log saved successfully. You can view all logs at /logs');
    } else {
      alert('Failed to save log');
    }
  }).catch(err => {
    console.error(err);
    alert('Error saving log: ' + err.message);
  });
}