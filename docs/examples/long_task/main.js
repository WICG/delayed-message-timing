function runWorker() {
  const worker = new Worker("worker.js", { name: "long_task_worker" });
  let i = 0;
  const interval = 60; // Interval in milliseconds
  const inputArray = [50, 50, 50, 120, 50]; // Durations for tasks in worker

  // Function to send messages to the worker at the specified interval
  function sendMessage() {
    if (i < inputArray.length) {
      const input = inputArray[i];
      console.log(`message #${i+1}: sending a message with input ${input}`);
      // Send a message to the worker
      worker.postMessage({
        no: i+1,
        input: input,
        startTime: performance.now() + performance.timeOrigin, // Absolute time
      });
      i++;
    } else {
      // Stop sending messages.
      clearInterval(messageInterval);
    }
  }

  // Start sending messages every 60ms
  const messageInterval = setInterval(sendMessage, interval);
}