// Read-only deployment gate: probe one stored upload and one final artifact without authentication.
const path = require("node:path");
const { createRequire } = require("node:module");
const root = path.resolve(__dirname, "..");
const req = createRequire(path.join(root, "apps/api/package.json"));
if (process.env.READINESS_ENV_FILE) req("dotenv").config({ path: process.env.READINESS_ENV_FILE, quiet: true });
const env = req("./dist/config/environment").validateEnvironment(process.env);
const { unsignedObjectUrl, isUnsignedReadBlocked } = req("./dist/storage/storage-privacy");
const { S3Client, HeadObjectCommand } = req("@aws-sdk/client-s3");
const { PrismaClient } = req("@prisma/client");
const db = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
const s3 = new S3Client({ endpoint: env.S3_ENDPOINT, region: env.S3_REGION, forcePathStyle: env.S3_FORCE_PATH_STYLE, credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY } });
async function main() {
  const objects = [await db.dealFile.findFirst({ select: { objectKey: true } }), await db.dealArtifact.findFirst({ select: { objectKey: true } })].filter(Boolean);
  for (const object of objects) {
    await s3.send(new HeadObjectCommand({ Bucket: env.S3_BUCKET, Key: object.objectKey }));
    const response = await fetch(unsignedObjectUrl(env.S3_ENDPOINT, env.S3_BUCKET, object.objectKey, env.S3_FORCE_PATH_STYLE), { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(10000) });
    if (!isUnsignedReadBlocked(response.status)) throw new Error("Unsigned object read was not blocked");
  }
  console.log(JSON.stringify({ storagePrivacy: objects.length ? "probe-passed" : "no-objects-to-probe", testedObjects: objects.length }));
}
main().catch(() => { console.error("Storage privacy check failed. Review S3 access; no object URL or credentials logged."); process.exitCode = 1; }).finally(() => { s3.destroy(); return db.$disconnect(); });
