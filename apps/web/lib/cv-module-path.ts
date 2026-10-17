import { existsSync } from "node:fs";
import path from "node:path";

/** Find the Python CV package already present on the shared filesystem. */
export function cvModuleDirectory(cwd = process.cwd()): string {
  const candidates = [
    path.resolve(cwd, "services/cv/app/modules"),
    path.resolve(cwd, "../../services/cv/app/modules"),
    path.resolve(cwd, "../services/cv/app/modules"),
  ];
  const dir = candidates.find((candidate) => existsSync(path.join(candidate, "base.py")));
  if (!dir) {
    throw new Error("CV service modules are not on this filesystem; landmark evaluation requires writing_posture_core.py");
  }
  return dir;
}
