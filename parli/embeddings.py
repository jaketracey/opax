"""
parli.embeddings — Embedding pipeline for semantic search over Hansard speeches.

Uses sentence-transformers to embed speeches into dense vectors.
Embeddings are stored as numpy memory-mapped files for fast access
without loading everything into RAM.

Model: all-MiniLM-L6-v2 (384-dim, ~80MB, fast on GPU)

Storage layout:
    ~/.cache/autoresearch/hansard/embeddings/
        speeches.npy          # (N, 384) float32, mmap-able
        speeches_ids.npy      # (N,) int64, speech_id for each row

Usage:
    python -m parli.embeddings                # embed all speeches
    python -m parli.embeddings --limit 1000   # embed first 1000 only
    python -m parli.embeddings --rebuild      # rebuild from scratch
"""

from pathlib import Path

import numpy as np

from parli.schema import get_db

EMBED_DIR = Path("~/.cache/autoresearch/hansard/embeddings").expanduser()
SPEECHES_NPY = EMBED_DIR / "speeches.npy"
SPEECHES_IDS = EMBED_DIR / "speeches_ids.npy"
MODEL_NAME = "all-MiniLM-L6-v2"
EMBED_DIM = 384
BATCH_SIZE = 256
TEXT_TRUNCATE = 512  # chars — captures key content without exceeding model context


_model = None


def get_model():
    """Load the sentence-transformer model (cached after first call)."""
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        _model = SentenceTransformer(MODEL_NAME)
    return _model


def embed_texts(texts: list[str]) -> np.ndarray:
    """Embed a list of texts. Returns (len(texts), 384) float32, L2-normalized."""
    model = get_model()
    embeddings = model.encode(
        texts,
        batch_size=BATCH_SIZE,
        show_progress_bar=False,
        normalize_embeddings=True,
        convert_to_numpy=True,
    )
    return embeddings.astype(np.float32)


def build_embeddings(rebuild: bool = False, limit: int | None = None):
    """Embed all speeches and save to disk.

    Args:
        rebuild: If True, discard existing embeddings and start fresh.
        limit: If set, only embed the first N speeches (for testing).
    """
    EMBED_DIR.mkdir(parents=True, exist_ok=True)

    # Determine where to resume from
    if SPEECHES_NPY.exists() and not rebuild:
        existing_ids = np.load(str(SPEECHES_IDS))
        print(f"Found existing embeddings for {len(existing_ids):,} speeches")
        start_after = int(existing_ids[-1]) if len(existing_ids) > 0 else 0
    else:
        existing_ids = np.array([], dtype=np.int64)
        start_after = 0

    db = get_db()

    # Fetch speeches that need embedding
    if limit is not None:
        remaining = limit - len(existing_ids)
        if remaining <= 0:
            print("Already have enough embeddings for the requested limit.")
            return
        rows = db.execute("""
            SELECT speech_id, text FROM speeches
            WHERE speech_id > ?
            ORDER BY speech_id
            LIMIT ?
        """, (start_after, remaining)).fetchall()
    else:
        rows = db.execute("""
            SELECT speech_id, text FROM speeches
            WHERE speech_id > ?
            ORDER BY speech_id
        """, (start_after,)).fetchall()

    if not rows:
        print("All speeches already embedded.")
        return

    print(f"Embedding {len(rows):,} new speeches...")

    all_ids = list(existing_ids)
    all_embeddings = []

    # Load existing embeddings if appending
    if SPEECHES_NPY.exists() and not rebuild and len(existing_ids) > 0:
        all_embeddings.append(np.load(str(SPEECHES_NPY)))

    # Process in batches
    total = len(rows)
    for i in range(0, total, BATCH_SIZE):
        batch = rows[i:i + BATCH_SIZE]
        texts = [row["text"][:TEXT_TRUNCATE] for row in batch]
        ids = [row["speech_id"] for row in batch]

        embs = embed_texts(texts)
        all_embeddings.append(embs)
        all_ids.extend(ids)

        done = min(i + BATCH_SIZE, total)
        pct = done / total * 100
        print(f"  [{pct:5.1f}%] {done:,}/{total:,} speeches embedded", flush=True)

    # Save
    final_embeddings = np.concatenate(all_embeddings, axis=0)
    final_ids = np.array(all_ids, dtype=np.int64)

    np.save(str(SPEECHES_NPY), final_embeddings)
    np.save(str(SPEECHES_IDS), final_ids)
    print(f"Saved {len(final_ids):,} embeddings to {EMBED_DIR}")


def load_embeddings() -> tuple[np.ndarray, np.ndarray]:
    """Load embeddings as memory-mapped arrays. Returns (embeddings, ids)."""
    if not SPEECHES_NPY.exists():
        raise FileNotFoundError(
            f"No embeddings found at {SPEECHES_NPY}. "
            "Run `python -m parli.embeddings` first."
        )
    embeddings = np.load(str(SPEECHES_NPY), mmap_mode="r")
    ids = np.load(str(SPEECHES_IDS))
    return embeddings, ids


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Embed Hansard speeches for semantic search")
    parser.add_argument("--rebuild", action="store_true", help="Rebuild all embeddings from scratch")
    parser.add_argument("--limit", type=int, default=None, help="Only embed first N speeches (for testing)")
    args = parser.parse_args()

    build_embeddings(rebuild=args.rebuild, limit=args.limit)


if __name__ == "__main__":
    main()
