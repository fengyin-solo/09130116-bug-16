import React, { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { SeismicData, VolumeRenderingConfig } from '../types';

interface VolumeRendererProps {
  seismicData: SeismicData;
  config: VolumeRenderingConfig;
}

const VolumeRenderer: React.FC<VolumeRendererProps> = ({ seismicData, config }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const width = (seismicData.num_crosslines || 100) * 10;
  const height = (seismicData.num_depths || 100) * 10;
  const depth = (seismicData.num_inlines || 100) * 10;

  const volumeData = useMemo(() => {
    const size = 64;
    const data = new Uint8Array(size * size * size);

    for (let z = 0; z < size; z++) {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const idx = z * size * size + y * size + x;
          
          const nx = x / size;
          const ny = y / size;
          const nz = z / size;
          
          const noise = Math.sin(nx * 20) * Math.sin(ny * 15) * Math.sin(nz * 25) * 0.5 +
                       Math.sin(nx * 10 + nz * 10) * 0.3 +
                       Math.cos(ny * 8) * Math.sin(nx * 12 + nz * 8) * 0.2;
          
          data[idx] = Math.floor((noise * 0.5 + 0.5) * 255);
        }
      }
    }
    return data;
  }, []);

  const volumeTexture = useMemo(() => {
    const texture = new THREE.Data3DTexture(
      volumeData,
      64,
      64,
      64
    );
    texture.format = THREE.RedFormat;
    texture.type = THREE.UnsignedByteType;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
  }, [volumeData]);

  const vertexShader = `
    varying vec3 vPosition;
    varying vec3 vWorldPosition;

    void main() {
      vPosition = position;
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `;

  const fragmentShader = `
    uniform sampler3D volumeTexture;
    uniform float opacity;
    uniform float sampleRate;
    uniform vec3 volumeSize;
    
    varying vec3 vPosition;
    varying vec3 vWorldPosition;

    vec4 rayMarch(vec3 rayOrigin, vec3 rayDir) {
      vec3 boxMin = -volumeSize * 0.5;
      vec3 boxMax = volumeSize * 0.5;
      
      float tmin = -1e10;
      float tmax = 1e10;
      
      for (int i = 0; i < 3; i++) {
        float invD = 1.0 / rayDir[i];
        float t0 = (boxMin[i] - rayOrigin[i]) * invD;
        float t1 = (boxMax[i] - rayOrigin[i]) * invD;
        if (invD < 0.0) {
          float temp = t0;
          t0 = t1;
          t1 = temp;
        }
        tmin = max(tmin, t0);
        tmax = min(tmax, t1);
      }
      
      if (tmax < tmin || tmax < 0.0) {
        return vec4(0.0);
      }
      
      tmin = max(tmin, 0.0);
      
      vec4 color = vec4(0.0);
      float stepSize = sampleRate * min(min(volumeSize.x, volumeSize.y), volumeSize.z) / 100.0;
      vec3 pos = rayOrigin + rayDir * tmin;
      
      for (float t = tmin; t < tmax; t += stepSize) {
        vec3 uvw = (pos - boxMin) / volumeSize;
        
        if (any(lessThan(uvw, vec3(0.0))) || any(greaterThan(uvw, vec3(1.0)))) {
          break;
        }
        
        float density = texture(volumeTexture, uvw).r;
        
        if (density > 0.1) {
          vec3 rgb;
          if (density < 0.3) {
            rgb = mix(vec3(0.0, 0.0, 1.0), vec3(0.0, 1.0, 1.0), density / 0.3);
          } else if (density < 0.5) {
            rgb = mix(vec3(0.0, 1.0, 1.0), vec3(0.0, 1.0, 0.0), (density - 0.3) / 0.2);
          } else if (density < 0.7) {
            rgb = mix(vec3(0.0, 1.0, 0.0), vec3(1.0, 1.0, 0.0), (density - 0.5) / 0.2);
          } else {
            rgb = mix(vec3(1.0, 1.0, 0.0), vec3(1.0, 0.0, 0.0), (density - 0.7) / 0.3);
          }
          
          float alpha = density * opacity * stepSize * 50.0;
          color.rgb = color.rgb + (1.0 - color.a) * rgb * alpha;
          color.a = color.a + (1.0 - color.a) * alpha;
          
          if (color.a > 0.95) {
            break;
          }
        }
        
        pos += rayDir * stepSize;
      }
      
      return color;
    }

    void main() {
      vec3 cameraPos = cameraPosition;
      vec3 rayDir = normalize(vWorldPosition - cameraPos);
      
      vec4 color = rayMarch(cameraPos, rayDir);
      
      if (color.a < 0.01) {
        discard;
      }
      
      gl_FragColor = color;
    }
  `;

  // uniforms 对象只创建一次：shaderMaterial 在首次挂载时绑定引用后，
  // 后续替换 uniforms 属性不会同步到 GPU。所有参数变化只更新各 uniform
  // 的 .value（见下面的 useEffect），从而保证任意 opacity 都立即生效，
  // 关闭再打开也不会沿用上一材质的中间值。
  const uniforms = useMemo(
    () => ({
      volumeTexture: { value: volumeTexture },
      opacity: { value: config.opacity },
      sampleRate: { value: config.sampleRate },
      volumeSize: { value: new THREE.Vector3(width, height, depth) },
    }),
    // 仅依赖纹理本身；config 的变化走下面的值同步
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [volumeTexture]
  );

  useEffect(() => {
    if (materialRef.current) {
      materialRef.current.uniforms.opacity.value = config.opacity;
      materialRef.current.uniforms.sampleRate.value = config.sampleRate;
      materialRef.current.uniforms.volumeSize.value.set(width, height, depth);
    }
    uniforms.opacity.value = config.opacity;
    uniforms.sampleRate.value = config.sampleRate;
    uniforms.volumeSize.value.set(width, height, depth);
  }, [uniforms, config.opacity, config.sampleRate, width, height, depth]);

  return (
    <mesh ref={meshRef} position={[width / 2, height / 2, depth / 2]}>
      <boxGeometry args={[width, height, depth]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        side={THREE.BackSide}
        depthWrite={false}
      />
    </mesh>
  );
};

export default VolumeRenderer;
