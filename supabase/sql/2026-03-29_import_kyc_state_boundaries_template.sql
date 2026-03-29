-- Use this after running:
--   1. supabase/sql/2026-03-29_create_kyc_geo_security.sql
--
-- Recommended source files:
--   Kaduna simplified GeoJSON geometry
--   Plateau simplified GeoJSON geometry
--
-- Replace the {...} payloads below with the "geometry" object only,
-- not the whole Feature wrapper.

insert into public.kyc_state_boundaries (
  state_name,
  state_code,
  source_name,
  source_boundary_id,
  boundary
)
values
(
  'Kaduna',
  'NG-KD',
  'geoBoundaries GRID3 ADM1 2022',
  '27671186B54051914323789',
  st_multi(
    st_setsrid(
      st_geomfromgeojson(
        $${
          "type": "Polygon",
          "coordinates": [
            [
              [0, 0],
              [0, 0],
              [0, 0]
            ]
          ]
        }$$
      ),
      4326
    )
  )
),
(
  'Plateau',
  'NG-PL',
  'geoBoundaries GRID3 ADM1 2022',
  '27671186B51792679167430',
  st_multi(
    st_setsrid(
      st_geomfromgeojson(
        $${
          "type": "Polygon",
          "coordinates": [
            [
              [0, 0],
              [0, 0],
              [0, 0]
            ]
          ]
        }$$
      ),
      4326
    )
  )
)
on conflict (state_name) do update
set
  state_code = excluded.state_code,
  source_name = excluded.source_name,
  source_boundary_id = excluded.source_boundary_id,
  boundary = excluded.boundary,
  is_active = true,
  updated_at = timezone('utc'::text, now());

-- Quick verification after import:
-- select state_name, state_code, st_isvalid(boundary) as boundary_valid
-- from public.kyc_state_boundaries
-- order by state_name;

-- Test a sample GPS point:
-- select *
-- from public.record_kyc_gps_audit(<shop_id>, '<merchant_uuid>', 9.0765, 7.3986);
