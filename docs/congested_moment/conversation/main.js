const startButton = document.querySelector("#start");
const status = document.querySelector("#status");
const measurements = document.querySelector("#measurements");
const support = document.querySelector("#support");
const entries = document.querySelector("#entries");
let worker;

startButton.addEventListener("click", () => {
  worker?.terminate();
  startButton.disabled = true;
  status.textContent = "Starting a dedicated worker...";
  support.textContent = "Checking worker LoAF support...";
  measurements.textContent = "Waiting for the worker.";
  entries.textContent = "No entries received.";
  const durations = [];
  const latencies = [];
  const previews = [];
  const reportedEntries = [];
  worker = new Worker("worker.js");

  worker.addEventListener("error", (event) => {
    console.error("Conversation worker failed:", event.message);
    status.textContent = `Worker failed: ${event.message}. Serve the demo over HTTP.`;
    startButton.disabled = false;
  });
  worker.addEventListener("messageerror", () => {
    console.error("Could not deserialize a message from the conversation worker.");
    status.textContent = "Could not read a worker message.";
    startButton.disabled = false;
  });
  worker.addEventListener("message", ({ data }) => {
    if (data.type === "ready") {
      support.textContent = data.supported
        ? "Worker LoAF is supported. Waiting for real performance entries."
        : "Worker LoAF is not supported in this build/configuration. Workload measurements still run; no LoAF entries will be invented.";
      status.textContent = "Processing 100 emails...";
      for (let id = 0; id < 100; id++) {
        worker.postMessage({
          id,
          sentAt: performance.timeOrigin + performance.now(),
        });
      }
    } else if (data.type === "processed") {
      durations.push(data.processingDuration);
      latencies.push(data.sendToHandler);
      previews.push(data.preview);
      status.textContent = `Processed ${durations.length} / 100 emails.`;
    } else if (data.type === "entry") {
      reportedEntries.push(data.entry);
      entries.textContent = JSON.stringify(reportedEntries, null, 2);
    } else if (data.type === "complete") {
      measurements.textContent = JSON.stringify({
        processedEmails: durations.length,
        workerElapsedMs: data.elapsed,
        processingRangeMs: [Math.min(...durations), Math.max(...durations)],
        processingAtLeast5ms: durations.filter((duration) => duration >= 5).length,
        maxSendToHandlerMs: Math.max(...latencies),
        firstPreview: previews[0],
      }, null, 2);
      status.textContent = "Workload finished. LoAF entries, if any, are shown separately.";
      startButton.disabled = false;
    }
  });
});
