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

The script writes `real-data-quality-report.json`, `real-data-quality-report.md`, `real-data-provenance.json` and `real-data-relationship-report.json` under `output/stage3/recheck/real-data-audit/` by default. Existing nonempty output directories are refused; select a new attempt directory instead of overwriting an earlier result.
It refuses to write inside the raw-data directory. It does not modify raw CSVs, canonical inputs, `output/analysis/case.json`, `cloud/dist/snapshot.js`, or the deployed site.

## Status meanings

- `BLOCKED`: a required table is missing, a declared header differs, a declared key is duplicated or blank, a required foreign-key relationship has orphans/blanks, actual file evidence differs from the historical/supplied provenance, the dataset identity is unconfirmed, or the ZIP CRC check fails.
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

Only after the real nine-table audit is reviewed should the team proceed to a separate canonicalization run in a versioned recheck directory. This branch now parameterizes `prepare_case.py` and `verify_case.py`, blocks protected outputs, and removes template/snapshot rewrites. Use the explicit commands in [STAGE3_REPRODUCTION.md](STAGE3_REPRODUCTION.md). A synthetically small fixture may exercise structural checks without an archive; the real-data runner additionally requires `source_verified=true` before advancing.

All date fields, finite cent-precision monetary values, exact duplicates, conflicting keys, null rates and postal-prefix multiplicity are reported. The relationship report includes child/matched/blank/orphan denominators. No customer records or original review text are exported into the aggregate audit.
