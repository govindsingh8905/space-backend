'use client';
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sphere } from '@react-three/drei';
import * as THREE from 'three';

const EARTH_RADIUS = 6.371; // scene units (1 unit = 1000 km)

// Inline shaders to avoid raw-loader dep in demo
const earthVert = `
  varying vec3 vNormal;
  varying vec2 vUv;
  varying vec3 vPosition;
  uniform vec3 uSunDirection;
  uniform float uTime;
  void main() {
    vNormal   = normalize(normalMatrix * normal);
    vUv       = uv;
    vPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const earthFrag = `
  varying vec3 vNormal;
  varying vec2 vUv;
  varying vec3 vPosition;
  uniform vec3 uSunDirection;
  uniform float uTime;
  uniform float uAtmosphereIntensity;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i=floor(p); vec2 f=fract(p);
    f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
  }
  float fbm(vec2 p) {
    float v=0.0; float a=0.5;
    for(int i=0;i<5;i++){v+=a*noise(p);p*=2.1;a*=0.5;}
    return v;
  }

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 sunDir = normalize(uSunDirection);
    float NdotL = dot(normal, sunDir);
    float diffuse = max(0.0, NdotL);
    float darkness = 1.0 - smoothstep(-0.15, 0.20, NdotL);

    // Base earth colors
    vec3 oceanDeep = vec3(0.03, 0.10, 0.26);
    vec3 oceanMid  = vec3(0.05, 0.18, 0.40);
    vec3 land      = vec3(0.14, 0.22, 0.09);
    vec3 desert    = vec3(0.38, 0.30, 0.12);
    vec3 snow      = vec3(0.85, 0.90, 0.95);

    float landMask   = smoothstep(0.43, 0.56, fbm(vUv * 3.5 + vec2(1.7,4.2)));
    float polarFade  = smoothstep(0.70, 0.86, abs(vUv.y - 0.5) * 2.0);
    float oceanDepth = fbm(vUv * 7.0);

    vec3 base = mix(oceanDeep, oceanMid, oceanDepth);
    vec3 terrain = mix(land, desert, fbm(vUv * 4.0 + vec2(3.0)));
    base = mix(base, terrain, landMask);
    base = mix(base, snow, polarFade);

    // Animated clouds
    float clouds = fbm((vUv + vec2(uTime*0.003,0.0)) * 4.0 + vec2(5.3,2.7));
    clouds = smoothstep(0.48, 0.68, clouds) * diffuse;
    base = mix(base, vec3(0.82, 0.85, 0.90), clouds * 0.65);

    // Lighting
    vec3 lit = base * (0.12 + diffuse * 0.88);

    // City lights
    float cityN = fbm(vUv*8.0)*fbm(vUv*22.0+3.7)*fbm(vUv*55.0+7.2);
    float cityLights = smoothstep(0.16, 0.52, cityN);
    cityLights *= smoothstep(0.43, 0.56, fbm(vUv*3.5+vec2(1.7,4.2)));
    cityLights *= (1.0 - smoothstep(0.60, 0.80, abs(vUv.y-0.5)*2.0));
    vec3 lightCol = mix(vec3(1.0,0.55,0.12), vec3(0.9,0.85,0.5), fbm(vUv*20.0+3.7));
    lit += lightCol * cityLights * darkness * 1.3;

    // Specular (ocean only)
    vec3 viewDir = normalize(-vPosition);
    vec3 halfDir = normalize(sunDir + viewDir);
    float spec   = pow(max(0.0, dot(normal, halfDir)), 90.0) * diffuse;
    spec *= (1.0 - landMask);
    lit += vec3(0.5,0.7,1.0) * spec * 0.45;

    // Atmosphere rim
    float rim = pow(1.0 - max(0.0, dot(normal, normalize(-vPosition))), 3.5);
    float sunInfluence = max(0.0, dot(normal, sunDir));
    vec3 atmoCol = mix(vec3(0.0,0.04,0.14), mix(vec3(0.1,0.35,0.9), vec3(0.5,0.7,1.0), sunInfluence), sunInfluence);
    lit += atmoCol * rim * uAtmosphereIntensity;

    gl_FragColor = vec4(lit, 1.0);
  }
`;

const atmosphereFrag = `
  varying vec3 vNormal;
  varying vec3 vPosition;
  uniform vec3 uSunDirection;
  uniform float uTime;
  uniform float uAtmosphereIntensity;
  varying vec2 vUv;
  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(-vPosition);
    float rim = pow(1.0 - max(0.0, dot(normal, viewDir)), 2.8);
    float sunInfluence = max(0.0, dot(normal, normalize(uSunDirection)));
    vec3 dayColor = mix(vec3(0.08,0.3,0.9), vec3(0.4,0.65,1.0), sunInfluence);
    vec3 nightColor = vec3(0.0, 0.02, 0.10);
    vec3 col = mix(nightColor, dayColor, sunInfluence) * rim * uAtmosphereIntensity;
    gl_FragColor = vec4(col, rim * 0.55);
  }
`;

export default function EarthModel() {
  const earthRef      = useRef<THREE.Mesh>(null);
  const atmosphereRef = useRef<THREE.Mesh>(null);

  const earthUniforms = useMemo(() => ({
    uSunDirection:       { value: new THREE.Vector3(1, 0.3, 0.5).normalize() },
    uTime:               { value: 0 },
    uAtmosphereIntensity: { value: 1.2 },
  }), []);

  const atmoUniforms = useMemo(() => ({
    uSunDirection:       { value: new THREE.Vector3(1, 0.3, 0.5).normalize() },
    uTime:               { value: 0 },
    uAtmosphereIntensity: { value: 1.5 },
  }), []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    earthUniforms.uTime.value = t;
    atmoUniforms.uTime.value  = t;

    // Slow rotation
    if (earthRef.current)      earthRef.current.rotation.y      = t * 0.05;
    if (atmosphereRef.current) atmosphereRef.current.rotation.y = t * 0.05;
  });

  return (
    <group>
      {/* Earth */}
      <Sphere ref={earthRef} args={[EARTH_RADIUS, 128, 128]}>
        <shaderMaterial
          vertexShader={earthVert}
          fragmentShader={earthFrag}
          uniforms={earthUniforms}
        />
      </Sphere>

      {/* Atmosphere shell */}
      <Sphere ref={atmosphereRef} args={[EARTH_RADIUS * 1.025, 64, 64]}>
        <shaderMaterial
          vertexShader={earthVert}
          fragmentShader={atmosphereFrag}
          uniforms={atmoUniforms}
          transparent
          side={THREE.BackSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </Sphere>

      {/* Inner glow (additive corona) */}
      <Sphere args={[EARTH_RADIUS * 1.06, 32, 32]}>
        <meshBasicMaterial
          color={new THREE.Color(0.05, 0.18, 0.5)}
          transparent
          opacity={0.06}
          side={THREE.BackSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </Sphere>
    </group>
  );
}
