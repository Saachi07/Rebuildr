"""
Semantic similarity layer for the recommender.

Wraps sentence-transformers. Embeds every resource body once at startup
(or loads from a cached .npy if present), then provides cosine
similarity vs a paragraph describing the user's situation.

The dependency is *optional*. If sentence-transformers isn't installed
(or the model can't be loaded), the embedder falls back to a no-op and
the semantic term simply contributes zero to the score. The rest of
the recommender continues to work.

Usage:
    from embeddings import ResourceEmbedder
    embedder = ResourceEmbedder(resources, cache_path="resource_embeddings.npy")
    sims = embedder.similarities("displaced renter, no insurance, kids")
    # sims[i] is the cosine similarity for resources[i]
"""

import os
from typing import Optional

import numpy as np


DEFAULT_MODEL = "sentence-transformers/all-MiniLM-L6-v2"


class ResourceEmbedder:
    """
    Lazily loads the sentence-transformer model. If anything goes wrong
    (missing dep, no internet to download model, etc.) the embedder
    enters disabled mode and returns zeros — the recommender keeps
    functioning, just without the semantic signal.
    """

    def __init__(
        self,
        resources: list[dict],
        model_name: str = DEFAULT_MODEL,
        cache_path: Optional[str] = None,
    ):
        self.resources = resources
        self.model_name = model_name
        self.cache_path = cache_path
        self.model = None
        self.embeddings: Optional[np.ndarray] = None
        self.disabled = False
        self._load()

    # ---- public ----------------------------------------------------------

    def similarities(self, query_text: str) -> np.ndarray:
        """
        Return a vector of cosine similarities, one per resource, in
        the same order as `self.resources`. If the embedder is disabled,
        returns zeros.
        """
        if self.disabled or not query_text or self.embeddings is None:
            return np.zeros(len(self.resources), dtype=np.float32)
        q = self._encode([query_text])[0]
        # Resource embeddings are already L2-normalised (see _load).
        q = q / (np.linalg.norm(q) + 1e-12)
        return self.embeddings @ q

    # ---- internals -------------------------------------------------------

    def _load(self) -> None:
        # Try to use cached embeddings even if the model can't be loaded —
        # that lets demos work offline as long as the cache exists.
        if self.cache_path and os.path.exists(self.cache_path):
            try:
                cached = np.load(self.cache_path)
                if cached.shape[0] == len(self.resources):
                    self.embeddings = cached
            except Exception:
                pass

        try:
            from sentence_transformers import SentenceTransformer
            self.model = SentenceTransformer(self.model_name)
        except Exception as e:
            # Soft-disable. The recommender will see zeros and continue.
            self.disabled = True
            if self.embeddings is None:
                # No cached embeddings either — fully disabled.
                return
            # We have a cache; we just can't encode new queries.
            print(f"[embeddings] model load failed ({e}); using cached resource "
                  "embeddings but cannot embed new queries. Semantic signal off.")
            return

        if self.embeddings is None:
            texts = [self._resource_text(r) for r in self.resources]
            embs = self._encode(texts)
            # Normalise once so cosine = dot product.
            norms = np.linalg.norm(embs, axis=1, keepdims=True) + 1e-12
            self.embeddings = (embs / norms).astype(np.float32)
            if self.cache_path:
                try:
                    np.save(self.cache_path, self.embeddings)
                except Exception:
                    pass

    def _encode(self, texts: list[str]) -> np.ndarray:
        if self.model is None:
            raise RuntimeError("Embedder model not loaded")
        return np.asarray(
            self.model.encode(texts, show_progress_bar=False),
            dtype=np.float32,
        )

    @staticmethod
    def _resource_text(r: dict) -> str:
        # Concatenate the user-facing fields so the embedding captures
        # what the resource actually is, not metadata.
        return f"{r['title']}. {r['body']}"


def user_situation_text(intake_answers: dict, user_context: dict) -> str:
    """
    Render the user's situation as a short paragraph for semantic matching.

    This is the bridge between numeric intake answers and the
    natural-language resource bodies. Keep it short and concrete — the
    embedder is doing soft matching, not parsing.
    """
    parts: list[str] = []

    disaster = user_context.get("disaster_type")
    region = user_context.get("region")
    if disaster and region:
        parts.append(f"{disaster} in {region}")
    elif disaster:
        parts.append(f"affected by {disaster}")

    housing_phrases = {
        0: "at home, livable",
        1: "homeowner, displaced",
        2: "renter, unit livable",
        3: "renter, displaced",
        4: "on-reserve or Métis settlement",
        5: "no shelter, urgent need",
    }
    h = intake_answers.get("housing")
    if h in housing_phrases:
        parts.append(housing_phrases[h])

    ins_phrases = {0: "has insurance", 1: "no insurance", 2: "insurance unknown"}
    if intake_answers.get("insurance") in ins_phrases:
        parts.append(ins_phrases[intake_answers["insurance"]])

    income_phrases = {
        0: "still working",
        1: "temporarily unable to work",
        2: "lost job or business",
        3: "already on assistance",
    }
    if intake_answers.get("income_affected") in income_phrases:
        parts.append(income_phrases[intake_answers["income_affected"]])

    household_bits = []
    if intake_answers.get("has_kids"): household_bits.append("children")
    if intake_answers.get("has_seniors"): household_bits.append("seniors")
    if intake_answers.get("has_disability"): household_bits.append("disability")
    if intake_answers.get("has_pets"): household_bits.append("pets")
    if household_bits:
        parts.append("household includes " + ", ".join(household_bits))

    if intake_answers.get("has_id") == 0:
        parts.append("missing ID")

    ic = user_context.get("insurance_company")
    if ic:
        parts.append(f"insurer {ic}")

    return ". ".join(parts) if parts else ""
