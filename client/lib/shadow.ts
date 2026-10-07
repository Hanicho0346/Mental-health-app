import { type ViewStyle } from "react-native";

type ShadowOffset = {
  width: number;
  height: number;
};

type ShadowOptions = {
  color?: string;
  offset?: ShadowOffset;
  opacity?: number;
  radius?: number;
  elevation?: number;
};

function hexToRgb(hex: string): string | null {
  const normalized = hex.replace("#", "").trim();
  if (!/^[\da-f]{3}$|^[\da-f]{6}$/i.test(normalized)) {
    return null;
  }

  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => char + char)
          .join("")
      : normalized;

  const value = Number.parseInt(full, 16);
  return `${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}`;
}

function shadowColor(color: string, opacity: number): string {
  const rgb = hexToRgb(color);
  return rgb ? `rgba(${rgb}, ${opacity})` : color;
}

export function shadowStyle({
  color = "#000",
  offset = { width: 0, height: 2 },
  opacity = 0.05,
  radius = 8,
  elevation = 0,
}: ShadowOptions = {}): ViewStyle {
  return {
    boxShadow: `${offset.width}px ${offset.height}px ${radius}px ${shadowColor(
      color,
      opacity,
    )}`,
    elevation,
  } as ViewStyle;
}
