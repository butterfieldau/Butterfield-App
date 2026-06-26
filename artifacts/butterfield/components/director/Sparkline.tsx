import React from 'react';
import { View } from 'react-native';
import Svg, { Polyline, Circle } from 'react-native-svg';

interface SparklineProps {
  data: number[];
  color: string;
  width?: number;
  height?: number;
}

export default function Sparkline({ data, color, width = 80, height = 28 }: SparklineProps) {
  if (!data || data.length < 2) return <View style={{ width, height }} />;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const pad = 4;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;

  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * innerW;
    const y = pad + (1 - (v - min) / range) * innerH;
    return { x, y };
  });

  const polylinePoints = points.map(p => `${p.x},${p.y}`).join(' ');

  const last = points[points.length - 1];

  return (
    <Svg width={width} height={height}>
      <Polyline
        points={polylinePoints}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.7}
      />
      <Circle
        cx={last.x}
        cy={last.y}
        r={2.5}
        fill={color}
        opacity={0.9}
      />
    </Svg>
  );
}
