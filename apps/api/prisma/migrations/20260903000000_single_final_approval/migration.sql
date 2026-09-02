-- Only unfinished pre-signing deals are migrated. Frozen/signed versions and
-- existing final files are deliberately left unchanged.
WITH candidates AS (
  SELECT d.id,
    CASE WHEN NOT EXISTS (
      SELECT 1 FROM deal_parties p
      JOIN template_document_requirements r ON r.template_version_id = d.template_version_id AND r.required
      WHERE p.deal_id = d.id AND NOT EXISTS (
        SELECT 1 FROM deal_files f
        WHERE f.deal_id = d.id AND f.owner_user_id = p.user_id
          AND f.requirement_id = r.id AND f.review_status = 'ACCEPTED'
      )
    ) THEN 'TERMS_REVIEW'::deal_status
    WHEN d.status = 'DOCUMENTS_REVIEW' THEN 'DOCUMENTS_REVIEW'::deal_status
    ELSE 'DOCUMENTS_PENDING'::deal_status END AS next_status
  FROM deals d
  WHERE d.status IN ('COUNTERPARTY_JOINED', 'DOCUMENTS_PENDING', 'DOCUMENTS_REVIEW')
    AND (SELECT count(*) FROM deal_parties p WHERE p.deal_id = d.id) = 2
    AND NOT EXISTS (SELECT 1 FROM deal_versions v WHERE v.deal_id = d.id AND v.frozen_at IS NOT NULL)
), revoked AS (
  UPDATE deal_approvals a SET status = 'REVOKED', invalidated_at = now(), updated_at = now()
  FROM candidates c WHERE a.deal_id = c.id AND a.status = 'APPROVED'
  RETURNING a.deal_id
), updated AS (
  UPDATE deals d SET status = c.next_status, updated_at = now()
  FROM candidates c WHERE d.id = c.id RETURNING d.id, d.status
)
INSERT INTO audit_events (id, event_type, entity_type, entity_id, metadata, created_at)
SELECT gen_random_uuid(), 'DEAL_APPROVAL_FLOW_UPDATED', 'Deal', u.id::text,
  jsonb_build_object('status', u.status, 'resetPreliminaryApprovals', (SELECT count(*) FROM revoked r WHERE r.deal_id = u.id)), now()
FROM updated u;
