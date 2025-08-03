profile
Qwen3-235B-A22B-2507
5:21 pm
Pertanyaanmu "nomor 2 saya gak ngerti itu tuh kita simpan di mana ya? apa kita buat function itu di dalam struktur backend?" — sangat jelas dan penting.

Mari kita bahas dengan praktis dan langsung ke inti:

✅ Jawaban Singkat:
Ya, fungsi PostGIS (seperti process_transects) tidak disimpan di struktur backend kamu.
Fungsi itu dibuat langsung di database (PostgreSQL + PostGIS) menggunakan pgAdmin, bukan di folder Node.js. 

Tapi...

Backend kamu (Node.js) akan memanggil fungsi itu lewat SQL, seperti ini: 

js


1
await db.none('SELECT process_transects($1, $2, $3)', [surveyId, rawTransects, areaId]);
🧱 Analoginya:
Bayangkan kamu punya bengkel mesin (database) dan kantor operasi (backend).

🔧
Bengkel (PostgreSQL/PostGIS)
Mesin besar: fungsi
process_transects
, tabel
survey_transects
, spatial index
🏢
Kantor (Backend Node.js)
Operator: yang tekan tombol "Jalankan mesin" lewat kode

Jadi:

Fungsi PostGIS → di database (pgAdmin)
Kode Node.js → hanya memanggilnya
📁 Jadi, "Nomor 2" (fungsi process_transects) disimpan di mana?
❌ BUKAN di:
controllers/
services/
routes/
models/
✅ TAPI di:
PostgreSQL (via pgAdmin) → sebagai fungsi database (stored function) 

🛠️ Cara Buat Fungsi di pgAdmin (Langkah Nyata)
Buka pgAdmin
Pilih database kamu (misal: gis_db)
Klik kanan → Query Tool
Tempel kode fungsi PostGIS:
sql


1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31
32
33
34
35
36
37
38
39
40
41
42
43
44
45
46
47
48
49
50
51
52
⌄
⌄
CREATE OR REPLACE FUNCTION process_transects(
  p_survey_id VARCHAR,
  p_raw_transects JSON,
  p_area_id INTEGER
)
RETURNS VOID AS $$
BEGIN
  DELETE FROM survey_transects WHERE survey_id = p_survey_id;

  WITH raw_features AS (
    SELECT 
      (f->>'id')::VARCHAR AS transect_id,
      (f->'properties'->>'distanceFromStart')::DOUBLE PRECISION AS distance_from_start,
      (f->'properties'->>'bearing')::DOUBLE PRECISION AS bearing,
      (f->'properties'->>'normalBearing')::DOUBLE PRECISION AS normal_bearing,
      ST_GeomFromGeoJSON(f->'geometry') AS geom_line
    FROM jsonb_array_elements((p_raw_transects->'features')::jsonb) AS f
  ),
  clipped AS (
    SELECT 
      rf.transect_id,
      rf.distance_from_start,
      rf.bearing,
      rf.normal_bearing,
      ST_Intersection(rf.geom_line, sa.geom) AS clipped_geom
    FROM raw_features rf
    JOIN study_areas sa ON sa.id = p_area_id
    WHERE ST_Intersects(rf.geom_line, sa.geom)
  ),
  validated AS (
    SELECT 
      transect_id,
      distance_from_start,
      bearing,
      normal_bearing,
      clipped_geom AS geom_line,
      ST_LineInterpolatePoint(clipped_geom, 0.5) AS geom_point,
      ST_Length(clipped_geom::geography) AS clipped_length,
      CASE WHEN ST_Length(clipped_geom::geography) > 10 THEN TRUE ELSE FALSE END AS is_valid
    FROM clipped
    WHERE GeometryType(clipped_geom) = 'LINESTRING'
  )
  INSERT INTO survey_transects (
    survey_id, transect_id, distance_from_start, bearing, normal_bearing,
    geom_line, geom_point, clipped_length, is_valid
  )
  SELECT 
    p_survey_id, transect_id, distance_from_start, bearing, normal_bearing,
    geom_line, geom_point, clipped_length, is_valid
  FROM validated;
END;
$$ LANGUAGE plpgsql;
Klik ▶️ Execute/Preview → fungsi akan dibuat di database.
