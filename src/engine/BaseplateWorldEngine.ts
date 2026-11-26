import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { createContactShadowTexture } from '../aura/textures';
import type { AuraLayer, AuraProject } from '../aura/types';
import {
  buildLayerRuntime,
  getLayerStructuralSignature,
  type CompiledLayerRuntime,
} from './layerBuilder';
import { createR6Character, type R6Rig } from './r6Character';
import { SpatialAuraAudioController } from './spatialAudio';

function detectSoftwareWebGL(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

function createStudBaseplateTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Baseplate tile
  ctx.fillStyle = '#181c26';
  ctx.fillRect(0, 0, size, size);

  // Subtle tile seam
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.045)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, size - 2, size - 2);

  // 4x4 Roblox-style studs per tile
  const step = size / 4;
  for (let gx = 0; gx < 4; gx++) {
    for (let gy = 0; gy < 4; gy++) {
      const cx = gx * step + step * 0.5;
      const cy = gy * step + step * 0.5;
      const r = step * 0.27;

      // Stud shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.beginPath();
      ctx.arc(cx + 2, cy + 2, r, 0, Math.PI * 2);
      ctx.fill();

      // Stud body
      const grad = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
      grad.addColorStop(0, '#252b3a');
      grad.addColorStop(1, '#1a1f2b');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      // Top highlight ring
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r - 1, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(35, 35);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

const BASEPLATE_HALF = 66;
const WALK_SPEED = 11.5;
const SPRINT_SPEED = 18.0;
const JUMP_VELOCITY = 11.5;
const GRAVITY = 28.0;

// Reusable scratch vectors
const _moveDir = new THREE.Vector3();
const _camForward = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _camGoal = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();

export class BaseplateWorldEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private rig: R6Rig;
  private isSoftwareGl: boolean;
  private maxAnisotropy: number;

  private runtimes = new Map<string, CompiledLayerRuntime>();
  private equippedAura: AuraProject | null = null;

  private keyLight: THREE.DirectionalLight;
  private rimLight: THREE.SpotLight;
  private contactShadow: THREE.Mesh;

  // Character kinematics
  private playerPos = new THREE.Vector3(0, 0, 0);
  private playerVelY = 0;
  private playerYaw = 0;
  private isGrounded = true;

  // Third-person orbit camera state
  private camYaw = 0.45;
  private camPitch = 0.34;
  private camDistance = 7.2;
  private isDragging = false;
  private lastPointerX = 0;
  private lastPointerY = 0;

  // Input state
  private keys = new Set<string>();
  private touchMove = { x: 0, y: 0 };

  private elapsed = 0;
  private lastNow = performance.now();
  private frameId = 0;
  private disposed = false;

  private resizeObserver: ResizeObserver;
  private envRT: THREE.WebGLRenderTarget;
  private worldDisposables: { dispose: () => void }[] = [];
  private spatialAudio: SpatialAuraAudioController;

  constructor(container: HTMLElement) {
    this.container = container;
    this.isSoftwareGl = detectSoftwareWebGL();

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2),
    );
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.maxAnisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());

    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#090c14');
    this.scene.fog = new THREE.FogExp2('#090c14', 0.011);

    this.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 260);

    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.envRT = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this.envRT.texture;
    pmremGenerator.dispose();

    // Lighting
    const hemi = new THREE.HemisphereLight(0xa9c4ff, 0x151923, 0.78);
    this.scene.add(hemi);

    this.keyLight = new THREE.DirectionalLight(0xfff1dc, 1.85);
    this.keyLight.position.set(14, 24, 16);
    this.keyLight.castShadow = !this.isSoftwareGl;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.keyLight.shadow.camera.near = 1;
    this.keyLight.shadow.camera.far = 65;
    const d = 16;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.02;
    this.scene.add(this.keyLight);
    this.scene.add(this.keyLight.target);

    const fillLight = new THREE.DirectionalLight(0x6fa8ff, 0.52);
    fillLight.position.set(-16, 10, -14);
    this.scene.add(fillLight);

    this.rimLight = new THREE.SpotLight(0xf59e0b, 16, 22, Math.PI * 0.38, 0.65, 1.2);
    this.scene.add(this.rimLight);
    this.scene.add(this.rimLight.target);

    this.buildBaseplateEnvironment();

    // R6 Player Character
    this.rig = createR6Character();
    this.scene.add(this.rig.root);

    // Grounded Contact Shadow
    const shadowTex = createContactShadowTexture();
    const shadowGeo = new THREE.PlaneGeometry(1.85, 1.85);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.65,
    });
    this.contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.contactShadow.position.y = 0.02;
    this.scene.add(this.contactShadow);
    this.worldDisposables.push(shadowTex, shadowGeo, shadowMat);

    // Bloom Postprocessing
    if (!this.isSoftwareGl) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(width, height),
        0.78,
        0.5,
        0.65,
      );
      this.composer.addPass(this.bloomPass);
      this.composer.addPass(new OutputPass());
      this.renderer.compile(this.scene, this.camera);
    }

    this.spatialAudio = new SpatialAuraAudioController(this.camera);
    this.bindEvents();
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);

    this.lastNow = performance.now();
    this.tick();
  }

  private buildBaseplateEnvironment() {
    // 1. Studded Baseplate Slab (140 x 140)
    const studTex = createStudBaseplateTexture(this.maxAnisotropy);
    const plateGeo = new THREE.BoxGeometry(140, 2, 140);
    const plateMat = new THREE.MeshStandardMaterial({
      map: studTex,
      roughness: 0.72,
      metalness: 0.14,
    });
    const plate = new THREE.Mesh(plateGeo, plateMat);
    plate.position.y = -1.0;
    plate.receiveShadow = true;
    this.scene.add(plate);
    this.worldDisposables.push(studTex, plateGeo, plateMat);

    // 2. Perimeter Curb & Boundary Markers
    const curbMat = new THREE.MeshStandardMaterial({
      color: 0x242a3a,
      roughness: 0.4,
      metalness: 0.65,
    });
    const curbGlowMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.55,
    });
    const edgeGeoH = new THREE.BoxGeometry(140.4, 0.45, 0.6);
    const edgeGeoV = new THREE.BoxGeometry(0.6, 0.45, 140.4);
    this.worldDisposables.push(curbMat, curbGlowMat, edgeGeoH, edgeGeoV);

    [69.8, -69.8].forEach((z) => {
      const m = new THREE.Mesh(edgeGeoH, curbMat);
      m.position.set(0, 0.22, z);
      this.scene.add(m);
    });
    [69.8, -69.8].forEach((x) => {
      const m = new THREE.Mesh(edgeGeoV, curbMat);
      m.position.set(x, 0.22, 0);
      this.scene.add(m);
    });

    // 3. Central Roll Altar / Spawn Pad (Composite multi-part landmark)
    const padBaseGeo = new THREE.CylinderGeometry(5.8, 6.4, 0.18, 48);
    const padMat = new THREE.MeshStandardMaterial({
      color: 0x141925,
      roughness: 0.45,
      metalness: 0.5,
    });
    const padBase = new THREE.Mesh(padBaseGeo, padMat);
    padBase.position.y = 0.04;
    padBase.receiveShadow = true;
    this.scene.add(padBase);

    const padRingGeo = new THREE.RingGeometry(5.55, 5.75, 48);
    padRingGeo.rotateX(-Math.PI / 2);
    const padRing = new THREE.Mesh(padRingGeo, curbGlowMat);
    padRing.position.y = 0.14;
    this.scene.add(padRing);
    this.worldDisposables.push(padBaseGeo, padMat, padRingGeo);

    // 4. Four Architectural Corner Obelisks (multi-part monoliths)
    const pillarBaseGeo = new THREE.BoxGeometry(3.2, 1.2, 3.2);
    const pillarShaftGeo = new THREE.BoxGeometry(1.8, 9.5, 1.8);
    const pillarCapGeo = new THREE.OctahedronGeometry(1.1, 0);
    const pillarCoreMat = new THREE.MeshStandardMaterial({
      color: 0x1b2130,
      roughness: 0.35,
      metalness: 0.72,
    });
    const pillarGemMat = new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      emissive: 0x38bdf8,
      emissiveIntensity: 1.5,
      roughness: 0.2,
      metalness: 0.3,
    });
    this.worldDisposables.push(
      pillarBaseGeo,
      pillarShaftGeo,
      pillarCapGeo,
      pillarCoreMat,
      pillarGemMat,
    );

    const corners: [number, number][] = [
      [26, 26],
      [-26, 26],
      [26, -26],
      [-26, -26],
    ];
    corners.forEach(([cx, cz]) => {
      const group = new THREE.Group();
      group.position.set(cx, 0, cz);
      const base = new THREE.Mesh(pillarBaseGeo, curbMat);
      base.position.y = 0.6;
      base.castShadow = true;
      base.receiveShadow = true;

      const shaft = new THREE.Mesh(pillarShaftGeo, pillarCoreMat);
      shaft.position.y = 5.4;
      shaft.castShadow = true;
      shaft.receiveShadow = true;

      const gem = new THREE.Mesh(pillarCapGeo, pillarGemMat);
      gem.position.y = 11.4;

      group.add(base, shaft, gem);
      this.scene.add(group);
    });

    // 5. Distant Horizon Terrain Ring (grounding beyond the baseplate)
    const mountainGeo = new THREE.ConeGeometry(18, 26, 5);
    const mountainMat = new THREE.MeshStandardMaterial({
      color: 0x101420,
      roughness: 0.9,
      metalness: 0.05,
    });
    this.worldDisposables.push(mountainGeo, mountainMat);

    const count = 18;
    const mountains = new THREE.InstancedMesh(mountainGeo, mountainMat, count);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const dist = 98 + (i % 3) * 14;
      dummy.position.set(Math.cos(a) * dist, 9, Math.sin(a) * dist);
      dummy.rotation.y = i * 0.9;
      const scale = 0.8 + (i % 4) * 0.35;
      dummy.scale.set(scale, scale * (0.7 + (i % 3) * 0.3), scale);
      dummy.updateMatrix();
      mountains.setMatrixAt(i, dummy.matrix);
    }
    mountains.computeBoundingSphere();
    this.scene.add(mountains);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT')
    ) {
      return;
    }
    const code = e.code;
    this.keys.add(code);
    void this.spatialAudio.resumeContext();
    if (code === 'Space' && this.isGrounded) {
      this.playerVelY = JUMP_VELOCITY;
      this.isGrounded = false;
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onPointerDown = (e: PointerEvent) => {
    void this.spatialAudio.resumeContext();
    this.isDragging = true;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.isDragging) return;
    const dx = e.clientX - this.lastPointerX;
    const dy = e.clientY - this.lastPointerY;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;

    this.camYaw -= dx * 0.0065;
    this.camPitch = THREE.MathUtils.clamp(this.camPitch + dy * 0.0055, 0.08, 1.25);
  };

  private onPointerUp = () => {
    this.isDragging = false;
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.camDistance = THREE.MathUtils.clamp(
      this.camDistance + e.deltaY * 0.006,
      3.2,
      18.0,
    );
  };

  private bindEvents() {
    const dom = this.renderer.domElement;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    dom.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    dom.addEventListener('wheel', this.onWheel, { passive: false });
  }

  public setTouchMove(x: number, y: number) {
    this.touchMove.x = x;
    this.touchMove.y = y;
  }

  public triggerJump() {
    if (this.isGrounded) {
      this.playerVelY = JUMP_VELOCITY;
      this.isGrounded = false;
    }
  }

  public resetSpawn() {
    this.playerPos.set(0, 0, 0);
    this.playerVelY = 0;
    this.isGrounded = true;
    this.playerYaw = 0;
  }

  public setEquippedAura(aura: AuraProject | null) {
    this.equippedAura = aura;
    if (aura) {
      this.rimLight.color.set(aura.environment.ambientRimColor);
      if (this.bloomPass) {
        this.bloomPass.strength = aura.environment.bloomStrength;
        this.bloomPass.radius = aura.environment.bloomRadius;
        this.bloomPass.threshold = aura.environment.bloomThreshold;
      }
      this.syncLayers(aura.layers);
      this.spatialAudio.setAuraAudio(this.rig.anchors.root, aura.audio);
    } else {
      this.syncLayers([]);
      this.spatialAudio.setAuraAudio(this.rig.anchors.root, undefined);
    }
  }

  public setAudioMuted(muted: boolean) {
    this.spatialAudio.setMuted(muted);
  }

  private syncLayers(layers: AuraLayer[]) {
    const incomingIds = new Set(layers.map((l) => l.id));
    for (const [id, runtime] of this.runtimes.entries()) {
      if (!incomingIds.has(id)) {
        runtime.dispose();
        this.runtimes.delete(id);
      }
    }
    for (const layer of layers) {
      const sig = getLayerStructuralSignature(layer);
      const existing = this.runtimes.get(layer.id);
      if (existing && existing.signature === sig) continue;
      if (existing) {
        existing.dispose();
        this.runtimes.delete(layer.id);
      }
      const created = buildLayerRuntime(layer, this.rig, this.maxAnisotropy);
      this.runtimes.set(layer.id, created);
    }
  }

  public handleResize() {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    if (this.composer && this.bloomPass) {
      this.composer.setSize(width, height);
      this.bloomPass.resolution.set(width, height);
    }
  }

  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (gl && typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 80);
        }
      };
      this.frameId = window.setTimeout(poll, 5);
    } else {
      this.frameId = window.setTimeout(cb, 80);
    }
  }

  private tick = () => {
    if (this.disposed) return;

    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0.0001, (now - this.lastNow) / 1000));
    this.lastNow = now;
    this.elapsed += dt;

    // 1. Compute horizontal movement relative to camera yaw
    let inputX = this.touchMove.x;
    let inputZ = this.touchMove.y;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) inputZ += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) inputZ -= 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) inputX -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) inputX += 1;

    const sprinting = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const speed = sprinting ? SPRINT_SPEED : WALK_SPEED;

    _camForward.set(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw)).normalize();
    _camRight.set(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw)).normalize();

    _moveDir.set(0, 0, 0);
    _moveDir.addScaledVector(_camForward, inputZ);
    _moveDir.addScaledVector(_camRight, inputX);

    const isMoving = _moveDir.lengthSq() > 0.001;
    if (isMoving) {
      _moveDir.normalize();
      this.playerPos.x = THREE.MathUtils.clamp(
        this.playerPos.x + _moveDir.x * speed * dt,
        -BASEPLATE_HALF,
        BASEPLATE_HALF,
      );
      this.playerPos.z = THREE.MathUtils.clamp(
        this.playerPos.z + _moveDir.z * speed * dt,
        -BASEPLATE_HALF,
        BASEPLATE_HALF,
      );

      // Smoothly turn R6 character toward walking direction
      const targetYaw = Math.atan2(_moveDir.x, _moveDir.z);
      let diff = targetYaw - this.playerYaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.playerYaw += diff * Math.min(1, dt * 12);
    }

    // 2. Vertical gravity & ground height (spawn pad at center has slight step 0.13)
    const distFromCenter = Math.hypot(this.playerPos.x, this.playerPos.z);
    const groundY = distFromCenter < 5.75 ? 0.13 : 0;

    if (!this.isGrounded || this.playerPos.y > groundY) {
      this.playerVelY -= GRAVITY * dt;
      this.playerPos.y += this.playerVelY * dt;
      if (this.playerPos.y <= groundY) {
        this.playerPos.y = groundY;
        this.playerVelY = 0;
        this.isGrounded = true;
      }
    } else {
      this.playerPos.y = groundY;
    }

    // 3. Apply transform to R6 Rig & Contact Shadow
    this.rig.root.position.copy(this.playerPos);
    this.rig.root.rotation.y = this.playerYaw;

    const airHeight = Math.max(0, this.playerPos.y - groundY);
    this.contactShadow.position.set(this.playerPos.x, groundY + 0.02, this.playerPos.z);
    const shadowScale = Math.max(0.45, 1 - airHeight * 0.12);
    this.contactShadow.scale.setScalar(shadowScale);
    (this.contactShadow.material as THREE.MeshBasicMaterial).opacity =
      0.65 * shadowScale;

    // 4. Update R6 Animation Pose (respecting aura levitate mode in-game)
    const isLevitate = Boolean(this.equippedAura?.levitate);
    if (!this.isGrounded) {
      this.rig.update(this.elapsed, 'jump');
    } else if (isMoving) {
      this.rig.update(
        this.elapsed,
        isLevitate ? 'levitate_walk' : 'walk',
        sprinting ? 1.25 : 0.95,
      );
    } else {
      this.rig.update(this.elapsed, isLevitate ? 'levitate' : 'idle');
    }

    // 5. Keep Shadows & Rim Light centered on player
    this.keyLight.position.set(
      this.playerPos.x + 14,
      this.playerPos.y + 24,
      this.playerPos.z + 16,
    );
    this.keyLight.target.position.copy(this.playerPos);

    this.rimLight.position.set(
      this.playerPos.x - 3.5,
      this.playerPos.y + 5.0,
      this.playerPos.z - 5.0,
    );
    this.rimLight.target.position.set(
      this.playerPos.x,
      this.playerPos.y + 1.4,
      this.playerPos.z,
    );

    // 6. Update Equipped Aura Layers
    if (this.equippedAura) {
      const pixelRatio = this.renderer.getPixelRatio();
      for (const layer of this.equippedAura.layers) {
        const runtime = this.runtimes.get(layer.id);
        if (runtime) {
          runtime.update(dt, this.elapsed, layer, pixelRatio);
        }
      }
    }

    // 7. Update Third-Person Follow Camera
    const horizDist = Math.cos(this.camPitch) * this.camDistance;
    const vertDist = Math.sin(this.camPitch) * this.camDistance;
    _lookTarget.set(this.playerPos.x, this.playerPos.y + 1.55, this.playerPos.z);
    _camGoal.set(
      _lookTarget.x + Math.sin(this.camYaw) * horizDist,
      _lookTarget.y + vertDist,
      _lookTarget.z + Math.cos(this.camYaw) * horizDist,
    );

    this.camera.position.lerp(_camGoal, Math.min(1, dt * 14));
    this.camera.lookAt(_lookTarget);

    if (this.isSoftwareGl || !this.composer) {
      this.renderer.render(this.scene, this.camera);
      this.afterDraw(this.tick);
    } else {
      this.composer.render();
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.resizeObserver.disconnect();

    const dom = this.renderer.domElement;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    dom.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    dom.removeEventListener('wheel', this.onWheel);

    this.spatialAudio.dispose();

    for (const runtime of this.runtimes.values()) {
      runtime.dispose();
    }
    this.runtimes.clear();

    this.rig.dispose();
    this.worldDisposables.forEach((d) => d.dispose());
    this.envRT.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
    if (dom.parentNode === this.container) {
      this.container.removeChild(dom);
    }
  }
}
