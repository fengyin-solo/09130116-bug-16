import React, { useState } from 'react';
import { Card, Collapse, Switch, Slider, Select, Space, Typography, Tag, Button } from 'antd';
import { EyeOutlined, EyeInvisibleOutlined, BuildOutlined, SettingOutlined, AreaChartOutlined } from '@ant-design/icons';
import { useSelector, useDispatch } from 'react-redux';
import {
  setSliceVisible,
  setSliceIndex,
  setSliceOpacity,
  setSliceColormap,
  setSliceValueRange,
  setVolumeRenderingEnabled,
  setVolumeRenderingOpacity,
  setBackground,
  setShowAxes,
  setShowGrid,
} from '../store/slices/viewerSlice';
import { RootState, AppDispatch } from '../store';
import { SeismicData } from '../types';
import {
  SliceType,
  COLORMAP_LABELS,
  getSliceCount,
  clampSliceIndex,
  clampUnitInterval,
  normalizeColormap,
  normalizeSliceConfig,
  normalizeVolumeConfig,
  getEffectiveValueRange,
} from '../utils/viewerSettings';

const { Title, Text } = Typography;
const { Panel } = Collapse;

interface ControlPanelProps {
  seismicData: SeismicData;
}

const colormapOptions = Object.entries(COLORMAP_LABELS).map(([value, label]) => ({ value, label }));

const ControlPanel: React.FC<ControlPanelProps> = ({ seismicData }) => {
  const dispatch = useDispatch<AppDispatch>();
  const slices = useSelector((state: RootState) => state.viewer.slices);
  const volumeRendering = useSelector((state: RootState) => state.viewer.volumeRendering);
  const background = useSelector((state: RootState) => state.viewer.background);
  const showAxes = useSelector((state: RootState) => state.viewer.showAxes);
  const showGrid = useSelector((state: RootState) => state.viewer.showGrid);

  const [activeKeys, setActiveKeys] = useState<string[]>(['slices', 'volume', 'display']);

  // 面板展示的体绘制参数同样经过统一判定，保证与画布、状态栏一致
  const effectiveVolume = normalizeVolumeConfig(volumeRendering);

  const renderSliceControl = (sliceType: SliceType) => {
    // 面板显示的就是标准化后的配置，画布与状态栏取参走的是同一个函数
    const config = normalizeSliceConfig(slices[sliceType], seismicData, sliceType);
    const count = getSliceCount(seismicData, sliceType);
    const effectiveRange = getEffectiveValueRange(config, seismicData);

    const globalMin = seismicData.min_value;
    const globalMax = seismicData.max_value;
    const hasGlobalBounds =
      typeof globalMin === 'number' &&
      typeof globalMax === 'number' &&
      Number.isFinite(globalMin) &&
      Number.isFinite(globalMax);
    const rangeDisabled = !hasGlobalBounds || globalMax! - globalMin! <= 0;
    const isDefaultRange = config.minValue === null && config.maxValue === null;

    const labelsMap: Record<SliceType, string> = {
      inline: 'Inline 切片',
      crossline: 'Crossline 切片',
      depth: '深度切片',
    };

    return (
      <Card
        key={sliceType}
        size="small"
        style={{ marginBottom: 8 }}
        extra={
          <Switch
            checked={config.visible}
            onChange={(checked) => dispatch(setSliceVisible({ sliceType, visible: checked }))}
            checkedChildren={<EyeOutlined />}
            unCheckedChildren={<EyeInvisibleOutlined />}
          />
        }
      >
        <Title level={5} style={{ margin: '0 0 12px 0' }}>
          {labelsMap[sliceType]}
        </Title>

        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text type="secondary">切片索引</Text>
            <Tag color="blue">
              {config.index} / {Math.max(0, count - 1)}
            </Tag>
          </div>
          <Slider
            min={0}
            max={Math.max(0, count - 1)}
            value={config.index}
            onChange={(value) =>
              dispatch(
                setSliceIndex({
                  sliceType,
                  index: clampSliceIndex(value, count),
                })
              )
            }
            disabled={!config.visible}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text type="secondary">不透明度</Text>
            <Tag>{(config.opacity * 100).toFixed(0)}%</Tag>
          </div>
          <Slider
            min={0}
            max={1}
            step={0.01}
            value={config.opacity}
            onChange={(value) =>
              dispatch(
                setSliceOpacity({
                  sliceType,
                  opacity: clampUnitInterval(value, 1),
                })
              )
            }
            disabled={!config.visible}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <Text type="secondary">色标</Text>
          <Select
            value={config.colormap}
            size="small"
            style={{ width: '100%' }}
            onChange={(value) =>
              dispatch(
                setSliceColormap({
                  sliceType,
                  colormap: normalizeColormap(value),
                })
              )
            }
            disabled={!config.visible}
          >
            {colormapOptions.map((opt) => (
              <Select.Option key={opt.value} value={opt.value}>
                {opt.label}
              </Select.Option>
            ))}
          </Select>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <Text type="secondary">取值范围</Text>
            <Space size={4}>
              <Tag color={isDefaultRange ? 'default' : 'green'}>
                {effectiveRange.min.toFixed(2)} ~ {effectiveRange.max.toFixed(2)}
                {isDefaultRange ? '（默认）' : ''}
              </Tag>
              <Button
                size="small"
                type="link"
                disabled={isDefaultRange || !config.visible}
                onClick={() =>
                  dispatch(
                    setSliceValueRange({ sliceType, minValue: null, maxValue: null })
                  )
                }
              >
                恢复默认
              </Button>
            </Space>
          </div>
          {hasGlobalBounds ? (
            <Slider
              range
              min={globalMin}
              max={globalMax}
              step={(globalMax! - globalMin!) / 1000}
              value={[
                config.minValue ?? globalMin!,
                config.maxValue ?? globalMax!,
              ]}
              onChange={(value) => {
                const [lo, hi] = value as [number, number];
                dispatch(setSliceValueRange({ sliceType, minValue: lo, maxValue: hi }));
              }}
              disabled={!config.visible || rangeDisabled}
              tooltip={{ formatter: (v) => (v === undefined ? '' : v.toFixed(2)) }}
            />
          ) : (
            <Text type="secondary" style={{ fontSize: 12 }}>
              当前数据缺少全局统计值，取值范围使用服务端自动估计（默认）
            </Text>
          )}
        </div>
      </Card>
    );
  };

  return (
    <div className="control-panel">
      <Card
        size="small"
        title={
          <Space>
            <SettingOutlined />
            <span>控制面板</span>
          </Space>
        }
        style={{ marginBottom: 0 }}
      >
        <Collapse
          activeKey={activeKeys}
          onChange={(keys) => setActiveKeys(keys as string[])}
        >
          <Panel
            header={
              <Space>
                <AreaChartOutlined />
                <span>切片控制</span>
              </Space>
            }
            key="slices"
          >
            {renderSliceControl('inline')}
            {renderSliceControl('crossline')}
            {renderSliceControl('depth')}
          </Panel>

          <Panel
            header={
              <Space>
                <BuildOutlined />
                <span>体绘制</span>
              </Space>
            }
            key="volume"
          >
            <Card size="small">
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text>启用体绘制</Text>
                  <Switch
                    checked={effectiveVolume.enabled}
                    onChange={(checked) => dispatch(setVolumeRenderingEnabled(checked))}
                  />
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text type="secondary">透明度</Text>
                  <Tag>{(effectiveVolume.opacity * 100).toFixed(0)}%</Tag>
                </div>
                <Slider
                  min={0}
                  max={1}
                  step={0.01}
                  value={effectiveVolume.opacity}
                  onChange={(value) =>
                    dispatch(
                      setVolumeRenderingOpacity(clampUnitInterval(value, 0.5))
                    )
                  }
                  disabled={!effectiveVolume.enabled}
                />
              </div>
            </Card>
          </Panel>

          <Panel
            header={
              <Space>
                <EyeOutlined />
                <span>显示设置</span>
              </Space>
            }
            key="display"
          >
            <Card size="small">
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text>背景</Text>
                  <Select
                    value={background}
                    size="small"
                    style={{ width: 100 }}
                    onChange={(value) => dispatch(setBackground(value))}
                  >
                    <Select.Option value="dark">深色</Select.Option>
                    <Select.Option value="light">浅色</Select.Option>
                  </Select>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text>显示坐标轴</Text>
                  <Switch
                    checked={showAxes}
                    onChange={(checked) => dispatch(setShowAxes(checked))}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text>显示网格</Text>
                  <Switch
                    checked={showGrid}
                    onChange={(checked) => dispatch(setShowGrid(checked))}
                  />
                </div>
              </div>
            </Card>
          </Panel>
        </Collapse>
      </Card>
    </div>
  );
};

export default ControlPanel;
