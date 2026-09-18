import { SeismicData, SliceConfig, VolumeRenderingConfig } from '../types';

/**
 * 查看器显示参数的唯一判定规则来源。
 *
 * 控制面板派发、偏好恢复（hydrate）、3D 渲染取参、状态栏展示都必须经过
 * 这里的 normalize* 函数，保证同一份配置在任何切换路径上得到完全相同的
 * 有效索引 / 色标 / 取值范围 / 不透明度。
 */

export type SliceType = 'inline' | 'crossline' | 'depth';

export const SLICE_TYPES: SliceType[] = ['inline', 'crossline', 'depth'];

export const COLORMAPS = ['seismic', 'gray', 'rainbow'] as const;
export const DEFAULT_COLORMAP = 'seismic';

export const COLORMAP_LABELS: Record<string, string> = {
  seismic: '地震波色标',
  gray: '灰度',
  rainbow: '彩虹',
};

/** 元数据缺失时使用的兜底维度（与各组件历史行为保持一致）。 */
const FALLBACK_DIMENSION = 100;

export interface SlicePreferences {
  visible: boolean;
  index: number;
  opacity: number;
  colormap: string;
  minValue: number | null;
  maxValue: number | null;
}

export interface ViewerPreferences {
  slices: Record<SliceType, SlicePreferences>;
  volumeRendering: Pick<VolumeRenderingConfig, 'enabled' | 'quality' | 'sampleRate' | 'opacity'>;
  background: 'dark' | 'light';
  showAxes: boolean;
  showGrid: boolean;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** 每种切片的有效切片数量；所有上限判定都走这里。 */
export function getSliceCount(
  seismicData: SeismicData | null | undefined,
  sliceType: SliceType
): number {
  const raw =
    seismicData == null
      ? undefined
      : sliceType === 'inline'
      ? seismicData.num_inlines
      : sliceType === 'crossline'
      ? seismicData.num_crosslines
      : seismicData.num_depths;
  return isFiniteNumber(raw) && raw > 0 ? Math.floor(raw) : FALLBACK_DIMENSION;
}

/** 合法索引区间：[0, count-1] 的整数，非法输入一律回到 0。 */
export function clampSliceIndex(index: unknown, count: number): number {
  const n = typeof index === 'number' ? index : Number(index);
  if (!Number.isFinite(n)) return 0;
  const max = Math.max(0, count - 1);
  return Math.min(max, Math.max(0, Math.round(n)));
}

/** 不透明度 / 透明度统一规则：[0, 1]，非法值使用 fallback。 */
export function clampUnitInterval(value: unknown, fallback = 1): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

export function normalizeColormap(value: unknown): string {
  return typeof value === 'string' && (COLORMAPS as readonly string[]).includes(value)
    ? value
    : DEFAULT_COLORMAP;
}

function globalBounds(seismicData: SeismicData | null | undefined): {
  min: number | null;
  max: number | null;
} {
  return {
    min: isFiniteNumber(seismicData?.min_value) ? (seismicData!.min_value as number) : null,
    max: isFiniteNumber(seismicData?.max_value) ? (seismicData!.max_value as number) : null,
  };
}

/**
 * 用户自定义取值范围的判定：
 * - null 表示沿用数据全局最小/最大值（默认）；
 * - 显式值必须为有限数，且不超出全局范围；
 * - 若下界大于上界则交换，保证 min <= max。
 */
export function normalizeValueRange(
  minValue: unknown,
  maxValue: unknown,
  seismicData: SeismicData | null | undefined
): { minValue: number | null; maxValue: number | null } {
  const bounds = globalBounds(seismicData);

  let lo = isFiniteNumber(minValue) ? minValue : null;
  let hi = isFiniteNumber(maxValue) ? maxValue : null;

  if (lo !== null && bounds.min !== null) lo = Math.max(lo, bounds.min);
  if (hi !== null && bounds.max !== null) hi = Math.min(hi, bounds.max);

  if (lo !== null && hi !== null && lo > hi) {
    [lo, hi] = [hi, lo];
  }
  return { minValue: lo, maxValue: hi };
}

/**
 * 实际生效的取值范围（发往后端 / 用于展示的唯一标准）：
 * 用户值优先，缺失时回退到数据全局范围，再缺失时回退 [0, 1]，
 * 并保证 min <= max。
 */
export function getEffectiveValueRange(
  config: Pick<SliceConfig, 'minValue' | 'maxValue'>,
  seismicData: SeismicData | null | undefined
): { min: number; max: number } {
  const bounds = globalBounds(seismicData);
  let lo = isFiniteNumber(config.minValue) ? config.minValue! : bounds.min;
  let hi = isFiniteNumber(config.maxValue) ? config.maxValue! : bounds.max;
  if (!isFiniteNumber(lo)) lo = 0;
  if (!isFiniteNumber(hi)) hi = lo === 0 ? 1 : lo;
  if (lo > hi) {
    const tmp = lo;
    lo = hi;
    hi = tmp;
  }
  return { min: lo, max: hi };
}

/** 任意来源（面板 / 存储 / 默认）切片配置 -> 合法的标准配置。 */
export function normalizeSliceConfig(
  raw: Partial<SliceConfig> | null | undefined,
  seismicData: SeismicData | null | undefined,
  sliceType: SliceType
): SliceConfig {
  const range = normalizeValueRange(raw?.minValue, raw?.maxValue, seismicData);
  return {
    type: sliceType,
    index: clampSliceIndex(raw?.index, getSliceCount(seismicData, sliceType)),
    visible: Boolean(raw?.visible),
    opacity: clampUnitInterval(raw?.opacity, 1),
    colormap: normalizeColormap(raw?.colormap),
    minValue: range.minValue,
    maxValue: range.maxValue,
  };
}

export function normalizeVolumeConfig(
  raw: Partial<VolumeRenderingConfig> | null | undefined
): VolumeRenderingConfig {
  const opacity = clampUnitInterval(raw?.opacity, 0.5);
  const sampleRate = Number.isFinite(raw?.sampleRate)
    ? Math.min(1, Math.max(0, (raw!.sampleRate as number) ?? 0.5))
    : 0.5;
  const quality = Number.isFinite(raw?.quality)
    ? Math.min(2, Math.max(0.1, raw!.quality as number))
    : 1;
  return {
    enabled: Boolean(raw?.enabled),
    quality,
    sampleRate,
    opacity,
  };
}

/** 新数据首次打开时的默认显示偏好（也是 store initialState 的唯一来源）。 */
export function buildDefaultPreferences(): ViewerPreferences {
  const sliceDefaults = (): SlicePreferences => ({
    visible: false,
    index: 0,
    opacity: 1,
    colormap: DEFAULT_COLORMAP,
    minValue: null,
    maxValue: null,
  });
  return {
    slices: {
      inline: sliceDefaults(),
      crossline: sliceDefaults(),
      depth: sliceDefaults(),
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
  };
}

/** 任意来源的偏好数据 -> 合法偏好；存储损坏 / 字段缺失时逐字段回退默认。 */
export function normalizePreferences(
  raw: Partial<ViewerPreferences> | null | undefined,
  seismicData: SeismicData | null | undefined
): ViewerPreferences {
  const defaults = buildDefaultPreferences();
  const rawSlices = raw?.slices ?? ({} as Partial<ViewerPreferences['slices']>);
  return {
    slices: {
      inline: normalizeSliceConfig(rawSlices.inline, seismicData, 'inline'),
      crossline: normalizeSliceConfig(rawSlices.crossline, seismicData, 'crossline'),
      depth: normalizeSliceConfig(rawSlices.depth, seismicData, 'depth'),
    },
    volumeRendering: normalizeVolumeConfig(raw?.volumeRendering),
    background: raw?.background === 'light' ? 'light' : 'dark',
    showAxes: typeof raw?.showAxes === 'boolean' ? raw.showAxes : defaults.showAxes,
    showGrid: typeof raw?.showGrid === 'boolean' ? raw.showGrid : defaults.showGrid,
  };
}

/** 判断一份偏好是否与默认完全一致（一致时不写入存储，保持“默认设置不变”）。 */
export function isDefaultPreferences(prefs: ViewerPreferences): boolean {
  return JSON.stringify(prefs) === JSON.stringify(buildDefaultPreferences());
}

/* ------------------------------ 持久化（localStorage） ------------------------------ */

const STORAGE_PREFIX = 'seismic:viewer-preferences:';

function storageKey(seismicId: number): string {
  return `${STORAGE_PREFIX}${seismicId}`;
}

/** 读取某条地震数据保存过的显示偏好；任何损坏都视为“未保存过”，回退默认。 */
export function loadViewerPreferences(seismicId: number): ViewerPreferences | null {
  try {
    const raw = localStorage.getItem(storageKey(seismicId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ViewerPreferences>;
    if (typeof parsed !== 'object' || parsed === null) return null;
    return parsed as ViewerPreferences;
  } catch {
    return null;
  }
}

export function saveViewerPreferences(seismicId: number, preferences: ViewerPreferences): void {
  try {
    localStorage.setItem(storageKey(seismicId), JSON.stringify(preferences));
  } catch {
    // 存储不可用（隐私模式 / 配额）时静默降级为仅本次会话生效
  }
}

export function removeViewerPreferences(seismicId: number): void {
  try {
    localStorage.removeItem(storageKey(seismicId));
  } catch {
    // ignore
  }
}
