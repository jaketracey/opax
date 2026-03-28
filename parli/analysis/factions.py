"""
parli.analysis.factions — Factional Analysis via Voting Clusters

Detect factional groupings within parties by clustering MPs based on:
  1. Voting similarity (who votes together on contentious divisions)
  2. Speech topic overlap (who talks about similar things)
  3. Cross-party alliances (unexpected voting agreements)

Method:
  - Build an MP-by-division vote matrix (rows=MPs, cols=divisions, values=aye/no/absent)
  - Filter to "interesting" divisions (not unanimous — these reveal factional lines)
  - Compute pairwise agreement rates between MPs within same party
  - Apply hierarchical clustering / UMAP for visualization
  - Label clusters by their distinctive speech topics

This is the analysis most likely to generate press coverage.
"Our model identifies 3 distinct factions within the Liberal Party..."

Usage:
    python -m parli.analysis.factions
    python -m parli.analysis.factions --party Labor
    python -m parli.analysis.factions --visualize
"""

import json
from collections import defaultdict

import numpy as np

from parli.schema import get_db, init_db


def build_vote_matrix(db, party: str | None = None, min_votes: int = 10):
    """Build MP-by-division vote matrix.

    Returns:
        matrix: np.ndarray (n_members, n_divisions) with values:
                1=aye, -1=no, 0=absent/abstain
        member_ids: list of member_ids (row index)
        division_ids: list of division_ids (col index)
    """
    # Get "interesting" divisions (not unanimous)
    where_clause = ""
    params = []
    if party:
        where_clause = """
            AND d.division_id IN (
                SELECT v2.division_id FROM votes v2
                JOIN members m2 ON v2.member_id = m2.member_id
                WHERE m2.party = ?
            )
        """
        params = [party]

    divisions = db.execute(f"""
        SELECT d.division_id, d.ayes_count, d.noes_count
        FROM divisions d
        WHERE d.ayes_count > 0 AND d.noes_count > 0
        {where_clause}
        ORDER BY d.date
    """, params).fetchall()

    # Filter out near-unanimous votes (< 10% dissent)
    contentious = []
    for d in divisions:
        total = (d["ayes_count"] or 0) + (d["noes_count"] or 0)
        if total == 0:
            continue
        minority = min(d["ayes_count"] or 0, d["noes_count"] or 0)
        if minority / total >= 0.05:  # at least 5% dissent
            contentious.append(d["division_id"])

    if not contentious:
        print("No contentious divisions found.")
        return None, [], []

    division_ids = contentious
    div_to_col = {d: i for i, d in enumerate(division_ids)}

    # Get members who voted in these divisions
    member_clause = ""
    member_params = []
    if party:
        member_clause = "AND m.party = ?"
        member_params = [party]

    members = db.execute(f"""
        SELECT DISTINCT m.member_id, m.name, m.party
        FROM members m
        JOIN votes v ON m.member_id = v.member_id
        WHERE v.division_id IN ({','.join('?' * len(division_ids))})
        {member_clause}
        GROUP BY m.member_id
        HAVING COUNT(*) >= ?
    """, division_ids + member_params + [min_votes]).fetchall()

    member_ids = [m["member_id"] for m in members]
    mem_to_row = {m: i for i, m in enumerate(member_ids)}

    # Build matrix
    matrix = np.zeros((len(member_ids), len(division_ids)), dtype=np.float32)

    votes = db.execute("""
        SELECT member_id, division_id, vote FROM votes
        WHERE division_id IN ({}) AND member_id IN ({})
    """.format(','.join('?' * len(division_ids)),
               ','.join('?' * len(member_ids))),
        division_ids + member_ids
    ).fetchall()

    for v in votes:
        r = mem_to_row.get(v["member_id"])
        c = div_to_col.get(v["division_id"])
        if r is not None and c is not None:
            if v["vote"] in ("aye", "teller_aye"):
                matrix[r, c] = 1.0
            elif v["vote"] in ("no", "teller_no"):
                matrix[r, c] = -1.0

    member_info = {m["member_id"]: {"name": m["name"], "party": m["party"]}
                   for m in members}

    return matrix, member_ids, division_ids, member_info


def compute_agreement_matrix(vote_matrix: np.ndarray) -> np.ndarray:
    """Compute pairwise agreement rate between MPs.

    For each pair, count divisions where both voted and agreed,
    divided by divisions where both voted.
    """
    n = vote_matrix.shape[0]
    agreement = np.zeros((n, n), dtype=np.float32)

    for i in range(n):
        for j in range(i, n):
            # Both voted (non-zero)
            both_voted = (vote_matrix[i] != 0) & (vote_matrix[j] != 0)
            if both_voted.sum() < 5:
                agreement[i, j] = agreement[j, i] = 0.5  # insufficient data
                continue
            agreed = (vote_matrix[i] == vote_matrix[j]) & both_voted
            rate = agreed.sum() / both_voted.sum()
            agreement[i, j] = agreement[j, i] = rate

    return agreement


def cluster_factions(agreement_matrix: np.ndarray, n_clusters: int = 3) -> np.ndarray:
    """Cluster MPs into factions using spectral clustering on agreement matrix.

    Falls back to simple k-means on agreement rows if scipy unavailable.
    """
    try:
        from scipy.cluster.hierarchy import fcluster, linkage
        from scipy.spatial.distance import squareform

        # Convert agreement to distance
        distance = 1.0 - agreement_matrix
        np.fill_diagonal(distance, 0)
        condensed = squareform(distance, checks=False)
        Z = linkage(condensed, method="ward")
        labels = fcluster(Z, n_clusters, criterion="maxclust")
        return labels - 1  # zero-indexed
    except ImportError:
        # Fallback: simple k-means on agreement rows
        from numpy.random import default_rng
        rng = default_rng(42)
        n = agreement_matrix.shape[0]
        labels = rng.integers(0, n_clusters, size=n)
        # Run 10 iterations of k-means
        for _ in range(10):
            centroids = np.array([agreement_matrix[labels == k].mean(axis=0)
                                  for k in range(n_clusters)])
            distances = np.array([np.linalg.norm(agreement_matrix - c, axis=1)
                                  for c in centroids])
            labels = distances.argmin(axis=0)
        return labels


def analyze_party_factions(db, party: str, n_clusters: int = 3) -> dict:
    """Full factional analysis for one party."""
    result = build_vote_matrix(db, party=party)
    if result[0] is None:
        return {"party": party, "error": "Insufficient data"}

    matrix, member_ids, division_ids, member_info = result

    agreement = compute_agreement_matrix(matrix)
    labels = cluster_factions(agreement, n_clusters=n_clusters)

    # Group members by faction
    factions = defaultdict(list)
    for i, mid in enumerate(member_ids):
        info = member_info[mid]
        factions[int(labels[i])].append({
            "member_id": mid,
            "name": info["name"],
        })

    # Compute inter-faction agreement
    faction_agreement = {}
    for f1 in range(n_clusters):
        for f2 in range(f1 + 1, n_clusters):
            f1_mask = labels == f1
            f2_mask = labels == f2
            cross = agreement[np.ix_(f1_mask, f2_mask)]
            faction_agreement[f"{f1}-{f2}"] = round(float(cross.mean()), 3)

    result = {
        "party": party,
        "n_clusters": n_clusters,
        "n_members": len(member_ids),
        "n_divisions": len(division_ids),
        "factions": dict(factions),
        "inter_faction_agreement": faction_agreement,
    }

    # Cache
    db.execute("""
        INSERT OR REPLACE INTO analysis_cache
        (cache_key, analysis_type, result_json, params_json)
        VALUES (?, 'faction', ?, ?)
    """, (
        f"faction:{party}:{n_clusters}",
        json.dumps(result, default=str),
        json.dumps({"party": party, "n_clusters": n_clusters}),
    ))
    db.commit()

    return result


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--party", type=str, default=None)
    parser.add_argument("--clusters", type=int, default=3)
    args = parser.parse_args()

    db = get_db()
    init_db(db)

    parties = [args.party] if args.party else ["Labor", "Liberal", "Greens", "Nationals"]

    for party in parties:
        print(f"\n{'='*60}")
        print(f"FACTIONAL ANALYSIS: {party}")
        print(f"{'='*60}")

        result = analyze_party_factions(db, party, n_clusters=args.clusters)

        if "error" in result:
            print(f"  {result['error']}")
            continue

        for faction_id, members in result["factions"].items():
            print(f"\n  Faction {faction_id} ({len(members)} members):")
            for m in members[:10]:
                print(f"    - {m['name']}")
            if len(members) > 10:
                print(f"    ... and {len(members) - 10} more")

        print(f"\n  Inter-faction agreement:")
        for pair, rate in result["inter_faction_agreement"].items():
            print(f"    Factions {pair}: {rate*100:.1f}% agreement")


if __name__ == "__main__":
    main()
