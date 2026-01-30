import * as THREE from 'three';
import { createAirplane } from '../src/airplane.js';
import { FlightController } from '../src/controls.js';

const DEG = THREE.MathUtils.RAD2DEG;

function createRig() {
  const airplane = createAirplane();
  const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 2000);
  const controller = new FlightController(airplane, camera);
  return { airplane, camera, controller };
}

function runScenario(name, duration, inputFn) {
  const rig = createRig();
  const { controller } = rig;
  const dt = 1 / 60;
  const steps = Math.floor(duration / dt);

  const stats = {
    speed: { min: Infinity, max: -Infinity, sum: 0 },
    g: { min: Infinity, max: -Infinity, sum: 0 },
    aoa: { min: Infinity, max: -Infinity, sum: 0 },
    rollRate: { min: Infinity, max: -Infinity, sum: 0 },
    pitchRate: { min: Infinity, max: -Infinity, sum: 0 },
    stall: { min: Infinity, max: -Infinity, sum: 0 }
  };

  for (let i = 0; i < steps; i += 1) {
    const time = i * dt;
    if (inputFn) inputFn(time, controller);
    controller.update(dt);

    const t = controller.telemetry;
    stats.speed.min = Math.min(stats.speed.min, t.speed);
    stats.speed.max = Math.max(stats.speed.max, t.speed);
    stats.speed.sum += t.speed;

    stats.g.min = Math.min(stats.g.min, t.gForce);
    stats.g.max = Math.max(stats.g.max, t.gForce);
    stats.g.sum += t.gForce;

    stats.aoa.min = Math.min(stats.aoa.min, t.aoa * DEG);
    stats.aoa.max = Math.max(stats.aoa.max, t.aoa * DEG);
    stats.aoa.sum += t.aoa * DEG;

    stats.rollRate.min = Math.min(stats.rollRate.min, t.rollRate * DEG);
    stats.rollRate.max = Math.max(stats.rollRate.max, t.rollRate * DEG);
    stats.rollRate.sum += t.rollRate * DEG;

    stats.pitchRate.min = Math.min(stats.pitchRate.min, t.pitchRate * DEG);
    stats.pitchRate.max = Math.max(stats.pitchRate.max, t.pitchRate * DEG);
    stats.pitchRate.sum += t.pitchRate * DEG;

    stats.stall.min = Math.min(stats.stall.min, t.stall);
    stats.stall.max = Math.max(stats.stall.max, t.stall);
    stats.stall.sum += t.stall;
  }

  const avg = {
    speed: stats.speed.sum / steps,
    g: stats.g.sum / steps,
    aoa: stats.aoa.sum / steps,
    rollRate: stats.rollRate.sum / steps,
    pitchRate: stats.pitchRate.sum / steps,
    stall: stats.stall.sum / steps
  };

  return { name, stats, avg };
}

function check(label, value, min, max) {
  const ok = value >= min && value <= max;
  return { label, value, min, max, ok };
}

function reportScenario(result) {
  const { name, stats, avg } = result;
  const lines = [];
  lines.push(`\n[${name}]`);
  lines.push(`speed avg ${avg.speed.toFixed(1)} (min ${stats.speed.min.toFixed(1)} max ${stats.speed.max.toFixed(1)})`);
  lines.push(`g avg ${avg.g.toFixed(2)} (min ${stats.g.min.toFixed(2)} max ${stats.g.max.toFixed(2)})`);
  lines.push(`aoa avg ${avg.aoa.toFixed(1)}° (min ${stats.aoa.min.toFixed(1)} max ${stats.aoa.max.toFixed(1)})`);
  lines.push(`rollRate avg ${avg.rollRate.toFixed(0)}°/s (min ${stats.rollRate.min.toFixed(0)} max ${stats.rollRate.max.toFixed(0)})`);
  lines.push(`pitchRate avg ${avg.pitchRate.toFixed(0)}°/s (min ${stats.pitchRate.min.toFixed(0)} max ${stats.pitchRate.max.toFixed(0)})`);
  lines.push(`stall avg ${(avg.stall * 100).toFixed(0)}% (max ${(stats.stall.max * 100).toFixed(0)}%)`);
  return lines.join('\n');
}

function run() {
  const results = [];

  // Trimmed level flight
  results.push(runScenario('trim-level', 8, (time, controller) => {
    controller.throttle = 0;
    controller.boost = false;
    controller.stickX = 0;
    controller.stickY = 0;
  }));

  // Max pitch pull for 2s, then neutral
  results.push(runScenario('pitch-pull', 4, (time, controller) => {
    controller.throttle = 0;
    controller.boost = false;
    controller.stickX = 0;
    controller.stickY = time < 2 ? 0.9 : 0;
  }));

  // Max roll for 2s
  results.push(runScenario('roll-right', 3, (time, controller) => {
    controller.throttle = 0;
    controller.boost = false;
    controller.stickX = time < 2 ? 1 : 0;
    controller.stickY = 0;
  }));

  // Afterburner acceleration
  results.push(runScenario('afterburner', 5, (time, controller) => {
    controller.throttle = 1;
    controller.boost = true;
    controller.stickX = 0;
    controller.stickY = 0;
  }));

  const checks = [];
  const trim = results[0];
  checks.push(check('trim-speed', trim.avg.speed, 220, 300));
  checks.push(check('trim-g', trim.avg.g, 0.85, 1.25));
  checks.push(check('trim-aoa', trim.avg.aoa, -2, 6));

  const pull = results[1];
  checks.push(check('pull-max-g', pull.stats.g.max, 3.5, 9));
  checks.push(check('pull-stall', pull.stats.stall.max, 0, 0.45));

  const roll = results[2];
  checks.push(check('roll-rate', roll.stats.rollRate.max, 140, 260));

  const ab = results[3];
  checks.push(check('afterburner-speed', ab.stats.speed.max, 360, 520));

  let pass = true;
  for (const entry of checks) {
    if (!entry.ok) pass = false;
  }

  console.log('Flight control physics smoke test');
  for (const result of results) {
    console.log(reportScenario(result));
  }

  console.log('\nChecks');
  for (const entry of checks) {
    console.log(`${entry.ok ? 'OK ' : 'FAIL'} ${entry.label}: ${entry.value.toFixed(2)} (expected ${entry.min}-${entry.max})`);
  }

  if (!pass) {
    process.exitCode = 1;
  }
}

run();
