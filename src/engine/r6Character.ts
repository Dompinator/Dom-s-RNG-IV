import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { AnchorPoint, CharacterPoseMode } from '../aura/types';

export interface R6Rig {
  root: THREE.Group;
  groundAnchor: THREE.Object3D;
  bodyRoot: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  bodyMeshes: THREE.Mesh[];
  anchors: Record<AnchorPoint, THREE.Object3D>;
  update: (
    elapsed: number,
    pose: CharacterPoseMode | 'walk' | 'jump' | 'levitate_walk',
    moveIntensity?: number,
  ) => void;
  dispose: () => void;
}

export function createR6Character(): R6Rig {
  const root = new THREE.Group();
  root.name = 'R6_CharacterRoot';

  const groundAnchor = new THREE.Group();
  groundAnchor.name = 'R6_GroundAnchor';
  groundAnchor.position.set(0, 0, 0);
  root.add(groundAnchor);

  const bodyRoot = new THREE.Group();
  bodyRoot.name = 'R6_BodyRoot';
  root.add(bodyRoot);

  // Calibrated PBR studio mannequin materials (matte ceramic + satin metallic joints)
  const primaryMat = new THREE.MeshPhysicalMaterial({
    color: 0x262b38,
    roughness: 0.48,
    metalness: 0.12,
    clearcoat: 0.18,
    clearcoatRoughness: 0.35,
  });

  const headMat = new THREE.MeshPhysicalMaterial({
    color: 0x323848,
    roughness: 0.38,
    metalness: 0.15,
    clearcoat: 0.28,
    clearcoatRoughness: 0.25,
  });

  const limbMat = new THREE.MeshStandardMaterial({
    color: 0x1e222d,
    roughness: 0.56,
    metalness: 0.18,
  });

  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x4b556b,
    roughness: 0.22,
    metalness: 0.82,
  });

  const visorMat = new THREE.MeshStandardMaterial({
    color: 0x0b0e14,
    roughness: 0.12,
    metalness: 0.9,
  });

  const geometries: THREE.BufferGeometry[] = [];
  const bodyMeshes: THREE.Mesh[] = [];

  const registerMesh = (mesh: THREE.Mesh, castShadow = true) => {
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    bodyMeshes.push(mesh);
    return mesh;
  };

  // 1. TORSO (Center at y = 1.5, bottom = 1.0, top = 2.0)
  const torso = new THREE.Group();
  torso.name = 'R6_Torso';
  torso.position.set(0, 1.5, 0);
  bodyRoot.add(torso);

  const torsoGeo = new RoundedBoxGeometry(1.0, 1.0, 0.52, 3, 0.055);
  geometries.push(torsoGeo);
  const torsoMesh = registerMesh(new THREE.Mesh(torsoGeo, primaryMat));
  torsoMesh.name = 'Torso';
  torso.add(torsoMesh);

  // Subtle chest harness seam & collar ring so the mannequin reads clearly in 3D
  const chestPlateGeo = new RoundedBoxGeometry(0.76, 0.44, 0.55, 2, 0.03);
  geometries.push(chestPlateGeo);
  const chestPlate = new THREE.Mesh(chestPlateGeo, trimMat);
  chestPlate.position.set(0, 0.14, 0);
  chestPlate.castShadow = true;
  chestPlate.receiveShadow = true;
  torso.add(chestPlate);

  // 2. HEAD (Pivoted at neck y = 0.52 relative to torso)
  const head = new THREE.Group();
  head.name = 'R6_Head';
  head.position.set(0, 0.52, 0);
  torso.add(head);

  const headGeo = new RoundedBoxGeometry(0.66, 0.66, 0.66, 4, 0.14);
  geometries.push(headGeo);
  const headMesh = registerMesh(new THREE.Mesh(headGeo, headMat));
  headMesh.name = 'Head';
  headMesh.position.set(0, 0.34, 0);
  head.add(headMesh);

  // Minimalist mannequin visor plate to indicate front-facing direction
  const visorGeo = new RoundedBoxGeometry(0.46, 0.15, 0.08, 2, 0.03);
  geometries.push(visorGeo);
  const visorMesh = new THREE.Mesh(visorGeo, visorMat);
  visorMesh.position.set(0, 0.36, 0.31);
  head.add(visorMesh);

  // 3. LEFT ARM (Classic R6: viewer's right / character's +X or -X. In right-handed facing +Z, character's left arm is +X)
  const leftArm = new THREE.Group();
  leftArm.name = 'R6_LeftArm';
  leftArm.position.set(0.78, 0.45, 0); // Shoulder pivot relative to torso
  torso.add(leftArm);

  const armGeo = new RoundedBoxGeometry(0.48, 1.0, 0.48, 3, 0.05);
  geometries.push(armGeo);
  const leftArmMesh = registerMesh(new THREE.Mesh(armGeo, limbMat));
  leftArmMesh.name = 'LeftArm';
  leftArmMesh.position.set(0, -0.45, 0);
  leftArm.add(leftArmMesh);

  const shoulderCapGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.12, 16);
  geometries.push(shoulderCapGeo);
  const leftCap = new THREE.Mesh(shoulderCapGeo, trimMat);
  leftCap.rotation.z = Math.PI / 2;
  leftCap.position.set(-0.22, -0.04, 0);
  leftArm.add(leftCap);

  // 4. RIGHT ARM
  const rightArm = new THREE.Group();
  rightArm.name = 'R6_RightArm';
  rightArm.position.set(-0.78, 0.45, 0);
  torso.add(rightArm);

  const rightArmMesh = registerMesh(new THREE.Mesh(armGeo, limbMat));
  rightArmMesh.name = 'RightArm';
  rightArmMesh.position.set(0, -0.45, 0);
  rightArm.add(rightArmMesh);

  const rightCap = new THREE.Mesh(shoulderCapGeo, trimMat);
  rightCap.rotation.z = Math.PI / 2;
  rightCap.position.set(0.22, -0.04, 0);
  rightArm.add(rightCap);

  // 5. LEFT LEG (Hip pivot at y = 1.0 in bodyRoot)
  const leftLeg = new THREE.Group();
  leftLeg.name = 'R6_LeftLeg';
  leftLeg.position.set(0.26, 1.0, 0);
  bodyRoot.add(leftLeg);

  const legGeo = new RoundedBoxGeometry(0.48, 1.0, 0.5, 3, 0.05);
  geometries.push(legGeo);
  const leftLegMesh = registerMesh(new THREE.Mesh(legGeo, limbMat));
  leftLegMesh.name = 'LeftLeg';
  leftLegMesh.position.set(0, -0.5, 0);
  leftLeg.add(leftLegMesh);

  // 6. RIGHT LEG
  const rightLeg = new THREE.Group();
  rightLeg.name = 'R6_RightLeg';
  rightLeg.position.set(-0.26, 1.0, 0);
  bodyRoot.add(rightLeg);

  const rightLegMesh = registerMesh(new THREE.Mesh(legGeo, limbMat));
  rightLegMesh.name = 'RightLeg';
  rightLegMesh.position.set(0, -0.5, 0);
  rightLeg.add(rightLegMesh);

  // Create dedicated center anchors on each R6 body part for layer attachment
  const makeAnchor = (parent: THREE.Object3D, yOffset: number, name: string) => {
    const anchor = new THREE.Object3D();
    anchor.name = name;
    anchor.position.set(0, yOffset, 0);
    parent.add(anchor);
    return anchor;
  };

  const anchors: Record<AnchorPoint, THREE.Object3D> = {
    root: makeAnchor(bodyRoot, 0, 'Anchor_Root'),
    ground: groundAnchor,
    torso: makeAnchor(torso, 0, 'Anchor_Torso'),
    head: makeAnchor(head, 0.34, 'Anchor_Head'),
    leftArm: makeAnchor(leftArm, -0.45, 'Anchor_LeftArm'),
    rightArm: makeAnchor(rightArm, -0.45, 'Anchor_RightArm'),
    leftLeg: makeAnchor(leftLeg, -0.5, 'Anchor_LeftLeg'),
    rightLeg: makeAnchor(rightLeg, -0.5, 'Anchor_RightLeg'),
  };

  const update = (
    elapsed: number,
    pose: CharacterPoseMode | 'walk' | 'jump' | 'levitate_walk',
    moveIntensity = 1,
  ) => {
    if (pose === 'paused') return;

    if (pose === 'jump') {
      bodyRoot.position.set(0, 0, 0);
      torso.position.set(0, 1.5, 0);
      torso.rotation.set(0.08, 0, 0);
      head.rotation.set(-0.06, 0, 0);
      leftArm.rotation.set(-0.45, 0, 0.35);
      rightArm.rotation.set(-0.45, 0, -0.35);
      leftLeg.rotation.set(0.35, 0, 0.06);
      rightLeg.rotation.set(-0.28, 0, -0.06);
      return;
    }

    if (pose === 'walk') {
      const freq = 9.5;
      const swing = Math.sin(elapsed * freq) * 0.72 * Math.min(1.2, moveIntensity);
      const bob = Math.abs(Math.cos(elapsed * freq)) * 0.06 * Math.min(1, moveIntensity);
      bodyRoot.position.set(0, 0, 0);
      torso.position.set(0, 1.5 + bob, 0);
      torso.rotation.set(0.06, Math.sin(elapsed * freq) * 0.04, 0);
      head.rotation.set(-0.03, 0, 0);
      leftArm.rotation.set(swing * 0.85, 0, 0.08);
      rightArm.rotation.set(-swing * 0.85, 0, -0.08);
      leftLeg.rotation.set(-swing, 0, 0.02);
      rightLeg.rotation.set(swing, 0, -0.02);
      return;
    }

    if (pose === 'tpose') {
      bodyRoot.position.set(0, 0, 0);
      bodyRoot.rotation.set(0, 0, 0);
      torso.position.set(0, 1.5, 0);
      torso.rotation.set(0, 0, 0);
      head.rotation.set(0, 0, 0);
      leftArm.rotation.set(0, 0, Math.PI * 0.47);
      rightArm.rotation.set(0, 0, -Math.PI * 0.47);
      leftLeg.rotation.set(0, 0, 0);
      rightLeg.rotation.set(0, 0, 0);
      return;
    }

    if (pose === 'levitate_walk') {
      const hover = Math.sin(elapsed * 2.4) * 0.12 + 0.42;
      const lean = 0.24 * Math.min(1.2, moveIntensity);
      bodyRoot.position.set(0, hover, 0);
      torso.position.set(0, 1.5, 0);
      torso.rotation.set(lean, Math.sin(elapsed * 1.4) * 0.04, 0);
      head.rotation.set(-lean * 0.65, 0, 0);
      leftArm.rotation.set(0.32, 0, 0.32 + Math.sin(elapsed * 2.4) * 0.05);
      rightArm.rotation.set(0.32, 0, -0.32 - Math.sin(elapsed * 2.4) * 0.05);
      leftLeg.rotation.set(0.34 + Math.sin(elapsed * 2.2) * 0.06, 0, 0.05);
      rightLeg.rotation.set(0.46 + Math.cos(elapsed * 2.2) * 0.06, 0, -0.05);
      return;
    }

    if (pose === 'levitate') {
      const hover = Math.sin(elapsed * 2.1) * 0.14 + 0.38;
      bodyRoot.position.set(0, hover, 0);
      torso.position.set(0, 1.5, 0);
      torso.rotation.set(0.08 + Math.sin(elapsed * 1.4) * 0.03, Math.sin(elapsed * 0.8) * 0.04, 0);
      head.rotation.set(-0.08 + Math.sin(elapsed * 1.4) * 0.04, Math.sin(elapsed * 0.7) * 0.06, 0);
      leftArm.rotation.set(0.15, 0, 0.28 + Math.sin(elapsed * 2.1) * 0.06);
      rightArm.rotation.set(0.15, 0, -0.28 - Math.sin(elapsed * 2.1) * 0.06);
      leftLeg.rotation.set(0.18 + Math.sin(elapsed * 1.8) * 0.05, 0, 0.05);
      rightLeg.rotation.set(0.28 + Math.cos(elapsed * 1.8) * 0.05, 0, -0.05);
      return;
    }

    // Classic smooth R6 idle animation
    const breathe = Math.sin(elapsed * 2.0);
    const sway = Math.sin(elapsed * 1.0);
    bodyRoot.position.set(0, 0, 0);
    torso.position.set(0, 1.5 + breathe * 0.018, 0);
    torso.rotation.set(breathe * 0.02, sway * 0.03, 0);
    head.rotation.set(breathe * 0.025, Math.sin(elapsed * 0.7) * 0.06, sway * 0.015);
    leftArm.rotation.set(Math.sin(elapsed * 1.3) * 0.04, 0, 0.05 + breathe * 0.025);
    rightArm.rotation.set(-Math.sin(elapsed * 1.3) * 0.04, 0, -0.05 - breathe * 0.025);
    leftLeg.rotation.set(0, 0, 0.015);
    rightLeg.rotation.set(0, 0, -0.015);
  };

  const dispose = () => {
    geometries.forEach((g) => g.dispose());
    primaryMat.dispose();
    headMat.dispose();
    limbMat.dispose();
    trimMat.dispose();
    visorMat.dispose();
  };

  return {
    root,
    groundAnchor,
    bodyRoot,
    torso,
    head,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    bodyMeshes,
    anchors,
    update,
    dispose,
  };
}
