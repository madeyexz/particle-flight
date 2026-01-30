import * as THREE from 'three';

const activeSonarEffects = [];

export function createSonarEffect(scene, position) {
  // Create expanding ring
  const geometry = new THREE.RingGeometry(0.1, 0.5, 64);
  const material = new THREE.MeshBasicMaterial({
    color: 0xff9900,
    transparent: true,
    opacity: 1,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
  });

  const ring = new THREE.Mesh(geometry, material);
  ring.position.copy(position);
  ring.rotation.x = -Math.PI / 2; // Horizontal

  ring.userData = {
    age: 0,
    maxAge: 3,
    startRadius: 0.5,
    maxRadius: 300
  };

  scene.add(ring);
  activeSonarEffects.push(ring);

  // Also create CSS sonar effect
  const sonarDiv = document.createElement('div');
  sonarDiv.className = 'sonar-ring';
  document.body.appendChild(sonarDiv);

  setTimeout(() => {
    sonarDiv.remove();
  }, 2000);
}

export function updateSonarEffects(scene, delta) {
  for (let i = activeSonarEffects.length - 1; i >= 0; i--) {
    const ring = activeSonarEffects[i];
    ring.userData.age += delta;

    const t = ring.userData.age / ring.userData.maxAge;

    if (t >= 1) {
      scene.remove(ring);
      ring.geometry.dispose();
      ring.material.dispose();
      activeSonarEffects.splice(i, 1);
      continue;
    }

    // Expand ring
    const currentRadius = THREE.MathUtils.lerp(
      ring.userData.startRadius,
      ring.userData.maxRadius,
      t
    );

    // Update ring geometry
    ring.geometry.dispose();
    ring.geometry = new THREE.RingGeometry(
      currentRadius - 2,
      currentRadius,
      64
    );

    // Fade out
    ring.material.opacity = 1 - t;
  }
}

// Particle burst effect for impacts/events
export function createParticleBurst(scene, position, color = 0xff9900) {
  const particleCount = 50;
  const geometry = new THREE.BufferGeometry();

  const positions = new Float32Array(particleCount * 3);
  const velocities = [];
  const colors = new Float32Array(particleCount * 3);

  const particleColor = new THREE.Color(color);

  for (let i = 0; i < particleCount; i++) {
    positions[i * 3] = position.x;
    positions[i * 3 + 1] = position.y;
    positions[i * 3 + 2] = position.z;

    // Random velocity
    velocities.push(new THREE.Vector3(
      (Math.random() - 0.5) * 20,
      (Math.random() - 0.5) * 20,
      (Math.random() - 0.5) * 20
    ));

    colors[i * 3] = particleColor.r;
    colors[i * 3 + 1] = particleColor.g;
    colors[i * 3 + 2] = particleColor.b;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 3,
    vertexColors: true,
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const particles = new THREE.Points(geometry, material);
  particles.userData = {
    velocities,
    age: 0,
    maxAge: 2
  };

  scene.add(particles);

  // Auto-cleanup
  const cleanup = () => {
    const age = particles.userData.age;
    if (age >= particles.userData.maxAge) {
      scene.remove(particles);
      geometry.dispose();
      material.dispose();
      return;
    }

    particles.userData.age += 0.016;

    const positions = particles.geometry.attributes.position.array;
    for (let i = 0; i < particleCount; i++) {
      const vel = particles.userData.velocities[i];
      positions[i * 3] += vel.x * 0.016;
      positions[i * 3 + 1] += vel.y * 0.016;
      positions[i * 3 + 2] += vel.z * 0.016;

      // Gravity
      vel.y -= 9.8 * 0.016;
    }
    particles.geometry.attributes.position.needsUpdate = true;
    particles.material.opacity = 1 - (age / particles.userData.maxAge);

    requestAnimationFrame(cleanup);
  };

  requestAnimationFrame(cleanup);
}
