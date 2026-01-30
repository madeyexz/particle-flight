import * as THREE from 'three';
import { createTerrain, updateTerrain } from './terrain.js';
import { createAirplane } from './airplane.js';
import { FlightController } from './controls.js';
import { createSonarEffect, updateSonarEffects } from './effects.js';

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0f);
scene.fog = new THREE.FogExp2(0x0a0a0f, 0.001);

// Camera
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(0, 50, 0);

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

// Create terrain
const terrain = createTerrain(scene);
terrain.material.uniforms.highlight.value = 1.0;

// Create airplane
const airplane = createAirplane();
scene.add(airplane);

// Flight controller
const controller = new FlightController(airplane, camera);

// State
let isStarted = false;
let groundHighlight = true;
let cameraMode = 0;
let lastAltitude = 0;
let verticalSpeed = 0;

// HUD Elements
const speedValue = document.getElementById('speed-value');
const altValue = document.getElementById('alt-value');
const speedTape = document.getElementById('speed-tape');
const altTape = document.getElementById('alt-tape');
const compassTape = document.getElementById('compass-tape');
const headingValue = document.getElementById('heading-value');
const pitchLadder = document.getElementById('pitch-ladder');
const rollPointer = document.getElementById('roll-pointer');
const gForceEl = document.getElementById('g-force');
const throttleFill = document.getElementById('throttle-fill');
const afterburnerFill = document.getElementById('afterburner-fill');
const verticalSpeedEl = document.getElementById('vertical-speed');

// Initialize HUD components
function initHUD() {
  // Generate speed tape marks
  generateTapeMarks(speedTape, 0, 500, 20, true);

  // Generate altitude tape marks
  generateTapeMarks(altTape, 0, 500, 20, false);

  // Generate compass tape
  generateCompassTape();

  // Generate pitch ladder marks
  generatePitchLadder();
}

function generateTapeMarks(container, min, max, step, isSpeed) {
  container.innerHTML = '';

  for (let val = min; val <= max; val += step / 2) {
    const mark = document.createElement('div');
    mark.className = 'tape-mark';

    const isMajor = val % step === 0;

    const line = document.createElement('div');
    line.className = `tape-mark-line ${isMajor ? 'major' : ''}`;
    mark.appendChild(line);

    if (isMajor) {
      const value = document.createElement('span');
      value.className = 'tape-mark-value';
      value.textContent = val;
      mark.appendChild(value);
    }

    // Position from bottom (higher values at top)
    mark.style.bottom = `${((val - min) / (max - min)) * 500}px`;

    container.appendChild(mark);
  }
}

function generateCompassTape() {
  compassTape.innerHTML = '';

  const directions = ['N', '', '', 'E', '', '', 'S', '', '', 'W', '', ''];

  // Create marks for 720 degrees (two full rotations for seamless wrapping)
  for (let deg = 0; deg < 720; deg += 10) {
    const mark = document.createElement('div');
    mark.className = 'compass-mark';

    const isMajor = deg % 30 === 0;

    const line = document.createElement('div');
    line.className = `compass-mark-line ${isMajor ? 'major' : ''}`;
    mark.appendChild(line);

    if (isMajor) {
      const normalizedDeg = deg % 360;
      const dirIndex = Math.floor(normalizedDeg / 30);
      const label = document.createElement('span');
      label.className = 'compass-mark-label';

      if (directions[dirIndex]) {
        label.textContent = directions[dirIndex];
      } else {
        label.textContent = normalizedDeg.toString().padStart(3, '0');
      }
      mark.appendChild(label);
    }

    compassTape.appendChild(mark);
  }
}

function generatePitchLadder() {
  // Keep only the horizon line, pitch marks are updated dynamically
}

// Start game
function startGame() {
  if (isStarted) return;
  isStarted = true;

  document.getElementById('start-screen').classList.add('fade-out');
  document.getElementById('hud').classList.remove('hidden');
  document.getElementById('controls').classList.remove('hidden');

  renderer.domElement.requestPointerLock();
}

// Input handling
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !isStarted) {
    startGame();
    return;
  }

  if (!isStarted) return;

  switch (e.key.toLowerCase()) {
    case 'w': controller.throttle = 1; break;
    case 's': controller.throttle = -1; break;
    case 'a': controller.yawInput = -1; break;
    case 'd': controller.yawInput = 1; break;
    case 'shift': controller.boost = true; break;
    case ' ':
      e.preventDefault();
      createSonarEffect(scene, airplane.position.clone());
      break;
    case 'r':
      groundHighlight = !groundHighlight;
      terrain.material.uniforms.highlight.value = groundHighlight ? 1.0 : 0.0;
      break;
    case 'g':
      cameraMode = (cameraMode + 1) % 3;
      controller.setCameraMode(cameraMode);
      break;
  }
});

document.addEventListener('keyup', (e) => {
  if (!isStarted) return;

  switch (e.key.toLowerCase()) {
    case 'w': case 's': controller.throttle = 0; break;
    case 'a': case 'd': controller.yawInput = 0; break;
    case 'shift': controller.boost = false; break;
  }
});

document.addEventListener('mousemove', (e) => {
  if (!isStarted || !document.pointerLockElement) return;
  controller.handleMouseMove(e.movementX, e.movementY);
});

document.addEventListener('click', () => {
  if (isStarted && !document.pointerLockElement) {
    renderer.domElement.requestPointerLock();
  }
});

// Update HUD
function updateHUD(delta) {
  const speed = controller.speed;
  const alt = airplane.position.y;
  const pitch = controller.pitch;
  const roll = controller.roll;
  const yaw = controller.yaw;

  // Calculate vertical speed
  verticalSpeed = THREE.MathUtils.lerp(verticalSpeed, (alt - lastAltitude) / delta, delta * 5);
  lastAltitude = alt;

  // Speed tape
  speedValue.textContent = Math.round(speed);
  const speedOffset = (speed / 500) * 500 - 90; // Center on current value
  speedTape.style.transform = `translateY(${speedOffset}px)`;

  // Altitude tape
  altValue.textContent = Math.round(alt);
  const altOffset = (alt / 500) * 500 - 90;
  altTape.style.transform = `translateY(${altOffset}px)`;

  // Heading compass
  const headingDeg = (((-yaw * 180 / Math.PI) % 360) + 360) % 360;
  headingValue.textContent = Math.round(headingDeg).toString().padStart(3, '0');

  // Each compass mark is 20px wide, 10 degrees apart = 2px per degree
  const compassOffset = 100 - (headingDeg * 2); // Center offset
  compassTape.style.transform = `translateX(${compassOffset}px)`;

  // Roll indicator
  const rollDeg = roll * 180 / Math.PI;
  rollPointer.style.transform = `rotate(${rollDeg}deg)`;

  // Pitch ladder - update horizon line rotation based on roll
  const horizonLine = pitchLadder.querySelector('.horizon-line');
  if (horizonLine) {
    const pitchOffset = pitch * 100; // pixels per radian
    horizonLine.style.transform = `translateY(calc(-50% + ${pitchOffset}px)) rotate(${rollDeg}deg)`;
  }

  // G-Force
  const g = controller.gForceSmoothed;
  gForceEl.textContent = g.toFixed(1);
  gForceEl.classList.remove('warning', 'danger');
  if (g > 4) {
    gForceEl.classList.add('danger');
  } else if (g > 2.5) {
    gForceEl.classList.add('warning');
  }

  // Throttle bar
  const throttlePercent = ((controller.speed - controller.minSpeed) /
    (controller.cruiseSpeed - controller.minSpeed)) * 100;
  throttleFill.style.width = `${Math.max(0, Math.min(100, throttlePercent))}%`;

  // Afterburner bar
  const abPercent = controller.getAfterburnerPercent() * 100;
  afterburnerFill.style.width = `${abPercent}%`;
  afterburnerFill.classList.remove('active', 'low');
  if (controller.afterburnerActive) {
    afterburnerFill.classList.add('active');
  }
  if (abPercent < 20) {
    afterburnerFill.classList.add('low');
  }

  // Vertical speed
  const vsText = verticalSpeed >= 0 ? `+${Math.round(verticalSpeed)}` : Math.round(verticalSpeed).toString();
  verticalSpeedEl.textContent = vsText;
  verticalSpeedEl.classList.remove('warning', 'danger');
  if (verticalSpeed < -50) {
    verticalSpeedEl.classList.add('danger');
  } else if (verticalSpeed < -20) {
    verticalSpeedEl.classList.add('warning');
  }
}

// Handle resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Animation loop
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();

  if (isStarted) {
    controller.update(delta);
    updateTerrain(terrain, airplane.position);
    updateSonarEffects(scene, delta);
    updateHUD(delta);
  }

  renderer.render(scene, camera);
}

// Initialize and start
initHUD();
animate();
