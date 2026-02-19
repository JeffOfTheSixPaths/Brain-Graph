const canvas = document.getElementById("lsmCanvas");
const ctx = canvas.getContext("2d");

const toggleBtn = document.getElementById("toggleBtn");
const resetBtn = document.getElementById("resetBtn");
const spikeRateInput = document.getElementById("spikeRate");
const connectivityInput = document.getElementById("connectivity");
const fadeInput = document.getElementById("fade");
const spikeRateDisplay = document.getElementById("spikeRateDisplay");
const solvedCountDisplay = document.getElementById("solvedCountDisplay");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const CENTER_X = WIDTH / 2;
const CENTER_Y = HEIGHT / 2;

const camera = {
  distance: 900,
  zoom: 1,
};

let neurons = [];
let connections = [];
let running = true;
let lastTime = 0;
let solvedCount = 0;

const rotation = {
  angleX: 0,
  angleY: 0,
  velocityX: 0,
  velocityY: 0,
  dragging: false,
  lastX: 0,
  lastY: 0,
};

const settings = {
  baseSpikeRate: spikeRateInput.value / 100,
  connectivity: connectivityInput.value / 100,
  fade: fadeInput.value / 100,
};

const REQUEST_SOCKET_URL = "ws://localhost:8787";
const MIN_SPIKE_STEP = 0.004;
const MAX_SPIKE_RATE = 0.25;

class Neuron {
  constructor(id, x, y, z, isExcitatory) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.z = z;
    this.isExcitatory = isExcitatory;
    this.membrane = Math.random() * 0.4;
    this.threshold = 0.9 + Math.random() * 0.2;
    this.refractory = 0;
    this.spike = 0;
  }

  step(dt) {
    if (this.refractory > 0) {
      this.refractory = Math.max(0, this.refractory - dt);
      this.membrane *= 0.95;
      this.spike *= 0.85;
      return;
    }

    const noise = (Math.random() - 0.5) * 0.05;
    this.membrane = Math.min(1.2, this.membrane + noise + settings.baseSpikeRate * 0.02);

    if (this.membrane >= this.threshold) {
      this.fire();
    } else {
      this.spike *= 0.92;
      this.membrane *= 0.985;
    }
  }

  fire() {
    this.spike = 1;
    this.membrane = 0.2;
    this.refractory = 0.08 + Math.random() * 0.08;
  }
}

const randomInRange = (min, max) => min + Math.random() * (max - min);

function setSpikeRate(value) {
  const clamped = Math.max(0, Math.min(MAX_SPIKE_RATE, value));
  settings.baseSpikeRate = clamped;
  spikeRateInput.value = Math.round(clamped * 100);
  if (spikeRateDisplay) {
    const hz = Math.round(clamped * 100);
    spikeRateDisplay.textContent = `${(hz/10) * 4}`;
  }
}

function bumpSpikeRate(step = MIN_SPIKE_STEP) {
  const delta = Math.max(step, MIN_SPIKE_STEP);
  setSpikeRate(settings.baseSpikeRate + delta);
  solvedCount += 0.5; // THIS HAS TO BE 0.5
  if (solvedCountDisplay) {
    solvedCountDisplay.textContent = `${solvedCount}`;
  }
}

function isInBrainShape(x, y) {
  const dx = (x - CENTER_X) / (WIDTH * 0.32);
  const dy = (y - CENTER_Y) / (HEIGHT * 0.38);

  const leftBrain = ((dx + 0.33) ** 2 + dy ** 2) <= 1.0;
  const rightBrain = ((dx - 0.33) ** 2 + dy ** 2) <= 1.0;

  const stem =
    ((x - CENTER_X) ** 2) / (WIDTH * 0.05) ** 2 +
      ((y - CENTER_Y - HEIGHT * 0.22) ** 2) / (HEIGHT * 0.18) ** 2 <=
    1.0;

  const cerebellum =
    ((x - CENTER_X + WIDTH * 0.16) ** 2) / (WIDTH * 0.12) ** 2 +
      ((y - CENTER_Y + HEIGHT * 0.18) ** 2) / (HEIGHT * 0.12) ** 2 <=
    1.0;

  return leftBrain || rightBrain || stem || cerebellum || true;
}

function brainOutlinePoint(t) {
  const wobble = 0.06 * Math.sin(t * 6) + 0.04 * Math.cos(t * 10);
  const rx = WIDTH * (0.23 + wobble) ;
  const ry = HEIGHT * (0.28 + wobble * 0.8);
  const offsetX = WIDTH * 0.13;
  const baseY = CENTER_Y - HEIGHT * 0.02;

  const theta = t * Math.PI * 2*1.5;
  const x = CENTER_X - offsetX + Math.cos(theta) * rx;
  const y = baseY + Math.sin(theta) * ry;

  return { x, y };
}

function brainDepthAtPoint(x, y) {
  const nx = (x - CENTER_X) / (WIDTH * 0.32);
  const ny = (y - CENTER_Y) / (HEIGHT * 0.36);
  const profile = Math.max(0, 1 - nx * nx - ny * ny);
  return 260 * Math.pow(profile, 0.55);
}

function generateNeurons(count = 360) {
  neurons = [];
  const outlineCount = Math.floor(count * 0.75);
  const interiorCount = count - outlineCount;

  for (let i = 0; i < outlineCount; i += 1) {
    const t = i / outlineCount;
    const left = brainOutlinePoint(t);
    const right = {
      x: CENTER_X + (CENTER_X - left.x),
      y: left.y,
    };
    const thickness = randomInRange(-18, 18);
    const normalAngle = t * Math.PI * 2 + Math.PI / 2;
    const nx = Math.cos(normalAngle) * thickness;
    const ny = Math.sin(normalAngle) * thickness;
    const depth = brainDepthAtPoint(left.x, left.y);
    const hemisphere = (i % 2 === 0 ? 1 : -1) * randomInRange(0.65, 1);
    const z = hemisphere * depth;

    const isExcitatory = Math.random() > 0.2;
    neurons.push(
      new Neuron(
        neurons.length,
        left.x + nx,
        left.y + ny,
        z + randomInRange(-12, 12),
        isExcitatory
      )
    );

    if (neurons.length < outlineCount) {
      neurons.push(
        new Neuron(
          neurons.length,
          right.x + nx,
          right.y + ny,
          hemisphere * depth + randomInRange(-12, 12),
          Math.random() > 0.2
        )
      );
    }
  }

  const cerebellumCount = Math.floor(count * 0.12);
  for (let i = 0; i < cerebellumCount; i += 1) {
    const cx = CENTER_X - WIDTH * 0.18 + randomInRange(-WIDTH * 0.06, WIDTH * 0.06);
    const cy = CENTER_Y + HEIGHT * 0.2 + randomInRange(-HEIGHT * 0.07, HEIGHT * 0.07);
    const depth = brainDepthAtPoint(cx, cy) * 0.8;
    const z = randomInRange(-depth, depth) + randomInRange(-40, 40);
    neurons.push(
      new Neuron(neurons.length, cx, cy, z, Math.random() > 0.2)
    );
  }

  const spinalCount = Math.floor(count * 0.08);
  for (let i = 0; i < spinalCount; i += 1) {
    const t = i / Math.max(1, spinalCount - 1);
    const sx = CENTER_X + randomInRange(-WIDTH * 0.02, WIDTH * 0.02);
    const sy = CENTER_Y + HEIGHT * 0.32 + t * HEIGHT * 0.2;
    const depth = 120 * (1 - t * 0.6);
    const z = randomInRange(-depth, depth);
    neurons.push(
      new Neuron(neurons.length, sx, sy, z, Math.random() > 0.2)
    );
  }

  let attempts = 0;
  while (neurons.length < count && attempts < interiorCount * 40) {
    const x = randomInRange(WIDTH * 0.15, WIDTH * 0.85);
    const y = randomInRange(HEIGHT * 0.12, HEIGHT * 0.88);
    const depth = brainDepthAtPoint(x, y);
    const z = randomInRange(-depth, depth);
    attempts += 1;

    if (isInBrainShape(x, y)) {
      neurons.push(
        new Neuron(neurons.length, x, y, z, Math.random() > 0.2)
      );
    }
  }
}

function generateConnections() {
  connections = [];
  const connectionProbability = settings.connectivity * 0.12;

  neurons.forEach((source, i) => {
    neurons.forEach((target, j) => {
      if (i === j) return;
      if (Math.random() < connectionProbability) {
        const weight = source.isExcitatory
          ? randomInRange(0.2, 0.6)
          : randomInRange(-0.6, -0.2);
        connections.push({ source: i, target: j, weight });
      }
    });
  });
}

function stimulateNetwork() {
  neurons.forEach((neuron) => {
    if (Math.random() < settings.baseSpikeRate * 0.1) {
      neuron.membrane += 0.5;
    }
  });
}

function propagateSpikes() {
  connections.forEach((connection) => {
    const source = neurons[connection.source];
    const target = neurons[connection.target];

    if (source.spike > 0.85) {
      target.membrane += connection.weight * 0.6;
    }
  });
}

function drawBackground() {
  ctx.fillStyle = `rgba(8, 10, 18, ${0.35 + settings.fade * 0.45})`;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function rotatePoint(x, y, z) {
  const dx = x - CENTER_X;
  const dy = y - CENTER_Y;
  const dz = z;

  const cosY = Math.cos(rotation.angleY);
  const sinY = Math.sin(rotation.angleY);
  const cosX = Math.cos(rotation.angleX);
  const sinX = Math.sin(rotation.angleX);

  const xz = dx * cosY - dz * sinY;
  const zz = dx * sinY + dz * cosY;

  const yz = dy * cosX - zz * sinX;
  const zz2 = dy * sinX + zz * cosX;

  const depth = camera.distance + zz2;
  const scale = (camera.distance / depth) * camera.zoom;

  return {
    x: CENTER_X + xz * scale,
    y: CENTER_Y + yz * scale,
    scale,
    depth,
  };
}

function drawConnections() {
  ctx.lineWidth = 1;
  connections.forEach((connection) => {
    const source = neurons[connection.source];
    const target = neurons[connection.target];
    const intensity = Math.max(source.spike, target.spike);

    if (intensity < 0.05) return;

    const alpha = 0.2 + intensity * 0.6;
    const hue = source.isExcitatory ? 190 : 320;

    const sourcePos = rotatePoint(source.x, source.y, source.z);
    const targetPos = rotatePoint(target.x, target.y, target.z);

    const depthFade = Math.max(0.2, Math.min(1, sourcePos.scale));

    ctx.strokeStyle = `hsla(${hue}, 85%, 65%, ${alpha * depthFade})`;
    ctx.beginPath();
    ctx.moveTo(sourcePos.x, sourcePos.y);
    ctx.lineTo(targetPos.x, targetPos.y);
    ctx.stroke();
  });
}

function drawNeurons() {
  const projected = neurons.map((neuron) => ({
    neuron,
    pos: rotatePoint(neuron.x, neuron.y, neuron.z),
  }));

  projected.sort((a, b) => a.pos.depth - b.pos.depth);

  projected.forEach(({ neuron, pos }) => {
    const baseRadius = neuron.isExcitatory ? 3.2 : 3.8;
    const glow = neuron.spike * 6;
    const alpha = 0.35 + neuron.spike * 0.65;
    const radius = (baseRadius + glow * 0.2) * pos.scale;
    const glowScaled = glow * pos.scale;

    ctx.beginPath();
    ctx.fillStyle = neuron.isExcitatory
      ? `rgba(110, 227, 255, ${alpha})`
      : `rgba(255, 120, 217, ${alpha})`;
    ctx.shadowColor = neuron.isExcitatory ? "#6be3ff" : "#ff7ad9";
    ctx.shadowBlur = glowScaled * 1.2;
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  });
}

function update(dt) {
  stimulateNetwork();
  neurons.forEach((neuron) => neuron.step(dt));
  propagateSpikes();
}

function animate(timestamp) {
  if (!running) return;
  const dt = Math.min((timestamp - lastTime) / 1000, 0.06) || 0.016;
  lastTime = timestamp;

  if (!rotation.dragging) {
    rotation.angleX += rotation.velocityX;
    rotation.angleY += rotation.velocityY;
    rotation.velocityX *= 0.94;
    rotation.velocityY *= 0.94;
  }

  update(dt);
  drawBackground();
  drawConnections();
  drawNeurons();

  requestAnimationFrame(animate);
}

function start() {
  generateNeurons();
  generateConnections();
  lastTime = 0;
  running = true;
  requestAnimationFrame(animate);
}

function resetNetwork() {
  generateNeurons();
  generateConnections();
}

function initRequestListener() {
  try {
    const socket = new WebSocket(REQUEST_SOCKET_URL);

    socket.addEventListener("message", (event) => {
      //bumpSpikeRate(MIN_SPIKE_STEP);
      const message = typeof event.data === "string" ? event.data : "";
      if (message === "connect" || message === "bump") {
        bumpSpikeRate(MIN_SPIKE_STEP);
      }
    });

    socket.addEventListener("error", () => {
      try {
        socket.close();
      } catch (error) {
        // ignore
      }
    });

    socket.addEventListener("close", () => {
      setTimeout(initRequestListener, 2000);
    });
  } catch (error) {
    setTimeout(initRequestListener, 2000);
  }
}

toggleBtn.addEventListener("click", () => {
  running = !running;
  toggleBtn.textContent = running ? "Pause" : "Resume";
  if (running) {
    requestAnimationFrame(animate);
  }
});

resetBtn.addEventListener("click", resetNetwork);

spikeRateInput.addEventListener("input", (event) => {
  setSpikeRate(event.target.value / 100);
});

connectivityInput.addEventListener("input", (event) => {
  settings.connectivity = event.target.value / 100;
  generateConnections();
});

fadeInput.addEventListener("input", (event) => {
  settings.fade = event.target.value / 100;
});

setSpikeRate(settings.baseSpikeRate);
if (solvedCountDisplay) {
  solvedCountDisplay.textContent = `${solvedCount}`;
}
start();

initRequestListener();

canvas.addEventListener("mousedown", (event) => {
  rotation.dragging = true;
  rotation.lastX = event.clientX;
  rotation.lastY = event.clientY;
});

window.addEventListener("mouseup", () => {
  rotation.dragging = false;
});

window.addEventListener("mousemove", (event) => {
  if (!rotation.dragging) return;
  const dx = event.clientX - rotation.lastX;
  const dy = event.clientY - rotation.lastY;
  rotation.lastX = event.clientX;
  rotation.lastY = event.clientY;

  rotation.angleY += dx * 0.006;
  rotation.angleX += dy * 0.004;
  rotation.velocityY = dx * 0.0007;
  rotation.velocityX = dy * 0.0006;
});

canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  const delta = Math.sign(event.deltaY) * -0.08;
  camera.zoom = Math.min(1.8, Math.max(0.6, camera.zoom + delta));
});
