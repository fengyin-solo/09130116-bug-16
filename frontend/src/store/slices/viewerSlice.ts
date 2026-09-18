import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { SliceConfig, VolumeRenderingConfig, Point3D, MeasurementResult } from '../../types';
import { buildDefaultPreferences, SliceType } from '../../utils/viewerSettings';

interface ViewerState {
  slices: {
    inline: SliceConfig;
    crossline: SliceConfig;
    depth: SliceConfig;
  };
  volumeRendering: VolumeRenderingConfig;
  tool: 'select' | 'pan' | 'rotate' | 'measure' | 'annotate';
  measurementType: 'distance' | 'area' | 'volume';
  measurementPoints: Point3D[];
  lastMeasurement: MeasurementResult | null;
  background: 'dark' | 'light';
  showAxes: boolean;
  showGrid: boolean;
  zoom: number;
  rotation: [number, number, number];
}

const defaults = buildDefaultPreferences();

const initialState: ViewerState = {
  slices: {
    inline: { type: 'inline', ...defaults.slices.inline },
    crossline: { type: 'crossline', ...defaults.slices.crossline },
    depth: { type: 'depth', ...defaults.slices.depth },
  },
  volumeRendering: { ...defaults.volumeRendering },
  tool: 'rotate',
  measurementType: 'distance',
  measurementPoints: [],
  lastMeasurement: null,
  background: defaults.background,
  showAxes: defaults.showAxes,
  showGrid: defaults.showGrid,
  zoom: 1,
  rotation: [0, 0, 0],
};

const viewerSlice = createSlice({
  name: 'viewer',
  initialState,
  reducers: {
    /**
     * 用已经过 normalizePreferences 校验的显示偏好整体覆盖当前配置
     * （页面加载 / 切换数据时使用）。工具、测量点、相机等会话状态不动。
     */
    hydrateViewer: (
      state,
      action: PayloadAction<{
        slices: Record<SliceType, Omit<SliceConfig, 'type'>>;
        volumeRendering: VolumeRenderingConfig;
        background: 'dark' | 'light';
        showAxes: boolean;
        showGrid: boolean;
      }>
    ) => {
      const { slices, volumeRendering, background, showAxes, showGrid } = action.payload;
      (['inline', 'crossline', 'depth'] as SliceType[]).forEach((sliceType) => {
        state.slices[sliceType] = { type: sliceType, ...slices[sliceType] };
      });
      state.volumeRendering = volumeRendering;
      state.background = background;
      state.showAxes = showAxes;
      state.showGrid = showGrid;
    },
    setSliceVisible: (
      state,
      action: PayloadAction<{ sliceType: SliceType; visible: boolean }>
    ) => {
      state.slices[action.payload.sliceType].visible = action.payload.visible;
    },
    setSliceIndex: (
      state,
      action: PayloadAction<{ sliceType: SliceType; index: number }>
    ) => {
      state.slices[action.payload.sliceType].index = action.payload.index;
    },
    setSliceOpacity: (
      state,
      action: PayloadAction<{ sliceType: SliceType; opacity: number }>
    ) => {
      state.slices[action.payload.sliceType].opacity = action.payload.opacity;
    },
    setSliceColormap: (
      state,
      action: PayloadAction<{ sliceType: SliceType; colormap: string }>
    ) => {
      state.slices[action.payload.sliceType].colormap = action.payload.colormap;
    },
    setSliceValueRange: (
      state,
      action: PayloadAction<{
        sliceType: SliceType;
        minValue: number | null;
        maxValue: number | null;
      }>
    ) => {
      state.slices[action.payload.sliceType].minValue = action.payload.minValue;
      state.slices[action.payload.sliceType].maxValue = action.payload.maxValue;
    },
    setVolumeRenderingEnabled: (state, action: PayloadAction<boolean>) => {
      state.volumeRendering.enabled = action.payload;
    },
    setVolumeRenderingQuality: (state, action: PayloadAction<number>) => {
      state.volumeRendering.quality = action.payload;
    },
    setVolumeRenderingOpacity: (state, action: PayloadAction<number>) => {
      state.volumeRendering.opacity = action.payload;
    },
    setTool: (state, action: PayloadAction<ViewerState['tool']>) => {
      state.tool = action.payload;
      state.measurementPoints = [];
    },
    setMeasurementType: (state, action: PayloadAction<ViewerState['measurementType']>) => {
      state.measurementType = action.payload;
      state.measurementPoints = [];
    },
    addMeasurementPoint: (state, action: PayloadAction<Point3D>) => {
      state.measurementPoints.push(action.payload);
    },
    clearMeasurementPoints: (state) => {
      state.measurementPoints = [];
    },
    setLastMeasurement: (state, action: PayloadAction<MeasurementResult | null>) => {
      state.lastMeasurement = action.payload;
    },
    setBackground: (state, action: PayloadAction<'dark' | 'light'>) => {
      state.background = action.payload;
    },
    setShowAxes: (state, action: PayloadAction<boolean>) => {
      state.showAxes = action.payload;
    },
    setShowGrid: (state, action: PayloadAction<boolean>) => {
      state.showGrid = action.payload;
    },
    setZoom: (state, action: PayloadAction<number>) => {
      state.zoom = action.payload;
    },
    setRotation: (state, action: PayloadAction<[number, number, number]>) => {
      state.rotation = action.payload;
    },
    resetViewer: () => initialState,
  },
});

export const {
  hydrateViewer,
  setSliceVisible,
  setSliceIndex,
  setSliceOpacity,
  setSliceColormap,
  setSliceValueRange,
  setVolumeRenderingEnabled,
  setVolumeRenderingQuality,
  setVolumeRenderingOpacity,
  setTool,
  setMeasurementType,
  addMeasurementPoint,
  clearMeasurementPoints,
  setLastMeasurement,
  setBackground,
  setShowAxes,
  setShowGrid,
  setZoom,
  setRotation,
  resetViewer,
} = viewerSlice.actions;
export default viewerSlice.reducer;
