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

// Create airplane
const airplane = createAirplane();
scene.add(airplane);

// Flight controller
const controller = new FlightController(airplane, camera);

// State
let isStarted = false;
let groundHighlight = false;
let cameraMode = 0; // 0 = third person, 1 = cockpit, 2 = side

// HUD elements
const speedArc = document.getElementById('speed-arc');
const speedValue = document.getElementById('speed-value');
const altArc = document.getElementById('alt-arc');
const altValue = document.getElementById('alt-value');

// Arc gauge config
const arcLength = 150; // Total arc length in SVG units

// Generate tick marks for gauges
function generateTicks(containerId, count = 10) {
  const container = document.getElementById(containerId);
  if (!container) return;

  for (let i = 0; i <= count; i++) {
    const t = i / count;
    // Calculate position along the arc
    const x = 10 + t * 60;
    const y = 100 - Math.sin(t * Math.PI / 2) * 80;

    const tick = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    tick.setAttribute('x', x - 1);
    tick.setAttribute('y', y - 3);
    tick.setAttribute('width', 2);
    tick.setAttribute('height', 6);
    tick.setAttribute('fill', '#f90');
    tick.setAttribute('opacity', '0.5');
    container.appendChild(tick);
  }
}

generateTicks('speed-ticks');
generateTicks('alt-ticks');

// Start game
function startGame() {
  if (isStarted) return;
  isStarted = true;

  document.getElementById('start-screen').classList.add('fade-out');
  document.getElementById('hud').classList.remove('hidden');
  document.getElementById('controls').classList.remove('hidden');

  // Lock pointer
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

  // Speed gauge (max 10)
  const speedPercent = Math.min(speed / 10, 1);
  const speedOffset = arcLength * (1 - speedPercent);
  speedArc.style.strokeDashoffset = speedOffset;
  speedValue.textContent = speed.toFixed(1);

  // Altitude gauge (max 200)
  const altPercent = Math.min(alt / 200, 1);
  const altOffset = arcLength * (1 - altPercent);
  altArc.style.strokeDashoffset = altOffset;
  altValue.textContent = alt.toFixed(1);
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
