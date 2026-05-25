import { enqueueUsageWrite } from "./backgroundQueue";
import {
  normalizeMorphUsageEvent,
  normalizeRequestLogEvent,
  normalizeUsageEvent,
} from "./events";

export function queueUsageEvent(entry, options = {}) {
  return enqueueUsageWrite(normalizeUsageEvent(entry, options));
}

export function queueMorphUsageEvent(entry) {
  return enqueueUsageWrite(normalizeMorphUsageEvent(entry));
}

export function queueRequestLogEvent(entry, options = {}) {
  return enqueueUsageWrite(normalizeRequestLogEvent(entry, options));
}
