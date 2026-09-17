import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type {
  SliceConfig,
  VolumeRenderingConfig,
  Point3D,
  MeasurementResult,
  SeismicData,
} from '../../types';
import {
  SliceType,
  ViewerDisplaySettings,
  clamp01 as clampUnitInterval,
  clampSliceIndex,
  clearViewerDisplaySettings,
  createDefaultDisplaySettings,
  normalizeValueRange,
} from '../../utils/viewerSettings';

interface ViewerState extends ViewerDisplaySettings {
  hydratedSeismicId: number | null;
  tool: 'select' | 'pan' | 'rotate' | 'measure' | 'annotate';
  measurementType: 'distance' | 'area' | 'volume';
  measurementPoints: Point3D[];
  lastMeasurement: MeasurementResult | null;
}

const defaultDisplaySettings = createDefaultDisplaySettings();

const initialState: ViewerState = {
  ...defaultDisplaySettings,
  hydratedSeismicId: null,
  tool: 'rotate',
  measurementType: 'distance',
  measurementPoints: [],
  lastMeasurement: null,
};

const viewerSlice = createSlice({
  name: 'viewer',
  initialState,
  reducers: {
    hydrateViewerSettings: (
      state,
      action: PayloadAction<{ seismicId: number; settings: ViewerDisplaySettings }>
    ) => {
      const { seismicId, settings } = action.payload;
      Object.assign(state, settings);
      state.hydratedSeismicId = seismicId;
    },
    resetViewerSettings: (state, action: PayloadAction<SeismicData>) => {
      const seismicData = action.payload;
      Object.assign(state, createDefaultDisplaySettings());
      state.hydratedSeismicId = seismicData.id;
      state.tool = 'rotate';
      state.measurementType = 'distance';
      state.measurementPoints = [];
      state.lastMeasurement = null;
      clearViewerDisplaySettings(seismicData.id);
    },
    setSliceVisible: (
      state,
      action: PayloadAction<{ sliceType: SliceType; visible: boolean }>
    ) => {
      state.slices[action.payload.sliceType].visible = action.payload.visible;
    },
    setSliceIndex: (
      state,
      action: PayloadAction<{
        sliceType: SliceType;
        index: number;
        seismicData?: SeismicData | null;
      }>
    ) => {
      const { sliceType, index, seismicData } = action.payload;
      state.slices[sliceType].index = clampSliceIndex(index, seismicData, sliceType);
    },
    setSliceOpacity: (
      state,
      action: PayloadAction<{ sliceType: SliceType; opacity: number }>
    ) => {
      state.slices[action.payload.sliceType].opacity = clampUnitInterval(
        action.payload.opacity,
        state.slices[action.payload.sliceType].opacity
      );
    },
    setSliceColormap: (
      state,
      action: PayloadAction<{ sliceType: SliceType; colormap: string }>
    ) => {
      const colormaps = ['seismic', 'gray', 'rainbow'];
      if (colormaps.includes(action.payload.colormap)) {
        state.slices[action.payload.sliceType].colormap = action.payload.colormap;
      }
    },
    setSliceValueRange: (
      state,
      action: PayloadAction<{
        sliceType: SliceType;
        minValue: number | null;
        maxValue: number | null;
        seismicData?: SeismicData | null;
      }>
    ) => {
      const { sliceType, minValue, maxValue, seismicData } = action.payload;
      const normalizedRange = normalizeValueRange(minValue, maxValue, seismicData);
      state.slices[sliceType].minValue = normalizedRange.minValue;
      state.slices[sliceType].maxValue = normalizedRange.maxValue;
    },
    setVolumeRenderingEnabled: (state, action: PayloadAction<boolean>) => {
      state.volumeRendering.enabled = action.payload;
    },
    setVolumeRenderingQuality: (state, action: PayloadAction<number>) => {
      state.volumeRendering.quality = clampUnitInterval(action.payload, state.volumeRendering.quality);
    },
    setVolumeRenderingSampleRate: (state, action: PayloadAction<number>) => {
      state.volumeRendering.sampleRate = clampUnitInterval(action.payload, state.volumeRendering.sampleRate);
    },
    setVolumeRenderingOpacity: (state, action: PayloadAction<number>) => {
      state.volumeRendering.opacity = clampUnitInterval(action.payload, state.volumeRendering.opacity);
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
      state.background = action.payload === 'light' ? 'light' : 'dark';
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
  },
});

export const {
  hydrateViewerSettings,
  resetViewerSettings,
  setSliceVisible,
  setSliceIndex,
  setSliceOpacity,
  setSliceColormap,
  setSliceValueRange,
  setVolumeRenderingEnabled,
  setVolumeRenderingQuality,
  setVolumeRenderingSampleRate,
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
} = viewerSlice.actions;

export type { SliceConfig, VolumeRenderingConfig };
export default viewerSlice.reducer;
