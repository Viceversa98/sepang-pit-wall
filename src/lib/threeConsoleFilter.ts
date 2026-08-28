/**
 * Suppress known harmless Three.js console noise (deprecations, ANGLE/HLSL precision).
 */
import { setConsoleFunction } from "three";

const shouldDrop = (...parts: unknown[]): boolean => {
  const text = parts.map(String).join(" ");
  return (
    text.includes("Clock: This module has been deprecated") ||
    text.includes("PCFSoftShadowMap has been deprecated") ||
    text.includes("cannot be represented accurately in double precision") ||
    (text.includes("WebGLProgram: Program Info Log") && text.includes("X4122"))
  );
};

setConsoleFunction((type, message, ...rest) => {
  if (type === "warn" && shouldDrop(message, ...rest)) return;

  const fn = console[type as "log" | "warn" | "error"];
  if (typeof fn === "function") {
    fn(message, ...rest);
  }
});
