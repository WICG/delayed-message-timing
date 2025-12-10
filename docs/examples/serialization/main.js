/**
 * Serialization/Deserialization Performance Demonstration
 * 
 * This example shows how large data objects affect postMessage performance.
 * The structured cloning algorithm used by postMessage must serialize data
 * on the sender side and deserialize on the receiver side, which can create
 * significant delays for large objects.
 */

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
    receivedData: largeJSON, // Large object that needs serialization
    startTime: startTime + performance.timeOrigin, // Small timestamp value
  });
  const endTime = performance.now();
  
  // Note: This timing includes serialization but may also include other overhead
  console.log(
    `[main] postMessage call duration (~7MB object serialization): ${(endTime - startTime).toFixed(2)} ms`,
  );
}

// Add event listener to the button
document.getElementById("sendJSON").addEventListener("click", sendLargeJSON);
