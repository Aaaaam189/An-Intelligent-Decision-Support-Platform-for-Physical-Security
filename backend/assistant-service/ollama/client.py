"""Ollama embedding and LLM client for the assistant-service.

Thin async wrapper over the local Ollama HTTP API. It exposes three
capabilities used by the rest of the service:

- :meth:`OllamaClient.embed` — turn text into a 768-dim embedding using the
  configured ``EMBEDDING_MODEL`` (Requirements 4.1, 12.2).
- :meth:`OllamaClient.generate` — generate an answer with the configured
  ``LLM_MODEL``.
- :meth:`OllamaClient.ensure_models` — a startup check that verifies the
  configured models exist in Ollama and logs a clear, model-named error when
  one is missing (Requirement 12.4).

Every request targets *only* ``OLLAMA_BASE_URL``; no other outbound AI host is
ever contacted, keeping all incident content on-premise (Requirement 12.3).

The client distinguishes *model-unavailable* failures (Ollama not reachable, or
the requested model is not installed) from every other error, so callers can
choose the right recovery policy — requeue the event when the model is
temporarily unavailable versus skip when the failure is not availability
related (Requirements 4.4, 4.5).
"""

from __future__ import annotations

import logging

import httpx

from config.settings import Settings, get_settings

logger = logging.getLogger(__name__)


class OllamaError(Exception):
    """Base class for all errors raised by the Ollama client."""


class ModelUnavailableError(OllamaError):
    """Raised when Ollama is unreachable or the requested model is missing.

    Callers treat this as *retryable*: the connection was refused / timed out,
    or the model is not installed. For the indexing pipeline this means the
    triggering event should be requeued rather than acked (Requirement 4.4).
    """


class EmbeddingDimensionError(OllamaError):
    """Raised when the embedding vector length does not match ``EMBEDDING_DIM``.

    This is a non-availability failure: Ollama responded, but the returned
    vector is the wrong size (e.g. a mismatched embedding model), so callers
    should not requeue indefinitely.
    """


class OllamaClient:
    """Async client for the local Ollama runtime.

    All calls are made against :pyattr:`base_url` (the configured
    ``OLLAMA_BASE_URL``) and no other host, so incident content never leaves the
    machine (Requirement 12.3).
    """

    def __init__(self, settings: Settings | None = None, client: httpx.AsyncClient | None = None) -> None:
        self._settings = settings or get_settings()
        self.base_url = self._settings.ollama_base_url.rstrip("/")
        self.embedding_model = self._settings.embedding_model
        self.llm_model = self._settings.llm_model
        self.embedding_dim = self._settings.embedding_dim
        # An injected client (used by tests/fakes) is not owned by this
        # instance, so it must not be closed by :meth:`aclose`.
        self._client = client
        self._owns_client = client is None

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------
    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(base_url=self.base_url, timeout=60.0)
            self._owns_client = True
        return self._client

    async def aclose(self) -> None:
        """Close the underlying HTTP client if this instance owns it."""

        if self._client is not None and self._owns_client:
            await self._client.aclose()
            self._client = None

    async def __aenter__(self) -> "OllamaClient":
        return self

    async def __aexit__(self, *exc_info: object) -> None:
        await self.aclose()

    # ------------------------------------------------------------------
    # Embeddings
    # ------------------------------------------------------------------
    async def embed(self, text: str) -> list[float]:
        """Return the embedding vector for ``text``.

        Uses the configured ``EMBEDDING_MODEL`` via ``POST /api/embeddings`` and
        asserts the returned vector length equals ``EMBEDDING_DIM`` (768 by
        default) so callers can rely on a fixed dimensionality (Requirements
        4.1, 12.2).

        Raises:
            ModelUnavailableError: Ollama is unreachable or the embedding model
                is not installed (retryable — requeue).
            EmbeddingDimensionError: The vector length does not match
                ``EMBEDDING_DIM``.
            OllamaError: Any other unexpected failure.
        """

        payload = {"model": self.embedding_model, "prompt": text}
        data = await self._post_json("/api/embeddings", payload, model=self.embedding_model)

        embedding = data.get("embedding")
        if not isinstance(embedding, list) or not embedding:
            raise OllamaError(
                f"Ollama returned no embedding for model '{self.embedding_model}'"
            )

        vector = [float(value) for value in embedding]
        if len(vector) != self.embedding_dim:
            raise EmbeddingDimensionError(
                f"embedding model '{self.embedding_model}' returned "
                f"{len(vector)} dimensions, expected {self.embedding_dim}"
            )
        return vector

    # ------------------------------------------------------------------
    # Generation
    # ------------------------------------------------------------------
    async def generate(self, system: str, prompt: str) -> str:
        """Generate a completion for ``prompt`` under the given ``system`` prompt.

        Uses the configured ``LLM_MODEL`` via ``POST /api/generate`` with
        streaming disabled and returns the response text.

        Raises:
            ModelUnavailableError: Ollama is unreachable or the LLM is not
                installed (retryable).
            OllamaError: Any other unexpected failure.
        """

        payload = {
            "model": self.llm_model,
            "system": system,
            "prompt": prompt,
            "stream": False,
        }
        data = await self._post_json("/api/generate", payload, model=self.llm_model)

        response = data.get("response")
        if not isinstance(response, str):
            raise OllamaError(
                f"Ollama returned no response text for model '{self.llm_model}'"
            )
        return response

    # ------------------------------------------------------------------
    # Startup model check
    # ------------------------------------------------------------------
    async def ensure_models(self) -> bool:
        """Verify the configured models exist in Ollama on startup.

        Calls ``GET /api/tags`` and checks that both the embedding model and the
        LLM are installed. If a model is missing, a clear error naming that
        model is logged and the method returns ``False`` (Requirement 12.4).

        Returns ``True`` when every configured model is available. If Ollama
        itself cannot be reached, logs an error and returns ``False`` (the
        service can still start and drain the queue via requeue once Ollama
        becomes available).
        """

        try:
            client = self._get_client()
            response = await client.get("/api/tags")
            response.raise_for_status()
            data = response.json()
        except (httpx.ConnectError, httpx.TimeoutException) as exc:
            logger.error(
                "Cannot reach Ollama at %s to verify models (%s: %s); "
                "embedding model '%s' and LLM '%s' could not be checked",
                self.base_url,
                type(exc).__name__,
                exc,
                self.embedding_model,
                self.llm_model,
            )
            return False
        except httpx.HTTPStatusError as exc:
            logger.error(
                "Ollama returned %s for GET /api/tags at %s; cannot verify models",
                exc.response.status_code,
                self.base_url,
            )
            return False

        installed = self._installed_model_names(data)

        all_present = True
        for label, model in (("embedding model", self.embedding_model), ("LLM", self.llm_model)):
            if not self._model_installed(model, installed):
                all_present = False
                logger.error(
                    "Configured %s '%s' is not available in Ollama at %s. "
                    "Install it with: ollama pull %s",
                    label,
                    model,
                    self.base_url,
                    model,
                )

        if all_present:
            logger.info(
                "Ollama models verified: embedding='%s', llm='%s'",
                self.embedding_model,
                self.llm_model,
            )
        return all_present

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    async def _post_json(self, path: str, payload: dict, *, model: str) -> dict:
        """POST ``payload`` as JSON to ``path`` and return the parsed response.

        Translates connection failures and model-not-found responses into
        :class:`ModelUnavailableError` so callers can distinguish retryable
        availability problems from other errors.
        """

        client = self._get_client()
        try:
            response = await client.post(path, json=payload)
            response.raise_for_status()
        except (httpx.ConnectError, httpx.TimeoutException) as exc:
            raise ModelUnavailableError(
                f"Ollama is unreachable at {self.base_url} "
                f"({type(exc).__name__}: {exc})"
            ) from exc
        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code
            body = self._safe_body(exc.response)
            if status == 404 or "not found" in body.lower():
                raise ModelUnavailableError(
                    f"model '{model}' is not available in Ollama at "
                    f"{self.base_url} (HTTP {status})"
                ) from exc
            raise OllamaError(
                f"Ollama request to {path} failed with HTTP {status}: {body}"
            ) from exc

        try:
            return response.json()
        except ValueError as exc:  # invalid / non-JSON body
            raise OllamaError(
                f"Ollama returned a non-JSON response from {path}"
            ) from exc

    @staticmethod
    def _safe_body(response: httpx.Response) -> str:
        try:
            return response.text
        except Exception:  # pragma: no cover - defensive
            return ""

    @staticmethod
    def _installed_model_names(data: object) -> set[str]:
        """Extract the set of installed model names from a ``/api/tags`` body."""

        names: set[str] = set()
        if isinstance(data, dict):
            for entry in data.get("models", []) or []:
                if isinstance(entry, dict):
                    name = entry.get("name") or entry.get("model")
                    if isinstance(name, str):
                        names.add(name)
        return names

    @staticmethod
    def _model_installed(model: str, installed: set[str]) -> bool:
        """Return whether ``model`` matches an installed model name.

        Ollama tags are ``name:tag``; a configured name without an explicit tag
        (e.g. ``nomic-embed-text``) is treated as matching its ``:latest`` tag.
        """

        if model in installed:
            return True
        # A configured name without an explicit tag matches any installed tag of
        # the same base name (e.g. 'nomic-embed-text' matches
        # 'nomic-embed-text:latest').
        if ":" not in model:
            if f"{model}:latest" in installed:
                return True
            return any(name.split(":", 1)[0] == model for name in installed)
        return False
