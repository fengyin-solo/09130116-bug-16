/// <reference types="jest" />
import {
  getSliceCount,
  clampSliceIndex,
  clampUnitInterval,
  normalizeColormap,
  normalizeValueRange,
  getEffectiveValueRange,
  normalizeSliceConfig,
  normalizeVolumeConfig,
  normalizePreferences,
  buildDefaultPreferences,
  isDefaultPreferences,
  loadViewerPreferences,
  saveViewerPreferences,
  removeViewerPreferences,
} from '../utils/viewerSettings';
import type { SeismicData } from '../types';

const seismicData = {
  id: 7,
  project_id: 1,
  name: 'demo',
  description: null,
  file_type: 'segy',
  file_size: null,
  status: 'ready',
  upload_progress: 100,
  created_by: 1,
  created_at: '',
  num_inlines: 200,
  num_crosslines: 150,
  num_depths: 100,
  min_value: -10,
  max_value: 10,
} as unknown as SeismicData;

describe('viewer settings — 统一判定规则', () => {
  test('切片数量缺失时回退 100', () => {
    expect(getSliceCount(seismicData, 'inline')).toBe(200);
    expect(getSliceCount(seismicData, 'crossline')).toBe(150);
    expect(getSliceCount(seismicData, 'depth')).toBe(100);
    expect(getSliceCount(null, 'inline')).toBe(100);
    expect(getSliceCount({} as SeismicData, 'depth')).toBe(100);
    expect(getSliceCount({ num_inlines: 0 } as unknown as SeismicData, 'inline')).toBe(100);
  });

  test('切片索引一律夹取到 [0, count-1] 的整数', () => {
    expect(clampSliceIndex(50, 100)).toBe(50);
    expect(clampSliceIndex(99, 100)).toBe(99);
    expect(clampSliceIndex(100, 100)).toBe(99);
    expect(clampSliceIndex(9999, 100)).toBe(99);
    expect(clampSliceIndex(-5, 100)).toBe(0);
    expect(clampSliceIndex('12', 100)).toBe(12);
    expect(clampSliceIndex(NaN, 100)).toBe(0);
    expect(clampSliceIndex(undefined, 100)).toBe(0);
    expect(clampSliceIndex(3.7, 100)).toBe(4);
    // count=1 时只能是 0，任何输入都不会产生越界空白
    expect(clampSliceIndex(1, 1)).toBe(0);
  });

  test('不透明度/透明度夹取到 [0,1]，0 是合法值', () => {
    expect(clampUnitInterval(0)).toBe(0);
    expect(clampUnitInterval(1)).toBe(1);
    expect(clampUnitInterval(-0.5)).toBe(0);
    expect(clampUnitInterval(2)).toBe(1);
    expect(clampUnitInterval(NaN, 0.5)).toBe(0.5);
  });

  test('非法色标回退默认 seismic', () => {
    expect(normalizeColormap('gray')).toBe('gray');
    expect(normalizeColormap('rainbow')).toBe('rainbow');
    expect(normalizeColormap('magma')).toBe('seismic');
    expect(normalizeColormap(undefined)).toBe('seismic');
  });

  test('取值范围：null 表示默认，显式值夹到全局范围，颠倒时交换', () => {
    expect(normalizeValueRange(null, null, seismicData)).toEqual({ minValue: null, maxValue: null });
    expect(normalizeValueRange(-20, 20, seismicData)).toEqual({ minValue: -10, maxValue: 10 });
    expect(normalizeValueRange(5, -5, seismicData)).toEqual({ minValue: -5, maxValue: 5 });
    expect(normalizeValueRange(NaN, 8, seismicData)).toEqual({ minValue: null, maxValue: 8 });
  });

  test('生效范围：用户值优先，缺失回退全局，再缺失回退 [0,1]', () => {
    expect(getEffectiveValueRange({ minValue: null, maxValue: null }, seismicData)).toEqual({
      min: -10,
      max: 10,
    });
    expect(getEffectiveValueRange({ minValue: -2, maxValue: 3 }, seismicData)).toEqual({
      min: -2,
      max: 3,
    });
    expect(getEffectiveValueRange({ minValue: null, maxValue: null }, null)).toEqual({
      min: 0,
      max: 1,
    });
    expect(getEffectiveValueRange({ minValue: 9, maxValue: 1 }, null)).toEqual({
      min: 1,
      max: 9,
    });
  });

  test('normalizeSliceConfig 对任意来源产出同一份合法配置', () => {
    const normalized = normalizeSliceConfig(
      {
        type: 'inline',
        index: 9999,
        visible: 'yes' as unknown as boolean,
        opacity: 5,
        colormap: 'unknown',
        minValue: -100,
        maxValue: 100,
      },
      seismicData,
      'inline'
    );
    expect(normalized).toEqual({
      type: 'inline',
      index: 199,
      visible: true,
      opacity: 1,
      colormap: 'seismic',
      minValue: -10,
      maxValue: 10,
    });

    // 空输入 => 与默认切片一致
    expect(normalizeSliceConfig(null, seismicData, 'depth')).toEqual({
      type: 'depth',
      ...buildDefaultPreferences().slices.depth,
    });
  });

  test('体绘配置：opacity=0 保留，非法回退 0.5', () => {
    expect(normalizeVolumeConfig({ enabled: true, opacity: 0 }).opacity).toBe(0);
    expect(normalizeVolumeConfig(null)).toEqual({
      enabled: false,
      quality: 1,
      sampleRate: 0.5,
      opacity: 0.5,
    });
  });

  test('损坏的偏好整体回退默认', () => {
    const prefs = normalizePreferences(
      {
        slices: {
          inline: { index: 99999, opacity: 2, colormap: 'x', visible: true },
        },
        background: 'blue',
      } as unknown as Parameters<typeof normalizePreferences>[0],
      seismicData
    );
    expect(prefs.slices.inline.index).toBe(199);
    expect(prefs.slices.inline.opacity).toBe(1);
    expect(prefs.slices.inline.colormap).toBe('seismic');
    expect(prefs.slices.inline.minValue).toBeNull();
    expect(prefs.background).toBe('dark');
    expect(prefs.volumeRendering.opacity).toBe(0.5);
    expect(prefs.showAxes).toBe(true);
  });

  test('默认偏好判定', () => {
    expect(isDefaultPreferences(buildDefaultPreferences())).toBe(true);
    const changed = buildDefaultPreferences();
    changed.slices.inline.visible = true;
    expect(isDefaultPreferences(changed)).toBe(false);
  });
});

describe('viewer settings — 持久化', () => {
  beforeEach(() => localStorage.clear());

  test('保存后可按数据 id 读回', () => {
    const prefs = buildDefaultPreferences();
    prefs.slices.crossline.index = 42;
    prefs.background = 'light';
    saveViewerPreferences(7, prefs);

    const loaded = loadViewerPreferences(7);
    expect(loaded?.slices.crossline.index).toBe(42);
    expect(loaded?.background).toBe('light');
    expect(loadViewerPreferences(8)).toBeNull();
  });

  test('删除后读不到', () => {
    saveViewerPreferences(7, buildDefaultPreferences());
    removeViewerPreferences(7);
    expect(loadViewerPreferences(7)).toBeNull();
  });

  test('存储内容损坏时视为未保存', () => {
    localStorage.setItem('seismic:viewer-preferences:7', '{not-json');
    expect(loadViewerPreferences(7)).toBeNull();
  });
});
