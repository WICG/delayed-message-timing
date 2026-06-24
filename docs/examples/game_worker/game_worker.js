function getRandomNumber(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

self.addEventListener("message", (event) => {
  if (event.data.canvas) {
    setupGame(event.data.canvas);
  } else if (event.data.type === "keydown" || event.data.type === "keyup") {
    handleInput(event.data);
  }
});

// Monitor long tasks
const observer = new PerformanceObserver((list) => {
  list.getEntries().forEach((entry) => {
    console.log(
      `Long task detected on the worker thread: ${entry.duration.toFixed(2)}ms`,
    );
  });
});

observer.observe({ type: "longtask", buffered: true });

let ctx;
let isRunning = true;
const keysPressed = new Set();

// Rectangle position and size
const rectangle = {
  x: 120,
  y: 100,
  width: 50,
  height: 50,
  speed: 5, // Speed of movement
};

function setupGame(offscreenCanvas) {
  ctx = offscreenCanvas.getContext("2d");
  startGameLoop();
}

function handleInput(input) {
  if (input.type === "keydown") {
    keysPressed.add(input.key);
  } else if (input.type === "keyup") {
    keysPressed.delete(input.key);
  }
}

function startGameLoop() {
  const threshold = 10; // Custom threshold for monitoring tasks
  self.performance.mark("start-task");

  function gameLoop() {
    const start = performance.now();
    // Simulate a long task on the web worker
    fibonacci(getRandomNumber(10, 35));
    // Clear the canvas
    ctx.clearRect(0, 0, 800, 600);

    // Update rectangle position based on key input
    if (keysPressed.has("ArrowUp")) {
      rectangle.y -= rectangle.speed;
    }
    if (keysPressed.has("ArrowDown")) {
      rectangle.y += rectangle.speed;
    }
    if (keysPressed.has("ArrowLeft")) {
      rectangle.x -= rectangle.speed;
    }
    if (keysPressed.has("ArrowRight")) {
      rectangle.x += rectangle.speed;
    }

    // Prevent the rectangle from going out of bounds
    rectangle.x = Math.max(0, Math.min(rectangle.x, 800 - rectangle.width));
    rectangle.y = Math.max(0, Math.min(rectangle.y, 600 - rectangle.height));

    // Draw the rectangle
    ctx.fillStyle = "blue";
    ctx.fillRect(rectangle.x, rectangle.y, rectangle.width, rectangle.height);

    // Monitor task duration
    const duration = performance.now() - start;
    if (duration > threshold) {
      //  console.warn(`Long task detected in worker: ${duration.toFixed(2)}ms`);
    }

    if (isRunning) {
      requestAnimationFrame(gameLoop);
    }
  }

  gameLoop();
}
