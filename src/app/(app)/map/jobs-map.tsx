"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { ChevronLeft, Globe, MapPin as MapPinIcon } from "lucide-react";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ScoreBadge, StatusDot } from "@/components/status-badge";
import type { JobStatus } from "@/db/schema";
import { cn } from "@/lib/utils";

export type MapJob = { id: number; title: string; company: string; location: string; status: JobStatus; score: number | null };
export type MapPin = { key: string; label: string; lat: number; lng: number; jobs: MapJob[] };

const STYLES = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};
// Mainland France plus Corsica.
const FRANCE: [[number, number], [number, number]] = [
  [-5.2, 41.3],
  [9.6, 51.2],
];
const CLOSED: JobStatus[] = ["rejected", "skipped"];

type Filter = "open" | "all";

const byScore = (a: MapJob, b: MapJob) => (b.score ?? -1) - (a.score ?? -1);

// The app follows the OS light/dark setting (see globals.css), so the map does too.
const DARK = "(prefers-color-scheme: dark)";
function useOsTheme(): keyof typeof STYLES {
  const dark = useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(DARK);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(DARK).matches,
    () => false,
  );
  return dark ? "dark" : "light";
}

const isWide = () => window.matchMedia("(min-width: 768px)").matches;

export function JobsMap({ pins, unplaced }: { pins: MapPin[]; unplaced: MapJob[] }) {
  const [filter, setFilter] = useState<Filter>("open");
  const [selected, setSelected] = useState<string | "unplaced" | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const theme = useOsTheme();
  // The style the map was created with or last switched to.
  const appliedTheme = useRef(theme);

  /** Map padding that keeps France and the selected pin out from under the panel. */
  const padding = () => {
    const h = panel.current?.offsetHeight ?? 0;
    const w = panel.current?.offsetWidth ?? 0;
    return isWide() ? { top: 24, bottom: 24, left: 24, right: w + 36 } : { top: 56, bottom: h + 24, left: 16, right: 16 };
  };

  const keep = (j: MapJob) => filter === "all" || !CLOSED.includes(j.status);
  const visiblePins = useMemo(
    () =>
      pins
        .map((p) => ({ ...p, jobs: p.jobs.filter(keep).sort(byScore) }))
        .filter((p) => p.jobs.length > 0)
        .sort((a, b) => b.jobs.length - a.jobs.length),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pins, filter],
  );
  const visibleUnplaced = useMemo(
    () => unplaced.filter(keep).sort(byScore),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [unplaced, filter],
  );
  const geojson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: visiblePins.map((p) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
        properties: { key: p.key, count: p.jobs.length, best: Math.max(-1, ...p.jobs.map((j) => j.score ?? -1)) },
      })),
    }),
    [visiblePins],
  );
  const geojsonRef = useRef(geojson);
  geojsonRef.current = geojson;

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | undefined;
    void import("maplibre-gl").then((maplibregl) => {
      if (cancelled || !container.current) return;
      // MapLibre finds its tile worker next to its own file, which the bundler moves; point it at the emitted copy.
      maplibregl.setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);
      const m = new maplibregl.Map({
        container: container.current,
        style: STYLES[appliedTheme.current],
        bounds: FRANCE,
        fitBoundsOptions: { padding: padding() },
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
      });
      map = m;
      m.touchZoomRotate.disableRotation();
      // Clear of the panel: bottom-left beside it on wide screens; on phones (pinch to zoom) the panel takes the bottom.
      if (isWide()) m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-left");
      m.addControl(new maplibregl.AttributionControl({ compact: true }), isWide() ? "bottom-left" : "top-right");
      // On phones, fold the credits behind their (i) button once they've loaded, as MapLibre does on the first drag,
      // so they don't cover the filter.
      if (!isWide()) {
        m.once("idle", () => {
          const credits = m.getContainer().querySelector(".maplibregl-ctrl-attrib");
          credits?.classList.remove("maplibregl-compact-show");
          credits?.removeAttribute("open");
        });
      }
      mapRef.current = m;

      // Runs on first load and again after every theme switch (setStyle drops our layers).
      m.on("style.load", () => addJobLayers(m, geojsonRef.current));

      m.on("click", "clusters", async (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const source = m.getSource("jobs") as GeoJSONSource;
        const zoom = await source.getClusterExpansionZoom(feature.properties.cluster_id);
        m.easeTo({ center: (feature.geometry as GeoJSON.Point).coordinates as [number, number], zoom, duration: 600 });
      });
      m.on("click", "pins", (e) => {
        const key = e.features?.[0]?.properties.key;
        if (key) setSelected(key);
      });
      for (const layer of ["clusters", "pins"]) {
        m.on("mouseenter", layer, () => (m.getCanvas().style.cursor = "pointer"));
        m.on("mouseleave", layer, () => (m.getCanvas().style.cursor = ""));
      }
    });
    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
    // Theme changes are handled below without recreating the map.
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    // Not created yet: the map picks up the current theme when it is.
    if (!map) {
      appliedTheme.current = theme;
      return;
    }
    if (appliedTheme.current === theme) return;
    appliedTheme.current = theme;
    map.setStyle(STYLES[theme]);
  }, [theme]);

  useEffect(() => {
    const source = mapRef.current?.getSource("jobs") as GeoJSONSource | undefined;
    source?.setData(geojson);
  }, [geojson]);

  // The selected pin can disappear when the filter changes.
  const pin = visiblePins.find((p) => p.key === selected);
  useEffect(() => {
    if (selected && selected !== "unplaced" && !pin) setSelected(null);
  }, [selected, pin]);

  const flyTo = (p: MapPin) => {
    setSelected(p.key);
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), 9), padding: padding(), duration: 900, essential: true });
  };

  // Clicking a pin selects it; fly there too.
  const lastFlown = useRef<string | null>(null);
  useEffect(() => {
    if (pin && lastFlown.current !== pin.key) {
      lastFlown.current = pin.key;
      flyTo(pin);
    }
    if (!pin) lastFlown.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  const reset = () => {
    setSelected(null);
    mapRef.current?.fitBounds(FRANCE, { padding: padding(), duration: 900 });
  };

  const total = visiblePins.reduce((n, p) => n + p.jobs.length, 0);

  return (
    <div className="relative h-[calc(100dvh-8.5rem)] min-h-[480px] overflow-hidden rounded-xl border bg-muted">
      {/* MapLibre's CSS makes its container position: relative, so it fills a positioned wrapper. */}
      <div className="absolute inset-0">
        <div ref={container} className="size-full" />
      </div>

      <div className="absolute top-3 left-3 flex rounded-lg border bg-background/90 p-0.5 text-xs font-medium shadow-sm backdrop-blur">
        {(["open", "all"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-md px-3 py-1.5 transition-colors",
              filter === f ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {f === "open" ? "Open" : "All jobs"}
          </button>
        ))}
      </div>

      <aside
        ref={panel}
        className="absolute inset-x-3 bottom-3 flex max-h-[45%] flex-col overflow-hidden rounded-xl border bg-background/95 shadow-lg backdrop-blur md:inset-x-auto md:top-3 md:right-3 md:max-h-none md:w-80">
        {pin || selected === "unplaced" ? (
          <>
            <div className="flex items-center gap-2 border-b px-3 py-2.5">
              <button
                type="button"
                onClick={reset}
                className="-ml-1 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Back to all places"
              >
                <ChevronLeft className="size-4" />
              </button>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{pin ? pin.label : "No single place"}</p>
                <p className="text-xs text-muted-foreground">
                  {pin ? pin.jobs.length : visibleUnplaced.length} job
                  {(pin ? pin.jobs.length : visibleUnplaced.length) === 1 ? "" : "s"}
                </p>
              </div>
            </div>
            <JobList jobs={pin ? pin.jobs : visibleUnplaced} showLocation={!pin} />
          </>
        ) : (
          <>
            <div className="border-b px-3 py-2.5">
              <p className="text-sm font-semibold">
                {total} job{total === 1 ? "" : "s"} in {visiblePins.length} place{visiblePins.length === 1 ? "" : "s"}
              </p>
              <p className="text-xs text-muted-foreground">Click a place to see its jobs.</p>
            </div>
            <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
              {visiblePins.map((p) => (
                <li key={p.key}>
                  <button
                    type="button"
                    onClick={() => flyTo(p)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                  >
                    <MapPinIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{p.label}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{p.jobs.length}</span>
                    <ScoreBadge score={p.jobs[0].score} className="h-5 min-w-8" />
                  </button>
                </li>
              ))}
              {visibleUnplaced.length > 0 && (
                <li className="mt-1 border-t pt-1">
                  <button
                    type="button"
                    onClick={() => setSelected("unplaced")}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Globe className="size-3.5 shrink-0" />
                    <span className="flex-1">Remote, France-wide or unknown</span>
                    <span className="text-xs tabular-nums">{visibleUnplaced.length}</span>
                  </button>
                </li>
              )}
            </ul>
          </>
        )}
      </aside>
    </div>
  );
}

function JobList({ jobs, showLocation }: { jobs: MapJob[]; showLocation: boolean }) {
  return (
    <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
      {jobs.map((j) => (
        <li key={j.id}>
          <Link href={`/jobs/${j.id}`} className="flex items-start gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-muted">
            <ScoreBadge score={j.score} className="mt-0.5 h-5 min-w-8" />
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 text-sm leading-snug font-medium">{j.title}</span>
              <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <StatusDot status={j.status} />
                <span className="truncate">
                  {j.company}
                  {showLocation && j.location && ` · ${j.location}`}
                </span>
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Clustered job pins, coloured by the best score at that place. */
function addJobLayers(map: MapLibreMap, data: GeoJSON.FeatureCollection) {
  if (map.getSource("jobs")) return;
  map.addSource("jobs", {
    type: "geojson",
    data,
    cluster: true,
    clusterRadius: 44,
    clusterMaxZoom: 11,
    clusterProperties: { count: ["+", ["get", "count"]], best: ["max", ["get", "best"]] },
  });
  const color = ["step", ["get", "best"], "#a1a1aa", 60, "#f59e0b", 80, "#10b981"] as const;
  const radius = ["interpolate", ["linear"], ["get", "count"], 1, 11, 5, 15, 20, 21, 60, 28] as const;
  for (const [id, filter] of [
    ["clusters", ["has", "point_count"]],
    ["pins", ["!", ["has", "point_count"]]],
  ] as const) {
    map.addLayer({
      id,
      type: "circle",
      source: "jobs",
      filter: filter as never,
      paint: {
        "circle-color": color as never,
        "circle-radius": radius as never,
        "circle-opacity": 0.92,
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
      },
    });
  }
  map.addLayer({
    id: "counts",
    type: "symbol",
    source: "jobs",
    layout: {
      "text-field": ["to-string", ["get", "count"]],
      "text-font": ["Noto Sans Bold"],
      "text-size": 12,
      "text-allow-overlap": true,
    },
    paint: { "text-color": "#ffffff" },
  });
}
