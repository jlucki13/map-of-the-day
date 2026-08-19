import type { MapSource } from "@/sources/types";
import { isLiveMode } from "@/lib/config";
import { wikimediaCommons } from "@/sources/wikimediaCommons";
import { staticDataset } from "@/sources/staticDataset";

/**
 * The active set of candidate-map providers. Mock mode must never hit the
 * network, so it only ever gets the static dataset; live mode adds the
 * network-backed Wikimedia Commons source ahead of it.
 */
export function getSources(): MapSource[] {
  if (isLiveMode()) {
    return [wikimediaCommons, staticDataset];
  }
  return [staticDataset];
}

/** Explicit fallback accessor for callers that specifically need the static
 * dataset regardless of mode (e.g. a live-source failure fallback). */
export function getStaticSource(): MapSource {
  return staticDataset;
}
