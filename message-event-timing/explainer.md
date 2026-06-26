
# Explainer: Exposing MessageEvent Timing via the Event Timing API

Author: [Joone Hur](https://github.com/joone) (Microsoft), Michal Mocny (Google) 

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
**Table of Contents** 

- [Introduction](#introduction)
- [Goals](#goals)
- [Non-Goals](#non-goals)
- [Problems](#problems)
  - [1. Queue wait time is hard to measure accurately](#1-queue-wait-time-is-hard-to-measure-accurately)
  - [2. Serialization and deserialization costs are not observable](#2-serialization-and-deserialization-costs-are-not-observable)
  - [3. The sending and receiving contexts are not attributed](#3-the-sending-and-receiving-contexts-are-not-attributed)
- [Proposed Solution: PerformanceMessageEventTiming](#proposed-solution-performancemessageeventtiming)
  - [Message Event Entry Structure](#message-event-entry-structure)
  - [`PerformanceMessageScriptInfo` and `PerformanceExecutionContextInfo`](#performancemessagescriptinfo-and-performanceexecutioncontextinfo)
  - [Observing `PerformanceMessageEventTiming` Entries](#observing-performancemessageeventtiming-entries)
  - [Example: diagnosing the large-JSON case](#example-diagnosing-the-large-json-case)
- [Relationship to the Congested Moment / LoAF extension](#relationship-to-the-congested-moment--loaf-extension)
- [Related Discussion, Articles, and Browser Issues](#related-discussion-articles-and-browser-issues)
- [Privacy and Security Considerations](#privacy-and-security-considerations)
- [Acknowledgements](#acknowledgements)
- [References](#references)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

# Introduction

Web applications frequently use the `postMessage` API for communication across different execution contexts, such as between windows, iframes, and web workers. However, message delays often occur when messages are queued but not processed promptly, degrading responsiveness. Today, it is hard to identify delayed `postMessage` events without manual instrumentation.

This explainer proposes exposing end-to-end timing for `postMessage` as part of the [Event Timing API](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceEventTiming). Because most `postMessage` events are ultimately triggered by user interaction, modeling `MessageEvent` as an Event Timing entry is a natural fit and reuses existing, familiar machinery.

This will enable developers to identify delayed `postMessage` communication across windows, iframes, and web workers. By exposing end-to-end timing and attribution data, including task queue wait time, serialization/deserialization cost, and blocking tasks, it helps identify bottlenecks that degrade responsiveness in complex web applications.

# Goals

* **Provide detailed end-to-end timing:** Offer comprehensive timing information for `postMessage` events, including task queue wait time, and the time taken for serialization and deserialization, to help pinpoint bottlenecks.

* **Attribute slow message handling to specific contexts:** Allow developers to identify which browser contexts (windows, tabs, iframes) or web workers are slow to handle individual `MessageEvent`s, based on the per-message timing and attribution this API exposes. This covers [cross-document messaging](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage), [cross-worker/document messaging](https://developer.mozilla.org/en-US/docs/Web/API/Worker/postMessage), [channel messaging](https://developer.mozilla.org/en-US/docs/Web/API/Channel_Messaging_API), and [broadcast channels](https://developer.mozilla.org/en-US/docs/Web/API/Broadcast_Channel_API).

* **Identify the sender and handler of a `MessageEvent`:** Allow developers to identify which execution context and script sent a `MessageEvent` and which handled it.

# Non-Goals

* **Interval-level congestion is out of scope.** This proposal reports timing for individual `message` events, not the sustained congestion intervals that may delay them. Diagnosing a congested execution context as a whole is covered by the [Congested Moment / LoAF extension explainer](../loaf-congested-moments/explainer.md).
* **Non-`postMessage` communication is out of scope.** This API does not provide diagnostics for:
  * [Server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
  * [WebSockets](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)
  * [WebRTC data channels](https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel)

# Problems

When a `postMessage` is delayed, developers can detect *that* something was slow, but the per-message details needed to act on it are not exposed. To diagnose a delayed message, a developer needs to know **which** message was delayed, **how long it waited** in the receiver's task queue before its handler ran, **how long the handler itself took**, and **how much of the cost came from serializing and deserializing** the payload. Today none of these can be obtained reliably without manual instrumentation, and even then the values are only rough approximations — in particular, the pure task queue wait time cannot be measured accurately.

This explainer focuses on that *per-message* visibility; diagnosing why an execution context is congested as a whole is a separate, interval-level concern, covered by the [Congested Moment / LoAF extension explainer](../loaf-congested-moments/explainer.md) and discussed in [Relationship to the Congested Moment / LoAF extension](#relationship-to-the-congested-moment--loaf-extension).

## 1. Queue wait time is hard to measure accurately

The most useful signal for diagnosing a delayed message is how long it waited in the receiver's task queue *before* its handler ran. Approximating this with manual instrumentation requires comparing a sender-side timestamp (passed in the message payload) against a receiver-side timestamp taken at the start of `onmessage`. This cannot yield an accurate value because the two contexts have different `timeOrigin`s, and the measured value mixes together serialization, actual queue wait, and deserialization, so it cannot isolate the pure queueing delay. The browser, however, knows exactly when the message was enqueued and when its handler began.

## 2. Serialization and deserialization costs are not observable

When data is passed to `postMessage()`, it is serialized on the sender side and deserialized on the receiver side. For large or complex payloads these steps can block their respective threads for a significant time. From JavaScript, serialization time can only be roughly approximated by timing the `postMessage()` call (which also includes other overhead), and deserialization timing is even less reliable—browsers may defer it until the data is first accessed, so the measured value varies across implementations. These internal operations are invisible to developers, yet they are often the real source of the delay.

The following example code demonstrates the delay introduced by serializing/deserializing a large JSON object during `postMessage()`.

[Link to live demo](https://wicg.github.io/delayed-message-timing/examples/serialization/)

**index.html**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>postMessage Serialization/Deserialization Performance Impact</title>
  </head>
  <body>
    <button id="sendJSON">Send Large JSON (~7MB)</button>
    <script src="main.js"></script>
  </body>
</html>
```

**main.js**

In the main.js file, 7000 JSON objects are sent to the worker using `postMessage()`. The duration of serialization can be measured by calling `performance.now()` before and after executing `postMessage()`.

```js
const worker = new Worker("worker.js");

// Generate a large JSON object to demonstrate serialization overhead
function generateLargeJSON(size) {
  const largeArray = [];
  for (let i = 0; i < size; i++) {
    largeArray.push({ 
      id: i, 
      name: `Item ${i}`, 
      data: Array(1000).fill("x") // Each item contains ~1KB of string data
    });
  }
  return { items: largeArray }; // Returns ~7MB object when size=7000
}

// Send a large JSON object to the worker to demonstrate serialization overhead
function sendLargeJSON() {
  const largeJSON = generateLargeJSON(7000); // ~7MB of data
  console.log("[main] Dispatching a large JSON object to the worker.");

  // Measure time for postMessage call (includes serialization)
  const startTime = performance.now();
  worker.postMessage({
    receivedData: largeJSON,
    startTime: startTime + performance.timeOrigin,
  });
  const endTime = performance.now();
  
  // Note: This timing includes serialization but may also include other overhead
  console.log(
    `[main] postMessage call duration (includes serialization): ${(endTime - startTime).toFixed(2)} ms`,
  );
}

// Add event listener to the button
document.getElementById("sendJSON").addEventListener("click", sendLargeJSON);
```

**worker.js**

In worker.js, the duration of deserialization is estimated by calling `performance.now()` immediately before and after the first access to properties of event.data (e.g., `event.data.startTime`), as this access typically triggers the deserialization process.

```js
// Worker receives large data
onmessage = (event) => {
  const processingStart = event.timeStamp;
  // Measure deserialization time by accessing the large data object
  // Note: Deserialization typically occurs when data is first accessed (implementation-dependent)
  const deserializationStartTime = performance.now();
  const startTimeFromMain = event.data.startTime - performance.timeOrigin;
  const receivedData = event.data.receivedData;
  const deserializationEndTime = performance.now();
  const blockedDuration = processingStart - startTimeFromMain;

  console.log("[worker] Deserialized Data:", receivedData.items.length, "items.");
  console.log(
    "[worker] Deserialization time:",
    (deserializationEndTime - deserializationStartTime).toFixed(2),
    "ms",
  );

  const totalDataProcessingTime = (deserializationEndTime - startTimeFromMain); 
  console.log("[worker] blockedDuration (including serialization):", blockedDuration.toFixed(2), "ms");
  console.log("[worker] serialization + deserialization (estimate):", totalDataProcessingTime.toFixed(2), "ms");
};
```

**Console logs**
```
[main] Dispatching a large JSON object to the worker.
[main] postMessage call duration (~7MB object serialization): 111.20 ms
[worker] Deserialized Data: 7000 items.
[worker] Deserialization time: 454.40 ms
[worker] blockedDuration (including serialization): 111.10 ms
[worker] serialization + deserialization (estimate): 566.00 ms
```
As shown, serialization on the main thread (approx. 111.20 ms) occurs synchronously during the `postMessage()` call, blocking other main thread work. Similarly, deserialization on the worker thread (approx. 454.40 ms) is a significant operation that blocks the worker's event loop during message processing, delaying the execution of the `onmessage` handler and any subsequent tasks.

In this example, the worker log `blockedDuration: 111.10 ms` indicates the time elapsed from when the main thread initiated the `postMessage()` (including its 111.20 ms serialization block) to when the worker's `onmessage` handler began execution. This suggests that the task queue wait time is nearly zero, and the delay is primarily caused by serialization on the sender side. However, the cost of data handling is difficult to estimate because the size of the message payload can vary depending on the scenario.

## 3. The sending and receiving contexts are not attributed

Even when a delay is detected, the `message` event carries no information about *which script* sent the message or *which execution context* it came from. In complex applications a single receiver often handles messages from many senders — the top-level document, several embedded iframes (sometimes third-party widgets), and other workers — and when one of those messages is delayed or its handler is slow, the developer needs to know *who sent it* in order to fix the right code.

For example, consider a worker that acts as a shared backend for several contexts that all post requests to it. The top-level document and an embedded iframe each connect to it over their own `MessageChannel`:

[Link to live demo](https://wicg.github.io/delayed-message-timing/examples/message_event/)

**main.js** (top-level document) — connects both itself and the embedded iframe to the worker, each via its own `MessageChannel`:

```js
// Top-level document.
//
// It connects BOTH itself and an embedded iframe to the same worker, each
// through its own MessageChannel. The worker receives requests from both but
// cannot tell them apart: for MessagePort messages, e.source is null and
// e.origin is "".

const worker = new Worker("worker.js");
const iframe = document.getElementById("appFrame");

// --- Channel 1: top-level document <-> worker ---
const mainChannel = new MessageChannel();
worker.postMessage({ type: "connect" }, [mainChannel.port2]);
mainChannel.port1.postMessage({ query: "loadDashboard" });

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
```

**iframe.js** (embedded iframe) — receives a port connected to the worker and sends a request on it:

```js
// Embedded iframe.
//
// It receives a port (connected to the worker) from the parent document, then
// sends a request to the worker on that port.

addEventListener("message", (event) => {
  if (event.data?.type === "workerPort") {
    // Receive the port that connects this iframe to the worker.
    const port = event.ports[0];
    port.postMessage({ query: "loadWidget" });
  }
});
```

**worker.js** — handles requests from every context, but cannot tell them apart:

```js
// Each context connects by sending a "connect" message that transfers one end
// of a MessageChannel. The worker then listens for requests on that port.

self.onmessage = (event) => {
  if (event.data?.type !== "connect") return;

  const port = event.ports[0];
  port.onmessage = (e) => {
    // A request arrived. If its handler is slow, or the message waited a long
    // time in the queue, which context sent it — the document, the iframe, or
    // another worker? The MessageEvent carries no attribution for the sender.
    handleRequest(e.data);
  };
};
```

The `message` event provides no way to answer that question. The closest existing fields do not help: `event.source` and `event.origin` identify only the sending *window* (and are `null` / `""` for `MessagePort` and worker messages), never the sending *script* or *execution context*, and never a worker. At the current platform level there is simply no way to attribute a delayed message to the script and context that sent or handled it — which is what this proposal adds.

To work around this today, the standard pattern in web development is for the sender to embed its own identifier in the message payload — for example, including a `sender: "MyScript"` property in `event.data` — and have the receiver read it back. This works, but only for code the developer controls and has instrumented: it does not cover third-party scripts or libraries, must be threaded through every message and message type, and reflects only whatever label the sender chose to include — not the actual script, its source location, or its execution context. This proposal provides that attribution automatically, without manual tagging.

# Proposed Solution: PerformanceMessageEventTiming

To expose the end-to-end timing of `postMessage` events, we propose **`PerformanceMessageEventTiming`**, a new interface that extends the [Event Timing API](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceEventTiming).

This interface provides the precise queue wait time, the serialization and deserialization durations measured by the browser, and attribution data identifying the sending and receiving scripts and their execution contexts.

This new interface relies on two supporting interfaces:

  * `PerformanceMessageScriptInfo`: Provides details about the script that sent or received the message.
  * `PerformanceExecutionContextInfo`: Describes the execution context (e.g., main thread, worker) of the sender or receiver.

## Message Event Entry Structure

```mermaid
classDiagram
    class PerformanceEntry {
        +entryType
        +name
        +startTime
        +duration
    }
    class PerformanceEventTiming {
        +processingStart
        +processingEnd
        +cancelable
        +interactionId
        +target
    }
    class PerformanceMessageEventTiming {
        +sentTime
        +blockedDuration
        +serialization
        +deserialization
        +messageType
        +traceId
        +invoker
        +receiver
    }
    PerformanceEntry <|-- PerformanceEventTiming
    PerformanceEventTiming <|-- PerformanceMessageEventTiming
```

```js
const someMessageEventEntry = {
  entryType: "event",
  name: "message",

  // Timing
  startTime,       // When postMessage() was called on the sender side
  duration,        // startTime → processingEnd
  sentTime,        // When the message was enqueued in the receiver's task queue
  processingStart, // When the onmessage handler began executing
  processingEnd,   // When the onmessage handler completed

  // Attribution
  blockedDuration,  // sentTime → processingStart (pure queue wait time)
  serialization,    // Time spent serializing the message on the sender side
  deserialization,  // Time spent deserializing the message on the receiver side

  // Inherited from PerformanceEventTiming (always false/0 for message events)
  cancelable,    // Always false — message events are not cancelable
  interactionId, // Always 0 — message events have no associated user interaction

  // Message metadata
  messageType, // "cross-worker-document" | "channel" | "cross-document" | "broadcast-channel"
  traceId,     // Unique identifier to correlate sender and receiver entries

  // Script attribution (PerformanceMessageScriptInfo)
  invoker,  // Details about the script that called postMessage()
  receiver  // Details about the script handling the message
}
```

All timestamps in the entry (`startTime`, `sentTime`, `processingStart`, `processingEnd`) are reported on the **receiving context's** performance timeline — the same timeline as the observing `PerformanceObserver` — so they are directly comparable even when `postMessage()` was called in a different context with a different `timeOrigin`. The browser performs this normalization internally using a shared monotonic clock, which is exactly what manual instrumentation (comparing timestamps taken in two contexts) cannot do reliably.

## `PerformanceMessageScriptInfo` and `PerformanceExecutionContextInfo`

`PerformanceMessageScriptInfo` provides attribution details for the script responsible for sending (`invoker`) or handling (`receiver`) a `message` event, including the source URL, function name, and position within the source file. Its `executionContext` property is a `PerformanceExecutionContextInfo` instance that identifies the type of execution context (window, iframe, or worker) where that script is running. Together, these interfaces allow developers to pinpoint exactly which script and context is responsible for a delayed message event.

```js
const somePerformanceMessageScriptInfo = {
  name,                 // "invoker" or "receiver"
  sourceURL,            // URL of the script that sent or handled the message
  sourceFunctionName,   // Function name at the call site; empty string if unavailable
  sourceCharPosition,   // Character offset within the source file
  sourceLineNumber,     // Line number within the source file
  sourceColumnNumber,   // Column number within the source file

  executionContext: {
    id,    // Unique integer ID for this context within the agent cluster (e.g. 0 = main thread)
    name,  // Worker name from new Worker("...", { name }), or window.name; may be empty
    type   // "main-thread" | "dedicated-worker" | "shared-worker" | "service-worker" | "window" | "iframe"
  }
}
```

## Observing `PerformanceMessageEventTiming` Entries

`PerformanceMessageEventTiming` entries can be observed independently of any [congested moment](../loaf-congested-moments/explainer.md). This is useful when a developer wants to monitor delayed messages across all contexts, with attribution details about which script sent the message and which handled it, including source location. This helps identify what kinds of messages are being delayed and where they originate.

Because `PerformanceMessageEventTiming` extends `PerformanceEventTiming`, it is reported via the existing `"event"` entry type and is available in workers as well as the main thread.

The `durationThreshold` option controls the minimum total duration a message event must exceed to be reported. For message events, the minimum enforced threshold is **200ms**; even if a lower value is specified, entries with a duration below 200ms will not be reported. This avoids excessive noise from short-lived messages that do not represent a real responsiveness problem.

```js
const observer = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (entry.name === "message") {
      console.log("Delayed message:", entry);
    }
  }
});

// durationThreshold below 200ms is silently clamped to 200ms for message events
observer.observe({ type: 'event', buffered: true, durationThreshold: 200 });
```

## Example: diagnosing the large-JSON case

Recall the [serialization example](#2-serialization-and-deserialization-costs-are-not-observable), where a ~7MB JSON object was sent to a worker. With manual instrumentation the developer could only estimate a combined cost. With `PerformanceMessageEventTiming`, the worker's observer receives an entry that isolates each phase:

```js
{
  entryType: "event",
  name: "message",
  startTime: 1240.0,        // postMessage() called on the main thread
  sentTime: 1351.2,         // message enqueued in the worker (after ~111ms serialization)
  processingStart: 1351.4,  // onmessage began
  processingEnd: 1806.0,    // onmessage finished
  duration: 566.0,          // startTime → processingEnd

  blockedDuration: 0.2,     // pure queue wait (sentTime → processingStart)
  serialization: 111.2,     // measured on the sender side
  deserialization: 454.4,   // measured on the receiver side

  messageType: "cross-worker-document",
  invoker:  { sourceURL: "https://example.com/main.js",   sourceFunctionName: "sendLargeJSON",
              executionContext: { id: 0, type: "main-thread" } },
  receiver: { sourceURL: "https://example.com/worker.js", sourceFunctionName: "onmessage",
              executionContext: { id: 1, type: "dedicated-worker", name: "" } },
}
```

The entry makes the diagnosis immediate: `blockedDuration` is near zero, so the message did not wait in the queue; the 566ms delay is almost entirely serialization (111ms on the sender) and deserialization (454ms on the receiver), with full attribution to the sending and receiving scripts.

# Relationship to the Congested Moment / LoAF extension

This proposal is complementary to the [Congested Moment / LoAF extension explainer](../loaf-congested-moments/explainer.md). The two operate at different granularities:

* **`PerformanceMessageEventTiming` (this proposal)** provides *per-message* timing and attribution: when a specific `postMessage` was sent, how long it waited in the queue, its serialization/deserialization cost, and which script and execution context sent and handled it. It is reported via the `"event"` entry type.
* **The Congested Moment / LoAF extension** provides *interval-level* attribution: it surfaces a sustained period during which an execution context is overloaded, along with the blocking scripts responsible. It is reported via the `"long-animation-frame"` entry type.

A single overloaded context can delay many messages at once. The LoAF extension explains *why the context was congested as a whole*, while `PerformanceMessageEventTiming` explains *what happened to an individual message*. The two interfaces share the `PerformanceExecutionContextInfo` interface (defined above) for identifying execution contexts, so attribution data is consistent across both.

# Related Discussion, Articles, and Browser Issues

- **Chromium Issue:** [postMessage between Trello and iframes timing out more frequently](https://issues.chromium.org/issues/40723533)
  This issue highlights increasing latency in `postMessage` communication between Trello and embedded iframes, suggesting a need for better diagnostics around message delivery delays.

- **Article:** [Is postMessage slow?](https://surma.dev/things/is-postmessage-slow/)
  This article explains how serialization and deserialization are major sources of delay in `postMessage()` usage. While `SharedArrayBuffer` can eliminate copying overhead via shared memory, its real-world usage is limited due to strict security constraints and the complexity of manual memory management.

# Privacy and Security Considerations

`PerformanceMessageEventTiming` exposes end-to-end timing and script attribution for `postMessage`, which requires care to avoid leaking cross-origin information:

- **Same-origin attribution only.** `PerformanceMessageScriptInfo` fields (`sourceURL`, `sourceFunctionName`, `sourceCharPosition`, line/column) are populated only when the script is same-origin with the observing context. For cross-origin senders or receivers these fields are omitted, and only coarse metadata (e.g., the context `type`) is exposed.
- **Serialization/deserialization timing.** These durations are measured on the observer's own thread for messages it sends or receives; they do not reveal the internal timing of a cross-origin context.
- **`traceId` correlation.** `traceId` correlates the sender and receiver entries only when both contexts are same-origin; it is not exposed across origins, so it cannot be used to link activity between unrelated origins.
- **Timestamp coarsening.** Timestamps follow the same resolution-clamping protections as the rest of the Event Timing API to mitigate high-resolution timing attacks.

# Acknowledgements

Thank you to Abhishek Shanthkumar, Alex Russell, Andy Luhrs, Dave Meyers, Ethan Bernstein, Evan Stade, Jared Mitchell, Luis Pardo, Michal Mocny, Noam Helfman, Noam Rosenthal, Sam Fortiner, Samuele Carpineti, Steve Becker, Yoav Weiss, Yehor Lvivski for their valuable feedback and advice.

# References
- [Event Timing API](https://w3c.github.io/event-timing/)
- [Extending Long Tasks API to Web Workers](https://github.com/MicrosoftEdge/MSEdgeExplainers/blob/main/LongTasks/explainer.md)
- https://developer.mozilla.org/en-US/docs/Web/API/PerformanceLongTaskTiming
- https://developer.mozilla.org/en-US/docs/Web/API/PerformanceScriptTiming
- https://developer.mozilla.org/en-US/docs/Web/API/MessageEvent
- https://developer.chrome.com/docs/web-platform/long-animation-frames
