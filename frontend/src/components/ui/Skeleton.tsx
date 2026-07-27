import type { CSSProperties } from "react";
import { colors, borderRadius } from "../../constants/theme";

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadiusOverride?: string;
}

export default function Skeleton({
  width = "100%",
  height = "20px",
  borderRadiusOverride,
}: SkeletonProps) {
  const style: CSSProperties = {
    width,
    height,
    backgroundColor: colors.lightGray,
    borderRadius: borderRadiusOverride ?? borderRadius.card,
    animation: "pulse 1.5s ease-in-out infinite",
  };

  return (
    <div style={style} aria-hidden="true">
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
