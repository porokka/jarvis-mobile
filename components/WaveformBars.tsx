import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Animated, Easing } from "react-native";
import { COLORS, STATE_COLORS } from "../utils/theme";
import { JarvisState } from "../utils/store";

const BAR_COUNT = 28;

interface WaveformBarsProps {
  state: JarvisState;
  amplitude: number; // 0..1
}

export function WaveformBars({ state, amplitude }: WaveformBarsProps) {
  const phases = useRef(
    Array.from({ length: BAR_COUNT }, (_, i) => new Animated.Value(i / BAR_COUNT))
  ).current;

  useEffect(() => {
    const anims = phases.map((p, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(p, {
            toValue: 1,
            duration: 1200 + i * 40,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: false,
          }),
          Animated.timing(p, {
            toValue: 0,
            duration: 1200 + i * 40,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: false,
          }),
        ])
      )
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, []);

  const color = STATE_COLORS[state] || COLORS.accent;

  return (
    <View style={styles.container}>
      {phases.map((phase, i) => {
        const barHeight = phase.interpolate({
          inputRange: [0, 1],
          outputRange: [
            state === "standby" ? 2 : 3 + amplitude * 6,
            state === "standby" ? 6 : 8 + amplitude * 24,
          ],
        });
        const opacity = phase.interpolate({
          inputRange: [0, 1],
          outputRange: [0.25, 0.9],
        });
        return (
          <Animated.View
            key={i}
            style={[
              styles.bar,
              {
                height: barHeight,
                backgroundColor: color,
                opacity,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    height: 32,
  },
  bar: {
    width: 2.5,
    borderRadius: 1.5,
  },
});
