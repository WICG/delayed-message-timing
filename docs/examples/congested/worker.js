/**
 * Web Worker for demonstrating message queue congestion.
 * 
 * This worker simulates email processing tasks that can cause message delays
 * when the worker is busy processing other tasks. It measures the time messages
 * spend waiting in the queue before being processed.
 */
// Listen for messages from the main thread
onmessage = async (event) => {
  const processingStart = event.timeStamp; // Time when worker starts processing this message
  const startTimeFromMain = event.data.startTime - performance.timeOrigin; // Convert to worker timeline
  // Calculate message queue wait time by comparing when the message
  // was sent (from main thread) vs when it started processing (in worker)
  const blockedDuration = processingStart - startTimeFromMain;
  const message = event.data;

  if (message.taskName === "checkMails") {
    await checkMails(message, blockedDuration);
  } else if (message.taskName === "deleteMail") {
    await deleteMail(message, blockedDuration);
  }
};

// Check emails from the mail storage
function checkMails(message, blockedDuration) {
  const startRead = performance.now();
  // Simulate task
  const start = Date.now();
  while (Date.now() - start < 50) {
    /* Do nothing */
  }
  const endRead = performance.now();
  console.log(
    `[worker] ${message.taskName},`,
    `blockedDuration: ${blockedDuration.toFixed(2)} ms,`,
    `duration: ${(endRead - startRead).toFixed(2)} ms`,
  );
}

// Delete an email by ID.
async function deleteMail(message, blockedDuration) {
  return new Promise((resolve) => {
    const startDelete = performance.now();
    // Simulate the delete task.
    const start = Date.now();
    while (Date.now() - start < 50) {
      /* Do nothing */
    }
    const endDelete = performance.now();
    console.log(
      `[worker] ${message.taskName}(email ID: ${message.emailId}),`,
      `blockedDuration: ${blockedDuration.toFixed(2)} ms,`,
      `duration: ${(endDelete - startDelete).toFixed(2)} ms`,
    );
    resolve();
  });
}