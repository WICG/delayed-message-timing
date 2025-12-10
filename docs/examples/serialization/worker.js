/**
 * Web Worker for demonstrating serialization/deserialization impact on message delays.
 * 
 * When large objects are sent via postMessage, they must be serialized by the sender
 * and deserialized by the receiver using the structured cloning algorithm. This
 * process can introduce significant delays, especially for large datasets.
 * 
 * This worker measures the deserialization time and queue wait time to demonstrate
 * how data size affects message processing performance.
 */

// Worker receives large data
onmessage = (event) => {
  const processingStart = event.timeStamp;
  // Measure deserialization time by accessing the large data object
  // Note: Deserialization typically occurs when data is first accessed (implementation-dependent)
  const deserializationStartTime = performance.now();
  const startTimeFromMain = event.data.startTime - performance.timeOrigin; // Small data, minimal deserialization cost
  const receivedData = event.data.receivedData; // Large data access triggers main deserialization
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
