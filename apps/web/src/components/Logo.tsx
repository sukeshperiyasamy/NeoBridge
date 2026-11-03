import Image from "next/image";

/** Full NeoBridge wordmark. The source PNG is 1261×355. */
export function Logo({ height = 40 }: { height?: number }) {
  return (
    <Image
      src="/neobridge-logo.png"
      alt="NeoBridge"
      width={Math.round((height * 1261) / 355)}
      height={height}
      priority
    />
  );
}
