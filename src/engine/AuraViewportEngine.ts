import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { createContactShadowTexture } from '../aura/textures';
import type {
  AuraEnvironment,
  AuraLayer,
  AuraProject,
  CameraPreset,
  CharacterPoseMode,
  LayerEffectSettings,
  Vec3,
} from '../aura/types';
import { AuraTitleSpriteController } from './auraTitleSprite';
import {
  buildLayerRuntime,
  getLayerStructuralSignature,
  type CompiledLayerRuntime,
} from './layerBuilder';
import { createR6Character, type R6Rig } from './r6Character';
import {
  SpatialAuraAudioController,
  type SpatialAudioState,
} from './spatialAudio';

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

const CAMERA_PRESETS: Record<
  CameraPreset,
  { pos: [number, number, number]; target: [number, number, number] }
> = {
  hero: { pos: [3.6, 2.35, 4.4], target: [0, 1.35, 0] },
  front: { pos: [0, 1.6, 5.2], target: [0, 1.35, 0] },
  closeup: { pos: [1.55, 2.05, 2.25], target: [0, 1.7, 0] },
  top: { pos: [0.01, 6.2, 2.4], target: [0, 1.2, 0] },
  low: { pos: [2.8, 0.55, 3.6], target: [0, 1.5, 0] },
};

export type ViewportGizmoMode = 'translate' | 'scale' | 'none';

export interface LayerTransformCommitPatch {
  position?: Vec3;
  settings?: Partial<LayerEffectSettings>;
}

export interface EngineCallbacks {
  onContextLost?: () => void;
  onContextRestored?: () => void;
  onAudioStateChange?: (state: SpatialAudioState) => void;
  onCommitLayerTransform?: (layerId: string, patch: LayerTransformCommitPatch) => void;
  onTransformReadout?: (text: string | null) => void;
}

export class AuraViewportEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private rig: R6Rig;
  private isSoftwareGl: boolean;
  private maxAnisotropy: number;

  private rimLight: THREE.SpotLight;
  private stageGroup: THREE.Group;
  private gridHelper: THREE.GridHelper;
  private stageRingMesh: THREE.Mesh;

  private runtimes = new Map<string, CompiledLayerRuntime>();
  private currentProject: AuraProject | null = null;
  private poseMode: CharacterPoseMode = 'idle';
  private isPlaying = true;
  private timeScale = 1.0;
  private showGrid = true;
  private showStage = true;

  private elapsed = 0;
  private lastNow = performance.now();
  private frameId = 0;
  private disposed = false;

  // Smooth camera preset transition state
  private camGoalPos = new THREE.Vector3();
  private camGoalTarget = new THREE.Vector3();
  private camTransitionActive = false;

  private callbacks: EngineCallbacks;
  private resizeObserver: ResizeObserver;
  private envRT: THREE.WebGLRenderTarget;
  private contactShadowTex: THREE.CanvasTexture;
  private stageDisposables: { dispose: () => void }[] = [];
  private spatialAudio: SpatialAuraAudioController;
  private auraTitle: AuraTitleSpriteController;

  // Interactive 3D Transform Gizmo (Move RGB arrows / Object Resize)
  private transformControls: TransformControls;
  private transformHelper: THREE.Object3D;
  private gizmoProxy: THREE.Group;
  private selectedLayerId: string | null = null;
  private gizmoMode: ViewportGizmoMode = 'translate';
  private isDraggingGizmo = false;
  private dragStartLayer: AuraLayer | null = null;
  private liveDragLayerPatch: LayerTransformCommitPatch | null = null;

  constructor(container: HTMLElement, callbacks: EngineCallbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareWebGL();

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
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
    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.handleContextRestored);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#090b10');
    this.scene.fog = new THREE.FogExp2('#090b10', 0.032);

    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 120);
    this.camera.position.set(...CAMERA_PRESETS.hero.pos);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(...CAMERA_PRESETS.hero.target);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 1.6;
    this.controls.maxDistance = 24;
    this.controls.maxPolarAngle = Math.PI * 0.62;
    this.controls.addEventListener('start', () => {
      this.camTransitionActive = false;
    });
    this.controls.update();

    // Procedural Studio Environment Reflection
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.envRT = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this.envRT.texture;
    pmremGenerator.dispose();

    // 3-Point Studio Lighting Rig
    const hemi = new THREE.HemisphereLight(0x9fb8ff, 0x161922, 0.72);
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff1dc, 1.9);
    keyLight.position.set(4.5, 7.5, 5.0);
    keyLight.castShadow = !this.isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 20;
    const d = 4.2;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x6fa8ff, 0.55);
    fillLight.position.set(-5.0, 3.2, -3.5);
    this.scene.add(fillLight);

    this.rimLight = new THREE.SpotLight(0xf59e0b, 14, 18, Math.PI * 0.35, 0.65, 1.2);
    this.rimLight.position.set(-2.5, 4.5, -4.5);
    this.scene.add(this.rimLight);

    // Grounded Studio Pedestal & Reference Grid
    this.stageGroup = new THREE.Group();
    this.scene.add(this.stageGroup);

    const discGeo = new THREE.CylinderGeometry(2.8, 3.05, 0.08, 64);
    const discMat = new THREE.MeshStandardMaterial({
      color: 0x111520,
      roughness: 0.62,
      metalness: 0.35,
    });
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.position.y = -0.04;
    disc.receiveShadow = true;
    this.stageGroup.add(disc);
    this.stageDisposables.push(discGeo, discMat);

    const trimRingGeo = new THREE.RingGeometry(2.74, 2.79, 64);
    trimRingGeo.rotateX(-Math.PI / 2);
    const trimRingMat = new THREE.MeshBasicMaterial({
      color: 0x3b4459,
      transparent: true,
      opacity: 0.65,
    });
    this.stageRingMesh = new THREE.Mesh(trimRingGeo, trimRingMat);
    this.stageRingMesh.position.y = 0.003;
    this.stageGroup.add(this.stageRingMesh);
    this.stageDisposables.push(trimRingGeo, trimRingMat);

    this.contactShadowTex = createContactShadowTexture();
    const shadowGeo = new THREE.PlaneGeometry(1.9, 1.9);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: this.contactShadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.65,
    });
    const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
    shadowPlane.position.y = 0.004;
    this.stageGroup.add(shadowPlane);
    this.stageDisposables.push(shadowGeo, shadowMat, this.contactShadowTex);

    this.gridHelper = new THREE.GridHelper(22, 22, 0x262d3d, 0x161a24);
    this.gridHelper.position.y = -0.002;
    this.scene.add(this.gridHelper);

    // Classic 6-part R6 Character
    this.rig = createR6Character();
    this.scene.add(this.rig.root);
    this.auraTitle = new AuraTitleSpriteController(this.scene);

    // Post-processing Bloom on GPU
    if (!this.isSoftwareGl) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(width, height),
        0.8,
        0.5,
        0.64,
      );
      this.composer.addPass(this.bloomPass);
      this.composer.addPass(new OutputPass());
      this.renderer.compile(this.scene, this.camera);
    }

    this.spatialAudio = new SpatialAuraAudioController(this.camera, {
      onStateChange: (s) => this.callbacks.onAudioStateChange?.(s),
    });
    this.renderer.domElement.addEventListener('pointerdown', this.handleAudioUnlock);

    this.gizmoProxy = new THREE.Group();
    this.gizmoProxy.name = 'AuraLayerGizmoProxy';

    this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
    this.transformControls.setMode('translate');
    this.transformControls.setSpace('local');
    this.transformControls.setSize(0.9);
    this.transformHelper = this.transformControls.getHelper();
    this.transformHelper.visible = false;
    this.scene.add(this.transformHelper);

    this.transformControls.addEventListener('dragging-changed', this.handleGizmoDraggingChanged);
    this.transformControls.addEventListener('objectChange', this.handleGizmoObjectChange);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);

    this.lastNow = performance.now();
    this.tick();
  }

  private handleAudioUnlock = () => {
    void this.spatialAudio.resumeContext();
  };

  private handleContextLost = (e: Event) => {
    e.preventDefault();
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.callbacks.onContextLost?.();
  };

  private handleContextRestored = () => {
    this.callbacks.onContextRestored?.();
    this.lastNow = performance.now();
    this.tick();
  };

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

  private handleGizmoDraggingChanged = (event: { value?: unknown }) => {
    const dragging = Boolean(event.value);
    this.isDraggingGizmo = dragging;
    this.controls.enabled = !dragging;

    if (dragging) {
      this.camTransitionActive = false;
      const layer = this.currentProject?.layers.find((l) => l.id === this.selectedLayerId);
      if (layer) {
        this.dragStartLayer = JSON.parse(JSON.stringify(layer)) as AuraLayer;
        this.liveDragLayerPatch = null;
        this.gizmoProxy.position.set(layer.position.x, layer.position.y, layer.position.z);
        this.gizmoProxy.rotation.set(0, 0, 0);
        this.gizmoProxy.scale.set(1, 1, 1);
      }
    } else {
      this.callbacks.onTransformReadout?.(null);
      if (this.dragStartLayer && this.liveDragLayerPatch) {
        this.callbacks.onCommitLayerTransform?.(
          this.dragStartLayer.id,
          this.liveDragLayerPatch,
        );
      }
      this.dragStartLayer = null;
      this.liveDragLayerPatch = null;
      this.gizmoProxy.scale.set(1, 1, 1);
      this.syncGizmoAttachment();
    }
  };

  private handleGizmoObjectChange = () => {
    if (!this.isDraggingGizmo || !this.dragStartLayer) return;
    const base = this.dragStartLayer;

    if (this.gizmoMode === 'translate') {
      const nx = Number(THREE.MathUtils.clamp(this.gizmoProxy.position.x, -10, 10).toFixed(2));
      const ny = Number(THREE.MathUtils.clamp(this.gizmoProxy.position.y, -10, 10).toFixed(2));
      const nz = Number(THREE.MathUtils.clamp(this.gizmoProxy.position.z, -10, 10).toFixed(2));
      this.gizmoProxy.position.set(nx, ny, nz);
      this.liveDragLayerPatch = { position: { x: nx, y: ny, z: nz } };
      this.callbacks.onTransformReadout?.(
        `Pos  X: ${nx.toFixed(2)}  Y: ${ny.toFixed(2)}  Z: ${nz.toFixed(2)}`,
      );
      return;
    }

    if (this.gizmoMode === 'scale') {
      const sx = Math.max(0.1, Math.min(8, this.gizmoProxy.scale.x));
      const sy = Math.max(0.1, Math.min(8, this.gizmoProxy.scale.y));
      const sz = Math.max(0.1, Math.min(8, this.gizmoProxy.scale.z));
      this.gizmoProxy.scale.set(sx, sy, sz);

      const avgUniform = Math.cbrt(sx * sy * sz);
      const axis =
        (this.transformControls as unknown as { axis?: string | null }).axis ?? 'XYZ';
      const baseObjScale = base.settings.objectScale ?? 1.0;

      const nextSettings: Partial<LayerEffectSettings> = {};
      if (axis === 'X' || axis === 'Z' || axis === 'XZ') {
        if (base.type === 'glowing_materials') {
          const val = Number(
            THREE.MathUtils.clamp(baseObjScale * (axis === 'X' ? sx : sz), 0.15, 4.0).toFixed(2),
          );
          nextSettings.objectScale = val;
          this.callbacks.onTransformReadout?.(`Object Size: ${val.toFixed(2)}x`);
        } else {
          const radialFactor = axis === 'X' ? sx : axis === 'Z' ? sz : Math.sqrt(sx * sz);
          const nextRadius = Number(
            THREE.MathUtils.clamp(base.settings.radius * radialFactor, 0.1, 10).toFixed(2),
          );
          nextSettings.radius = nextRadius;
          this.callbacks.onTransformReadout?.(`Radius: ${nextRadius.toFixed(2)}`);
        }
      } else if (axis === 'Y') {
        if (
          base.type === 'energy_spheres' ||
          base.type === 'distortion_effects' ||
          base.type === 'glowing_materials'
        ) {
          const val = Number(
            THREE.MathUtils.clamp(baseObjScale * sy, 0.15, 4.0).toFixed(2),
          );
          nextSettings.objectScale = val;
          this.callbacks.onTransformReadout?.(`Object Size: ${val.toFixed(2)}x`);
        } else {
          const nextSpread = Number(
            THREE.MathUtils.clamp(base.settings.spread * sy, 0.1, 12).toFixed(2),
          );
          nextSettings.spread = nextSpread;
          this.callbacks.onTransformReadout?.(`Spread: ${nextSpread.toFixed(2)}`);
        }
      } else {
        const val = Number(
          THREE.MathUtils.clamp(baseObjScale * avgUniform, 0.15, 4.0).toFixed(2),
        );
        nextSettings.objectScale = val;
        this.callbacks.onTransformReadout?.(
          `Object Size: ${val.toFixed(2)}x (Overall Scale: ${base.settings.size.toFixed(2)})`,
        );
      }

      this.liveDragLayerPatch = { settings: nextSettings };
    }
  };

  private syncGizmoAttachment() {
    if (this.isDraggingGizmo || this.disposed) return;

    const layer = this.currentProject?.layers.find(
      (l) => l.id === this.selectedLayerId && l.visible,
    );
    const canTranslate = layer && layer.type !== 'glowing_materials';

    if (
      !layer ||
      this.gizmoMode === 'none' ||
      (this.gizmoMode === 'translate' && !canTranslate)
    ) {
      this.transformControls.detach();
      this.gizmoProxy.removeFromParent();
      this.transformHelper.visible = false;
      return;
    }

    const anchorObj = this.rig.anchors[layer.anchor] || this.rig.anchors.root;
    if (this.gizmoProxy.parent !== anchorObj) {
      anchorObj.add(this.gizmoProxy);
    }
    this.gizmoProxy.position.set(layer.position.x, layer.position.y, layer.position.z);
    this.gizmoProxy.rotation.set(0, 0, 0);
    this.gizmoProxy.scale.set(1, 1, 1);

    this.transformControls.setMode(this.gizmoMode);
    this.transformControls.setSpace('local');
    this.transformControls.attach(this.gizmoProxy);
    this.transformHelper.visible = true;
  }

  public setSelectedLayerId(layerId: string | null) {
    if (this.selectedLayerId === layerId) return;
    this.selectedLayerId = layerId;
    this.syncGizmoAttachment();
  }

  public setGizmoMode(mode: ViewportGizmoMode) {
    if (this.gizmoMode === mode) return;
    this.gizmoMode = mode;
    this.syncGizmoAttachment();
  }

  public setProject(project: AuraProject) {
    this.currentProject = project;
    this.applyEnvironment(project.environment);
    this.syncLayers(project.layers);
    this.spatialAudio.setAuraAudio(this.rig.anchors.root, project.audio);
    this.syncGizmoAttachment();
  }

  public setAudioMuted(muted: boolean) {
    this.spatialAudio.setMuted(muted);
  }

  public unlockAudio() {
    void this.spatialAudio.resumeContext();
  }

  private applyEnvironment(env: AuraEnvironment) {
    const bg = new THREE.Color(env.backgroundColor);
    this.scene.background = bg;
    this.scene.fog = new THREE.FogExp2(env.backgroundColor, 0.032);
    this.rimLight.color.set(env.ambientRimColor);
    if (this.bloomPass) {
      this.bloomPass.strength = env.bloomStrength;
      this.bloomPass.radius = env.bloomRadius;
      this.bloomPass.threshold = env.bloomThreshold;
    }
  }

  private syncLayers(layers: AuraLayer[]) {
    const incomingIds = new Set(layers.map((l) => l.id));

    // Dispose removed layers
    for (const [id, runtime] of this.runtimes.entries()) {
      if (!incomingIds.has(id)) {
        runtime.dispose();
        this.runtimes.delete(id);
      }
    }

    // Build or update existing layers
    for (const layer of layers) {
      const sig = getLayerStructuralSignature(layer);
      const existing = this.runtimes.get(layer.id);
      if (existing && existing.signature === sig) {
        continue;
      }
      if (existing) {
        existing.dispose();
        this.runtimes.delete(layer.id);
      }
      const created = buildLayerRuntime(layer, this.rig, this.maxAnisotropy);
      this.runtimes.set(layer.id, created);
    }
  }

  public setPoseMode(pose: CharacterPoseMode) {
    this.poseMode = pose;
  }

  public setPlaying(playing: boolean) {
    this.isPlaying = playing;
  }

  public setTimeScale(scale: number) {
    this.timeScale = Math.max(0.1, Math.min(3.0, scale));
  }

  public setStageOptions(opts: { showGrid?: boolean; showStage?: boolean }) {
    if (typeof opts.showGrid === 'boolean') {
      this.showGrid = opts.showGrid;
      this.gridHelper.visible = this.showGrid;
    }
    if (typeof opts.showStage === 'boolean') {
      this.showStage = opts.showStage;
      this.stageGroup.visible = this.showStage;
    }
  }

  public setCameraPreset(preset: CameraPreset) {
    const cfg = CAMERA_PRESETS[preset];
    this.camGoalPos.set(...cfg.pos);
    this.camGoalTarget.set(...cfg.target);
    this.camTransitionActive = true;
  }

  public restartSimulation() {
    this.elapsed = 0;
    if (this.currentProject) {
      for (const runtime of this.runtimes.values()) {
        runtime.dispose();
      }
      this.runtimes.clear();
      this.syncLayers(this.currentProject.layers);
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
    const rawDt = Math.min(0.05, Math.max(0.0001, (now - this.lastNow) / 1000));
    this.lastNow = now;

    const simDt = this.isPlaying ? rawDt * this.timeScale : 0;
    this.elapsed += simDt;

    // Smooth camera preset damping
    if (this.camTransitionActive) {
      const lambda = 7.0;
      this.camera.position.x = THREE.MathUtils.damp(
        this.camera.position.x,
        this.camGoalPos.x,
        lambda,
        rawDt,
      );
      this.camera.position.y = THREE.MathUtils.damp(
        this.camera.position.y,
        this.camGoalPos.y,
        lambda,
        rawDt,
      );
      this.camera.position.z = THREE.MathUtils.damp(
        this.camera.position.z,
        this.camGoalPos.z,
        lambda,
        rawDt,
      );
      this.controls.target.x = THREE.MathUtils.damp(
        this.controls.target.x,
        this.camGoalTarget.x,
        lambda,
        rawDt,
      );
      this.controls.target.y = THREE.MathUtils.damp(
        this.controls.target.y,
        this.camGoalTarget.y,
        lambda,
        rawDt,
      );
      this.controls.target.z = THREE.MathUtils.damp(
        this.controls.target.z,
        this.camGoalTarget.z,
        lambda,
        rawDt,
      );

      if (
        this.camera.position.distanceToSquared(this.camGoalPos) < 0.0008 &&
        this.controls.target.distanceToSquared(this.camGoalTarget) < 0.0008
      ) {
        this.camera.position.copy(this.camGoalPos);
        this.controls.target.copy(this.camGoalTarget);
        this.camTransitionActive = false;
      }
    }

    this.controls.update();
    this.rig.update(this.elapsed, this.poseMode);
    this.auraTitle.update(this.elapsed, this.currentProject, this.rig);

    if (this.currentProject) {
      this.spatialAudio.updateDistanceAttenuation(this.camera.position);
      const music = this.spatialAudio.sampleMusicSync(simDt);
      const pixelRatio = this.renderer.getPixelRatio();
      for (const layer of this.currentProject.layers) {
        const runtime = this.runtimes.get(layer.id);
        if (runtime) {
          const effectiveLayer =
            this.isDraggingGizmo &&
            this.dragStartLayer?.id === layer.id &&
            this.liveDragLayerPatch
              ? {
                  ...layer,
                  ...(this.liveDragLayerPatch.position
                    ? { position: this.liveDragLayerPatch.position }
                    : {}),
                  ...(this.liveDragLayerPatch.settings
                    ? {
                        settings: {
                          ...layer.settings,
                          ...this.liveDragLayerPatch.settings,
                        },
                      }
                    : {}),
                }
              : layer;
          runtime.update(simDt, this.elapsed, effectiveLayer, pixelRatio, music);
        }
      }
    }

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
    this.renderer.domElement.removeEventListener('pointerdown', this.handleAudioUnlock);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.handleContextRestored);

    this.spatialAudio.dispose();

    for (const runtime of this.runtimes.values()) {
      runtime.dispose();
    }
    this.runtimes.clear();

    this.transformControls.removeEventListener('dragging-changed', this.handleGizmoDraggingChanged);
    this.transformControls.removeEventListener('objectChange', this.handleGizmoObjectChange);
    this.transformControls.detach();
    this.transformControls.dispose();
    this.transformHelper.removeFromParent();
    this.gizmoProxy.removeFromParent();

    this.auraTitle.dispose();
    this.rig.dispose();
    this.stageDisposables.forEach((d) => d.dispose());
    this.envRT.dispose();
    this.controls.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
