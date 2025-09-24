import { gql } from "apollo-server-express";

const typeDefs = gql`
  # Scalar untuk JSON
  scalar JSON

  # Tipe data user
  type User {
    id: ID!
    username: String!
    email: String!
    role: String!
    fullName: String
    lastLoginAt: String
    isActive: Boolean!
    avatarUrl: String
  }

  # Tipe data login result
  type LoginResult {
    success: Boolean!
    token: String
    user: User
    message: String
  }

  # Tipe data spatial_features
  type SpatialFeature {
    id: ID!
    layerType: String!
    name: String
    description: String
    geometry: JSON
    createdAt: String
    updatedAt: String
    createdBy: User
    source: String

    """
    Metadata dinamis yang bisa berisi:

    🔹 Styling:
      - icon: String
      - color: String
      - fillColor: String
      - fillOpacity: Float
      - weight: Int

    🔹 Data Survey:
      - survey_id: String          → ID survei (misal: SURVEY_1756167280)
      - transect_id: String        → ID transek (misal: TR_1)
      - kedalaman: Float           → kedalaman (bisa negatif)
      - depth_value: Float         → alternatif kedalaman (dipakai di valid_sampling_point)
      - distance_m: Float          → jarak dari awal sungai (x-axis)
      - offset_m: Float            → jarak dari tengah sungai (y-axis, negatif = kiri)
      - posisi: String             → 'kiri', 'tengah', 'kanan' (opsional)
      - centerline_source: String  → 'auto' atau 'manual'

    🔹 Toponimi:
      - category: String           → kategori toponimi
      - iconType: String           → tipe ikon
      - imageUrl: String           → URL gambar kustom

    🔹 Batimetri:
      - contour_interval: Float    → interval kontur (misal: 1.0)
      - depth_value: Float         → kedalaman kontur (untuk styling warna)

    Contoh:
    {
      "survey_id": "SURVEY_1756167280",
      "transect_id": "TR_1",
      "distance_m": 100.5,
      "offset_m": -24.3,
      "depth_value": -2.445,
      "posisi": "kiri",
      "icon": "circle",
      "color": "#16a34a",
      "centerline_source": "manual"
    }
    """
    meta: JSON

    user_id: Int
    is_shared: Boolean
  }

  # Tipe data cross_sections
  type CrossSection {
    id: ID!
    stationName: String!
    stationValue: Float!
    riverId: ID
    locationPoint: JSON
    createdAt: String
    createdBy: User
    notes: String
  }

  # 🔥 Tipe data layer_definitions
  type LayerDefinition {
    id: ID!
    name: String!
    description: String
    layerType: String!
    source: String

    """
    Metadata tambahan untuk konfigurasi layer:
    - defaultStyle: { color, weight, fillColor, ... }
    - isEditable: Boolean
    - zIndex: Int
    """
    meta: JSON
  }

  # 🔥 Tipe data opsi layer (untuk dropdown)
  type LayerOption {
    id: Int!
    name: String!
    layerType: String!
  }

  # Input untuk create/update
  input GeometryInput {
    type: String!
    coordinates: [[Float]]!
  }

  # ✅ DIPERBAIKI: Tambah field category dan icon
  input MetadataInput {
    # --- Visual Styling ---
    icon: String
    iconColor: String
    markerColor: String
    fillColor: String
    color: String
    weight: Int
    fillOpacity: Float
    iconType: String
    imageUrl: String
    imageWidth: Int
    imageHeight: Int

    # --- Toponimi & Kategori ---
    category: String # ✅ Kategori toponimi (misal: "Bendungan", "Jembatan")
    source: String # ✅ Sumber data (opsional)
    is_custom: Boolean
  }

  # Mutation Response standar
  type MutationResponse {
    success: Boolean!
    message: String!
  }

  # ✅ Response untuk simpan draft
  type DraftResponse {
    success: Boolean!
    message: String!
    draftId: Int!
  }

  # ✅ ProcessSurveyResponse: Hasil dari process_survey / generate_survey
  type ProcessSurveyResponse {
    success: Boolean!
    message: String!
    result: JSON # GeoJSON hasil akhir
  }

  # ✅ GenerateTransectsResult: Hasil dari generateTransectsFromPolygonAndLine
  type GenerateTransectsResult {
    success: Boolean!
    message: String!
    transects: JSON! # GeoJSON FeatureCollection
  }

  """
  Hasil dari proses generate (transek, batimetri, dll)

  Digunakan oleh:
  - generateTransekFromPolygonByDraft
  - generateBatimetriFromSamplingPoints
  - dan proses generate lainnya
  """
  type GenerateResult {
    success: Boolean!
    message: String!

    """
    Data tambahan opsional — bisa berisi:
    - pointCount: jumlah titik input
    - contourCount: jumlah kontur dihasilkan
    - depthRange: [min, max] kedalaman
    - surveyId: ID survey terkait
    - durationMs: durasi proses dalam milidetik
    """
    data: JSON
  }

  # 🔥 Tambahkan fieldSurveyPointsBySurveyId di type Query
  type Query {
    """
    Ambil semua spatial features, bisa difilter berdasarkan layerType atau source
    """
    spatialFeatures(layerType: String, source: String): [SpatialFeature]

    """
    Ambil semua cross sections
    """
    crossSections: [CrossSection]

    """
    Ambil semua user
    """
    users: [User]

    """
    🔥 Ambil semua definisi layer (untuk sidebar dinamis)
    """
    layerDefinitions: [LayerDefinition!]!

    """
    🔥 Ambil opsi layer berdasarkan tipe (misal: area_sungai)
    """
    layerOptions(layerType: String!): [LayerOption!]!

    """
    🔥 Ambil semua sampling point berdasarkan survey_id

    ⚠️ CATATAN: Resolver ini akan:
      - Filter titik dengan layer_type = 'valid_sampling_point'
      - Urutkan titik sepanjang 'valid_transect_line' terkait
      - Hitung dan tambahkan \`distance_m\` ke \`meta\` (jarak dari awal transek)
      - Pastikan \`kedalaman\` bernilai negatif (di bawah permukaan)

    Cocok untuk:
      - Chart penampang 2D
      - Analisis profil sungai
      - Ekspor data
    """
    samplingPointsBySurveyId(surveyId: String!): [SpatialFeature!]!

    """
    🔥 Ambil semua titik survey lapangan berdasarkan survey_id
    - Tidak butuh valid_transect_line
    - Urutkan berdasarkan 'sequence' di metadata
    - Hitung jarak kumulatif antar titik
    - Cocok untuk data hasil upload CSV (echosounder)
    """
    fieldSurveyPointsBySurveyId(surveyId: String!): [SpatialFeature!]!

    """
    🔥 Ambil titik simulasi berdasarkan surveyId — tanpa perlu transect line

    Cocok untuk:
      - Titik yang dibuat manual (drawing)
      - Simulasi tanpa proses transect
      - Data dengan 'name = surveyId' atau 'meta.survey_id'
      - Titik tanpa geometri kompleks

    Akan tambahkan:
      - meta.distance_m → dari metadata atau default
      - meta.depth_value → negatif
      - meta.offset_m → default 0
    """
    simulatedPointsBySurveyId(surveyId: String!): [SpatialFeature!]!

    """
    🔥 Ambil layer kontur & permukaan batimetri berdasarkan surveyId

    Mengembalikan:
      - layer_type = 'kontur_batimetri' → garis kontur kedalaman
      - layer_type = 'permukaan_batimetri' → permukaan TIN

    Cocok untuk:
      - Visualisasi 3D dasar sungai
      - Styling warna berdasarkan kedalaman
      - Analisis volume sedimen
    """
    batimetriLayersBySurveyId(surveyId: String!): [SpatialFeature!]!
  }

  type LayerGroup {
    id: ID!
    name: String!
    description: String
    displayOrder: Int
    isActive: Boolean
  }

  extend type Query {
    """
    Ambil semua grup layer untuk pengelompokan di sidebar
    """
    layerGroups: [LayerGroup!]!
  }

  # Mutation utama
  type Mutation {
    """
    Buat spatial feature baru
    """
    createSpatialFeature(layerType: String!, name: String, description: String, geometry: GeometryInput!, source: String, meta: MetadataInput): SpatialFeature

    """
    Update spatial feature berdasarkan ID
    """
    updateSpatialFeature(id: ID!, name: String, description: String, geometry: GeometryInput, source: String, meta: MetadataInput): SpatialFeature

    """
    Hapus spatial feature berdasarkan ID
    """
    deleteSpatialFeature(id: ID!): MutationResponse!

    """
    Login user dan dapatkan JWT token
    """
    login(email: String!, password: String!): LoginResult!

    """
    Daftar user baru — sekarang terima role (opsional)
    """
    register(name: String!, email: String!, password: String!, role: String): LoginResult!

    """
    Ubah role user — hanya untuk admin
    """
    updateUserRole(id: ID!, role: String!): MutationResponse!

    """
    Hapus user — hanya untuk admin
    """
    deleteUser(id: ID!): MutationResponse!

    """
    🔥 Simpan draft garis sungai ke database
    """
    saveRiverLineDraft(geom: JSON!): DraftResponse!

    """
    🔥 Simpan draft polygon ke database
    """
    savePolygonDraft(geom: JSON!): DraftResponse!

    """
    🔥 Proses survey dari draft: generate transect, clip, simpan hasil
    """
    generateSurvey(surveyId: String!, riverLineDraftId: Int!, areaId: Int!, spasi: Float!, panjang: Float!): ProcessSurveyResponse!

    """
    🔥 Proses survey: kirim riverLine langsung sebagai GeoJSON (untuk kompatibilitas lama)
    """
    processSurveyWithLine(surveyId: String!, riverLine: JSON!, areaId: Int!, spasi: Float!, panjang: Float!): ProcessSurveyResponse!

    """
    🔥 Proses transek dari draft polygon (versi lama - kompatibilitas)
    """
    generateTransekFromPolygon(surveyId: String!, polygonDraftId: Int!, lineCount: Int!, spacing: Float!): ProcessSurveyResponse!

    """
    🔥 Proses transek dari draft polygon (versi baru: bisa lineCount, pointCount, atau fixedSpacing)
    """
    generateTransekFromPolygonByDraft(
      surveyId: String!
      polygonDraftId: Int
      lineCount: Int
      pointCount: Int
      fixedSpacing: Float
      centerlineGeom: JSON # ✅ TAMBAHKAN INI — opsional, untuk garis manual
      mode: String
    ): GenerateResult! # ✅ GANTI JADI GenerateResult
    """
    🔥 Hapus semua hasil survey berdasarkan surveyId
    Digunakan untuk regenerate hasil
    """
    deleteSurveyResults(surveyId: String!): MutationResponse!

    """
    🔥 Generate transek dari polygon + line manual via PostGIS

    Parameters:
    - polygon: GeoJSON Polygon
    - line: GeoJSON LineString (garis tengah manual)
    - mode: "interval" | "jumlah"
    - interval: Float (jika mode = "interval")
    - jumlah: Int (jika mode = "jumlah")
    - panjangTransek: Float (panjang transek dalam km)

    Returns:
    - success: Boolean
    - message: String
    - transects: GeoJSON FeatureCollection
    """
    generateTransectsFromPolygonAndLine(polygon: JSON!, line: JSON!, mode: String!, interval: Float, jumlah: Int, panjangTransek: Float!): GenerateTransectsResult!

    """
    🔥 Generate kontur & batimetri dari titik sampling

    Parameters:
    - surveyId: String! → ID survei yang sudah memiliki titik sampling

    Returns:
    - success: Boolean
    - message: String → "Kontur dan batimetri berhasil digenerate"
    - data: JSON → { pointCount, depthRange, surveyId, ... }

    Menghasilkan:
    - layer_type = 'kontur_batimetri' → garis kontur kedalaman
    - layer_type = 'permukaan_batimetri' → permukaan TIN

    Disimpan ke spatial_features — bisa langsung ditampilkan di peta.
    """
    generateBatimetriFromSamplingPoints(surveyId: String!): GenerateResult!
  }
`;

export default typeDefs;
