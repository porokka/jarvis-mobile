import React, { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";
import Svg, { Circle, Line, G } from "react-native-svg";

// Same vertex/edge data as desktop
const FACE_VERTICES: [number, number, number][] = [
  [0,1.3,0.1],[-0.35,1.2,0.15],[0.35,1.2,0.15],[-0.55,1.0,0.2],[0.55,1.0,0.2],
  [-0.3,1.05,0.3],[0.3,1.05,0.3],[0,1.1,0.35],
  [-0.5,0.75,0.35],[-0.25,0.8,0.42],[0,0.78,0.44],[0.25,0.8,0.42],[0.5,0.75,0.35],
  [-0.38,0.78,0.4],[-0.38,0.65,0.38],[-0.2,0.62,0.4],[-0.48,0.6,0.32],[-0.35,0.55,0.36],
  [0.38,0.65,0.38],[0.2,0.62,0.4],[0.48,0.6,0.32],[0.35,0.55,0.36],
  [0,0.6,0.48],[0,0.45,0.55],[0,0.3,0.58],[-0.12,0.25,0.5],[0.12,0.25,0.5],[0,0.22,0.52],
  [-0.58,0.45,0.3],[0.58,0.45,0.3],[-0.55,0.2,0.28],[0.55,0.2,0.28],
  [-0.22,0.08,0.46],[0.22,0.08,0.46],[-0.1,0.12,0.5],[0,0.13,0.52],[0.1,0.12,0.5],
  [-0.1,0.03,0.49],[0,0.01,0.5],[0.1,0.03,0.49],
  [-0.55,0.05,0.22],[0.55,0.05,0.22],[-0.48,-0.15,0.24],[0.48,-0.15,0.24],
  [-0.35,-0.32,0.3],[0.35,-0.32,0.3],[-0.15,-0.42,0.36],[0.15,-0.42,0.36],
  [0,-0.48,0.38],[-0.2,-0.6,0.2],[0.2,-0.6,0.2],
];

const FACE_EDGES: [number, number][] = [
  [0,1],[0,2],[1,3],[2,4],[1,5],[2,6],[5,7],[6,7],[0,7],[3,5],[4,6],
  [5,9],[6,11],[7,10],[3,8],[8,13],[13,9],[9,10],[10,11],[11,12],[4,12],
  [8,16],[13,14],[9,15],[14,15],[14,16],[15,17],[16,17],
  [12,20],[11,19],[18,19],[18,20],[19,21],[20,21],
  [10,22],[15,22],[19,22],[22,23],[23,24],[24,25],[24,26],[25,27],[26,27],[25,26],
  [16,28],[28,30],[17,28],[20,29],[29,31],[21,29],[30,32],[31,33],
  [27,35],[32,34],[34,35],[35,36],[36,33],[32,37],[37,38],[38,39],[39,33],
  [30,40],[31,41],[40,42],[41,43],[42,44],[43,45],[44,46],[45,47],[46,48],[47,48],
  [48,49],[48,50],[46,49],[47,50],
];

const SPEAKING_OFFSETS: Record<number, [number, number, number]> = {
  38: [0,-0.06,0], 37: [-0.01,-0.05,0], 39: [0.01,-0.05,0],
  46: [0,-0.04,0], 47: [0,-0.04,0], 48: [0,-0.06,0],
  44: [0,-0.03,0], 45: [0,-0.03,0],
};

function project(
  x: number, y: number, z: number,
  cx: number, cy: number, scale: number
): [number, number, number] {
  const fov = 2.8;
  const d = fov / (fov + z * 0.4);
  return [cx + x * scale * d, cy - y * scale * d, d];
}

interface LatticeFaceRNProps {
  size: number;
  speaking: boolean;
  thinking: boolean;
  amplitude: number; // 0..1
  emotion: string;
}

export function LatticeFaceRN({
  size,
  speaking,
  thinking,
  amplitude,
  emotion,
}: LatticeFaceRNProps) {
  const animRef = useRef(new Animated.Value(0)).current;
  const swayRef = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(animRef, { toValue: 1, duration: 4000, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        Animated.timing(animRef, { toValue: 0, duration: 4000, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      ])
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(swayRef, { toValue: 1, duration: 6000, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        Animated.timing(swayRef, { toValue: -1, duration: 6000, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      ])
    ).start();
  }, []);

  const canvasH = Math.round(size * 0.92);
  const cx = size / 2;
  const cy = canvasH * 0.64;
  const scale = size * 0.445;

  // Compute projected vertices with speaking morph
  const verts = FACE_VERTICES.map(([bx, by, bz], i) => {
    let x = bx, y = by, z = bz;
    if (speaking && SPEAKING_OFFSETS[i]) {
      x += SPEAKING_OFFSETS[i][0] * amplitude;
      y += SPEAKING_OFFSETS[i][1] * amplitude;
      z += SPEAKING_OFFSETS[i][2] * amplitude;
    }
    return project(x, y, z, cx, cy, scale);
  });

  const accentColor = thinking ? "#f0c040" : "#40a0f0";

  return (
    <Svg width={size} height={canvasH}>
      {/* Edges */}
      {FACE_EDGES.map(([a, b], i) => {
        const [ax, ay] = verts[a];
        const [bx, by] = verts[b];
        return (
          <Line
            key={`e${i}`}
            x1={ax} y1={ay} x2={bx} y2={by}
            stroke={accentColor}
            strokeWidth={0.6}
            strokeOpacity={0.3}
          />
        );
      })}

      {/* Nodes */}
      {verts.map(([px, py, pd], i) => (
        <Circle
          key={`n${i}`}
          cx={px} cy={py}
          r={1.4 * pd}
          fill={accentColor}
          fillOpacity={0.8 * pd}
        />
      ))}

      {/* Amplitude ring when speaking */}
      {speaking && amplitude > 0.05 && (
        <Circle
          cx={cx} cy={cy}
          r={scale * 0.82 * (1 + amplitude * 0.08)}
          fill="none"
          stroke={accentColor}
          strokeWidth={1.5}
          strokeOpacity={amplitude * 0.5}
        />
      )}
    </Svg>
  );
}
