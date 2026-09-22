# TD_008: learning from recovered reviews

Reviews: {'REJECT': 49, 'KEEP': 66, 'EDIT': 3}.

Spatially held-out agreement: 107/115 (93.0%).
Balanced accuracy: 92.6%; majority comparator: 50.0%.

Spatial cross-validation measures agreement with one reviewer's tree inclusion choices. No field DBH accuracy claim. Numeric CSV values may be algorithm-prefilled.

## Requested POM investigations

- TREE_0009: POM 2.5 m; diagnostic D 40.5364787 cm; blockers AXIS_NOT_BRACKETED_BY_OBSERVATIONS, COMPETING_OR_DISCONTINUOUS_STEM_CENTERS, CONNECTED_STEM_RADIUS_UNSTABLE, FIT_MOVED_FROM_STEM_HYPOTHESIS, INCOMPLETE_ANGULAR_SUPPORT, INDEPENDENT_ELLIPSE_DISAGREES, LARGE_UNOBSERVED_SECTOR, MIXED_OR_NONCIRCULAR_SECTION, OPERATIONAL_RADIUS_GUARDRAIL, STABILITY_NOT_TESTED.
- TREE_0014: POM 1.3 m; diagnostic D 7.5014551 cm; blockers HIGH_RELATIVE_RESIDUAL, INDEPENDENT_ELLIPSE_DISAGREES, MIXED_OR_NONCIRCULAR_SECTION, STABILITY_NOT_TESTED, TREE_DETECTION_UNCERTAIN.
- TREE_0032: POM 1.5 m; diagnostic D None cm; blockers AXIS_CENTERS_INCONSISTENT, AXIS_IDENTITY_SHIFT, AXIS_MODEL_DISAGREEMENT, CONTINUITY_REQUIRES_THREE_LEVELS, NO_STABLE_CIRCLE, STABILITY_NOT_TESTED.
- TREE_0113: POM 2.5 m; diagnostic D 17.294359 cm; blockers GROUND_SPATIALLY_UNSTABLE, INCOMPLETE_ANGULAR_SUPPORT, INDEPENDENT_ELLIPSE_DISAGREES, LARGE_UNOBSERVED_SECTOR, MIXED_OR_NONCIRCULAR_SECTION, STABILITY_NOT_TESTED.

Original CSV is retained under annotations/td008/imports; revisions are in reviews.sqlite3.
KEEP includes a tree in further analysis. It never converts a failed geometric fit to a measured diameter.
