"""
Data preparation for Australian Hansard experiments.
Replaces the default prepare.py for parliamentary speech data.

Source: SQLite database at ~/.cache/autoresearch/parli.db (422K+ speeches)

Usage:
    python prepare_hansard.py                  # full prep
    python prepare_hansard.py --skip-shards    # tokenizer only (if shards exist)

Data, tokenizer, and shards are stored in ~/.cache/autoresearch/hansard/.
"""

import os
import sys
import re
import time
import math
import glob
import random
import hashlib
import pickle
import sqlite3
import argparse

import numpy as np
import rustbpe
import tiktoken
import torch

# ---------------------------------------------------------------------------
# Constants (fixed, do not modify — must match prepare.py interface)
# ---------------------------------------------------------------------------

MAX_SEQ_LEN = 2048       # context length
TIME_BUDGET = 300        # training time budget in seconds (5 minutes)
EVAL_TOKENS = 40 * 524288  # number of tokens for val eval
VOCAB_SIZE = 8192

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

CACHE_DIR = os.path.join(os.path.expanduser("~"), ".cache", "autoresearch", "hansard")
SHARD_DIR = os.path.join(CACHE_DIR, "shards")
TOKENIZER_DIR = os.path.join(CACHE_DIR, "tokenizer")

SQLITE_DB = os.path.join(os.path.expanduser("~"), ".cache", "autoresearch", "parli.db")

SHARD_SIZE_BYTES = 50 * 1024 * 1024  # ~50MB per shard
SHARD_SIZE_TOKENS = SHARD_SIZE_BYTES // 2  # uint16 = 2 bytes per token

# BPE split pattern (GPT-4 style, with \p{N}{1,2} instead of {1,3})
SPLIT_PATTERN = r"""'(?i:[sdmt]|ll|ve|re)|[^\r\n\p{L}\p{N}]?+\p{L}+|\p{N}{1,2}| ?[^\s\p{L}\p{N}]++[\r\n]*|\s*[\r\n]|\s+(?!\S)|\s+"""

SPECIAL_TOKENS = [f"<|reserved_{i}|>" for i in range(4)]
BOS_TOKEN = "<|reserved_0|>"

# ---------------------------------------------------------------------------
# HTML stripping and text cleaning
# ---------------------------------------------------------------------------

_HTML_TAG_RE = re.compile(r"<[^>]+>")
_MULTI_SPACE_RE = re.compile(r"[ \t]+")
_MULTI_NEWLINE_RE = re.compile(r"\n{3,}")

PROCEDURAL_PATTERNS = [
    re.compile(r"^The (SPEAKER|PRESIDENT|CHAIRMAN|DEPUTY SPEAKER|CLERK) took the chair", re.IGNORECASE),
    re.compile(r"^Question agreed to\.?\s*$", re.IGNORECASE),
    re.compile(r"^Question negatived\.?\s*$", re.IGNORECASE),
    re.compile(r"^Question put\.?\s*$", re.IGNORECASE),
    re.compile(r"^Ordered that the bill", re.IGNORECASE),
    re.compile(r"^Bill read a (first|second|third) time\.?\s*$", re.IGNORECASE),
    re.compile(r"^The House divided\.?\s*$", re.IGNORECASE),
    re.compile(r"^Ayes,?\s+\d+", re.IGNORECASE),
    re.compile(r"^Noes,?\s+\d+", re.IGNORECASE),
    re.compile(r"^Motion[—\-]by leave[—\-]agreed to\.?\s*$", re.IGNORECASE),
    re.compile(r"^Senate adjourned at", re.IGNORECASE),
    re.compile(r"^House adjourned at", re.IGNORECASE),
]


def strip_html(text):
    """Remove HTML tags from text."""
    text = _HTML_TAG_RE.sub("", text)
    text = _MULTI_SPACE_RE.sub(" ", text)
    text = _MULTI_NEWLINE_RE.sub("\n\n", text)
    return text.strip()


def is_procedural(text):
    """Check if the text is procedural boilerplate."""
    first_line = text.split("\n")[0].strip()
    return any(pat.match(first_line) for pat in PROCEDURAL_PATTERNS)


def clean_text(text):
    """Strip HTML, return None if too short or procedural."""
    text = strip_html(text)
    if len(text) < 50:
        return None
    if is_procedural(text):
        return None
    return text


# ---------------------------------------------------------------------------
# Data loading from SQLite
# ---------------------------------------------------------------------------

def format_document(speaker, party, text):
    """Format a single document for training."""
    return f"<speaker>{speaker} ({party})</speaker>\n{text}\n\n"


def load_sqlite_docs():
    """Load all speeches from the SQLite database."""
    if not os.path.exists(SQLITE_DB):
        print(f"  ERROR: SQLite database not found at {SQLITE_DB}")
        sys.exit(1)

    print(f"  Loading speeches from {SQLITE_DB}...")
    conn = sqlite3.connect(SQLITE_DB)
    cur = conn.cursor()
    cur.execute("SELECT speaker_name, party, text FROM speeches")

    docs = []
    skipped = 0
    for speaker_name, party, text in cur:
        if text is None:
            skipped += 1
            continue
        cleaned = clean_text(text)
        if cleaned is None:
            skipped += 1
            continue

        speaker = speaker_name or "Unknown"
        party = party or "Unknown"
        docs.append(format_document(speaker, party, cleaned))

    conn.close()
    print(f"  Loaded {len(docs):,} documents from SQLite ({skipped:,} skipped).")
    return docs


def deduplicate_docs(docs):
    """Deduplicate by text content hash."""
    print(f"  Deduplicating {len(docs):,} documents...")
    seen = set()
    unique = []
    for doc in docs:
        h = hashlib.md5(doc.encode("utf-8")).digest()
        if h not in seen:
            seen.add(h)
            unique.append(doc)
    print(f"  After deduplication: {len(unique):,} documents ({len(docs) - len(unique):,} removed).")
    return unique


# ---------------------------------------------------------------------------
# Tokenizer training
# ---------------------------------------------------------------------------

def text_iterator_from_docs(docs, max_chars=1_000_000_000, doc_cap=10_000):
    """Yield documents for tokenizer training."""
    nchars = 0
    for doc in docs:
        d = doc[:doc_cap] if len(doc) > doc_cap else doc
        nchars += len(d)
        yield d
        if nchars >= max_chars:
            return


def train_tokenizer(train_docs):
    """Train BPE tokenizer using rustbpe, save as tiktoken pickle."""
    tokenizer_pkl = os.path.join(TOKENIZER_DIR, "tokenizer.pkl")
    token_bytes_path = os.path.join(TOKENIZER_DIR, "token_bytes.pt")

    if os.path.exists(tokenizer_pkl) and os.path.exists(token_bytes_path):
        print(f"Tokenizer: already trained at {TOKENIZER_DIR}")
        return

    os.makedirs(TOKENIZER_DIR, exist_ok=True)

    if len(train_docs) < 100:
        print("Tokenizer: need at least 100 training documents. Load more data first.")
        sys.exit(1)

    # --- Train with rustbpe ---
    print("Tokenizer: training BPE tokenizer...")
    t0 = time.time()

    tokenizer = rustbpe.Tokenizer()
    vocab_size_no_special = VOCAB_SIZE - len(SPECIAL_TOKENS)
    tokenizer.train_from_iterator(
        text_iterator_from_docs(train_docs), vocab_size_no_special, pattern=SPLIT_PATTERN
    )

    # Build tiktoken encoding from trained merges
    pattern = tokenizer.get_pattern()
    mergeable_ranks = {bytes(k): v for k, v in tokenizer.get_mergeable_ranks()}
    tokens_offset = len(mergeable_ranks)
    special_tokens = {name: tokens_offset + i for i, name in enumerate(SPECIAL_TOKENS)}
    enc = tiktoken.Encoding(
        name="rustbpe_hansard",
        pat_str=pattern,
        mergeable_ranks=mergeable_ranks,
        special_tokens=special_tokens,
    )

    # Save tokenizer
    with open(tokenizer_pkl, "wb") as f:
        pickle.dump(enc, f)

    t1 = time.time()
    print(f"Tokenizer: trained in {t1 - t0:.1f}s, saved to {tokenizer_pkl}")

    # --- Build token_bytes lookup for BPB evaluation ---
    print("Tokenizer: building token_bytes lookup...")
    special_set = set(SPECIAL_TOKENS)
    token_bytes_list = []
    for token_id in range(enc.n_vocab):
        token_str = enc.decode([token_id])
        if token_str in special_set:
            token_bytes_list.append(0)
        else:
            token_bytes_list.append(len(token_str.encode("utf-8")))
    token_bytes_tensor = torch.tensor(token_bytes_list, dtype=torch.int32)
    torch.save(token_bytes_tensor, token_bytes_path)
    print(f"Tokenizer: saved token_bytes to {token_bytes_path}")

    # Sanity check
    test = "Hello world! Numbers: 123. Unicode: The honourable member for Sydney"
    encoded = enc.encode_ordinary(test)
    decoded = enc.decode(encoded)
    assert decoded == test, f"Tokenizer roundtrip failed: {test!r} -> {decoded!r}"
    print(f"Tokenizer: sanity check passed (vocab_size={enc.n_vocab})")


# ---------------------------------------------------------------------------
# Shard creation
# ---------------------------------------------------------------------------

def create_shards(all_docs, enc):
    """Tokenize documents and save as binary shards (uint16 numpy arrays)."""
    os.makedirs(SHARD_DIR, exist_ok=True)

    # Check if shards already exist
    existing = sorted(glob.glob(os.path.join(SHARD_DIR, "*.bin")))
    if existing:
        print(f"Shards: {len(existing)} shards already exist at {SHARD_DIR}")
        return

    print("Shards: tokenizing and writing...")
    t0 = time.time()

    bos_id = enc.encode_single_token(BOS_TOKEN)

    shard_idx = 0
    current_tokens = []
    val_tokens = []

    # Split: last 1% for validation
    split_point = int(len(all_docs) * 0.99)
    train_docs = all_docs[:split_point]
    val_docs = all_docs[split_point:]

    print(f"  Train docs: {len(train_docs):,}, Val docs: {len(val_docs):,}")

    # Tokenize and shard training data
    for i, doc in enumerate(train_docs):
        token_ids = [bos_id] + enc.encode_ordinary(doc)
        current_tokens.extend(token_ids)

        # Write shard when large enough
        while len(current_tokens) >= SHARD_SIZE_TOKENS:
            shard_data = np.array(current_tokens[:SHARD_SIZE_TOKENS], dtype=np.uint16)
            shard_path = os.path.join(SHARD_DIR, f"train_{shard_idx:05d}.bin")
            shard_data.tofile(shard_path)
            shard_idx += 1
            current_tokens = current_tokens[SHARD_SIZE_TOKENS:]

        if (i + 1) % 100000 == 0:
            print(f"  Tokenized {i + 1:,}/{len(train_docs):,} train docs, {shard_idx} shards written")

    # Write remaining training tokens as final shard
    if current_tokens:
        shard_data = np.array(current_tokens, dtype=np.uint16)
        shard_path = os.path.join(SHARD_DIR, f"train_{shard_idx:05d}.bin")
        shard_data.tofile(shard_path)
        shard_idx += 1

    print(f"  Wrote {shard_idx} train shards")

    # Tokenize and write validation data
    for doc in val_docs:
        token_ids = [bos_id] + enc.encode_ordinary(doc)
        val_tokens.extend(token_ids)

    if val_tokens:
        val_data = np.array(val_tokens, dtype=np.uint16)
        val_path = os.path.join(SHARD_DIR, "val_00000.bin")
        val_data.tofile(val_path)
        print(f"  Wrote val shard: {len(val_tokens):,} tokens ({len(val_data) * 2 / 1024 / 1024:.1f}MB)")

    t1 = time.time()
    print(f"Shards: done in {t1 - t0:.1f}s, saved to {SHARD_DIR}")


# ---------------------------------------------------------------------------
# Runtime utilities (imported by train.py)
# ---------------------------------------------------------------------------

class Tokenizer:
    """Minimal tokenizer wrapper. Training is handled above."""

    def __init__(self, enc):
        self.enc = enc
        self.bos_token_id = enc.encode_single_token(BOS_TOKEN)

    @classmethod
    def from_directory(cls, tokenizer_dir=TOKENIZER_DIR):
        with open(os.path.join(tokenizer_dir, "tokenizer.pkl"), "rb") as f:
            enc = pickle.load(f)
        return cls(enc)

    def get_vocab_size(self):
        return self.enc.n_vocab

    def get_bos_token_id(self):
        return self.bos_token_id

    def encode(self, text, prepend=None, num_threads=8):
        if prepend is not None:
            prepend_id = prepend if isinstance(prepend, int) else self.enc.encode_single_token(prepend)
        if isinstance(text, str):
            ids = self.enc.encode_ordinary(text)
            if prepend is not None:
                ids.insert(0, prepend_id)
        elif isinstance(text, list):
            ids = self.enc.encode_ordinary_batch(text, num_threads=num_threads)
            if prepend is not None:
                for row in ids:
                    row.insert(0, prepend_id)
        else:
            raise ValueError(f"Invalid input type: {type(text)}")
        return ids

    def decode(self, ids):
        return self.enc.decode(ids)


def get_token_bytes(device="cpu"):
    path = os.path.join(TOKENIZER_DIR, "token_bytes.pt")
    with open(path, "rb") as f:
        return torch.load(f, map_location=device)


def _list_shard_files(split):
    """Return sorted list of binary shard file paths for the given split."""
    prefix = "train_" if split == "train" else "val_"
    files = sorted(
        f for f in os.listdir(SHARD_DIR)
        if f.startswith(prefix) and f.endswith(".bin")
    )
    assert len(files) > 0, f"No {split} shard files found in {SHARD_DIR}. Run prepare_hansard.py first."
    return [os.path.join(SHARD_DIR, f) for f in files]


def make_dataloader(tokenizer, B, T, split, buffer_size=1000):
    """
    BOS-aligned dataloader with best-fit packing.
    Every row starts with BOS. Documents packed using best-fit to minimize cropping.
    When no document fits remaining space, crops shortest doc to fill exactly.
    100% utilization (no padding).

    This version reads from pre-tokenized binary shards for efficiency.
    """
    assert split in ["train", "val"]
    row_capacity = T + 1
    bos_token = tokenizer.get_bos_token_id()

    # Load all shard tokens into a single stream, split into documents by BOS
    shard_paths = _list_shard_files(split)

    def _load_docs_from_shards():
        """Load token sequences from shards, splitting on BOS token."""
        all_tokens = []
        for filepath in shard_paths:
            shard_tokens = np.fromfile(filepath, dtype=np.uint16)
            all_tokens.append(shard_tokens)
        full_stream = np.concatenate(all_tokens)

        # Find BOS positions to split into documents
        bos_positions = np.where(full_stream == bos_token)[0]
        docs = []
        for i in range(len(bos_positions)):
            start = bos_positions[i]
            end = bos_positions[i + 1] if i + 1 < len(bos_positions) else len(full_stream)
            if end - start > 1:  # skip empty docs
                docs.append(full_stream[start:end].tolist())
        return docs

    all_docs = _load_docs_from_shards()
    doc_buffer = list(all_docs)  # mutable copy
    epoch = 1

    def refill_buffer():
        nonlocal epoch
        epoch += 1
        doc_buffer.extend(all_docs)

    # Pre-allocate buffers: [inputs (B*T) | targets (B*T)]
    row_buffer = torch.empty((B, row_capacity), dtype=torch.long)
    cpu_buffer = torch.empty(2 * B * T, dtype=torch.long, pin_memory=True)
    gpu_buffer = torch.empty(2 * B * T, dtype=torch.long, device="cuda")
    cpu_inputs = cpu_buffer[:B * T].view(B, T)
    cpu_targets = cpu_buffer[B * T:].view(B, T)
    inputs = gpu_buffer[:B * T].view(B, T)
    targets = gpu_buffer[B * T:].view(B, T)

    while True:
        for row_idx in range(B):
            pos = 0
            while pos < row_capacity:
                while len(doc_buffer) < buffer_size:
                    refill_buffer()

                remaining = row_capacity - pos

                # Find largest doc that fits entirely
                best_idx = -1
                best_len = 0
                for i, doc in enumerate(doc_buffer):
                    doc_len = len(doc)
                    if doc_len <= remaining and doc_len > best_len:
                        best_idx = i
                        best_len = doc_len

                if best_idx >= 0:
                    doc = doc_buffer.pop(best_idx)
                    row_buffer[row_idx, pos:pos + len(doc)] = torch.tensor(doc, dtype=torch.long)
                    pos += len(doc)
                else:
                    # No doc fits — crop shortest to fill remaining
                    shortest_idx = min(range(len(doc_buffer)), key=lambda i: len(doc_buffer[i]))
                    doc = doc_buffer.pop(shortest_idx)
                    row_buffer[row_idx, pos:pos + remaining] = torch.tensor(doc[:remaining], dtype=torch.long)
                    pos += remaining

        cpu_inputs.copy_(row_buffer[:, :-1])
        cpu_targets.copy_(row_buffer[:, 1:])
        gpu_buffer.copy_(cpu_buffer, non_blocking=True)
        yield inputs, targets, epoch


# ---------------------------------------------------------------------------
# Evaluation (DO NOT CHANGE — this is the fixed metric)
# ---------------------------------------------------------------------------

@torch.no_grad()
def evaluate_bpb(model, tokenizer, batch_size):
    """
    Bits per byte (BPB): vocab size-independent evaluation metric.
    Sums per-token cross-entropy (in nats), sums target byte lengths,
    then converts nats/byte to bits/byte. Special tokens (byte length 0)
    are excluded from both sums.
    Uses fixed MAX_SEQ_LEN so results are comparable across configs.
    """
    token_bytes = get_token_bytes(device="cuda")
    val_loader = make_dataloader(tokenizer, batch_size, MAX_SEQ_LEN, "val")
    steps = EVAL_TOKENS // (batch_size * MAX_SEQ_LEN)
    total_nats = 0.0
    total_bytes = 0
    for _ in range(steps):
        x, y, _ = next(val_loader)
        loss_flat = model(x, y, reduction='none').view(-1)
        y_flat = y.view(-1)
        nbytes = token_bytes[y_flat]
        mask = nbytes > 0
        total_nats += (loss_flat * mask).sum().item()
        total_bytes += nbytes.sum().item()
    return total_nats / (math.log(2) * total_bytes)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Prepare Hansard data and tokenizer for autoresearch")
    parser.add_argument("--skip-shards", action="store_true", help="Skip shard creation (if shards already exist)")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for shuffling")
    args = parser.parse_args()

    print(f"Hansard cache directory: {CACHE_DIR}")
    print()

    # Step 1: Load data from SQLite
    print("Step 1: Loading data from SQLite...")
    all_docs = load_sqlite_docs()

    if len(all_docs) == 0:
        print("ERROR: No documents loaded from SQLite database.")
        print(f"  Database: {SQLITE_DB}")
        sys.exit(1)

    print(f"Total documents before dedup: {len(all_docs):,}")
    print()

    # Step 2: Deduplicate
    print("Step 2: Deduplicating...")
    all_docs = deduplicate_docs(all_docs)
    print()

    # Step 3: Shuffle and split
    print("Step 3: Shuffling...")
    random.seed(args.seed)
    random.shuffle(all_docs)
    print(f"Total documents after shuffle: {len(all_docs):,}")
    print()

    # Step 4: Train tokenizer (on first 99% = train split)
    split_point = int(len(all_docs) * 0.99)
    train_docs = all_docs[:split_point]
    print(f"Step 4: Training tokenizer on {len(train_docs):,} train documents...")
    train_tokenizer(train_docs)
    print()

    # Step 5: Create shards
    if not args.skip_shards:
        print("Step 5: Creating data shards...")
        tokenizer_pkl = os.path.join(TOKENIZER_DIR, "tokenizer.pkl")
        with open(tokenizer_pkl, "rb") as f:
            enc = pickle.load(f)
        create_shards(all_docs, enc)
    else:
        print("Step 5: Skipping shard creation (--skip-shards)")
    print()

    print("Done! Ready to train.")
    print(f"  Tokenizer: {TOKENIZER_DIR}")
    print(f"  Shards:    {SHARD_DIR}")
