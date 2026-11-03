import { BandStatus } from "@neobridge/ble-protocol";

const fill = {
  [BandStatus.Green]: "var(--green)",
  [BandStatus.Yellow]: "var(--yellow)",
  [BandStatus.Red]: "var(--red)",
  [BandStatus.Grey]: "var(--grey)",
};

export const statusLabel = {
  [BandStatus.Green]: { local: "ठीक", english: "No problem" },
  [BandStatus.Yellow]: { local: "ठंड/गर्मी", english: "Warm and check" },
  [BandStatus.Red]: { local: "मदद", english: "Help now" },
  [BandStatus.Grey]: { local: "नहीं पढ़ा", english: "No reading" },
};

/** Each status has its own shape so colour is never the only signal. */
export function StatusShape({ status, size = 20 }: { status: BandStatus; size?: number }) {
  const c = fill[status];
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-label={statusLabel[status].english} role="img">
      {status === BandStatus.Green && <circle cx="10" cy="10" r="9" fill={c} />}
      {status === BandStatus.Yellow && <path d="M10 1.5 19 18H1z" fill={c} />}
      {status === BandStatus.Red && (
        <path d="M6.3 1h7.4L19 6.3v7.4L13.7 19H6.3L1 13.7V6.3z" fill={c} />
      )}
      {status === BandStatus.Grey && (
        <circle cx="10" cy="10" r="8" fill="none" stroke={c} strokeWidth="2.5" strokeDasharray="3 2.5" />
      )}
    </svg>
  );
}
