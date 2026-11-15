"use client";

import "leaflet/dist/leaflet.css";

import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import { GeoJSON, MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import type { Feature, FeatureCollection, MultiLineString, MultiPolygon } from "geojson";

import {
  boundsOf,
  heatColor,
  labelColor,
  type HeatBin,
  type MapDistrictData,
  type MapLevel,
  type Segment,
} from "@/features/map/geo";

type Selection = { level: MapLevel; id: number } | null;
type AreaProps = { id: number; name: string; district: string; applicants: number; admitted: number };

const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · Boundaries: NAMRIA, PSA via OCHA COD-AB (CC BY-IGO)';

const lines = (segments: Segment[]): MultiLineString => ({ type: "MultiLineString", coordinates: segments });
const asFeature = (geometry: MultiLineString | MultiPolygon): Feature => ({ type: "Feature", properties: {}, geometry });

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Zooms to the selected area, or back to the whole city when cleared. */
function FitToSelection({ target }: Readonly<{ target: [[number, number], [number, number]] }>) {
  const map = useMap();
  const key = JSON.stringify(target);
  useEffect(() => {
    map.flyToBounds(target, { padding: [24, 24], duration: 0.4, maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the bounds change
  }, [map, key]);
  return null;
}

export default function LeafletMap({
  districts,
  cityOutline,
  bounds,
  level,
  bins,
  selected,
  onSelect,
  height,
}: Readonly<{
  districts: MapDistrictData[];
  cityOutline: Segment[];
  bounds: [[number, number], [number, number]];
  level: MapLevel;
  bins: HeatBin[];
  selected: Selection;
  onSelect: (selection: Selection) => void;
  height: string;
}>) {
  // Leaflet handlers are bound once per layer; read the latest callback via a ref.
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  const areas = useMemo<FeatureCollection<MultiPolygon, AreaProps>>(() => {
    const features: Feature<MultiPolygon, AreaProps>[] =
      level === "district"
        ? districts.map((d) => ({
            type: "Feature",
            properties: { id: d.id, name: d.name, district: d.name, applicants: d.applicants, admitted: d.admitted },
            geometry: { type: "MultiPolygon", coordinates: d.barangays.flatMap((b) => b.polygons) },
          }))
        : districts.flatMap((d) =>
            d.barangays.map((b) => ({
              type: "Feature" as const,
              properties: { id: b.id, name: `Brgy. ${b.name}`, district: d.name, applicants: b.applicants, admitted: b.admitted },
              geometry: { type: "MultiPolygon" as const, coordinates: b.polygons },
            })),
          );
    return { type: "FeatureCollection", features };
  }, [districts, level]);

  // Remount the GeoJSON layers when the data or level changes (Leaflet styles are not reactive).
  const dataKey = `${level}:${areas.features.map((f) => f.properties.applicants).join(",")}`;

  const districtOutlines = useMemo<FeatureCollection<MultiLineString>>(
    () => ({
      type: "FeatureCollection",
      features: districts.map((d) => ({ type: "Feature", properties: {}, geometry: lines(d.outline) })),
    }),
    [districts],
  );

  const selectedDistrict =
    selected?.level === "district" ? districts.find((d) => d.id === selected.id) : undefined;
  const selectedBarangay =
    selected?.level === "barangay"
      ? districts.flatMap((d) => d.barangays).find((b) => b.id === selected.id)
      : undefined;

  const fitTarget = useMemo<[[number, number], [number, number]]>(() => {
    const polygons = selectedBarangay?.polygons ?? selectedDistrict?.barangays.flatMap((b) => b.polygons);
    if (!polygons?.length) return bounds;
    const box = boundsOf(polygons);
    return [
      [box.minLat, box.minLon],
      [box.maxLat, box.maxLon],
    ];
  }, [bounds, selectedBarangay, selectedDistrict]);

  const maxBounds: L.LatLngBoundsExpression = [
    [bounds[0][0] - 0.08, bounds[0][1] - 0.08],
    [bounds[1][0] + 0.08, bounds[1][1] + 0.08],
  ];

  return (
    <MapContainer
      bounds={bounds}
      maxBounds={maxBounds}
      minZoom={11}
      maxZoom={17}
      scrollWheelZoom={false}
      style={{ height, width: "100%", background: "#e5e5e5" }}
      className="z-0 rounded-lg"
      attributionControl
    >
      <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution={OSM_ATTRIBUTION} maxZoom={19} />

      <GeoJSON
        key={dataKey}
        data={areas}
        style={(feature) => {
          const applicants = (feature?.properties as AreaProps | undefined)?.applicants ?? 0;
          const fill = heatColor(applicants, bins);
          return {
            fillColor: fill,
            fillOpacity: applicants > 0 ? 0.72 : 0.35,
            color: "#ffffff",
            weight: level === "district" ? 0 : 0.7,
            stroke: level !== "district",
          };
        }}
        onEachFeature={(feature, layer) => {
          const p = feature.properties as AreaProps;
          layer.bindTooltip(
            `<strong>${escapeHtml(p.name)}</strong>${level === "barangay" ? `<br/><span>${escapeHtml(p.district)}</span>` : ""}<br/>${p.applicants} applicant${p.applicants === 1 ? "" : "s"} · ${p.admitted} passed`,
            { sticky: true, direction: "top", offset: [0, -6] },
          );
          layer.on({
            click: () => onSelectRef.current({ level, id: p.id }),
            mouseover: (event) => (event.target as L.Path).setStyle({ weight: 2.5, color: "#0b0b0b", stroke: true }),
            mouseout: (event) =>
              (event.target as L.Path).setStyle({
                weight: level === "district" ? 0 : 0.7,
                color: "#ffffff",
                stroke: level !== "district",
              }),
          });
        }}
      />

      <GeoJSON
        key={`outlines-${level}`}
        data={districtOutlines}
        interactive={false}
        style={{ color: level === "district" ? "#ffffff" : "#3f3f46", weight: level === "district" ? 2.5 : 1.4 }}
      />
      <GeoJSON
        key="city-outline"
        data={asFeature(lines(cityOutline))}
        interactive={false}
        style={{ color: "#3f3f46", weight: 2 }}
      />

      {selectedBarangay && (
        <GeoJSON
          key={`sel-b-${selectedBarangay.id}`}
          data={asFeature({ type: "MultiPolygon", coordinates: selectedBarangay.polygons })}
          interactive={false}
          style={{ fill: false, color: "#0b0b0b", weight: 3.5 }}
        />
      )}
      {selectedDistrict && (
        <GeoJSON
          key={`sel-d-${selectedDistrict.id}`}
          data={asFeature(lines(selectedDistrict.outline))}
          interactive={false}
          style={{ color: "#0b0b0b", weight: 4 }}
        />
      )}

      {level === "district" &&
        districts.map((d) => {
          const ink = labelColor(heatColor(d.applicants, bins));
          return (
            <Marker
              key={`label-${d.id}-${d.applicants}`}
              position={[d.label[1], d.label[0]]}
              interactive={false}
              keyboard={false}
              icon={L.divIcon({
                className: "tanaw-map-label",
                html: `<span style="color:${ink};--halo:${ink === "#ffffff" ? "#0d366b" : "#ffffff"}">${escapeHtml(d.name.toUpperCase())}<br/>${d.applicants}</span>`,
                iconSize: [0, 0],
              })}
            />
          );
        })}

      <FitToSelection target={fitTarget} />
    </MapContainer>
  );
}
