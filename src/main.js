import * as THREE from 'three';
import { createTerrain, updateTerrain } from './terrain.js';
import { createAirplane } from './airplane.js';
import { FlightController } from './controls.js';
import { createSonarEffect, updateSonarEffects } from './effects.js';

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1117);
scene.fog = new THREE.FogExp2(0x0d1117, 0.002);

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
terrain.material.uniforms.highlight.value = 1.0; // Heightmap on by default

// Create airplane
const airplane = createAirplane();
scene.add(airplane);

// Flight controller
const controller = new FlightController(airplane, camera);

// State
let isStarted = false;
let groundHighlight = true; // On by default
let cameraMode = 0;

// HUD elements
const speedArc = document.getElementById('speed-arc');
const speedValue = document.getElementById('speed-value');
const speedDisplay = document.getElementById('speed-display');
const altArc = document.getElementById('alt-arc');
const altValue = document.getElementById('alt-value');
const altDisplay = document.getElementById('alt-display');

// Arc configuration
const arcLength = 180; // Approximate arc length

// Initialize arcs with stroke-dasharray
speedArc.style.strokeDasharray = arcLength;
speedArc.style.strokeDashoffset = arcLength;
altArc.style.strokeDasharray = arcLength;
altArc.style.strokeDashoffset = arcLength;

// Generate tick marks for gauges
function generateTicks(containerId, isLeft) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const tickCount = 12;

  for (let i = 0; i <= tickCount; i++) {
    const t = i / tickCount;

    // Calculate position along the quadratic bezier curve
    // For left gauge: M 85 130 Q 85 10 15 10
    // For right gauge: M 15 130 Q 15 10 85 10
    let x, y;

    if (isLeft) {
      // Bezier: P0(85,130), P1(85,10), P2(15,10)
      const p0 = { x: 85, y: 130 };
      const p1 = { x: 85, y: 10 };
      const p2 = { x: 15, y: 10 };
      x = (1-t)*(1-t)*p0.x + 2*(1-t)*t*p1.x + t*t*p2.x;
      y = (1-t)*(1-t)*p0.y + 2*(1-t)*t*p1.y + t*t*p2.y;
    } else {
      // Bezier: P0(15,130), P1(15,10), P2(85,10)
      const p0 = { x: 15, y: 130 };
      const p1 = { x: 15, y: 10 };
      const p2 = { x: 85, y: 10 };
      x = (1-t)*(1-t)*p0.x + 2*(1-t)*t*p1.x + t*t*p2.x;
      y = (1-t)*(1-t)*p0.y + 2*(1-t)*t*p1.y + t*t*p2.y;
    }

    // Create tick mark
    const tick = document.createElementNS('http://www.w3.org/2000/svg', 'rect');

    // Offset tick outward from curve
    const offsetX = isLeft ? 8 : -8;

    tick.setAttribute('x', x + offsetX - 1);
    tick.setAttribute('y', y - 2);
    tick.setAttribute('width', i % 3 === 0 ? 6 : 3);
    tick.setAttribute('height', 2);
    tick.setAttribute('fill', '#f90');
    tick.setAttribute('opacity', i % 3 === 0 ? '0.8' : '0.4');

    container.appendChild(tick);
  }
}

generateTicks('speed-ticks', true);
generateTicks('alt-ticks', false);

// Get position along bezier curve
function getBezierPoint(t, isLeft) {
  if (isLeft) {
    const p0 = { x: 85, y: 130 };
    const p1 = { x: 85, y: 10 };
    const p2 = { x: 15, y: 10 };
    return {
      x: (1-t)*(1-t)*p0.x + 2*(1-t)*t*p1.x + t*t*p2.x,
      y: (1-t)*(1-t)*p0.y + 2*(1-t)*t*p1.y + t*t*p2.y
    };
  } else {
    const p0 = { x: 15, y: 130 };
    const p1 = { x: 15, y: 10 };
    const p2 = { x: 85, y: 10 };
    return {
      x: (1-t)*(1-t)*p0.x + 2*(1-t)*t*p1.x + t*t*p2.x,
      y: (1-t)*(1-t)*p0.y + 2*(1-t)*t*p1.y + t*t*p2.y
    };
  }
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
    case 'a': controller.strafe = -1; break;
    case 'd': controller.strafe = 1; break;
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
    case 'a': case 'd': controller.strafe = 0; break;
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
function updateHUD() {
  const speed = controller.speed;
  const alt = airplane.position.y;

  // Speed gauge (max 160)
  const speedPercent = Math.min(speed / 160, 1);
  const speedOffset = arcLength * (1 - speedPercent);
  speedArc.style.strokeDashoffset = speedOffset;
  speedValue.textContent = speed.toFixed(1);

  // Position speed value along the arc
  const speedPos = getBezierPoint(speedPercent, true);
  speedDisplay.style.top = `${speedPos.y / 140 * 100}%`;
  speedDisplay.style.left = `${speedPos.x / 100 * 100 - 35}%`;

  // Altitude gauge (max 200)
  const altPercent = Math.min(alt / 200, 1);
  const altOffset = arcLength * (1 - altPercent);
  altArc.style.strokeDashoffset = altOffset;
  altValue.textContent = alt.toFixed(1);

  // Position alt value along the arc
  const altPos = getBezierPoint(altPercent, false);
  altDisplay.style.top = `${altPos.y / 140 * 100}%`;
  altDisplay.style.right = `${(100 - altPos.x) / 100 * 100 - 35}%`;
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
    updateHUD();
  }

  renderer.render(scene, camera);
}

animate();
