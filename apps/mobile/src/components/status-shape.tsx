import { StyleSheet, View } from 'react-native';

import { BandStatus } from '@neobridge/ble-protocol';
import { status as statusColor } from '@neobridge/tokens';

/**
 * Small status marker. Each status keeps its own shape so colour is never the
 * only signal: circle, triangle, octagon-ish, dashed ring.
 */
export function StatusShape({ status, size = 20 }: { status: BandStatus; size?: number }) {
  switch (status) {
    case BandStatus.Green:
      return (
        <View
          style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: statusColor.green.fill }}
        />
      );
    case BandStatus.Yellow:
      return (
        <View
          style={[
            styles.triangle,
            {
              borderLeftWidth: size / 2,
              borderRightWidth: size / 2,
              borderBottomWidth: size * 0.9,
              borderBottomColor: statusColor.yellow.fill,
            },
          ]}
        />
      );
    case BandStatus.Red:
      return (
        <View
          style={{ width: size, height: size, borderRadius: size * 0.28, backgroundColor: statusColor.red.fill }}
        />
      );
    case BandStatus.Grey:
      return (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: Math.max(2, size / 8),
            borderStyle: 'dashed',
            borderColor: statusColor.grey.fill,
          }}
        />
      );
  }
}

const styles = StyleSheet.create({
  triangle: {
    width: 0,
    height: 0,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
});
