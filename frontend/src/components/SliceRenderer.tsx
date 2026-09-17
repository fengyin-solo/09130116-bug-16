import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useSelector } from 'react-redux';
import { SeismicData } from '../types';
import { RootState } from '../store';
import { seismicAPI } from '../services/api';
import { getSliceCount, SliceType } from '../utils/viewerSettings';

interface SliceRendererProps {
  seismicData: SeismicData;
}

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

interface SliceMeshProps {
  seismicData: SeismicData;
  sliceType: SliceType;
}

const SliceMesh: React.FC<SliceMeshProps> = ({ seismicData, sliceType }) => {
  const config = useSelector((state: RootState) => state.viewer.slices[sliceType]);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const textureRef = useRef<THREE.Texture | null>(null);
  const placeholderTexture = useMemo(() => createPlaceholderTexture(), []);

  const width = getSliceCount(seismicData, 'crossline') * 10;
  const height = getSliceCount(seismicData, 'depth') * 10;
  const depth = getSliceCount(seismicData, 'inline') * 10;

  const updateTexture = (nextTexture: THREE.Texture | null) => {
    textureRef.current = nextTexture;
    setTexture(nextTexture);
  };

  useEffect(() => {
    if (!config.visible) {
      updateTexture(null);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    let loadedTexture: THREE.Texture | null = null;

    const loadTexture = async () => {
      try {
        const response = await seismicAPI.getSliceImage(
          seismicData.id,
          sliceType,
          config.index,
          {
            colormap: config.colormap,
            min_value: config.minValue,
            max_value: config.maxValue,
          }
        );

        if (cancelled) return;

        objectUrl = URL.createObjectURL(response.data);
        loadedTexture = await new Promise<THREE.Texture>((resolve, reject) => {
          new THREE.TextureLoader().load(
            objectUrl!,
            (nextTexture) => {
              nextTexture.colorSpace = THREE.SRGBColorSpace;
              nextTexture.needsUpdate = true;
              resolve(nextTexture);
            },
            undefined,
            reject
          );
        });

        if (cancelled) return;

        updateTexture(loadedTexture);
        loadedTexture = null;
      } catch (error) {
        if (!cancelled) {
          console.error(`Failed to load ${sliceType} slice:`, error);
          updateTexture(null);
        }
      } finally {
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
        }
      }
    };

    loadTexture();

    return () => {
      cancelled = true;
      loadedTexture?.dispose();
      const currentTexture = textureRef.current;
      currentTexture?.dispose();
      textureRef.current = null;
      setTexture(null);
    };
  }, [
    config.visible,
    config.index,
    config.colormap,
    config.minValue,
    config.maxValue,
    seismicData.id,
    sliceType,
  ]);

  useEffect(() => () => placeholderTexture.dispose(), [placeholderTexture]);

  if (!config.visible) return null;

  const commonMaterial = (
    <meshBasicMaterial
      map={texture ?? placeholderTexture}
      transparent
      opacity={config.opacity}
      side={THREE.DoubleSide}
    />
  );

  if (sliceType === 'inline') {
    return (
      <mesh
        position={[config.index * 10, height / 2, depth / 2]}
        rotation={[0, Math.PI / 2, 0]}
      >
        <planeGeometry args={[depth, height]} />
        {commonMaterial}
      </mesh>
    );
  }

  if (sliceType === 'crossline') {
    return (
      <mesh position={[width / 2, height / 2, config.index * 10]}>
        <planeGeometry args={[width, height]} />
        {commonMaterial}
      </mesh>
    );
  }

  return (
    <mesh
      position={[width / 2, config.index * 10, depth / 2]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <planeGeometry args={[width, depth]} />
      {commonMaterial}
    </mesh>
  );
};

const SliceRenderer: React.FC<SliceRendererProps> = ({ seismicData }) => (
  <group>
    <SliceMesh seismicData={seismicData} sliceType="inline" />
    <SliceMesh seismicData={seismicData} sliceType="crossline" />
    <SliceMesh seismicData={seismicData} sliceType="depth" />
  </group>
);

export default SliceRenderer;
