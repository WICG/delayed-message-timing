// Worker — a shared backend that several contexts connect to.
//
// Each context connects by sending a "connect" message that transfers one end
// of a MessageChannel. The worker then listens for requests on that port.
//
// The problem: when a request arrives, the worker cannot tell which context
// sent it. The MessageEvent carries no attribution for the sender.

self.onmessage = (event) => {
  if (event.data?.type !== "connect") return;

  const port = event.ports[0];
  port.onmessage = (e) => {
    // A request arrived — but which context sent it? There is no way to know
    // from the MessageEvent.
    console.log("[worker] request:", e.data.query, "— sender: unknown");

    // Reply to the sender so the page can show that the request was handled.
    port.postMessage({ type: "result", query: e.data.query });
  };
};
