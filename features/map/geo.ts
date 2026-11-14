/**
 * GeoJSON helpers for the Quezon City map. No dependencies — used by the
 * server (overview data, PDF export) and the browser (Leaflet map, PNG export).
 * Coordinates are WGS 84 [longitude, latitude].
 */

export type LonLat = [number, number];
export type Ring = LonLat[];
export type PolygonCoords = Ring[];
export type Segment = [LonLat, LonLat];

/** Parses a stored boundary (Polygon / MultiPolygon / Feature) into polygons. */
export function parseBoundary(text: string | null): PolygonCoords[] {
  if (!text) return [];
  try {
    const value = JSON.parse(text);
    const geometry = value.type === "Feature" ? value.geometry : value;
    if (geometry?.type === "Polygon") return [geometry.coordinates];
    if (geometry?.type === "MultiPolygon") return geometry.coordinates;
  } catch {
    // Invalid boundary text: draw nothing for this area.
  }
  return [];
}

/**
 * Outline of a group of adjacent polygons: the edges that belong to only one
 * of them (shared inner borders cancel out). Works because neighbouring
 * barangays in the source data share identical vertices.
 */
export function outlineSegments(polygons: PolygonCoords[]): Segment[] {
  const counts = new Map<string, { segment: Segment; n: number }>();
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (let i = 0; i < ring.length - 1; i++) {
        const a = ring[i];
        const b = ring[i + 1];
        const ka = a.join(",");
        const kb = b.join(",");
        const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
        const entry = counts.get(key);
        if (entry) entry.n++;
        else counts.set(key, { segment: [a, b], n: 1 });
      }
    }
  }
  return [...counts.values()].filter((e) => e.n === 1).map((e) => e.segment);
}

export function boundsOf(polygons: PolygonCoords[]) {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const [lon, lat] of ring) {
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }
  }
  return { minLon, minLat, maxLon, maxLat };
}

type Project = (point: LonLat) => [number, number];
const identity: Project = (point) => point;

function ringArea(ring: [number, number][]) {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return area / 2;
}

/** Area-weighted centroid of the largest polygon (label position). */
export function labelPoint(polygons: PolygonCoords[], project: Project = identity): [number, number] {
  let best: { area: number; x: number; y: number } | null = null;
  for (const polygon of polygons) {
    const ring = polygon[0].map(project);
    let cx = 0, cy = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const [x0, y0] = ring[i];
      const [x1, y1] = ring[i + 1];
      const cross = x0 * y1 - x1 * y0;
      cx += (x0 + x1) * cross;
      cy += (y0 + y1) * cross;
    }
    const area = ringArea(ring);
    if (area !== 0 && (!best || Math.abs(area) > Math.abs(best.area))) {
      best = { area, x: cx / (6 * area), y: cy / (6 * area) };
    }
  }
  return best ? [best.x, best.y] : [0, 0];
}

/**
 * Label point for a group of areas (a district made of barangays): the label
 * point of the member closest to the group's overall centroid, so it always
 * lands inside the group, even for long, thin shapes.
 */
export function groupLabelPoint(members: PolygonCoords[][], project: Project = identity): [number, number] {
  let sumX = 0, sumY = 0, sumArea = 0;
  const points = members.map((polygons) => {
    const point = labelPoint(polygons, project);
    const area = polygons.reduce((sum, polygon) => sum + Math.abs(ringArea(polygon[0].map(project))), 0);
    sumX += point[0] * area;
    sumY += point[1] * area;
    sumArea += area;
    return point;
  });

  if (points.length === 0 || sumArea === 0) return [0, 0];
  const cx = sumX / sumArea;
  const cy = sumY / sumArea;
  return points.reduce((best, p) =>
    (p[0] - cx) ** 2 + (p[1] - cy) ** 2 < (best[0] - cx) ** 2 + (best[1] - cy) ** 2 ? p : best,
  );
}

/* ----- flat projection for exported images and PDFs ----- */

/** Equirectangular projection scaled by cos(latitude); accurate at city scale. */
export function createProjection(polygons: PolygonCoords[], width: number, padding = 8) {
  const { minLon, minLat, maxLon, maxLat } = boundsOf(polygons);
  const kx = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const spanX = (maxLon - minLon) * kx || 1;
  const spanY = maxLat - minLat || 1;
  const scale = (width - padding * 2) / spanX;
  const height = Math.ceil(spanY * scale + padding * 2);

  const project: Project = ([lon, lat]) => [
    Math.round(((lon - minLon) * kx * scale + padding) * 10) / 10,
    Math.round(((maxLat - lat) * scale + padding) * 10) / 10,
  ];

  return { project, width, height };
}

export function polygonsToPath(polygons: PolygonCoords[], project: Project) {
  return polygons
    .flatMap((polygon) =>
      polygon.map((ring) => `M${ring.map((point) => project(point).join(" ")).join("L")}Z`),
    )
    .join("");
}

export function segmentsToPath(segments: Segment[], project: Project) {
  return segments.map(([a, b]) => `M${project(a).join(" ")}L${project(b).join(" ")}`).join("");
}

/* ----- heatmap color scale (sequential single hue, light → dark) ----- */

/** Validated sequential blue ramp, lightest = fewest applicants. */
export const HEAT_RAMP = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#1c5cab", "#0d366b"];
/** Areas with no applicants (kept visibly different from the ramp). */
export const ZERO_FILL = "#ecebe8";

function niceStep(raw: number) {
  if (raw <= 1) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (m * magnitude >= raw) return m * magnitude;
  }
  return 10 * magnitude;
}

export type HeatBin = { min: number; max: number | null; color: string; label: string };

/** Six equal-width bins with round boundaries covering 1…max. */
export function heatBins(max: number): HeatBin[] {
  const step = niceStep(Math.max(1, max) / HEAT_RAMP.length);
  return HEAT_RAMP.map((color, index) => {
    const min = index * step + 1;
    const isLast = index === HEAT_RAMP.length - 1;
    const upper = (index + 1) * step;
    let label = `${min} – ${upper}`;
    if (isLast) label = `> ${index * step}`;
    else if (min === upper) label = `${min}`;
    return { min, max: isLast ? null : upper, color, label };
  });
}

export function heatColor(value: number, bins: HeatBin[]) {
  if (value <= 0) return ZERO_FILL;
  return bins.find((bin) => bin.max === null || value <= bin.max)?.color ?? bins.at(-1)!.color;
}

/** Text color that stays readable on a heat fill. */
export function labelColor(fill: string) {
  return HEAT_RAMP.indexOf(fill) >= 3 ? "#ffffff" : "#0b0b0b";
}

/* ----- one drawing model for PNG (browser) and PDF (server) exports ----- */

export type MapAreaData = {
  id: number;
  name: string;
  applicants: number;
  admitted: number;
  label: LonLat;
};
export type MapBarangayData = MapAreaData & { polygons: PolygonCoords[] };
export type MapDistrictData = MapAreaData & { outline: Segment[]; barangays: MapBarangayData[] };
export type MapLevel = "district" | "barangay";

export type MapDrawing = {
  width: number;
  height: number;
  shapes: { d: string; fill: string; stroke: string; strokeWidth: number }[];
  labels: { x: number; y: number; text: string; sub: string; fill: string; halo: string }[];
};

/** Flat, shaded map (no basemap) at the given width, for exported files. */
export function buildMapDrawing(
  districts: MapDistrictData[],
  cityOutline: Segment[],
  level: MapLevel,
  bins: HeatBin[],
  width: number,
): MapDrawing {
  const all = districts.flatMap((d) => d.barangays.flatMap((b) => b.polygons));
  const { project, height } = createProjection(all, width);
  const shapes: MapDrawing["shapes"] = [];
  const labels: MapDrawing["labels"] = [];

  if (level === "district") {
    for (const d of districts) {
      const fill = heatColor(d.applicants, bins);
      shapes.push({ d: polygonsToPath(d.barangays.flatMap((b) => b.polygons), project), fill, stroke: fill, strokeWidth: 0.6 });
    }
    for (const d of districts) {
      shapes.push({ d: segmentsToPath(d.outline, project), fill: "none", stroke: "#ffffff", strokeWidth: 2.5 });
    }
    for (const d of districts) {
      const [x, y] = project(d.label);
      const ink = labelColor(heatColor(d.applicants, bins));
      labels.push({ x, y, text: d.name.toUpperCase(), sub: String(d.applicants), fill: ink, halo: ink === "#ffffff" ? "#0d366b" : "#ffffff" });
    }
  } else {
    for (const b of districts.flatMap((d) => d.barangays)) {
      shapes.push({ d: polygonsToPath(b.polygons, project), fill: heatColor(b.applicants, bins), stroke: "#ffffff", strokeWidth: 0.6 });
    }
    for (const d of districts) {
      shapes.push({ d: segmentsToPath(d.outline, project), fill: "none", stroke: "#3f3f46", strokeWidth: 1.4 });
    }
  }
  shapes.push({ d: segmentsToPath(cityOutline, project), fill: "none", stroke: "#3f3f46", strokeWidth: 1.6 });

  return { width, height, shapes, labels };
}

export function mapLevelValues(districts: MapDistrictData[], level: MapLevel) {
  return level === "district"
    ? districts.map((d) => d.applicants)
    : districts.flatMap((d) => d.barangays.map((b) => b.applicants));
}
