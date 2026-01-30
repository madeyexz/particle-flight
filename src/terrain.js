import * as THREE from 'three';

// Terrain configuration
const TERRAIN_SIZE = 1000;
const PARTICLE_COUNT = 150000;

// Simplex noise implementation
class SimplexNoise {
  constructor(seed = Math.random()) {
    this.p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) this.p[i] = i;

    let n = seed * 256;
    for (let i = 255; i > 0; i--) {
      n = (n * 16807) % 2147483647;
      const j = n % (i + 1);
      [this.p[i], this.p[j]] = [this.p[j], this.p[i]];
    }

    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = this.p[i & 255];
  }

  noise2D(x, y) {
    const F2 = 0.5 * (Math.sqrt(3) - 1);
    const G2 = (3 - Math.sqrt(3)) / 6;

    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);

    const t = (i + j) * G2;
    const X0 = i - t;
    const Y0 = j - t;
    const x0 = x - X0;
    const y0 = y - Y0;

    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;

    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;

    const ii = i & 255;
    const jj = j & 255;

    const grad = (hash, x, y) => {
      const h = hash & 7;
      const u = h < 4 ? x : y;
      const v = h < 4 ? y : x;
      return ((h & 1) ? -u : u) + ((h & 2) ? -2 * v : 2 * v);
    };

    let n0 = 0, n1 = 0, n2 = 0;

    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      t0 *= t0;
      n0 = t0 * t0 * grad(this.perm[ii + this.perm[jj]], x0, y0);
    }

    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      t1 *= t1;
      n1 = t1 * t1 * grad(this.perm[ii + i1 + this.perm[jj + j1]], x1, y1);
    }

    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      t2 *= t2;
      n2 = t2 * t2 * grad(this.perm[ii + 1 + this.perm[jj + 1]], x2, y2);
    }

    return 70 * (n0 + n1 + n2);
  }

  fbm(x, y, octaves = 6) {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      value += amplitude * this.noise2D(x * frequency, y * frequency);
      maxValue += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }

    return value / maxValue;
  }
}

const noise = new SimplexNoise(Math.random() * 10000);

// Get terrain height at position
export function getTerrainHeight(x, z) {
  const scale = 0.002;
  const height = noise.fbm(x * scale, z * scale, 6);
  const base = height * 80;
  const ridges = Math.abs(noise.noise2D(x * 0.001, z * 0.001)) * 40;
  return base + ridges;
}

// Vertex shader for particles
const vertexShader = `
  attribute float size;
  attribute float heightNorm;

  varying float vHeightNorm;
  varying float vDistance;

  void main() {
    vHeightNorm = heightNorm;

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vDistance = -mvPosition.z;

    // Size attenuation
    gl_PointSize = size * (300.0 / vDistance);
    gl_PointSize = clamp(gl_PointSize, 1.0, 8.0);

    gl_Position = projectionMatrix * mvPosition;
  }
`;

// Fragment shader for particles
const fragmentShader = `
  varying float vHeightNorm;
  varying float vDistance;

  uniform float highlight;

  void main() {
    // Circular point
    vec2 center = gl_PointCoord - vec2(0.5);
    float dist = length(center);
    if (dist > 0.5) discard;

    // Soft edge
    float alpha = 1.0 - smoothstep(0.3, 0.5, dist);

    // Distance fog
    float fog = 1.0 - smoothstep(100.0, 700.0, vDistance);

    // Color based on highlight mode
    vec3 color;

    if (highlight > 0.5) {
      // Highlight mode: cyan (low) to red (high)
      vec3 lowColor = vec3(0.0, 0.8, 1.0);  // Cyan
      vec3 highColor = vec3(1.0, 0.3, 0.2); // Red-orange
      color = mix(lowColor, highColor, vHeightNorm);
    } else {
      // Normal mode: blue-gray particles
      float h = 0.58 + vHeightNorm * 0.08;
      float s = 0.15 + vHeightNorm * 0.2;
      float l = 0.35 + vHeightNorm * 0.25;

      // HSL to RGB conversion
      float c = (1.0 - abs(2.0 * l - 1.0)) * s;
      float x = c * (1.0 - abs(mod(h * 6.0, 2.0) - 1.0));
      float m = l - c / 2.0;

      vec3 rgb;
      float hue = h * 6.0;
      if (hue < 1.0) rgb = vec3(c, x, 0.0);
      else if (hue < 2.0) rgb = vec3(x, c, 0.0);
      else if (hue < 3.0) rgb = vec3(0.0, c, x);
      else if (hue < 4.0) rgb = vec3(0.0, x, c);
      else if (hue < 5.0) rgb = vec3(x, 0.0, c);
      else rgb = vec3(c, 0.0, x);

      color = rgb + vec3(m);
    }

    gl_FragColor = vec4(color, alpha * fog);
  }
`;

export function createTerrain(scene) {
  const geometry = new THREE.BufferGeometry();

  const positions = new Float32Array(PARTICLE_COUNT * 3);
  const heightNorms = new Float32Array(PARTICLE_COUNT);
  const sizes = new Float32Array(PARTICLE_COUNT);

  const gridSize = Math.sqrt(PARTICLE_COUNT);
  const spacing = TERRAIN_SIZE / gridSize;

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const ix = i % gridSize;
    const iz = Math.floor(i / gridSize);

    const x = (ix - gridSize / 2) * spacing;
    const z = (iz - gridSize / 2) * spacing;
    const y = getTerrainHeight(x, z);

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    // Normalize height for shader (0-1 range)
    heightNorms[i] = Math.max(0, Math.min(1, (y + 40) / 120));

    // Size variation
    sizes[i] = 2 + Math.random() * 2;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('heightNorm', new THREE.BufferAttribute(heightNorms, 1));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      highlight: { value: 0.0 }
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  const points = new THREE.Points(geometry, material);
  scene.add(points);

  return points;
}

// Update terrain particles based on player position (infinite terrain)
export function updateTerrain(terrain, playerPos) {
  const positions = terrain.geometry.attributes.position.array;
  const heightNorms = terrain.geometry.attributes.heightNorm.array;

  const gridSize = Math.sqrt(PARTICLE_COUNT);
  const spacing = TERRAIN_SIZE / gridSize;
  const halfTerrain = TERRAIN_SIZE / 2;

  let needsUpdate = false;

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    let x = positions[i * 3];
    let z = positions[i * 3 + 2];

    const dx = x - playerPos.x;
    const dz = z - playerPos.z;

    if (Math.abs(dx) > halfTerrain) {
      x = playerPos.x - Math.sign(dx) * halfTerrain + (dx % spacing);
      const y = getTerrainHeight(x, z);
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      heightNorms[i] = Math.max(0, Math.min(1, (y + 40) / 120));
      needsUpdate = true;
    }

    if (Math.abs(dz) > halfTerrain) {
      z = playerPos.z - Math.sign(dz) * halfTerrain + (dz % spacing);
      const y = getTerrainHeight(x, z);
      positions[i * 3 + 2] = z;
      positions[i * 3 + 1] = y;
      heightNorms[i] = Math.max(0, Math.min(1, (y + 40) / 120));
      needsUpdate = true;
    }
  }

  if (needsUpdate) {
    terrain.geometry.attributes.position.needsUpdate = true;
    terrain.geometry.attributes.heightNorm.needsUpdate = true;
  }
}
