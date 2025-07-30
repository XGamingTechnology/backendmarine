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

  # Input untuk create/update
  input GeometryInput {
    type: String!
    coordinates: [[Float]]!
  }

  input MetadataInput {
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
  }

  # Mutation Response standar
  type MutationResponse {
    success: Boolean!
    message: String!
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
    deleteSpatialFeature(id: ID!): Boolean

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
    deleteUser(id: ID!): Boolean!
  }
`;

export default typeDefs;
