const supported = PerformanceObserver.supportedEntryTypes.includes("long-animation-frame");
let observer;
if (supported) {
  observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      postMessage({
        type: "entry",
        entry: {
          entryType: entry.entryType,
          startTime: entry.startTime,
          duration: entry.duration,
          scriptCount: entry.scriptCount,
          scriptsLength: entry.scripts.length,
        },
      });
    }
  });
  observer.observe({ type: "long-animation-frame", buffered: true });
}

let processed = 0;
let firstStart;
self.onmessage = ({ data }) => {
  const start = performance.now();
  firstStart ??= start;
  const sendToHandler = performance.timeOrigin + start - data.sentAt;
  const preview = data.body.replace(/\s+/g, " ").trim().slice(0, 80);
  // Simulate CPU processing; real email bodies do not have a fixed processing cost.
  while (performance.now() - start < 3) {}
  const processingDuration = performance.now() - start;
  postMessage({ type: "processed", id: data.id, preview, processingDuration, sendToHandler });
  processed++;
  if (processed === 100) {
    const elapsed = performance.now() - firstStart;
    setTimeout(() => postMessage({ type: "complete", elapsed }), 50);
  }
};
self.onmessageerror = () => {
  throw new Error("Could not deserialize an email-processing request.");
};
postMessage({ type: "ready", supported });
