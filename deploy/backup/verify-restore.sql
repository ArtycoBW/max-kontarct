-- Run on source and restored test database; emits no personal data.
SELECT 'migrations', count(*)::text FROM _prisma_migrations WHERE finished_at IS NOT NULL
UNION ALL SELECT 'users', count(*)::text FROM users
UNION ALL SELECT 'deals', count(*)::text FROM deals
UNION ALL SELECT 'signatures', count(*)::text FROM deal_signatures
UNION ALL SELECT 'artifacts', count(*)::text FROM deal_artifacts
UNION ALL SELECT 'file_hashes', md5(coalesce(string_agg(sha256, ',' ORDER BY id), '')) FROM deal_files
UNION ALL SELECT 'artifact_hashes', md5(coalesce(string_agg(sha256, ',' ORDER BY id), '')) FROM deal_artifacts
ORDER BY 1;
