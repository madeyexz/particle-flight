import * as THREE from 'three';

export function createAirplane() {
  const group = new THREE.Group();

  // Paper airplane geometry - simple triangular shape
  const shape = new THREE.Shape();
  shape.moveTo(0, -1.5);      // Nose
  shape.lineTo(-1, 0.8);      // Left wing tip
  shape.lineTo(0, 0.4);       // Center notch
  shape.lineTo(1, 0.8);       // Right wing tip
  shape.closePath();

  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2); // Lay flat
  geometry.rotateY(Math.PI);      // Face forward

  // Orange wireframe material
  const wireMaterial = new THREE.MeshBasicMaterial({
    color: 0xff6600,
    wireframe: true,
    transparent: true,
    opacity: 0.9
  });

  // Subtle fill
  const fillMaterial = new THREE.MeshBasicMaterial({
    color: 0xff4400,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide
  });

  const wireframe = new THREE.Mesh(geometry.clone(), wireMaterial);
  const fill = new THREE.Mesh(geometry, fillMaterial);

  // Scale down
  wireframe.scale.set(0.8, 0.8, 0.8);
  fill.scale.set(0.8, 0.8, 0.8);

  group.add(fill);
  group.add(wireframe);

  // Small center line (tail fin indicator)
  const lineGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0.3, 0.2),
    new THREE.Vector3(0, 0.3, 0.6)
  ]);
  const lineMat = new THREE.LineBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.8 });
  const line = new THREE.Line(lineGeom, lineMat);
  group.add(line);

  // Initial position
  group.position.set(0, 50, 0);

  return group;
}
