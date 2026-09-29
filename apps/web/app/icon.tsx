import { COLORS } from "@aramayo/design-engine";
import { AramayoMark } from "@aramayo/design-engine/react";
import { ImageResponse } from "next/og";

/**
 * El isotipo en tres tamaños: la pestaña usa el chico y el celular, al
 * agregar el panel a la pantalla de inicio, los de 192 y 512 del manifiesto.
 */
const iconSizes = [128, 192, 512] as const;

export function generateImageMetadata(): {
  contentType: string;
  id: string;
  size: { height: number; width: number };
}[] {
  return iconSizes.map((pixels) => ({
    contentType: "image/png",
    id: String(pixels),
    size: { height: pixels, width: pixels },
  }));
}

export default async function Icon({
  id,
}: Readonly<{ id: Promise<string> }>): Promise<ImageResponse> {
  const requested = Number(await id);
  const pixels = iconSizes.find((size) => size === requested) ?? iconSizes[0];
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
      <AramayoMark color={COLORS.rust} size={Math.round(pixels * 0.75)} />
    </div>,
    { height: pixels, width: pixels },
  );
}
