import { createHash } from "node:crypto";

import type { Request } from "express";

export function clientFingerprintHash(request: Request): string {
  const userAgent = request.headers["user-agent"] ?? "";
  return createHash("sha256")
    .update(`${request.ip}|${userAgent}`, "utf8")
    .digest("hex");
}
