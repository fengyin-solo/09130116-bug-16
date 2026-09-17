import React from 'react';
import { Space, Tag, Typography } from 'antd';
import { InfoCircleOutlined, DatabaseOutlined, LineChartOutlined } from '@ant-design/icons';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import { SeismicData } from '../types';
import { getSliceCount, SliceType } from '../utils/viewerSettings';

const { Text } = Typography;

interface StatusBarProps {
  seismicData: SeismicData;
}

const sliceNames: Record<SliceType, string> = {
  inline: 'Inline',
  crossline: 'Crossline',
  depth: '深度',
};

const formatValue = (value: number | null | undefined) =>
  Number.isFinite(value) ? Number(value).toFixed(2) : '-';

const StatusBar: React.FC<StatusBarProps> = ({ seismicData }) => {
  const tool = useSelector((state: RootState) => state.viewer.tool);
  const lastMeasurement = useSelector((state: RootState) => state.viewer.lastMeasurement);
  const measurementPoints = useSelector((state: RootState) => state.viewer.measurementPoints);
  const slices = useSelector((state: RootState) => state.viewer.slices);

  const toolLabels: Record<string, string> = {
    rotate: '旋转模式',
    pan: '平移模式',
    select: '选择模式',
    measure: '测量模式',
    annotate: '标注模式',
  };

  const activeSlices = (Object.keys(sliceNames) as SliceType[]).filter(
    (sliceType) => slices[sliceType].visible
  );

  const activeSliceText = activeSlices
    .map((sliceType) => {
      const config = slices[sliceType];
      const maxIndex = getSliceCount(seismicData, sliceType) - 1;
      const safeIndex = Math.min(maxIndex, Math.max(0, config.index));

      if (sliceType === 'inline') {
        const start = seismicData.inline_start ?? 0;
        const step = seismicData.inline_step || 1;
        return `${sliceNames[sliceType]} #${safeIndex} (${start + safeIndex * step})`;
      }

      if (sliceType === 'crossline') {
        const start = seismicData.crossline_start ?? 0;
        const step = seismicData.crossline_step || 1;
        return `${sliceNames[sliceType]} #${safeIndex} (${start + safeIndex * step})`;
      }

      const start = seismicData.depth_start ?? 0;
      const step = seismicData.depth_step || 1;
      return `${sliceNames[sliceType]} #${safeIndex} (${formatValue(start + safeIndex * step)} ms)`;
    })
    .join(' / ');

  const statusItems = [
    {
      icon: <DatabaseOutlined />,
      content: (
        <>
          <Text type="secondary">数据维度: </Text>
          <Text>
            {(seismicData.num_inlines || '-') +
              ' × ' +
              (seismicData.num_crosslines || '-') +
              ' × ' +
              (seismicData.num_depths || '-')}
          </Text>
        </>
      ),
    },
    {
      icon: <LineChartOutlined />,
      content: (
        <>
          <Text type="secondary">当前切片: </Text>
          <Text>{activeSliceText || '未显示'}</Text>
        </>
      ),
    },
    {
      icon: <LineChartOutlined />,
      content: (
        <>
          <Text type="secondary">采样间隔: </Text>
          <Text>{formatValue(seismicData.depth_step)} ms</Text>
        </>
      ),
    },
    {
      icon: <LineChartOutlined />,
      content: (
        <>
          <Text type="secondary">数据范围: </Text>
          <Text>
            {formatValue(seismicData.min_value)} ~ {formatValue(seismicData.max_value)}
          </Text>
        </>
      ),
    },
    {
      icon: <InfoCircleOutlined />,
      content: (
        <>
          <Text type="secondary">当前模式: </Text>
          <Tag color="blue">{toolLabels[tool] || tool}</Tag>
        </>
      ),
    },
  ];

  if (activeSlices.length > 0) {
    const sliceType = activeSlices[0];
    const config = slices[sliceType];
    statusItems.push({
      icon: <LineChartOutlined />,
      content: (
        <>
          <Text type="secondary">显示范围: </Text>
          <Text>
            {formatValue(config.minValue ?? seismicData.min_value)} ~{' '}
            {formatValue(config.maxValue ?? seismicData.max_value)}
          </Text>
        </>
      ),
    });
  }

  if (tool === 'measure' && lastMeasurement) {
    statusItems.push({
      icon: <LineChartOutlined />,
      content: (
        <>
          <Text type="secondary">测量结果: </Text>
          <Tag color="green">
            {lastMeasurement.value.toFixed(2)} {lastMeasurement.unit}
          </Tag>
        </>
      ),
    });
  }

  if (tool === 'measure' && measurementPoints.length > 0) {
    statusItems.push({
      icon: <InfoCircleOutlined />,
      content: (
        <>
          <Text type="secondary">已选点: </Text>
          <Tag>{measurementPoints.length}</Tag>
        </>
      ),
    });
  }

  return (
    <div className="status-bar">
      <Space size="large" wrap>
        {statusItems.map((item, index) => (
          <Space key={index} size={4}>
            {item.icon}
            {item.content}
          </Space>
        ))}
      </Space>

      <Space size="large">
        {seismicData.file_size && (
          <Text type="secondary">
            文件大小: {(seismicData.file_size / 1024 / 1024).toFixed(2)} MB
          </Text>
        )}
      </Space>
    </div>
  );
};

export default StatusBar;
