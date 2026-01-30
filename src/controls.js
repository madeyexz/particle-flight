import * as THREE from 'three';
import { getTerrainHeight } from './terrain.js';

export class FlightController {
  constructor(airplane, camera) {
    this.airplane = airplane;
    this.camera = camera;

    // Flight state
    this.speed = 3.0;
    this.baseSpeed = 3.0;
    this.maxSpeed = 10.0;
    this.boostSpeed = 15.0;

    // Control inputs
    this.throttle = 0;
    this.strafe = 0;
    this.boost = false;

    // Mouse look
    this.pitch = 0;
    this.yaw = 0;
    this.roll = 0;

    // Smoothing
    this.targetPitch = 0;
    this.targetYaw = 0;
    this.mouseSensitivity = 0.002;

    // Camera settings
    this.cameraMode = 0;
    this.cameraOffsets = [
      new THREE.Vector3(0, 3, 12),   // Third person (behind)
      new THREE.Vector3(0, 0.5, 0),   // Cockpit (first person)
      new THREE.Vector3(8, 2, 0),     // Side view
    ];

    // Physics
    this.velocity = new THREE.Vector3();
    this.minAltitude = 5;
  }

  setCameraMode(mode) {
    this.cameraMode = mode;
  }

  handleMouseMove(movementX, movementY) {
    this.targetYaw -= movementX * this.mouseSensitivity;
    this.targetPitch -= movementY * this.mouseSensitivity;
    this.targetPitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, this.targetPitch));
  }

  update(delta) {
    // Speed control
    const targetSpeed = this.boost ? this.boostSpeed : this.baseSpeed + this.throttle * 2;
    this.speed = THREE.MathUtils.lerp(this.speed, targetSpeed, delta * 2);
    this.speed = Math.max(1, Math.min(this.maxSpeed, this.speed));

    // Smooth rotation
    this.pitch = THREE.MathUtils.lerp(this.pitch, this.targetPitch, delta * 5);
    this.yaw = THREE.MathUtils.lerp(this.yaw, this.targetYaw, delta * 5);

    // Calculate roll from yaw rate
    const yawRate = this.targetYaw - this.yaw;
    this.roll = THREE.MathUtils.lerp(this.roll, -yawRate * 20, delta * 3);
    this.roll = THREE.MathUtils.clamp(this.roll, -Math.PI / 4, Math.PI / 4);

    // Build rotation quaternion
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
    this.velocity.add(right.clone().multiplyScalar(this.strafe * this.speed * 0.5));

    // Update position
    this.airplane.position.add(this.velocity.clone().multiplyScalar(delta));

    // Ground collision
    const groundHeight = getTerrainHeight(this.airplane.position.x, this.airplane.position.z);
    const minHeight = groundHeight + this.minAltitude;

    if (this.airplane.position.y < minHeight) {
      this.airplane.position.y = minHeight;
      if (this.pitch > 0) {
        this.targetPitch = -0.1;
      }
    }

    // Ceiling
    if (this.airplane.position.y > 200) {
      this.airplane.position.y = 200;
      if (this.pitch < 0) {
        this.targetPitch = 0.1;
      }
    }

    // Update camera
    this.updateCamera(delta);

    // Gradually return to neutral pitch
    this.targetPitch *= 0.99;
  }

  updateCamera(delta) {
    const offset = this.cameraOffsets[this.cameraMode].clone();

    if (this.cameraMode === 0) {
      // Third person - follow behind
      const cameraEuler = new THREE.Euler(this.pitch * 0.5, this.yaw, 0, 'YXZ');
      offset.applyEuler(cameraEuler);

      const targetCameraPos = this.airplane.position.clone().add(offset);
      this.camera.position.lerp(targetCameraPos, delta * 8);

      // Look ahead
      const lookOffset = new THREE.Vector3(0, 0, -30);
      lookOffset.applyQuaternion(this.airplane.quaternion);
      const lookTarget = this.airplane.position.clone().add(lookOffset);
      this.camera.lookAt(lookTarget);

    } else if (this.cameraMode === 1) {
      // Cockpit - first person
      offset.applyQuaternion(this.airplane.quaternion);
      this.camera.position.copy(this.airplane.position).add(offset);
      this.camera.quaternion.copy(this.airplane.quaternion);

    } else if (this.cameraMode === 2) {
      // Side view
      const cameraEuler = new THREE.Euler(0, this.yaw, 0, 'YXZ');
      offset.applyEuler(cameraEuler);

      const targetCameraPos = this.airplane.position.clone().add(offset);
      this.camera.position.lerp(targetCameraPos, delta * 8);
      this.camera.lookAt(this.airplane.position);
    }
  }
}
