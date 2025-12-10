// Simulates a task that consumes CPU for a given duration
function runTask(duration) {
  const start = Date.now();
  while (Date.now() - start < duration) { // Use duration directly
    /* Busy wait to simulate work */
  }
}

onmessage = function runLongTaskOnWorker(e) {
  const processingStartOnWorker = e.timeStamp; // Time when onmessage handler starts
  const taskSimulationStartTime = performance.now();
  
  runTask(e.data.input); // Simulate the work
  
  const taskSimulationDuration = performance.now() - taskSimulationStartTime;

  // Calculate timings relative to worker's performance.timeOrigin
  const startTimeFromMain = e.data.startTime - performance.timeOrigin;
  const messageQueueWaitTime = processingStartOnWorker - startTimeFromMain;

  console.log(`message #${e.data.no}: original postMessage call at ${startTimeFromMain.toFixed(2)} ms (relative to worker origin)`);
  console.log(`message #${e.data.no}: started processing in worker at ${processingStartOnWorker.toFixed(2)} ms`);
  console.log(
    `message #${e.data.no}: ran a task for input (${e.data.input}ms), actual duration: ${taskSimulationDuration.toFixed(2)}ms`
  );
  console.log(
    `message #${e.data.no}: total time from postMessage to task end: ` +
    `task duration (${taskSimulationDuration.toFixed(2)}) + ` +
    `message queue wait time etc. (${messageQueueWaitTime.toFixed(2)}) = ` +
    `${(taskSimulationDuration + messageQueueWaitTime).toFixed(2)} ms (approx)`
  );
};