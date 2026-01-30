import * as THREE from 'three';
import { getTerrainHeight } from './terrain.js';

export class FlightController {
  constructor(airplane, camera) {
    this.airplane = airplane;
    this.camera = camera;

    // Flight state
    this.speed = 120.0;
    this.minSpeed = 60.0;
    this.cruiseSpeed = 120.0;
    this.maxSpeed = 280.0;
    this.afterburnerSpeed = 420.0;

    // Control inputs
    this.throttle = 0;      // W/S for throttle
    this.yawInput = 0;      // A/D for yaw (rudder)
    this.boost = false;     // Shift for afterburner
    this.invertY = false;   // Mouse invert option

    // Afterburner system
    this.afterburnerFuel = 100;
    this.afterburnerMaxFuel = 100;
    this.afterburnerDrain = 25;
    this.afterburnerRecharge = 15;
    this.afterburnerActive = false;

    // Orientation (euler angles)
    this.pitch = 0;
    this.yaw = 0;
    this.roll = 0;

    // Mouse input accumulation
    this.mouseX = 0;
    this.mouseY = 0;

    // Sensitivity
    this.mouseSensitivity = 0.0025;
    this.fpsSensitivity = 0.0015;

    // Rates (radians/sec)
    this.pitchRate = 2.4;
    this.rollRate = 3.8;
    this.yawRate = 1.4;

    // Auto-leveling
    this.autoLevelRoll = 0.8;
    this.autoLevelPitch = 0.35;

    // Limits
    this.maxPitch = Math.PI / 2.2;
    this.maxRoll = Math.PI * 0.9;

    // Physics
    this.gravity = 35.0;
    this.velocityAlign = 3.0;
    this.velocity = new THREE.Vector3();
    this.minAltitude = 5;

    // Acceleration
    this.accel = 55.0;
    this.decel = 70.0;
    this.afterburnerAccel = 110.0;

    // G-force tracking
    this.gForce = 1.0;
    this.maxGForce = 6.0;
    this.gForceSmoothed = 1.0;

    // Camera settings
    this.cameraMode = 0;
    this.baseFOV = 75;
    this.boostFOV = 100;
    this.currentFOV = 75;
  }

  setCameraMode(mode) {
    this.cameraMode = mode;
  }

  setInvertY(enabled) {
    this.invertY = Boolean(enabled);
  }

  handleMouseMove(movementX, movementY) {
    const sensitivity = this.cameraMode === 1 ? this.fpsSensitivity : this.mouseSensitivity;
    const invertMultiplier = this.invertY ? -1 : 1;

    this.mouseX += movementX * sensitivity;
    this.mouseY += movementY * sensitivity * invertMultiplier;
  }

  update(delta) {
    if (!delta) return;

    // Afterburner
    if (this.boost && this.afterburnerFuel > 0) {
      this.afterburnerActive = true;
      this.afterburnerFuel = Math.max(0, this.afterburnerFuel - this.afterburnerDrain * delta);
    } else {
      this.afterburnerActive = false;
      this.afterburnerFuel = Math.min(this.afterburnerMaxFuel, this.afterburnerFuel + this.afterburnerRecharge * delta);
    }

    // Speed
    let targetSpeed = this.cruiseSpeed;
    if (this.throttle > 0) {
      targetSpeed = THREE.MathUtils.lerp(this.cruiseSpeed, this.maxSpeed, this.throttle);
    } else if (this.throttle < 0) {
      targetSpeed = THREE.MathUtils.lerp(this.cruiseSpeed, this.minSpeed, -this.throttle);
    }
    if (this.afterburnerActive) {
      targetSpeed = this.afterburnerSpeed;
    }

    const accel = this.afterburnerActive ? this.afterburnerAccel : this.accel;
    if (targetSpeed > this.speed) {
      this.speed = Math.min(targetSpeed, this.speed + accel * delta);
    } else {
      this.speed = Math.max(targetSpeed, this.speed - this.decel * delta);
    }

    // Control axes
    const pitchAxis = THREE.MathUtils.clamp(-this.mouseY, -1, 1);
    const rollAxis = THREE.MathUtils.clamp(-this.mouseX, -1, 1);
    const yawAxis = THREE.MathUtils.clamp(this.yawInput, -1, 1);

    this.pitch += pitchAxis * this.pitchRate * delta;
    this.roll += rollAxis * this.rollRate * delta;
    this.yaw += yawAxis * this.yawRate * delta;

    // Auto-level when no input
    if (Math.abs(pitchAxis) < 0.01) {
      this.pitch = THREE.MathUtils.lerp(this.pitch, 0, delta * this.autoLevelPitch);
    }
    if (Math.abs(rollAxis) < 0.01) {
      this.roll = THREE.MathUtils.lerp(this.roll, 0, delta * this.autoLevelRoll);
    }

    // Clamp angles
    this.pitch = THREE.MathUtils.clamp(this.pitch, -this.maxPitch, this.maxPitch);
    this.roll = THREE.MathUtils.clamp(this.roll, -this.maxRoll, this.maxRoll);

    if (this.yaw > Math.PI) this.yaw -= Math.PI * 2;
    if (this.yaw < -Math.PI) this.yaw += Math.PI * 2;

    // Reset mouse deltas
    this.mouseX = 0;
    this.mouseY = 0;

    // G-force (simple approximation)
    const turnRate = Math.abs(pitchAxis) * this.pitchRate + Math.abs(rollAxis) * this.rollRate + Math.abs(yawAxis) * this.yawRate;
    this.gForce = 1.0 + turnRate * (this.speed / this.cruiseSpeed) * 0.2;
    this.gForce = Math.min(this.gForce, this.maxGForce);
    this.gForceSmoothed = THREE.MathUtils.lerp(this.gForceSmoothed, this.gForce, delta * 6);

    // Rotation
    const euler = new THREE.Euler(this.pitch, this.yaw, this.roll, 'YXZ');
    this.airplane.quaternion.setFromEuler(euler);

    // Velocity & gravity
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.airplane.quaternion);
    const desiredVelocity = forward.multiplyScalar(this.speed);
    this.velocity.lerp(desiredVelocity, delta * this.velocityAlign);
    this.velocity.y -= this.gravity * delta;

    this.airplane.position.addScaledVector(this.velocity, delta);

    // Ground collision
    const groundHeight = getTerrainHeight(this.airplane.position.x, this.airplane.position.z);
    const minHeight = groundHeight + this.minAltitude;
    if (this.airplane.position.y < minHeight) {
      this.airplane.position.y = minHeight;
      if (this.velocity.y < 0) this.velocity.y = 0;
    }

    // Ceiling
    if (this.airplane.position.y > 400) {
      this.airplane.position.y = 400;
      if (this.velocity.y > 0) this.velocity.y = 0;
    }

    // Camera
    this.updateCamera(delta);

    // FOV effect
    let targetFOV = this.baseFOV;
    const speedFOV = (this.speed - this.cruiseSpeed) / (this.afterburnerSpeed - this.cruiseSpeed) * 12;
    targetFOV += speedFOV;
    if (this.afterburnerActive) {
      targetFOV = this.boostFOV;
    }

    this.currentFOV = THREE.MathUtils.lerp(this.currentFOV, targetFOV, delta * 6);
    this.camera.fov = this.currentFOV;
    this.camera.updateProjectionMatrix();
  }

  updateCamera(delta) {
    const shakeIntensity = (this.gForceSmoothed - 1) * 0.02;
    const shake = new THREE.Vector3(
      (Math.random() - 0.5) * shakeIntensity,
      (Math.random() - 0.5) * shakeIntensity,
      (Math.random() - 0.5) * shakeIntensity
    );

    if (this.cameraMode === 0) {
      const baseDistance = 16;
      const speedDistance = (this.speed / this.cruiseSpeed - 1) * 4;
      const distance = baseDistance + speedDistance;

      const offset = new THREE.Vector3(0, 5, distance);
      const yawQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, this.yaw, 0));
      offset.applyQuaternion(yawQuat);
      offset.y += Math.sin(this.pitch) * 2;

      const targetPos = this.airplane.position.clone().add(offset);
      const lagFactor = 4 + (this.speed / this.afterburnerSpeed) * 4;
      this.camera.position.lerp(targetPos, delta * lagFactor);
      this.camera.position.add(shake);

      const lookTarget = this.airplane.position.clone();
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.airplane.quaternion);
      lookTarget.add(forward.multiplyScalar(5));
      this.camera.lookAt(lookTarget);
    } else if (this.cameraMode === 1) {
      const offset = new THREE.Vector3(0, 0.5, -1);
      offset.applyQuaternion(this.airplane.quaternion);
      this.camera.position.copy(this.airplane.position).add(offset);
      this.camera.position.add(shake.multiplyScalar(2));
      this.camera.quaternion.copy(this.airplane.quaternion);
    } else if (this.cameraMode === 2) {
      const offset = new THREE.Vector3(12, 4, 8);
      const yawQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, this.yaw, 0));
      offset.applyQuaternion(yawQuat);

      const targetPos = this.airplane.position.clone().add(offset);
      this.camera.position.lerp(targetPos, delta * 5);
      this.camera.position.add(shake);
      this.camera.lookAt(this.airplane.position);
    }
  }

  getAfterburnerPercent() {
    return this.afterburnerFuel / this.afterburnerMaxFuel;
  }
}
