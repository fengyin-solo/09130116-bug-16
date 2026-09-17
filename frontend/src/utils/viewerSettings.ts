import { SeismicData, SliceConfig } from '../types';

export type SliceType = 'inline' | 'crossline' | 'depth';
export type Colormap = 'seismic' | 'gray' | 'rainbow';

export interface ViewerDisplaySettings {
  slices: Record<SliceType, SliceConfig>;
  volumeRendering: {
    enabled: boolean;
    quality: number;
    sampleRate: number;
    opacity: number;
  };
  background: 'dark' | 'light';
  showAxes: boolean;
  showGrid: boolean;
  zoom: number;
  rotation: [number, number, number];
}

export const SLICE_TYPES: SliceType[] = ['inline', 'crossline', 'depth'];
export const COLORMAPS: Colormap[] = ['seismic', 'gray', 'rainbow'];

export const createDefaultSlice = (type: SliceType): SliceConfig => ({
  type,
  index: 0,
  visible: false,
  opacity: 1,
  colormap: 'seismic',
  minValue: null,
  maxValue: null,
});

export const createDefaultDisplaySettings = (): ViewerDisplaySettings => ({
  slices: {
    inline: createDefaultSlice('inline'),
    crossline: createDefaultSlice('crossline'),
    depth: createDefaultSlice('depth'),
  },
  volumeRendering: {
    enabled: false,
    quality: 1,
    sampleRate: 0.5,
    opacity: 0.5,
  },
  background: 'dark',
  showAxes: true,
  showGrid: true,
  zoom: 1,
  rotation: [0, 0, 0],
});

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export const getSliceCount = (seismicData: SeismicData | null | undefined, type: SliceType): number => {
  const count =
    type === 'inline'
      ? seismicData?.num_inlines
      : type === 'crossline'
        ? seismicData?.num_crosslines
        : seismicData?.num_depths;

  return isFiniteNumber(count) && count > 0 ? Math.floor(count) : 100;
};

export const clampSliceIndex = (index: unknown, seismicData: SeismicData | null | undefined, type: SliceType): number => {
  const maxIndex = getSliceCount(seismicData, type) - 1;
  if (!isFiniteNumber(index)) return 0;
  return Math.min(maxIndex, Math.max(0, Math.round(index)));
};

export const clampUnitInterval = (value: unknown, fallback: number): number => {
  if (!isFiniteNumber(value)) return fallback;
  return Math.min(1, Math.max(0, value));
};

export const clamp01 = clampUnitInterval;

const normalizeColormap = (value: unknown): Colormap =>
  COLORMAPS.includes(value as Colormap) ? (value as Colormap) : 'seismic';

const normalizeRangeValue = (
  value: unknown,
  dataMin: number,
  dataMax: number,
  fallback: number
): number => {
  if (!isFiniteNumber(value)) return fallback;
  return Math.min(dataMax, Math.max(dataMin, value));
};

export const normalizeValueRange = (
  minValue: unknown,
  maxValue: unknown,
  seismicData: SeismicData | null | undefined
): { minValue: number | null; maxValue: number | null } => {
  if (minValue === null || maxValue === null) return { minValue: null, maxValue: null };
  if (!isFiniteNumber(minValue) || !isFiniteNumber(maxValue)) return { minValue: null, maxValue: null };

  const dataMin = isFiniteNumber(seismicData?.min_value) ? (seismicData.min_value as number) : null;
  const dataMax = isFiniteNumber(seismicData?.max_value) ? (seismicData.max_value as number) : null;

  if (dataMin === null || dataMax === null) {
    return maxValue > minValue
      ? { minValue, maxValue }
      : { minValue: null, maxValue: null };
  }

  const [safeMin, safeMax] = dataMin <= dataMax ? [dataMin, dataMax] : [dataMax, dataMin];
  const rangeSpan = safeMax - safeMin || 1;
  const epsilon = rangeSpan * 1e-6;

  let min = normalizeRangeValue(minValue, safeMin, safeMax, safeMin);
  let max = normalizeRangeValue(maxValue, safeMin, safeMax, safeMax);

  if (min > max) {
    [min, max] = [max, min];
  }

  if (max - min < epsilon) {
    if (min > safeMin) min = Math.max(safeMin, min - epsilon);
    else if (max < safeMax) max = Math.min(safeMax, max + epsilon);
  }

  if (max - min < epsilon) {
    return { minValue: null, maxValue: null };
  }

  return { minValue: min, maxValue: max };
};

export const normalizeSliceConfig = (
  type: SliceType,
  value: unknown,
  seismicData: SeismicData | null | undefined
): SliceConfig => {
  const candidate = (value ?? {}) as Partial<SliceConfig>;
  const range = normalizeValueRange(candidate.minValue, candidate.maxValue, seismicData);

  return {
    type,
    index: clampSliceIndex(candidate.index, seismicData, type),
    visible: typeof candidate.visible === 'boolean' ? candidate.visible : false,
    opacity: clamp01(candidate.opacity, 1),
    colormap: normalizeColormap(candidate.colormap),
    minValue: range.minValue,
    maxValue: range.maxValue,
  };
};

export const normalizeDisplaySettings = (
  value: unknown,
  seismicData: SeismicData | null | undefined
): ViewerDisplaySettings => {
  const defaults = createDefaultDisplaySettings();
  const candidate = (value ?? {}) as Partial<ViewerDisplaySettings>;
  const candidateSlices = candidate.slices as Partial<Record<SliceType, unknown>> | undefined;

  return {
    slices: {
      inline: normalizeSliceConfig('inline', candidateSlices?.inline, seismicData),
      crossline: normalizeSliceConfig('crossline', candidateSlices?.crossline, seismicData),
      depth: normalizeSliceConfig('depth', candidateSlices?.depth, seismicData),
    },
    volumeRendering: {
      enabled: typeof candidate.volumeRendering?.enabled === 'boolean'
        ? candidate.volumeRendering.enabled
        : defaults.volumeRendering.enabled,
      quality: clamp01(candidate.volumeRendering?.quality, defaults.volumeRendering.quality),
      sampleRate: clamp01(candidate.volumeRendering?.sampleRate, defaults.volumeRendering.sampleRate),
      opacity: clamp01(candidate.volumeRendering?.opacity, defaults.volumeRendering.opacity),
    },
    background: candidate.background === 'light' ? 'light' : 'dark',
    showAxes: typeof candidate.showAxes === 'boolean' ? candidate.showAxes : true,
    showGrid: typeof candidate.showGrid === 'boolean' ? candidate.showGrid : true,
    zoom: isFiniteNumber(candidate.zoom) ? candidate.zoom : 1,
    rotation: Array.isArray(candidate.rotation) && candidate.rotation.every(isFiniteNumber)
      ? [
          Number(candidate.rotation[0]),
          Number(candidate.rotation[1]),
          Number(candidate.rotation[2]),
        ] as [number, number, number]
      : [0, 0, 0],
  };
};

const SETTINGS_STORAGE_PREFIX = 'seismic-viewer-settings:';

export const getViewerSettingsStorageKey = (seismicId: number): string =>
  `${SETTINGS_STORAGE_PREFIX}${seismicId}`;

export const loadViewerDisplaySettings = (seismicId: number, seismicData: SeismicData): ViewerDisplaySettings => {
  try {
    const raw = localStorage.getItem(getViewerSettingsStorageKey(seismicId));
    if (!raw) return createDefaultDisplaySettings();
    return normalizeDisplaySettings(JSON.parse(raw), seismicData);
  } catch {
    return createDefaultDisplaySettings();
  }
};

export const saveViewerDisplaySettings = (seismicId: number, settings: ViewerDisplaySettings): void => {
  try {
    localStorage.setItem(getViewerSettingsStorageKey(seismicId), JSON.stringify(settings));
  } catch {
    // Browser storage can be unavailable in private/restricted environments.
  }
};

export const clearViewerDisplaySettings = (seismicId: number): void => {
  try {
    localStorage.removeItem(getViewerSettingsStorageKey(seismicId));
  } catch {
    // No saved preference needs to be cleared when storage is unavailable.
  }
};
