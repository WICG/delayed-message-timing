// Embedded iframe.
//
// It receives a port (connected to the worker) from the parent document, then
// sends requests to the worker on that port when asked.

let workerPort = null;

addEventListener("message", (event) => {
  if (event.data?.type === "workerPort") {
    // Receive the port that connects this iframe to the worker.
    workerPort = event.ports[0];

    // Forward the worker's reply up to the top-level document for display.
    workerPort.onmessage = (e) => {
      if (e.data?.type === "result") {
        parent.postMessage({ type: "iframeResult", query: e.data.query }, "*");
      }
    };
  } else if (event.data?.type === "sendQuery") {
    // The parent asked us to send a request to the worker.
    workerPort?.postMessage({ query: event.data.query });
  }
});
