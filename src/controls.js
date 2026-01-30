import * as THREE from 'three';

const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;

function damp(value, target, lambda, dt) {
  return THREE.MathUtils.damp(value, target, lambda, dt);
}

function dampVector(current, target, lambda, dt) {
  const t = 1 - Math.exp(-lambda * dt);
  current.lerp(target, t);
}

function toDeg(value) {
  return value * THREE.MathUtils.RAD2DEG;
}

export class FlightController {
  constructor(airplane, camera) {
    this.airplane = airplane;
    this.camera = camera;

    // Inputs
    this.throttle = 0;
    this.yawInput = 0;
    this.boost = false;
    this.invertY = false;

    // Virtual stick (mouse)
    this.stickX = 0;
    this.stickY = 0;

    // Flight state
    this.pitch = 0;
    this.roll = 0;
    this.yaw = 0;

    // Speed targets
    this.minSpeed = 70;
    this.stallSpeed = 95;
    this.cruiseSpeed = 260;
    this.maxSpeed = 360;
    this.afterburnerSpeed = 470;
    this.speed = this.cruiseSpeed;

    // Angular rates (rad/s)
    this.pitchRate = 0;
    this.rollRate = 0;
    this.yawRate = 0;

    // Input shaping
    this.mouseSensitivity = 0.0022;
    this.stickReturn = 7.0;
    this.inputExpo = 0.35;

    // Rate limits
    this.maxPitchRate = THREE.MathUtils.degToRad(220);
    this.maxRollRate = THREE.MathUtils.degToRad(300);
    this.maxYawRate = THREE.MathUtils.degToRad(120);

    // Control response (rate controller)
    this.pitchResponse = 7.5;
    this.rollResponse = 9.0;
    this.yawResponse = 5.5;

    // Stability and damping
    this.rollStability = 2.6;
    this.alphaStability = 2.2;
    this.betaStability = 2.0;
    this.rollToYaw = 0.9;
    this.yawDamping = 1.8;
    this.pitchDamping = 2.8;
    this.rollDamping = 2.4;

    // Flight path hold
    this.flightPathHoldGain = 1.6;
    this.flightPathHoldMax = THREE.MathUtils.degToRad(10);

    // AoA limiter
    this.aoaLimit = THREE.MathUtils.degToRad(18);
    this.aoaLimiterGain = 14.0;

    // Aerodynamics
    this.gravity = 9.81;
    this.liftScalar = 0.0010;
    this.dragScalar = 0.00125;
    this.sideScalar = 0.0007;
    this.cl0 = 0.2;
    this.clAlpha = 4.8;
    this.clMax = 1.5;
    this.cd0 = 0.02;
    this.cdAlpha = 0.3;
    this.cdInduced = 0.12;
    this.stallAoA = THREE.MathUtils.degToRad(18);
    this.stallFade = THREE.MathUtils.degToRad(12);
    this.stallDrag = 0.7;
    this.cyBeta = 0.8;
    this.cyMax = 1.0;

    // Thrust / throttle
    this.throttleSetting = 0.6;
    this.throttleRate = 0.55;
    this.idleThrust = 2.0;
    this.maxThrust = 15.0;
    this.afterburnerThrust = 12.0;

    // Afterburner
    this.afterburnerFuel = 1.0;
    this.afterburnerActive = false;
    this.afterburnerBurnRate = 0.28;
    this.afterburnerRegenRate = 0.18;

    // Alignment helper
    this.velocityAlign = 0.35;

    // G-force
    this.gForceSmoothed = 1.0;

    // Camera
    this.cameraMode = 0;
    this.cameraLag = 6.0;
    this.cameraOffset = new THREE.Vector3();
    this.cameraTarget = new THREE.Vector3();

    // Telemetry
    this.telemetry = {
      speed: this.speed,
      throttle: this.throttleSetting,
      thrust: 0,
      aoa: 0,
      beta: 0,
      gForce: 1,
      cl: 0,
      cd: 0,
      cy: 0,
      lift: 0,
      drag: 0,
      side: 0,
      stall: 0,
      authority: 0,
      pitchRate: 0,
      rollRate: 0,
      yawRate: 0
    };

    // Internal caches
    this._forward = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._velocity = new THREE.Vector3(0, 0, -1).multiplyScalar(this.cruiseSpeed);
    this._prevVelocity = this._velocity.clone();
    this._accel = new THREE.Vector3();
    this._temp = new THREE.Vector3();
    this._temp2 = new THREE.Vector3();
    this._velLocal = new THREE.Vector3();
    this._liftDir = new THREE.Vector3();
    this._sideDir = new THREE.Vector3();
    this._specificForce = new THREE.Vector3();
    this._gravityVec = new THREE.Vector3(0, this.gravity, 0);
    this._quat = new THREE.Quaternion();
    this._invQuat = new THREE.Quaternion();
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');

    this.setCameraMode(0);
  }

  setInvertY(enabled) {
    this.invertY = Boolean(enabled);
  }

  setCameraMode(mode) {
    this.cameraMode = mode;
  }

  handleMouseMove(dx, dy) {
    const pitchDir = this.invertY ? 1 : -1;
    this.stickX = clamp(this.stickX + dx * this.mouseSensitivity, -1, 1);
    this.stickY = clamp(this.stickY + dy * this.mouseSensitivity * pitchDir, -1, 1);
  }

  getAfterburnerPercent() {
    return this.afterburnerFuel;
  }

  update(delta) {
    if (!delta || !Number.isFinite(delta)) return;
    const dt = Math.min(delta, 0.05);

    // Re-center virtual stick
    this.stickX = damp(this.stickX, 0, this.stickReturn, dt);
    this.stickY = damp(this.stickY, 0, this.stickReturn, dt);

    const deadzone = 0.02;
    const rollInput = Math.abs(this.stickX) < deadzone ? 0 : this.stickX;
    const pitchInput = Math.abs(this.stickY) < deadzone ? 0 : this.stickY;
    const rollShaped = Math.sign(rollInput) * Math.pow(Math.abs(rollInput), 1 + this.inputExpo);
    const pitchShaped = Math.sign(pitchInput) * Math.pow(Math.abs(pitchInput), 1 + this.inputExpo);

    // Axes and local velocity for AoA/beta
    this._right.set(1, 0, 0).applyQuaternion(this.airplane.quaternion);
    this._up.set(0, 1, 0).applyQuaternion(this.airplane.quaternion);
    this._forward.set(0, 0, -1).applyQuaternion(this.airplane.quaternion);

    const speed = this._velocity.length();
    this._invQuat.copy(this.airplane.quaternion).invert();
    this._velLocal.copy(this._velocity).applyQuaternion(this._invQuat);
    const aoa = Math.atan2(-this._velLocal.y, -this._velLocal.z);
    const beta = Math.atan2(this._velLocal.x, -this._velLocal.z);

    const authority = clamp(speed / this.cruiseSpeed, 0.35, 1.4);

    // Rate command control
    const desiredRollRate = rollShaped * this.maxRollRate * authority;
    let desiredPitchRate = pitchShaped * this.maxPitchRate * authority;
    const desiredYawRate = this.yawInput * this.maxYawRate * authority;

    if (aoa > this.aoaLimit) desiredPitchRate = Math.min(desiredPitchRate, 0);
    if (aoa < -this.aoaLimit) desiredPitchRate = Math.max(desiredPitchRate, 0);

    let rollAccel = (desiredRollRate - this.rollRate) * this.rollResponse;
    let pitchAccel = (desiredPitchRate - this.pitchRate) * this.pitchResponse;
    let yawAccel = (desiredYawRate - this.yawRate) * this.yawResponse;

    // Stability derivatives
    rollAccel += -this.roll * this.rollStability - this.rollRate * this.rollDamping;
    pitchAccel += -aoa * this.alphaStability - this.pitchRate * this.pitchDamping;
    yawAccel += -beta * this.betaStability - this.yawRate * this.yawDamping;

    // Coordinated yaw
    yawAccel += this.rollRate * this.rollToYaw * authority;

    // Flight path hold when neutral
    const horizSpeed = Math.max(Math.hypot(this._velocity.x, this._velocity.z), 1);
    const flightPathAngle = Math.atan2(this._velocity.y, horizSpeed);
    const holdBlend = clamp(1 - Math.abs(pitchShaped) * 1.6, 0, 1);
    const holdCorrection = clamp(-flightPathAngle * this.flightPathHoldGain, -this.flightPathHoldMax, this.flightPathHoldMax);
    pitchAccel += holdCorrection * holdBlend;

    // AoA limiter
    if (aoa > this.aoaLimit) {
      pitchAccel += (this.aoaLimit - aoa) * this.aoaLimiterGain;
    } else if (aoa < -this.aoaLimit) {
      pitchAccel += (-this.aoaLimit - aoa) * this.aoaLimiterGain;
    }

    // Integrate angular rates
    this.rollRate += rollAccel * dt;
    this.pitchRate += pitchAccel * dt;
    this.yawRate += yawAccel * dt;

    this.rollRate = clamp(this.rollRate, -this.maxRollRate, this.maxRollRate);
    this.pitchRate = clamp(this.pitchRate, -this.maxPitchRate, this.maxPitchRate);
    this.yawRate = clamp(this.yawRate, -this.maxYawRate, this.maxYawRate);

    // Update orientation
    if (this.pitchRate !== 0) {
      this._quat.setFromAxisAngle(this._right, this.pitchRate * dt);
      this.airplane.quaternion.multiply(this._quat);
    }
    if (this.rollRate !== 0) {
      this._quat.setFromAxisAngle(this._forward, this.rollRate * dt);
      this.airplane.quaternion.multiply(this._quat);
    }
    if (this.yawRate !== 0) {
      this._quat.setFromAxisAngle(this._up, this.yawRate * dt);
      this.airplane.quaternion.multiply(this._quat);
    }

    // Extract angles for HUD
    this._euler.setFromQuaternion(this.airplane.quaternion, 'YXZ');
    this.pitch = this._euler.x;
    this.yaw = this._euler.y;
    this.roll = this._euler.z;

    // Afterburner and throttle
    const wantsAfterburner = this.boost && this.afterburnerFuel > 0.02;
    this.afterburnerActive = wantsAfterburner;
    if (wantsAfterburner) {
      this.afterburnerFuel = Math.max(0, this.afterburnerFuel - this.afterburnerBurnRate * dt);
    } else {
      this.afterburnerFuel = Math.min(1, this.afterburnerFuel + this.afterburnerRegenRate * dt);
    }

    if (this.throttle > 0) {
      this.throttleSetting = clamp(this.throttleSetting + this.throttleRate * dt, 0, 1);
    } else if (this.throttle < 0) {
      this.throttleSetting = clamp(this.throttleSetting - this.throttleRate * dt, 0, 1);
    }

    // Recompute axes after rotation
    this._right.set(1, 0, 0).applyQuaternion(this.airplane.quaternion);
    this._up.set(0, 1, 0).applyQuaternion(this.airplane.quaternion);
    this._forward.set(0, 0, -1).applyQuaternion(this.airplane.quaternion);

    // Aerodynamic forces
    const newSpeed = Math.max(this._velocity.length(), 1);
    const q = newSpeed * newSpeed;

    this._invQuat.copy(this.airplane.quaternion).invert();
    this._velLocal.copy(this._velocity).applyQuaternion(this._invQuat);
    const aoaNow = Math.atan2(-this._velLocal.y, -this._velLocal.z);
    const betaNow = Math.atan2(this._velLocal.x, -this._velLocal.z);

    const aoaAbs = Math.abs(aoaNow);
    const stallT = clamp((aoaAbs - this.stallAoA) / this.stallFade, 0, 1);
    let cl = this.cl0 + this.clAlpha * aoaNow;
    cl = clamp(cl, -this.clMax, this.clMax);
    cl = lerp(cl, cl * 0.35, stallT);

    const cd = this.cd0 + this.cdAlpha * aoaAbs + this.cdInduced * cl * cl + stallT * this.stallDrag;
    const cy = clamp(betaNow * this.cyBeta, -this.cyMax, this.cyMax);

    const velDir = this._temp.copy(this._velocity).normalize();

    this._liftDir.copy(this._up).addScaledVector(velDir, -this._up.dot(velDir));
    if (this._liftDir.lengthSq() > 0.0001) this._liftDir.normalize();

    this._sideDir.copy(this._right).addScaledVector(velDir, -this._right.dot(velDir));
    if (this._sideDir.lengthSq() > 0.0001) this._sideDir.normalize();

    const liftAccel = this.liftScalar * q * cl;
    const dragAccel = this.dragScalar * q * cd;
    const sideAccel = this.sideScalar * q * cy;

    this._accel.set(0, 0, 0);
    this._accel.addScaledVector(this._liftDir, liftAccel);
    this._accel.addScaledVector(velDir, -dragAccel);
    this._accel.addScaledVector(this._sideDir, sideAccel);

    const thrustBase = lerp(this.idleThrust, this.maxThrust, this.throttleSetting);
    const thrust = thrustBase + (this.afterburnerActive ? this.afterburnerThrust : 0);
    this._accel.addScaledVector(this._forward, thrust);

    // Alignment helper for responsive nose
    this._temp.copy(this._forward).multiplyScalar(newSpeed).sub(this._velocity);
    this._accel.addScaledVector(this._temp, this.velocityAlign * authority);

    // Gravity
    this._accel.y -= this.gravity;

    // Integrate velocity & position
    this._velocity.addScaledVector(this._accel, dt);

    const clampedSpeed = this._velocity.length();
    if (clampedSpeed < this.minSpeed) this._velocity.setLength(this.minSpeed);
    if (clampedSpeed > this.afterburnerSpeed * 1.1) this._velocity.setLength(this.afterburnerSpeed * 1.1);

    this.speed = this._velocity.length();
    this.airplane.position.addScaledVector(this._velocity, dt);

    // G-force estimate
    this._temp.copy(this._velocity).sub(this._prevVelocity).multiplyScalar(1 / dt);
    this._specificForce.copy(this._temp).add(this._gravityVec);
    const gForce = this._specificForce.dot(this._up) / this.gravity;
    this.gForceSmoothed = damp(this.gForceSmoothed, clamp(gForce, -2, 9), 6, dt);
    this._prevVelocity.copy(this._velocity);

    // Telemetry
    this.telemetry.speed = this.speed;
    this.telemetry.throttle = this.throttleSetting;
    this.telemetry.thrust = thrust;
    this.telemetry.aoa = aoaNow;
    this.telemetry.beta = betaNow;
    this.telemetry.gForce = this.gForceSmoothed;
    this.telemetry.cl = cl;
    this.telemetry.cd = cd;
    this.telemetry.cy = cy;
    this.telemetry.lift = liftAccel;
    this.telemetry.drag = dragAccel;
    this.telemetry.side = sideAccel;
    this.telemetry.stall = stallT;
    this.telemetry.authority = authority;
    this.telemetry.pitchRate = this.pitchRate;
    this.telemetry.rollRate = this.rollRate;
    this.telemetry.yawRate = this.yawRate;

    // Camera update
    this.updateCamera(dt);
  }

  updateCamera(dt) {
    const forward = this._forward;
    const up = this._up;
    const right = this._right;

    if (this.cameraMode === 0) {
      this.cameraOffset.copy(forward).multiplyScalar(-38);
      this.cameraOffset.addScaledVector(up, 12);
      this.cameraOffset.addScaledVector(right, 2);
      this.cameraTarget.copy(this.airplane.position).addScaledVector(forward, 40);
    } else if (this.cameraMode === 1) {
      this.cameraOffset.copy(forward).multiplyScalar(1.8);
      this.cameraOffset.addScaledVector(up, 1.2);
      this.cameraTarget.copy(this.airplane.position).addScaledVector(forward, 120);
    } else {
      this.cameraOffset.copy(right).multiplyScalar(18);
      this.cameraOffset.addScaledVector(up, 6);
      this.cameraOffset.addScaledVector(forward, -6);
      this.cameraTarget.copy(this.airplane.position).addScaledVector(forward, 30);
    }

    this.cameraOffset.add(this.airplane.position);
    dampVector(this.camera.position, this.cameraOffset, this.cameraLag, dt);

    if (this.cameraMode === 1) {
      this.camera.quaternion.slerp(this.airplane.quaternion, 1 - Math.exp(-dt * 10));
    } else {
      this.camera.lookAt(this.cameraTarget);
    }

    const targetFov = this.afterburnerActive ? 82 : 75;
    this.camera.fov = damp(this.camera.fov, targetFov, 4, dt);
    this.camera.updateProjectionMatrix();
  }
}

export { toDeg };
