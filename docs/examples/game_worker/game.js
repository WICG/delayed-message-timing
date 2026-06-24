const canvas = document.getElementById("gameCanvas");
const offscreen = canvas.transferControlToOffscreen();
const worker = new Worker("game_worker.js");

worker.postMessage({ canvas: offscreen }, [offscreen]);

// Listen to key inputs
window.addEventListener("keydown", (e) => {
  worker.postMessage({ type: "keydown", key: e.key });
});

window.addEventListener("keyup", (e) => {
  worker.postMessage({ type: "keyup", key: e.key });
});

// Monitor long tasks
const observer = new PerformanceObserver((list) => {
  list.getEntries().forEach((entry) => {
    console.log(
      `Long task detected on the main thread: ${entry.duration.toFixed(2)}ms`,
    );
  });
});

observer.observe({ type: "long-animation-frame", buffered: true });
