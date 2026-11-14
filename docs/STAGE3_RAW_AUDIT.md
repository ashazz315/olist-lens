# Stage 3 raw Olist data audit

This stage adds a non-destructive audit of the nine raw CSVs in Kaggle Olist dataset version 2.

## Run

From the repository root, after obtaining the official Kaggle v2 archive through the existing `scripts/download_kaggle.py` flow:

```bash
python scripts/audit_raw_stage3.py
```

Optional paths:

```bash
python scripts/audit_raw_stage3.py --raw-dir data/raw/kaggle-v2 --out-dir output/stage3/recheck/real-data-audit
```

The script writes only `real-data-quality-report.json` and `real-data-quality-report.md` under `output/stage3/recheck/real-data-audit/` by default.
It refuses to write inside the raw-data directory. It does not modify raw CSVs, canonical inputs, `output/analysis/case.json`, `cloud/dist/snapshot.js`, or the deployed site.

## Status meanings

- `BLOCKED`: a required table is missing, a declared header differs, a declared key is duplicated, a required foreign-key relationship has orphans, or the ZIP CRC check fails.
- `REVIEW_REQUIRED`: reference row counts or source hashes differ, or selected date/numeric values are invalid. Investigate before analysis.
- `PASS_WITH_WARNINGS`: structural checks pass, but date-order or postal-prefix warnings remain.
- `PASS`: none of the above conditions were found.

Exit codes: 0 = PASS/PASS_WITH_WARNINGS, 1 = REVIEW_REQUIRED, 2 = BLOCKED.

## Important interpretation

Reference row counts and hashes are comparison points from the repository's existing provenance record, not a reason to force a downloaded file to match. A mismatch must be investigated.
The audit records nulls and unusual date ordering; it never imputes, deletes, or silently repairs source rows. Geolocation postal prefixes are many-to-many and are not unique keys.
The report contains aggregate counts and a limited list of untranslated category names, not raw customer-level rows.
This audit is not a complete proof of source truth. A clean audit does not establish that every upstream business event is factually correct.

## Synthetic tests

```bash
python -m unittest tests/test_stage3_raw_audit.py
```

The tests use tiny synthetic fixtures. Their expected row-count mismatch is intentional and must not be interpreted as a real-data result.

## Next gate

Only after the real nine-table audit is reviewed should the team proceed to a separate canonicalization run in a versioned recheck directory. The current `prepare_case.py` and `verify_case.py` write to established case paths; do not run them for Stage 3 until they accept explicit output paths or are safely adapted on this branch.