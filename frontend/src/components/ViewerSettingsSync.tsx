import type { FC } from 'react';
import { useLayoutEffect } from 'react';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '../store';
import type { SeismicData } from '../types';
import { hydrateViewerSettings } from '../store/slices/viewerSlice';
import { loadViewerDisplaySettings, saveViewerDisplaySettings, ViewerDisplaySettings } from '../utils/viewerSettings';

interface ViewerSettingsSyncProps {
  seismicData: SeismicData;
}

const selectDisplaySettings = (state: RootState): ViewerDisplaySettings => {
  const {
    slices,
    volumeRendering,
    background,
    showAxes,
    showGrid,
    zoom,
    rotation,
  } = state.viewer;

  return {
    slices,
    volumeRendering,
    background,
    showAxes,
    showGrid,
    zoom,
    rotation,
  };
};

const ViewerSettingsSync: FC<ViewerSettingsSyncProps> = ({ seismicData }) => {
  const dispatch = useDispatch<AppDispatch>();
  const hydratedSeismicId = useSelector((state: RootState) => state.viewer.hydratedSeismicId);
  const settings = useSelector(selectDisplaySettings, shallowEqual);

  useLayoutEffect(() => {
    if (hydratedSeismicId !== seismicData.id) {
      dispatch(
        hydrateViewerSettings({
          seismicId: seismicData.id,
          settings: loadViewerDisplaySettings(seismicData.id, seismicData),
        })
      );
    }
  }, [dispatch, hydratedSeismicId, seismicData]);

  useLayoutEffect(() => {
    if (hydratedSeismicId === seismicData.id) {
      saveViewerDisplaySettings(seismicData.id, settings);
    }
  }, [hydratedSeismicId, seismicData.id, settings]);

  return null;
};

export default ViewerSettingsSync;
