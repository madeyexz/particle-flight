import * as THREE from 'three';

export function createAirplane() {
  const group = new THREE.Group();

  // 3D Paper airplane geometry
  const geometry = new THREE.BufferGeometry();

  // Vertices for a 3D paper airplane
  const vertices = new Float32Array([
    // Nose (front point)
    0, 0, -2,

    // Left wing top
    -1.8, 0.1, 1.2,

    // Left wing bottom
    -1.8, -0.05, 1.2,

    // Right wing top
    1.8, 0.1, 1.2,

    // Right wing bottom
    1.8, -0.05, 1.2,

    // Center top (fuselage ridge)
    0, 0.3, 0.8,

    // Center back
    0, 0.15, 1.5,

    // Tail fin top
    0, 0.6, 1.3,
  ]);

  // Indices for triangles
  const indices = [
    // Left wing top surface
    0, 5, 1,
    1, 5, 6,

    // Left wing bottom surface
    0, 2, 5,
    2, 6, 5,

    // Right wing top surface
    0, 3, 5,
    3, 6, 5,

    // Right wing bottom surface
    0, 5, 4,
    4, 5, 6,

    // Left wing edge
    1, 2, 0,
    1, 6, 2,

    // Right wing edge
    3, 0, 4,
    3, 4, 6,

    // Tail fin
    5, 7, 6,
    5, 6, 7,
  ];

  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  // Wireframe for that digital look
  const wireMaterial = new THREE.MeshBasicMaterial({
    color: 0xff6600,
    wireframe: true,
    transparent: true,
    opacity: 0.9
  });

  // Solid fill with transparency
  const solidMaterial = new THREE.MeshBasicMaterial({
    color: 0xff4400,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide
  });

  const wireframe = new THREE.Mesh(geometry, wireMaterial);
  const solid = new THREE.Mesh(geometry.clone(), solidMaterial);

  group.add(solid);
  group.add(wireframe);

  // Add edge lines for cleaner look
  const edges = new THREE.EdgesGeometry(geometry, 15);
  const lineMaterial = new THREE.LineBasicMaterial({
    color: 0xff9900,
    transparent: true,
    opacity: 1
  });
  const edgeLines = new THREE.LineSegments(edges, lineMaterial);
  group.add(edgeLines);

  // Initial position
  group.position.set(0, 50, 0);

  return group;
}
