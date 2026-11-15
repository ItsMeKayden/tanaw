# Quezon City boundaries

`qc-barangays.geojson` — the 142 barangays of Quezon City (PSGC 1381300000),
high resolution (10% of source vertices), WGS 84 longitude/latitude.

- Source: [faeldon/philippines-json-maps](https://github.com/faeldon/philippines-json-maps)
  release v1.1.1, `geojson/municities/hires/bgysubmuns-municity-1381300000.0.1.json`
  (SHA-256 of the release zip: `d6aedda878af0884f112d992183639df61f5e74af380cf71a589055f9437a348`).
- Boundaries: NAMRIA and PSA, via OCHA's Common Operational Dataset (COD-AB),
  licensed **CC BY-IGO**. Republishing requires this credit (shown on the Map page).

`npm run db:seed` copies each barangay's geometry into
`tbl_barangay.boundary_geojson` and builds each district's
`tbl_district.boundary_geojson` (a MultiPolygon of its barangays).
