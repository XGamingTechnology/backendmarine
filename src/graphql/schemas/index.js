// src/graphql/schemas/index.js
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

    🔹 Toponimi:
      - category: String           → kategori toponimi
      - iconType: String           → tipe ikon
      - imageUrl: String           → URL gambar kustom

    Contoh:
    {
      "survey_id": "SURVEY_1756167280",
      "transect_id": "TR_1",
      "distance_m": 100.5,
      "offset_m": -24.3,
      "depth_value": -2.445,
      "posisi": "kiri",
      "icon": "circle",
      "color": "#16a34a"
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
    🔥 Proses survey dari draft polygon (versi lama - kompatibilitas)
    """
    generateTransekFromPolygon(surveyId: String!, polygonDraftId: Int!, lineCount: Int!, spacing: Float!): ProcessSurveyResponse!

    """
    🔥 Proses transek dari draft polygon (versi baru: bisa lineCount, pointCount, atau fixedSpacing)
    """
    generateTransekFromPolygonByDraft(surveyId: String!, polygonDraftId: Int!, lineCount: Int, pointCount: Int, fixedSpacing: Float): ProcessSurveyResponse!

    """
    🔥 Hapus semua hasil survey berdasarkan surveyId
    Digunakan untuk regenerate hasil
    """
    deleteSurveyResults(surveyId: String!): MutationResponse!
  }
`;

export default typeDefs;
