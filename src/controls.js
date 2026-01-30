import * as THREE from 'three';
import { getTerrainHeight } from './terrain.js';

export class FlightController {
  constructor(airplane, camera) {
    this.airplane = airplane;
    this.camera = camera;

    // Flight state
    this.speed = 60.0;
    this.baseSpeed = 60.0;
    this.maxSpeed = 160.0;
    this.boostSpeed = 480.0;

    // FOV for boost effect
    this.baseFOV = 75;
    this.boostFOV = 95;
    this.currentFOV = 75;

    // Control inputs
    this.throttle = 0;
    this.strafe = 0;
    this.boost = false;

    // Flight dynamics - bank to turn model
    this.pitch = 0;
    this.yaw = 0;
    this.roll = 0;

    // Input targets
    this.targetPitch = 0;
    this.targetRoll = 0;

    // Mouse input accumulator
    this.mouseX = 0;
    this.mouseY = 0;

    // Sensitivity
    this.mouseSensitivity = 0.003;
    this.fpsSensitivity = 0.001;

    // Physics tuning
    this.rollSpeed = 3.0;      // How fast the plane rolls
    this.turnRate = 1.5;       // How much roll affects yaw (turn)
    this.pitchSpeed = 2.5;     // How fast pitch changes
    this.autoLevel = 0.5;      // How fast roll returns to level when not turning
    this.maxRoll = Math.PI / 3; // 60 degrees max bank
    this.maxPitch = Math.PI / 3;

    // Camera settings
    this.cameraMode = 0;
    this.cameraOffsets = [
      new THREE.Vector3(0, 3, 12),
      new THREE.Vector3(0, 0.5, 0),
      new THREE.Vector3(8, 2, 0),
    ];

    // Physics
    this.velocity = new THREE.Vector3();
    this.minAltitude = 5;
  }

  setCameraMode(mode) {
    this.cameraMode = mode;
  }

  handleMouseMove(movementX, movementY) {
    const sensitivity = this.cameraMode === 1 ? this.fpsSensitivity : this.mouseSensitivity;

    // Accumulate mouse input (will be consumed in update)
    this.mouseX += movementX * sensitivity;
    this.mouseY += movementY * sensitivity;
  }

  update(delta) {
    // Speed control
    const targetSpeed = this.boost ? this.boostSpeed : this.baseSpeed + this.throttle * 20;
    this.speed = THREE.MathUtils.lerp(this.speed, targetSpeed, delta * 2);
    this.speed = Math.max(10, Math.min(this.maxSpeed, this.speed));

    // Process mouse input for roll and pitch targets
    this.targetRoll = THREE.MathUtils.clamp(-this.mouseX * 15, -this.maxRoll, this.maxRoll);
    this.targetPitch = THREE.MathUtils.clamp(-this.mouseY * 10, -this.maxPitch, this.maxPitch);

    // Decay mouse input (creates a "spring back" feel)
    this.mouseX *= 0.85;
    this.mouseY *= 0.9;

    // Smooth roll towards target
    this.roll = THREE.MathUtils.lerp(this.roll, this.targetRoll, delta * this.rollSpeed);

    // Auto-level roll when mouse centered
    if (Math.abs(this.mouseX) < 0.01) {
      this.roll = THREE.MathUtils.lerp(this.roll, 0, delta * this.autoLevel);
    }

    // Yaw is driven by roll (bank to turn)
    const turnAmount = this.roll * this.turnRate * delta;
    this.yaw += turnAmount;

    // Smooth pitch
    this.pitch = THREE.MathUtils.lerp(this.pitch, this.targetPitch, delta * this.pitchSpeed);

    // Auto-level pitch slowly
    if (Math.abs(this.mouseY) < 0.01) {
      this.pitch = THREE.MathUtils.lerp(this.pitch, 0, delta * 0.3);
    }

    // Build rotation quaternion (YXZ order: yaw, pitch, roll)
    const euler = new THREE.Euler(this.pitch, this.yaw, this.roll, 'YXZ');
    this.airplane.quaternion.setFromEuler(euler);

    // Calculate forward direction
    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyQuaternion(this.airplane.quaternion);

    // Calculate right direction for strafing
    const right = new THREE.Vector3(1, 0, 0);
    right.applyQuaternion(this.airplane.quaternion);

    // Apply movement
    this.velocity.copy(forward).multiplyScalar(this.speed);
    this.velocity.add(right.clone().multiplyScalar(this.strafe * this.speed * 0.3));

    // Update position
    this.airplane.position.add(this.velocity.clone().multiplyScalar(delta));

    // Ground collision
    const groundHeight = getTerrainHeight(this.airplane.position.x, this.airplane.position.z);
    const minHeight = groundHeight + this.minAltitude;

    if (this.airplane.position.y < minHeight) {
      this.airplane.position.y = minHeight;
      if (this.pitch > 0) {
        this.targetPitch = -0.2;
        this.mouseY = 0.02;
      }
    }

    // Ceiling
    if (this.airplane.position.y > 300) {
      this.airplane.position.y = 300;
      if (this.pitch < 0) {
        this.targetPitch = 0.2;
        this.mouseY = -0.02;
      }
    }

    // Update camera
    this.updateCamera(delta);

    // FOV boost effect
    const targetFOV = this.boost ? this.boostFOV : this.baseFOV;
    this.currentFOV = THREE.MathUtils.lerp(this.currentFOV, targetFOV, delta * 5);
    this.camera.fov = this.currentFOV;
    this.camera.updateProjectionMatrix();
  }

  updateCamera(delta) {
    if (this.cameraMode === 0) {
      // Third person - smooth follow behind plane
      const offset = new THREE.Vector3(0, 4, 14);

      // Rotate offset by yaw only (no pitch/roll on camera position)
      const yawQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, this.yaw, 0));
      offset.applyQuaternion(yawQuat);

      const targetPos = this.airplane.position.clone().add(offset);
      this.camera.position.lerp(targetPos, delta * 8);

      // Look at plane position (stable target)
      this.camera.lookAt(this.airplane.position);

    } else if (this.cameraMode === 1) {
      // Cockpit - locked to plane
      const offset = new THREE.Vector3(0, 0.5, -1);
      offset.applyQuaternion(this.airplane.quaternion);
      this.camera.position.copy(this.airplane.position).add(offset);
      this.camera.quaternion.copy(this.airplane.quaternion);

    } else if (this.cameraMode === 2) {
      // Side view
      const offset = new THREE.Vector3(10, 3, 0);
      const yawQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, this.yaw, 0));
      offset.applyQuaternion(yawQuat);

      const targetPos = this.airplane.position.clone().add(offset);
      this.camera.position.lerp(targetPos, delta * 8);
      this.camera.lookAt(this.airplane.position);
    }
  }
}
