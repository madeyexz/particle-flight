import * as THREE from 'three';
import { getTerrainHeight } from './terrain.js';

export class FlightController {
  constructor(airplane, camera) {
    this.airplane = airplane;
    this.camera = camera;

    // BF2042-style flight state
    this.speed = 120.0;
    this.minSpeed = 60.0;
    this.cruiseSpeed = 120.0;
    this.maxSpeed = 280.0;
    this.afterburnerSpeed = 420.0;

    // FOV for speed effect
    this.baseFOV = 75;
    this.boostFOV = 105;
    this.currentFOV = 75;

    // Control inputs
    this.throttle = 0;      // W/S for throttle
    this.rollInput = 0;     // A/D for roll
    this.boost = false;     // Shift for afterburner

    // Afterburner system
    this.afterburnerFuel = 100;
    this.afterburnerMaxFuel = 100;
    this.afterburnerDrain = 25;    // Per second when active
    this.afterburnerRecharge = 15; // Per second when inactive
    this.afterburnerActive = false;

    // Flight orientation (euler angles)
    this.pitch = 0;
    this.yaw = 0;
    this.roll = 0;

    // Angular velocities (momentum)
    this.pitchVelocity = 0;
    this.yawVelocity = 0;
    this.rollVelocity = 0;

    // Mouse input (pitch and yaw control)
    this.mouseX = 0;
    this.mouseY = 0;

    // Sensitivity
    this.mouseSensitivity = 0.0025;
    this.fpsSensitivity = 0.0015;

    // BF2042-style physics tuning
    this.pitchRate = 2.2;          // Base pitch rate
    this.yawRate = 0.8;            // Base yaw rate (slower than pitch)
    this.rollRate = 3.5;           // Roll rate
    this.angularDamping = 2.5;     // How fast rotation slows
    this.autoLevelRoll = 0.3;      // Auto-level roll strength
    this.autoLevelPitch = 0.15;    // Auto-level pitch strength

    // Speed affects handling
    this.speedHandlingMin = 0.5;   // Handling at max speed
    this.speedHandlingMax = 1.3;   // Handling at min speed

    // Gravity and lift
    this.gravity = 15.0;           // Downward force
    this.liftCoefficient = 1.2;    // How much speed generates lift

    // G-force tracking
    this.gForce = 1.0;
    this.maxGForce = 6.0;
    this.gForceSmoothed = 1.0;

    // Speed bleed in turns
    this.turnSpeedBleed = 0.15;    // Speed lost per second when turning hard

    // Limits
    this.maxPitch = Math.PI / 2.5;
    this.maxRoll = Math.PI * 0.8;  // Almost full roll allowed

    // Camera settings
    this.cameraMode = 0;
    this.cameraShake = 0;
    this.cameraLag = new THREE.Vector3();

    // Velocity vector (for momentum)
    this.velocity = new THREE.Vector3();
    this.minAltitude = 5;
  }

  setCameraMode(mode) {
    this.cameraMode = mode;
  }

  handleMouseMove(movementX, movementY) {
    const sensitivity = this.cameraMode === 1 ? this.fpsSensitivity : this.mouseSensitivity;

    // Accumulate mouse input
    this.mouseX += movementX * sensitivity;
    this.mouseY += movementY * sensitivity;
  }

  // Calculate handling modifier based on speed (faster = less agile)
  getSpeedHandling() {
    const speedRatio = (this.speed - this.minSpeed) / (this.maxSpeed - this.minSpeed);
    return THREE.MathUtils.lerp(this.speedHandlingMax, this.speedHandlingMin, speedRatio);
  }

  update(delta) {
    const handling = this.getSpeedHandling();

    // === AFTERBURNER SYSTEM ===
    if (this.boost && this.afterburnerFuel > 0) {
      this.afterburnerActive = true;
      this.afterburnerFuel -= this.afterburnerDrain * delta;
      this.afterburnerFuel = Math.max(0, this.afterburnerFuel);
    } else {
      this.afterburnerActive = false;
      this.afterburnerFuel += this.afterburnerRecharge * delta;
      this.afterburnerFuel = Math.min(this.afterburnerMaxFuel, this.afterburnerFuel);
    }

    // === SPEED CONTROL ===
    let targetSpeed = this.cruiseSpeed;

    // Throttle affects speed
    if (this.throttle > 0) {
      targetSpeed = THREE.MathUtils.lerp(this.cruiseSpeed, this.maxSpeed, this.throttle);
    } else if (this.throttle < 0) {
      targetSpeed = THREE.MathUtils.lerp(this.cruiseSpeed, this.minSpeed, -this.throttle);
    }

    // Afterburner
    if (this.afterburnerActive) {
      targetSpeed = this.afterburnerSpeed;
    }

    // Pitch affects speed (diving gains, climbing loses)
    const pitchSpeedEffect = Math.sin(this.pitch) * 30;
    targetSpeed += pitchSpeedEffect;

    // Turn speed bleed (pulling hard costs speed)
    const turnIntensity = Math.abs(this.pitchVelocity) + Math.abs(this.rollVelocity) * 0.5;
    const speedBleed = turnIntensity * this.turnSpeedBleed * this.speed * delta;

    // Smooth speed change with momentum
    const speedAccel = this.afterburnerActive ? 80 : 40;
    this.speed = THREE.MathUtils.lerp(this.speed, targetSpeed, delta * 1.5);
    this.speed -= speedBleed;
    this.speed = THREE.MathUtils.clamp(this.speed, this.minSpeed, this.afterburnerActive ? this.afterburnerSpeed : this.maxSpeed);

    // === ANGULAR MOMENTUM SYSTEM ===

    // Mouse Y controls pitch (pull back = pitch up)
    const pitchInput = -this.mouseY * this.pitchRate * handling;
    this.pitchVelocity += pitchInput;

    // Mouse X controls yaw (direct) + induces roll
    const yawInput = -this.mouseX * this.yawRate * handling;
    this.yawVelocity += yawInput;

    // A/D controls roll directly
    const rollInput = this.rollInput * this.rollRate * handling;
    this.rollVelocity += rollInput * delta * 60;

    // Roll from yaw input (banking into turns like BF2042)
    this.rollVelocity += this.mouseX * 1.5 * handling;

    // Angular damping (momentum decay)
    this.pitchVelocity *= Math.pow(0.1, delta * this.angularDamping);
    this.yawVelocity *= Math.pow(0.1, delta * this.angularDamping);
    this.rollVelocity *= Math.pow(0.1, delta * this.angularDamping * 0.8);

    // Apply angular velocities
    this.pitch += this.pitchVelocity * delta;
    this.yaw += this.yawVelocity * delta;
    this.roll += this.rollVelocity * delta;

    // Auto-level roll when not inputting
    if (Math.abs(this.mouseX) < 0.01 && Math.abs(this.rollInput) < 0.1) {
      this.roll = THREE.MathUtils.lerp(this.roll, 0, delta * this.autoLevelRoll);
    }

    // Slight auto-level pitch when not inputting
    if (Math.abs(this.mouseY) < 0.01) {
      this.pitch = THREE.MathUtils.lerp(this.pitch, 0, delta * this.autoLevelPitch);
    }

    // Clamp angles
    this.pitch = THREE.MathUtils.clamp(this.pitch, -this.maxPitch, this.maxPitch);
    this.roll = THREE.MathUtils.clamp(this.roll, -this.maxRoll, this.maxRoll);

    // Decay mouse input
    this.mouseX *= 0.75;
    this.mouseY *= 0.8;

    // === CALCULATE G-FORCE ===
    const angularIntensity = Math.abs(this.pitchVelocity) * 2 + Math.abs(this.yawVelocity);
    this.gForce = 1.0 + angularIntensity * (this.speed / this.cruiseSpeed) * 0.5;
    this.gForce = Math.min(this.gForce, this.maxGForce);
    this.gForceSmoothed = THREE.MathUtils.lerp(this.gForceSmoothed, this.gForce, delta * 8);

    // === BUILD ROTATION ===
    const euler = new THREE.Euler(this.pitch, this.yaw, this.roll, 'YXZ');
    this.airplane.quaternion.setFromEuler(euler);

    // === VELOCITY WITH GRAVITY ===
    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyQuaternion(this.airplane.quaternion);

    // Base velocity from direction
    this.velocity.copy(forward).multiplyScalar(this.speed);

    // Gravity (constant downward pull)
    const lift = this.speed / this.cruiseSpeed * this.liftCoefficient;
    const effectiveGravity = this.gravity * (1 - Math.min(lift, 1) * 0.7);
    this.velocity.y -= effectiveGravity * delta * 10;

    // Update position
    this.airplane.position.add(this.velocity.clone().multiplyScalar(delta));

    // === GROUND COLLISION ===
    const groundHeight = getTerrainHeight(this.airplane.position.x, this.airplane.position.z);
    const minHeight = groundHeight + this.minAltitude;

    if (this.airplane.position.y < minHeight) {
      this.airplane.position.y = minHeight;
      // Bounce pitch up when scraping ground
      if (this.pitch > -0.1) {
        this.pitchVelocity = -1.5;
      }
    }

    // Ceiling
    if (this.airplane.position.y > 400) {
      this.airplane.position.y = 400;
      if (this.pitch < 0) {
        this.pitchVelocity = 0.5;
      }
    }

    // === CAMERA ===
    this.updateCamera(delta);

    // FOV effect (speed + G-force)
    let targetFOV = this.baseFOV;
    const speedFOV = (this.speed - this.cruiseSpeed) / (this.afterburnerSpeed - this.cruiseSpeed) * 20;
    const gForceFOV = (this.gForceSmoothed - 1) * 5;
    targetFOV += speedFOV + gForceFOV;

    if (this.afterburnerActive) {
      targetFOV = this.boostFOV;
    }

    this.currentFOV = THREE.MathUtils.lerp(this.currentFOV, targetFOV, delta * 6);
    this.camera.fov = this.currentFOV;
    this.camera.updateProjectionMatrix();
  }

  updateCamera(delta) {
    // Camera shake from G-force
    const shakeIntensity = (this.gForceSmoothed - 1) * 0.02;
    const shake = new THREE.Vector3(
      (Math.random() - 0.5) * shakeIntensity,
      (Math.random() - 0.5) * shakeIntensity,
      (Math.random() - 0.5) * shakeIntensity
    );

    if (this.cameraMode === 0) {
      // Third person - BF2042 style with lag
      const baseDistance = 16;
      const speedDistance = (this.speed / this.cruiseSpeed - 1) * 4;
      const distance = baseDistance + speedDistance;

      const offset = new THREE.Vector3(0, 5, distance);

      // Camera follows yaw with slight lag
      const yawQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, this.yaw, 0));
      offset.applyQuaternion(yawQuat);

      // Add slight pitch influence for dynamic feel
      offset.y += Math.sin(this.pitch) * 2;

      const targetPos = this.airplane.position.clone().add(offset);

      // Lag based on speed (faster = more lag)
      const lagFactor = 4 + (this.speed / this.afterburnerSpeed) * 4;
      this.camera.position.lerp(targetPos, delta * lagFactor);

      // Add shake
      this.camera.position.add(shake);

      // Look ahead of the plane
      const lookTarget = this.airplane.position.clone();
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.airplane.quaternion);
      lookTarget.add(forward.multiplyScalar(5));
      this.camera.lookAt(lookTarget);

    } else if (this.cameraMode === 1) {
      // Cockpit - locked to plane with G-force effects
      const offset = new THREE.Vector3(0, 0.5, -1);
      offset.applyQuaternion(this.airplane.quaternion);
      this.camera.position.copy(this.airplane.position).add(offset);

      // Add enhanced shake in cockpit
      this.camera.position.add(shake.multiplyScalar(2));

      this.camera.quaternion.copy(this.airplane.quaternion);

    } else if (this.cameraMode === 2) {
      // Chase cam - follows behind with more dynamic movement
      const offset = new THREE.Vector3(12, 4, 8);
      const yawQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, this.yaw, 0));
      offset.applyQuaternion(yawQuat);

      const targetPos = this.airplane.position.clone().add(offset);
      this.camera.position.lerp(targetPos, delta * 5);
      this.camera.position.add(shake);
      this.camera.lookAt(this.airplane.position);
    }
  }

  // Get afterburner fuel percentage (for HUD)
  getAfterburnerPercent() {
    return this.afterburnerFuel / this.afterburnerMaxFuel;
  }
}
