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
    category: String # ✅ Tambah: kategori toponimi
    source: String # ✅ Opsional: tambah metadata.source
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

  # Query utama
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
    Gunakan untuk export langsung tanpa ambil semua data
    """
    samplingPointsBySurveyId(surveyId: String!): [SpatialFeature!]!
  }

  type LayerGroup {
    id: ID!
    name: String!
    description: String
    displayOrder: Int
    isActive: Boolean
  }

  extend type Query {
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
