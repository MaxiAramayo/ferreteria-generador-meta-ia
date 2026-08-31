import { COLORS } from "@aramayo/design-engine";
import { AramayoMark } from "@aramayo/design-engine/react";
import { ImageResponse } from "next/og";

export const size = { height: 128, width: 128 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: COLORS.graphiteDeep,
        display: "flex",
        height: "100%",
        justifyContent: "center",
        width: "100%",
      }}
    >
      <AramayoMark color={COLORS.rust} size={96} />
    </div>,
    size,
  );
}
