import React, { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { useSelector } from 'react-redux';
import { SeismicData, SliceConfig } from '../types';
import { RootState } from '../store';
import { seismicAPI } from '../services/api';
import {
  SliceType,
  normalizeSliceConfig,
  getEffectiveValueRange,
} from '../utils/viewerSettings';

interface SliceRendererProps {
  seismicData: SeismicData;
}

interface SliceTextureCacheEntry {
  url: string;
}

/**
 * 已加载切片图的会话级缓存：所有切片共用，key 由“实际生效”的参数构成，
 * 保证同样的索引/色标/范围永远只请求一次，且任意切换路径命中同一缓存。
 */
const sliceTextureCache = new Map<string, SliceTextureCacheEntry>();
const inflightRequests = new Map<string, Promise<string | null>>();

const createPlaceholderTexture = (): THREE.Texture => {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  const gradient = ctx.createLinearGradient(0, 0, 256, 256);
  gradient.addColorStop(0, '#1a1a2e');
  gradient.addColorStop(0.5, '#16213e');
  gradient.addColorStop(1, '#0f3460');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 256; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 256);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(256, i);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
};

async function loadSliceImageUrl(
  seismicId: number,
  sliceType: SliceType,
  config: SliceConfig,
  min: number,
  max: number
): Promise<string | null> {
  // key 只用实际生效参数，保证色标/范围/索引任一变化都会取到新图
  const cacheKey = `${seismicId}:${sliceType}:${config.index}:${config.colormap}:${min}:${max}`;
  const cached = sliceTextureCache.get(cacheKey);
  if (cached) return cached.url;

  const inflight = inflightRequests.get(cacheKey);
  if (inflight) return inflight;

  const request = seismicAPI
    .getSliceImage(seismicId, sliceType, config.index, {
      colormap: config.colormap,
      min_value: min,
      max_value: max,
    })
    .then((response) => {
      const url = URL.createObjectURL(response.data);
      sliceTextureCache.set(cacheKey, { url });
      inflightRequests.delete(cacheKey);
      return url;
    })
    .catch((error) => {
      console.error(`Failed to load ${sliceType} slice ${config.index}:`, error);
      inflightRequests.delete(cacheKey);
      return null;
    });

  inflightRequests.set(cacheKey, request);
  return request;
}

interface SlicePlaneProps {
  seismicData: SeismicData;
  config: SliceConfig;
  geometry: [number, number];
  position: [number, number, number];
  rotation?: [number, number, number];
}

const SlicePlane: React.FC<SlicePlaneProps> = ({
  seismicData,
  config,
  geometry,
  position,
  rotation = [0, 0, 0],
}) => {
  const { min, max } = useMemo(
    () => getEffectiveValueRange(config, seismicData),
    [config, seismicData]
  );

  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const placeholderTexture = useMemo(() => createPlaceholderTexture(), []);

  useEffect(() => {
    let cancelled = false;

    loadSliceImageUrl(seismicData.id, config.type, config, min, max).then((url) => {
      if (cancelled || !url) return;
      const loaded = new THREE.TextureLoader().load(url);
      loaded.colorSpace = THREE.SRGBColorSpace;
      loaded.needsUpdate = true;
      setTexture(loaded);
    });

    return () => {
      cancelled = true;
    };
  }, [seismicData.id, config, min, max]);

  useEffect(() => () => placeholderTexture.dispose(), [placeholderTexture]);
  useEffect(() => () => texture?.dispose(), [texture]);

  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={geometry} />
      <meshBasicMaterial
        map={texture ?? placeholderTexture}
        transparent
        opacity={config.opacity}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
};

const SliceRenderer: React.FC<SliceRendererProps> = ({ seismicData }) => {
  const slices = useSelector((state: RootState) => state.viewer.slices);

  // 所有取参的唯一入口：任何来源的配置都先过同一套判定规则
  const inline = useMemo(
    () => normalizeSliceConfig(slices.inline, seismicData, 'inline'),
    [slices.inline, seismicData]
  );
  const crossline = useMemo(
    () => normalizeSliceConfig(slices.crossline, seismicData, 'crossline'),
    [slices.crossline, seismicData]
  );
  const depth = useMemo(
    () => normalizeSliceConfig(slices.depth, seismicData, 'depth'),
    [slices.depth, seismicData]
  );

  const width = (seismicData.num_crosslines || 100) * 10;
  const height = (seismicData.num_depths || 100) * 10;
  const depthWidth = (seismicData.num_inlines || 100) * 10;

  return (
    <group>
      {inline.visible && (
        <SlicePlane
          seismicData={seismicData}
          config={inline}
          geometry={[depthWidth, height]}
          position={[inline.index * 10, height / 2, depthWidth / 2]}
          rotation={[0, Math.PI / 2, 0]}
        />
      )}
      {crossline.visible && (
        <SlicePlane
          seismicData={seismicData}
          config={crossline}
          geometry={[width, height]}
          position={[width / 2, height / 2, crossline.index * 10]}
        />
      )}
      {depth.visible && (
        <SlicePlane
          seismicData={seismicData}
          config={depth}
          geometry={[width, depthWidth]}
          position={[width / 2, depth.index * 10, depthWidth / 2]}
          rotation={[-Math.PI / 2, 0, 0]}
        />
      )}
    </group>
  );
};

export default SliceRenderer;
