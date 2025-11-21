-- Per-pair repeatability: mode label and repeatability per (batch, doc, requirement)
WITH counts AS (
  SELECT
    batch_id,
    doc_id,
    requirement_id,
    model_label,
    COUNT(*) AS label_count
  FROM eval_results
  GROUP BY batch_id, doc_id, requirement_id, model_label
),
ranked AS (
  SELECT
    *,
    ROW_NUMBER() OVER (
      PARTITION BY batch_id, doc_id, requirement_id
      ORDER BY label_count DESC
    ) AS rn,
    SUM(label_count) OVER (
      PARTITION BY batch_id, doc_id, requirement_id
    ) AS total_runs
  FROM counts
)
SELECT
  batch_id,
  doc_id,
  requirement_id,
  model_label AS mode_label,
  label_count::FLOAT / NULLIF(total_runs::FLOAT, 0) AS repeatability,
  total_runs
FROM ranked
WHERE rn = 1
ORDER BY repeatability ASC;

-- Batch comparison: repeatability deltas between two batches/configs on the same eval set
WITH per_pair AS (
  SELECT
    batch_id,
    doc_id,
    requirement_id,
    model_label,
    COUNT(*) AS label_count,
    SUM(COUNT(*)) OVER (
      PARTITION BY batch_id, doc_id, requirement_id
    ) AS total_runs
  FROM eval_results
  GROUP BY batch_id, doc_id, requirement_id, model_label
),
per_pair_mode AS (
  SELECT
    batch_id,
    doc_id,
    requirement_id,
    model_label AS mode_label,
    label_count::FLOAT / NULLIF(total_runs::FLOAT, 0) AS repeatability
  FROM (
    SELECT
      *,
      ROW_NUMBER() OVER (
        PARTITION BY batch_id, doc_id, requirement_id
        ORDER BY label_count DESC
      ) AS rn
    FROM per_pair
  ) t
  WHERE rn = 1
)
SELECT
  a.doc_id,
  a.requirement_id,
  a.repeatability AS baseline_repeatability,
  b.repeatability AS new_repeatability,
  (b.repeatability - a.repeatability) AS delta
FROM per_pair_mode a
JOIN per_pair_mode b
  ON a.doc_id = b.doc_id
 AND a.requirement_id = b.requirement_id
WHERE a.batch_id = '2025-11-20_baseline_v1'
  AND b.batch_id = '2025-11-25_new_prompts_v2'
ORDER BY delta ASC;
