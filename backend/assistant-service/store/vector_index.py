"""Vector index store over Redis Stack (RediSearch).

Wraps the RediSearch ``FT`` commands that back the Vector_Index. This module is
responsible for three things (design section 7 "Vector Index Store"):

1. Creating the ``idx:incidents`` index on startup if it does not already exist,
   using the documented HASH schema with a VECTOR field configured as
   ``HNSW / FLOAT32 / DIM 768 / COSINE`` (Requirement 4.6).
2. Upserting one document per incident keyed by ``incident:{id}`` so that writing
   the same incident again simply overwrites the prior document, guaranteeing
   exactly one record per incident (Requirements 1.5, 4.2).
3. Running KNN nearest-neighbour search over the ``embedding`` field with optional
   metadata pre-filters (``zone_id`` / ``assigned_guard_id`` / ``doc_type``) and a
   ``LIMIT 0 K`` clause used for role scoping by the Retriever.

The document shape (from design "Data Models"):

    incident_id       TAG   (also the key suffix)
    doc_type          TAG   ("incident" | "alert")
    zone_id           TAG   (role-scope filter)
    camera_id         TAG
    type              TAG
    priority          TAG
    status            TAG
    assigned_guard_id TAG   (role-scope filter)
    created_at        NUMERIC SORTABLE (unix seconds)
    description       TEXT
    embedding         VECTOR HNSW FLOAT32 DIM 768 COSINE

RediSearch schema (created on startup if absent):

    FT.CREATE idx:incidents ON HASH PREFIX 1 incident: SCHEMA
      incident_id TAG  doc_type TAG  zone_id TAG  camera_id TAG
      type TAG  priority TAG  status TAG  assigned_guard_id TAG
      created_at NUMERIC SORTABLE  description TEXT
      embedding VECTOR HNSW 6 TYPE FLOAT32 DIM 768 DISTANCE_METRIC COSINE
"""

from __future__ import annotations

import struct
from dataclasses import dataclass, field
from typing import Any, Optional

import redis
from redis.commands.search.field import (
    NumericField,
    TagField,
    TextField,
    VectorField,
)
from redis.commands.search.indexDefinition import IndexDefinition, IndexType
from redis.commands.search.query import Query
from redis.exceptions import ResponseError

from config.settings import Settings, get_settings

# Key prefix for every incident/alert document. The full key is ``incident:{id}``.
KEY_PREFIX = "incident:"

# The embedding field is stored as a raw little-endian float32 byte blob, which is
# what RediSearch expects for a FLOAT32 vector field.
_VECTOR_TYPE = "FLOAT32"
_DISTANCE_METRIC = "COSINE"

# Metadata fields that may be used as KNN pre-filters for role scoping.
_FILTERABLE_TAG_FIELDS = ("zone_id", "assigned_guard_id", "doc_type")

# All TAG fields stored on a document (used to normalise/serialise HASH values).
_TAG_FIELDS = (
    "incident_id",
    "doc_type",
    "zone_id",
    "camera_id",
    "type",
    "priority",
    "status",
    "assigned_guard_id",
)


def encode_vector(vector: list[float]) -> bytes:
    """Encode a float vector as a little-endian FLOAT32 byte blob.

    RediSearch stores/queries FLOAT32 vectors as packed bytes. Using
    little-endian keeps the encoding stable across the query and the stored
    document.
    """

    return struct.pack(f"<{len(vector)}f", *vector)


def _tag_escape(value: str) -> str:
    """Escape characters that are special inside a RediSearch TAG filter.

    Tag values such as UUIDs contain ``-`` which RediSearch treats as a token
    separator unless escaped, so we escape the punctuation that commonly appears
    in the platform's identifiers and enum values.
    """

    special = set("-@.:{}[]()|>*\\\"'& ")
    return "".join(f"\\{ch}" if ch in special else ch for ch in value)


@dataclass
class SearchHit:
    """A single KNN search result.

    Attributes:
        incident_id: The incident UUID stored on the document.
        score: The vector distance returned by RediSearch (lower is closer for
            COSINE distance).
        fields: The remaining stored metadata fields (decoded to ``str``).
    """

    incident_id: str
    score: float
    fields: dict[str, str] = field(default_factory=dict)


class VectorIndexStore:
    """RediSearch-backed store for incident embeddings and metadata."""

    def __init__(
        self,
        client: Optional["redis.Redis"] = None,
        settings: Optional[Settings] = None,
    ) -> None:
        """Create the store.

        Args:
            client: An optional pre-built redis client. When omitted, a client is
                built from ``REDIS_URL`` in settings.
            settings: Optional settings override (defaults to ``get_settings()``).
        """

        self._settings = settings or get_settings()
        self._index_name = self._settings.vector_index_name
        self._dim = self._settings.embedding_dim
        self._client = client or redis.Redis.from_url(
            self._settings.redis_url, decode_responses=False
        )

    @property
    def client(self) -> "redis.Redis":
        """Return the underlying redis client."""

        return self._client

    # --- Index lifecycle -------------------------------------------------

    def index_exists(self) -> bool:
        """Return ``True`` when the RediSearch index already exists."""

        try:
            self._client.ft(self._index_name).info()
            return True
        except ResponseError:
            return False

    def create_index(self) -> bool:
        """Create ``idx:incidents`` if absent (Requirement 4.6).

        Idempotent: if the index already exists this is a no-op and returns
        ``False``; when the index is newly created it returns ``True``.
        """

        if self.index_exists():
            return False

        schema = (
            TagField("incident_id"),
            TagField("doc_type"),
            TagField("zone_id"),
            TagField("camera_id"),
            TagField("type"),
            TagField("priority"),
            TagField("status"),
            TagField("assigned_guard_id"),
            NumericField("created_at", sortable=True),
            TextField("description"),
            VectorField(
                "embedding",
                "HNSW",
                {
                    "TYPE": _VECTOR_TYPE,
                    "DIM": self._dim,
                    "DISTANCE_METRIC": _DISTANCE_METRIC,
                },
            ),
        )
        definition = IndexDefinition(
            prefix=[KEY_PREFIX], index_type=IndexType.HASH
        )
        try:
            self._client.ft(self._index_name).create_index(
                fields=schema, definition=definition
            )
        except ResponseError as exc:
            # Another worker may have created the index between our existence
            # check and this call; treat "Index already exists" as success.
            if "already exists" in str(exc).lower():
                return False
            raise
        return True

    # --- Writes ----------------------------------------------------------

    def _document_key(self, incident_id: str) -> str:
        """Return the Redis key for an incident document."""

        return f"{KEY_PREFIX}{incident_id}"

    def _serialise(self, document: dict[str, Any]) -> dict[str, Any]:
        """Serialise a document dict into a RediSearch HASH mapping.

        - The ``embedding`` list is packed to a FLOAT32 byte blob.
        - ``created_at`` is stored as an integer (unix seconds).
        - TAG/TEXT fields are stored as strings; ``None`` becomes an empty
          string so the field still exists for filtering.
        """

        mapping: dict[str, Any] = {}

        for tag in _TAG_FIELDS:
            if tag in document:
                value = document[tag]
                mapping[tag] = "" if value is None else str(value)

        if "created_at" in document and document["created_at"] is not None:
            mapping["created_at"] = int(document["created_at"])

        if "description" in document and document["description"] is not None:
            mapping["description"] = str(document["description"])

        embedding = document.get("embedding")
        if embedding is not None:
            if len(embedding) != self._dim:
                raise ValueError(
                    f"embedding has {len(embedding)} dimensions, "
                    f"expected {self._dim}"
                )
            mapping["embedding"] = encode_vector(list(embedding))

        return mapping

    def upsert(
        self,
        incident_id: str,
        document: dict[str, Any],
        *,
        doc_key: Optional[str] = None,
    ) -> str:
        """Insert or overwrite the document for ``incident_id``.

        Writing key ``incident:{id}`` replaces any prior document for the same
        incident, guaranteeing exactly one record per incident (Requirements
        1.5, 4.2). The document's ``incident_id`` field is set from the argument
        to keep the key and stored id consistent.

        ``doc_key`` lets a caller store a *separate* document (e.g. a
        CriticalAlert document keyed by ``alert:{id}``) under a distinct Redis
        key while preserving the real incident ID in the ``incident_id`` field
        so Citations still resolve (Req 4.3). When omitted, the key suffix is
        ``incident_id`` itself.

        Returns the Redis key that was written.
        """

        document = {**document, "incident_id": incident_id}
        mapping = self._serialise(document)
        key = self._document_key(doc_key if doc_key is not None else incident_id)

        # Replace the whole hash so removed fields (e.g. a cleared guard) do not
        # linger from a previous write. This keeps upserts overwrite-on-write.
        pipe = self._client.pipeline(transaction=True)
        pipe.delete(key)
        pipe.hset(key, mapping=mapping)
        pipe.execute()
        return key

    def get(self, incident_id: str) -> Optional[dict[str, str]]:
        """Return the stored metadata for an incident (excluding the vector).

        Returns ``None`` when no document exists for the incident.
        """

        key = self._document_key(incident_id)
        raw = self._client.hgetall(key)
        if not raw:
            return None
        result: dict[str, str] = {}
        for field_name, value in raw.items():
            name = _to_str(field_name)
            if name == "embedding":
                # Skip the raw byte blob in the metadata view.
                continue
            result[name] = _to_str(value)
        return result

    def delete(self, incident_id: str) -> bool:
        """Delete an incident document. Returns ``True`` if a key was removed."""

        key = self._document_key(incident_id)
        return bool(self._client.delete(key))

    # --- Reads (KNN search) ---------------------------------------------

    def knn_search(
        self,
        embedding: list[float],
        k: int,
        filters: Optional[dict[str, Any]] = None,
        return_fields: Optional[list[str]] = None,
    ) -> list[SearchHit]:
        """Run KNN search over the ``embedding`` field.

        Args:
            embedding: The query vector (must match ``EMBEDDING_DIM``).
            k: The maximum number of nearest neighbours to return (``LIMIT 0 K``).
            filters: Optional TAG pre-filters. Only ``zone_id``,
                ``assigned_guard_id`` and ``doc_type`` are honoured (the fields
                used for role scoping). A value may be a single string or a list
                of strings (matched as an OR set).
            return_fields: Optional list of metadata fields to return per hit.
                Defaults to all TAG fields plus ``created_at``.

        Returns:
            A list of ``SearchHit`` ordered by ascending vector distance, capped
            at ``k`` results.
        """

        if len(embedding) != self._dim:
            raise ValueError(
                f"query embedding has {len(embedding)} dimensions, "
                f"expected {self._dim}"
            )
        if k <= 0:
            return []

        prefilter = _build_filter_expression(filters)
        query_str = f"{prefilter}=>[KNN {k} @embedding $vec AS score]"

        if return_fields is None:
            return_fields = list(_TAG_FIELDS) + ["created_at"]
        # Always include the KNN score alias.
        result_fields = [*return_fields, "score"]

        query = (
            Query(query_str)
            .sort_by("score")
            .return_fields(*result_fields)
            .paging(0, k)
            .dialect(2)
        )
        params = {"vec": encode_vector(list(embedding))}

        raw = self._client.ft(self._index_name).search(query, query_params=params)
        return _parse_search_results(raw)


def _build_filter_expression(filters: Optional[dict[str, Any]]) -> str:
    """Build the RediSearch pre-filter portion of a KNN query.

    Only the role-scoping tag fields are honoured. With no filters this returns
    ``*`` (match everything) so the KNN runs over the full index.
    """

    if not filters:
        return "*"

    clauses: list[str] = []
    for field_name in _FILTERABLE_TAG_FIELDS:
        if field_name not in filters or filters[field_name] is None:
            continue
        value = filters[field_name]
        values = value if isinstance(value, (list, tuple, set)) else [value]
        escaped = [_tag_escape(str(v)) for v in values if v is not None and v != ""]
        if not escaped:
            continue
        clauses.append(f"@{field_name}:{{{'|'.join(escaped)}}}")

    if not clauses:
        return "*"
    return " ".join(clauses)


def _to_str(value: Any) -> str:
    """Decode a redis value (bytes or str) to a plain ``str``."""

    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return str(value)


def _parse_search_results(raw: Any) -> list[SearchHit]:
    """Convert a RediSearch ``search`` result object into ``SearchHit`` items."""

    hits: list[SearchHit] = []
    for doc in getattr(raw, "docs", []):
        fields: dict[str, str] = {}
        incident_id = ""
        score = 0.0
        for attr in vars(doc):
            if attr in ("id", "payload"):
                continue
            value = getattr(doc, attr)
            if attr == "score":
                try:
                    score = float(value)
                except (TypeError, ValueError):
                    score = 0.0
                continue
            str_value = _to_str(value)
            if attr == "incident_id":
                incident_id = str_value
            fields[attr] = str_value
        hits.append(SearchHit(incident_id=incident_id, score=score, fields=fields))
    return hits
