"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import "leaflet/dist/leaflet.css";

// TASK-026: the day map. Stops are pins, drives are routes (from the GPS
// breadcrumb). Leaflet is driven imperatively (no react-leaflet) and loaded
// client-side only. Tiles are OpenStreetMap — free, no API key.

type Stop = { id: string; label: string | null; lat: number; lng: number; status: string };
type Drive = { id: string; status: string; estimated_miles: number | null; points: [number, number][] };
type MapData = { stops: Stop[]; drives: Drive[] };

const COLOR_PROVISIONAL = "#2563eb";
const COLOR_CONFIRMED = "#16a34a";
const COLOR_STOP_FILL = "#f59e0b";

export default function DayMap({ day }: { day?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const [empty, setEmpty] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;

      if (!mapRef.current) {
        mapRef.current = L.map(containerRef.current, { zoomControl: true, attributionControl: true });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "© OpenStreetMap",
        }).addTo(mapRef.current);
        mapRef.current.setView([39.5, -98.35], 4); // continental US until we have points
      }

      setLoading(true);
      const qs = day ? `?date=${day}` : "";
      const res = await fetch(`/api/v1/activities/segments/geometry${qs}`).catch(() => null);
      const json = res ? await res.json().catch(() => null) : null;
      if (cancelled) return;
      const data: MapData = json?.data ?? { stops: [], drives: [] };

      if (layerRef.current) mapRef.current.removeLayer(layerRef.current);
      const group = L.layerGroup().addTo(mapRef.current);
      layerRef.current = group;

      const bounds: [number, number][] = [];
      for (const d of data.drives) {
        if (d.points.length >= 2) {
          L.polyline(d.points, {
            color: d.status === "confirmed" ? COLOR_CONFIRMED : COLOR_PROVISIONAL,
            weight: 4,
            opacity: 0.8,
          })
            .addTo(group)
            .bindPopup(d.estimated_miles != null ? `Drive · ~${d.estimated_miles} mi` : "Drive");
          bounds.push(...d.points);
        }
      }
      for (const s of data.stops) {
        L.circleMarker([s.lat, s.lng], {
          radius: 7,
          color: "#0f172a",
          weight: 2,
          fillColor: s.status === "confirmed" ? COLOR_CONFIRMED : COLOR_STOP_FILL,
          fillOpacity: 0.9,
        })
          .addTo(group)
          .bindPopup(s.label ?? "Stop");
        bounds.push([s.lat, s.lng]);
      }

      setEmpty(bounds.length === 0);
      setLoading(false);
      if (bounds.length > 0) mapRef.current.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
      mapRef.current.invalidateSize();
    })();

    return () => {
      cancelled = true;
    };
  }, [day]);

  // Tear the map down on unmount so re-mounts don't double-init the container.
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        layerRef.current = null;
      }
    };
  }, []);

  return (
    <div style={{ position: "relative" }}>
      <div
        ref={containerRef}
        style={{ height: 320, borderRadius: "var(--radius-lg)", overflow: "hidden", border: "1px solid var(--border)", zIndex: 0 }}
      />
      {!loading && empty ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            color: "var(--text-muted)",
            fontSize: "0.85rem",
            background: "var(--surface)",
            borderRadius: "var(--radius-lg)",
          }}
        >
          No mapped locations for this day yet.
        </div>
      ) : null}
    </div>
  );
}
