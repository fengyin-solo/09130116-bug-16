import { useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '../store';
import { hydrateViewer } from '../store/slices/viewerSlice';
import { SeismicData } from '../types';
import {
  SliceType,
  SLICE_TYPES,
  loadViewerPreferences,
  saveViewerPreferences,
  removeViewerPreferences,
  normalizePreferences,
  isDefaultPreferences,
  ViewerPreferences,
} from '../utils/viewerSettings';

interface ViewerPreferencesBridgeProps {
  seismicData: SeismicData;
}

/**
 * 显示偏好的恢复与自动保存（不渲染任何 UI）：
 * - 数据就绪/切换时，从 localStorage 读取该数据保存过的偏好，经统一判定
 *   规则校验后整体 hydrate 到 store；
 * - 用户改动显示参数后防抖写回；与默认值完全一致时清除存储，保证
 *   「恢复默认 / 重置视图」刷新后仍是默认；
 * - 工具、测量点、相机视角等会话状态不参与持久化。
 */
const ViewerPreferencesBridge: React.FC<ViewerPreferencesBridgeProps> = ({ seismicData }) => {
  const dispatch = useDispatch<AppDispatch>();
  const slices = useSelector((state: RootState) => state.viewer.slices);
  const volumeRendering = useSelector((state: RootState) => state.viewer.volumeRendering);
  const background = useSelector((state: RootState) => state.viewer.background);
  const showAxes = useSelector((state: RootState) => state.viewer.showAxes);
  const showGrid = useSelector((state: RootState) => state.viewer.showGrid);

  const hydratedFor = useRef<number | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataRef = useRef(seismicData);
  dataRef.current = seismicData;

  // 按数据 id 恢复（仅一次），恢复完成前不保存，避免默认值覆盖已存偏好
  useEffect(() => {
    const data = dataRef.current;
    const stored = loadViewerPreferences(data.id);
    // 恢复时同样过统一判定规则：存储损坏 / 字段越界逐字段回退默认
    const prefs = normalizePreferences(stored, data);

    dispatch(
      hydrateViewer({
        slices: {
          inline: prefs.slices.inline,
          crossline: prefs.slices.crossline,
          depth: prefs.slices.depth,
        },
        volumeRendering: prefs.volumeRendering,
        background: prefs.background,
        showAxes: prefs.showAxes,
        showGrid: prefs.showGrid,
      })
    );
    hydratedFor.current = data.id;
    // 仅在切换到另一条数据时重新恢复；同一条数据对象引用变化不重复 hydrate
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seismicData.id, dispatch]);

  // 任何显示参数变化 -> 防抖持久化（hydrate 当帧跳过）
  useEffect(() => {
    if (hydratedFor.current !== seismicData.id) return;

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const prefs: ViewerPreferences = {
        slices: SLICE_TYPES.reduce(
          (acc, sliceType: SliceType) => {
            const { type: _type, ...rest } = slices[sliceType];
            acc[sliceType] = rest;
            return acc;
          },
          {} as ViewerPreferences['slices']
        ),
        volumeRendering: {
          enabled: volumeRendering.enabled,
          quality: volumeRendering.quality,
          sampleRate: volumeRendering.sampleRate,
          opacity: volumeRendering.opacity,
        },
        background,
        showAxes,
        showGrid,
      };

      if (isDefaultPreferences(prefs)) {
        removeViewerPreferences(seismicData.id);
      } else {
        saveViewerPreferences(seismicData.id, normalizePreferences(prefs, dataRef.current));
      }
    }, 400);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [
    seismicData.id,
    slices,
    volumeRendering,
    background,
    showAxes,
    showGrid,
  ]);

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    []
  );

  return null;
};

export default ViewerPreferencesBridge;
