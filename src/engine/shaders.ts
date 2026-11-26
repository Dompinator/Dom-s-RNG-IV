import * as THREE from 'three';

const NOISE_GLSL = /* glsl */ `
  float hash31(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float noise3D(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    float n000 = hash31(i + vec3(0.0, 0.0, 0.0));
    float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash31(i + vec3(1.0, 1.0, 1.0));

    float nx00 = mix(n000, n100, f.x);
    float nx10 = mix(n010, n110, f.x);
    float nx01 = mix(n001, n101, f.x);
    float nx11 = mix(n011, n111, f.x);

    float nxy0 = mix(nx00, nx10, f.y);
    float nxy1 = mix(nx01, nx11, f.y);

    return mix(nxy0, nxy1, f.z);
  }

  float fbm3(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise3D(p);
      p = p * 2.05 + vec3(1.7, 9.2, 4.3);
      a *= 0.5;
    }
    return v;
  }
`;

export function createEnergySphereShaderMaterial(texture: THREE.Texture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColorA: { value: new THREE.Color('#f59e0b') },
      uColorB: { value: new THREE.Color('#ef4444') },
      uIntensity: { value: 1.5 },
      uOpacity: { value: 0.75 },
      uTurbulence: { value: 0.5 },
      uMap: { value: texture },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uTurbulence;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewPos;
      varying vec3 vLocalPos;
      ${NOISE_GLSL}

      void main() {
        vUv = uv;
        vLocalPos = position;
        float n = fbm3(position * 2.2 + vec3(uTime * 0.7, -uTime * 0.5, uTime * 0.4));
        vec3 displaced = position + normal * (n - 0.5) * uTurbulence * 0.25;
        vec4 mvPos = modelViewMatrix * vec4(displaced, 1.0);
        vViewPos = -mvPos.xyz;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      uniform float uIntensity;
      uniform float uOpacity;
      uniform float uTurbulence;
      uniform sampler2D uMap;

      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewPos;
      varying vec3 vLocalPos;
      ${NOISE_GLSL}

      void main() {
        vec3 viewDir = normalize(vViewPos);
        vec3 norm = normalize(vNormal);
        float ndotv = abs(dot(viewDir, norm));
        float fresnel = pow(1.0 - ndotv, 2.2);

        float plasma = fbm3(vLocalPos * 2.8 + vec3(0.0, -uTime * 1.1, uTime * 0.6));
        vec2 scrollUv = vUv * vec2(2.0, 2.0) + vec2(uTime * 0.15, -uTime * 0.22);
        float texAlpha = texture2D(uMap, scrollUv).a;

        float energy = smoothstep(0.2, 0.85, plasma * 0.7 + texAlpha * 0.45);
        vec3 col = mix(uColorA, uColorB, clamp(energy + fresnel * 0.5, 0.0, 1.0));
        float alpha = clamp((fresnel * 0.85 + energy * 0.35) * uOpacity, 0.0, 1.0);

        gl_FragColor = vec4(col * uIntensity * (0.8 + fresnel * 1.4), alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

export function createRingShaderMaterial(texture: THREE.Texture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColorA: { value: new THREE.Color('#38bdf8') },
      uColorB: { value: new THREE.Color('#e0f2fe') },
      uIntensity: { value: 1.5 },
      uOpacity: { value: 0.9 },
      uMap: { value: texture },
      uDirection: { value: 1.0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      uniform float uIntensity;
      uniform float uOpacity;
      uniform sampler2D uMap;
      uniform float uDirection;
      varying vec2 vUv;

      void main() {
        vec2 uv = vec2(fract(vUv.x * 3.0 + uTime * 0.22 * uDirection), vUv.y);
        vec4 tex = texture2D(uMap, uv);
        float pulse = 0.75 + 0.25 * sin(vUv.x * 12.566 + uTime * 3.0);
        float edgeGlow = smoothstep(0.0, 0.5, 1.0 - abs(vUv.y - 0.5) * 2.0);
        vec3 col = mix(uColorA, uColorB, tex.a * 0.7 + edgeGlow * 0.3);
        float alpha = clamp((tex.a * 0.8 + 0.2) * edgeGlow * uOpacity, 0.0, 1.0);
        gl_FragColor = vec4(col * uIntensity * pulse, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

export function createParticleShaderMaterial(texture: THREE.Texture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColorA: { value: new THREE.Color('#fbbf24') },
      uColorB: { value: new THREE.Color('#f97316') },
      uSize: { value: 28.0 },
      uIntensity: { value: 1.6 },
      uOpacity: { value: 0.9 },
      uPixelRatio: { value: 1.0 },
      uMap: { value: texture },
    },
    vertexShader: /* glsl */ `
      attribute float aLife;
      attribute float aScale;
      uniform float uSize;
      uniform float uPixelRatio;
      varying float vLife;

      void main() {
        vLife = aLife;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float fadeScale = sin(clamp(aLife, 0.0, 1.0) * 3.14159265);
        gl_PointSize = max(2.0, uSize * aScale * fadeScale * uPixelRatio * (10.0 / max(1.0, -mvPosition.z)));
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      uniform float uIntensity;
      uniform float uOpacity;
      uniform sampler2D uMap;
      varying float vLife;

      void main() {
        vec4 tex = texture2D(uMap, gl_PointCoord);
        if (tex.a < 0.02) discard;
        float fade = sin(clamp(vLife, 0.0, 1.0) * 3.14159265);
        vec3 col = mix(uColorA, uColorB, vLife);
        gl_FragColor = vec4(col * tex.rgb * uIntensity, tex.a * fade * uOpacity);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

export function createRibbonShaderMaterial(texture: THREE.Texture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColorA: { value: new THREE.Color('#ec4899') },
      uColorB: { value: new THREE.Color('#8b5cf6') },
      uIntensity: { value: 1.7 },
      uOpacity: { value: 0.85 },
      uDirection: { value: 1.0 },
      uMap: { value: texture },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      uniform float uIntensity;
      uniform float uOpacity;
      uniform float uDirection;
      uniform sampler2D uMap;
      varying vec2 vUv;

      void main() {
        float taper = sin(vUv.x * 3.14159265);
        float crossFade = sin(vUv.y * 3.14159265);
        vec2 flowUv = vec2(fract(vUv.x * 2.5 - uTime * 0.85 * uDirection), vUv.y);
        float texVal = texture2D(uMap, flowUv).a;
        float streak = 0.55 + 0.45 * sin(vUv.x * 18.0 - uTime * 4.0 * uDirection);
        vec3 col = mix(uColorA, uColorB, vUv.x);
        float alpha = clamp(taper * crossFade * (0.45 + texVal * 0.75) * streak * uOpacity, 0.0, 1.0);
        gl_FragColor = vec4(col * uIntensity, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

export function createDistortionShaderMaterial(texture: THREE.Texture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColorA: { value: new THREE.Color('#c084fc') },
      uColorB: { value: new THREE.Color('#22d3ee') },
      uIntensity: { value: 1.5 },
      uOpacity: { value: 0.55 },
      uTurbulence: { value: 0.85 },
      uMap: { value: texture },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uTurbulence;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewPos;
      varying vec3 vPos;
      ${NOISE_GLSL}

      void main() {
        vUv = uv;
        float w1 = sin(position.y * 5.0 + uTime * 3.5);
        float w2 = fbm3(position * 2.5 + vec3(uTime * 1.2));
        vec3 displaced = position + normal * ((w1 * 0.06 + (w2 - 0.5) * 0.35) * uTurbulence);
        vPos = displaced;
        vec4 mvPos = modelViewMatrix * vec4(displaced, 1.0);
        vViewPos = -mvPos.xyz;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      uniform float uIntensity;
      uniform float uOpacity;
      uniform sampler2D uMap;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewPos;
      varying vec3 vPos;

      void main() {
        vec3 viewDir = normalize(vViewPos);
        vec3 n = normalize(vNormal);
        float rim = pow(1.0 - abs(dot(viewDir, n)), 2.8);

        // Chromatic ripple interference bands
        float ripple = 0.5 + 0.5 * sin(length(vPos.xy) * 14.0 - uTime * 4.5);
        float tex = texture2D(uMap, vUv * 2.0 + vec2(uTime * 0.2, -uTime * 0.3)).a;

        vec3 shiftCol = mix(uColorA, uColorB, ripple);
        shiftCol.r += rim * 0.25;
        shiftCol.b += (1.0 - ripple) * rim * 0.25;

        float alpha = clamp((rim * 0.9 + ripple * tex * 0.25) * uOpacity, 0.0, 1.0);
        gl_FragColor = vec4(shiftCol * uIntensity * (0.7 + rim * 1.4), alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

export function createGlowShellShaderMaterial(texture: THREE.Texture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColorA: { value: new THREE.Color('#22d3ee') },
      uColorB: { value: new THREE.Color('#3b82f6') },
      uIntensity: { value: 2.0 },
      uOpacity: { value: 0.8 },
      uTurbulence: { value: 0.4 },
      uMap: { value: texture },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewPos;
      varying vec3 vLocalPos;

      void main() {
        vUv = uv;
        vLocalPos = position;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewPos = -mvPos.xyz;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      uniform float uIntensity;
      uniform float uOpacity;
      uniform float uTurbulence;
      uniform sampler2D uMap;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewPos;
      varying vec3 vLocalPos;

      void main() {
        vec3 viewDir = normalize(vViewPos);
        vec3 n = normalize(vNormal);
        float fresnel = pow(1.0 - abs(dot(viewDir, n)), 1.9);
        float scan = 0.65 + 0.35 * sin(vLocalPos.y * 8.0 - uTime * 3.5);
        float pattern = texture2D(uMap, vUv * 2.0 + vec2(0.0, -uTime * 0.35)).a;
        vec3 col = mix(uColorA, uColorB, scan * 0.6 + pattern * 0.4);
        float alpha = clamp((fresnel * 0.95 + pattern * 0.25 * uTurbulence) * scan * uOpacity, 0.0, 1.0);
        gl_FragColor = vec4(col * uIntensity * (0.85 + fresnel), alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
  });
}

export function createLightBeamShaderMaterial(texture: THREE.Texture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColorA: { value: new THREE.Color('#fde68a') },
      uColorB: { value: new THREE.Color('#f59e0b') },
      uIntensity: { value: 1.4 },
      uOpacity: { value: 0.45 },
      uMap: { value: texture },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewPos;
      void main() {
        vUv = uv;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewPos = -mvPos.xyz;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      uniform float uIntensity;
      uniform float uOpacity;
      uniform sampler2D uMap;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewPos;

      void main() {
        vec3 viewDir = normalize(vViewPos);
        vec3 n = normalize(vNormal);
        // Soft edge fade using view alignment so cylinder edges never look sharp
        float softEdge = pow(abs(dot(viewDir, n)), 1.6);
        float verticalFade = smoothstep(0.0, 0.15, vUv.y) * pow(1.0 - vUv.y, 1.4);
        float rays = 0.7 + 0.3 * sin(vUv.x * 25.1327 + uTime * 1.5);
        float tex = texture2D(uMap, vec2(vUv.x * 2.0, vUv.y - uTime * 0.25)).a;
        vec3 col = mix(uColorA, uColorB, vUv.y);
        float alpha = clamp(softEdge * verticalFade * rays * (0.65 + tex * 0.35) * uOpacity, 0.0, 1.0);
        gl_FragColor = vec4(col * uIntensity, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}
