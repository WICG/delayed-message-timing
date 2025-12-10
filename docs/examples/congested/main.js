/**
 * Message Queue Congestion Demonstration
 * 
 * This example demonstrates how message queues in Web Workers can become
 * congested when tasks take longer to process than the rate at which
 * messages are sent. It sends delete tasks every 30ms, then a read task,
 * measuring queue wait times to show the congestion effect.
 */

// Create a Web Worker
const worker = new Worker("worker.js");

// Counter for generating unique email IDs for each delete task
let emailID = 0;

/**
 * Sends a series of delete tasks followed by a read task to demonstrate
 * message queue congestion. The 30ms interval creates congestion since
 * worker tasks take ~50ms each to complete.
 */
function sendTasksToWorker() {
  const interval = setInterval(() => {
    // Send delete task with unique email ID and timestamp
    worker.postMessage({
      emailId: emailID,
      taskName: `deleteMail`,
      startTime: performance.now() + performance.timeOrigin, // Absolute timestamp for timing analysis
    });
    console.log(`[main] dispatching the deleteMail task(email ID: #${emailID})`);
    emailID++;
    if (emailID >= 10) {
      clearInterval(interval);
      // Send final read task - this will experience the most queue delay
      worker.postMessage({
        taskName: "checkMails",
        startTime: performance.now() + performance.timeOrigin, // Timestamp when task is queued
      });
      console.log("[main] dispatching the checkMail task");
    }
  }, 30); // 30ms interval creates congestion (faster than worker's 50ms task duration)
}
