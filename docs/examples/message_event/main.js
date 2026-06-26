// Top-level document.
//
// It connects BOTH itself and an embedded iframe to the same worker, each
// through its own MessageChannel. The worker receives requests from both but
// cannot tell them apart: for MessagePort messages, e.source is null and
// e.origin is "".

const logEl = document.getElementById("log");
function log(line) {
  logEl.textContent += line + "\n";
}

const worker = new Worker("worker.js");
const iframe = document.getElementById("appFrame");

// --- Channel 1: top-level document <-> worker ---
const mainChannel = new MessageChannel();
worker.postMessage({ type: "connect" }, [mainChannel.port2]);

// The worker replies on the same port; it cannot identify which context sent
// the request.
mainChannel.port1.onmessage = (e) => {
  if (e.data?.type === "result") {
    log(`[document<-worker] handled query="${e.data.query}" (sender not attributable)`);
  }
};

// --- Channel 2: embedded iframe <-> worker ---
// Once the iframe has loaded (and registered its message listener), give it a
// port whose other end is connected to the worker.
iframe.addEventListener("load", () => {
  const iframeChannel = new MessageChannel();
  // Worker end of the channel.
  worker.postMessage({ type: "connect" }, [iframeChannel.port2]);
  // iframe end of the channel (transferred into the iframe).
  iframe.contentWindow.postMessage({ type: "workerPort" }, "*", [
    iframeChannel.port1,
  ]);
});

// --- Buttons ---
document.getElementById("fromDocument").addEventListener("click", () => {
  log('[document] sending "loadDashboard" to the worker...');
  mainChannel.port1.postMessage({ query: "loadDashboard" });
});

document.getElementById("fromIframe").addEventListener("click", () => {
  log('[document] asking the iframe to send "loadWidget"...');
  iframe.contentWindow.postMessage({ type: "sendQuery", query: "loadWidget" }, "*");
});

// The iframe forwards the worker's reply back here so everything is visible
// in one place.
window.addEventListener("message", (e) => {
  if (e.data?.type === "iframeResult") {
    log(`[iframe<-worker] handled query="${e.data.query}" (sender not attributable)`);
  }
});
