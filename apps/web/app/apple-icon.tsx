import { COLORS } from "@aramayo/design-engine";
import { AramayoMark } from "@aramayo/design-engine/react";
import { ImageResponse } from "next/og";

/** Ícono del iPhone al agregar el panel a la pantalla de inicio. */
export const size = { height: 180, width: 180 };
export const contentType = "image/png";

export default function AppleIcon(): ImageResponse {
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
      <AramayoMark color={COLORS.rust} size={128} />
    </div>,
    size,
  );
}
