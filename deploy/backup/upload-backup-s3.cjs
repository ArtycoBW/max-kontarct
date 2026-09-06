#!/usr/bin/env node
"use strict";

const { createReadStream } = require("node:fs");
const { basename } = require("node:path");
const { stat } = require("node:fs/promises");
const {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} = require("@aws-sdk/client-s3");

const [dumpPath, checksumPath] = process.argv.slice(2);
if (!dumpPath || !checksumPath) fail("Pass the verified dump and checksum paths");

const required = [
  "BACKUP_S3_ENDPOINT",
  "BACKUP_S3_ACCESS_KEY",
  "BACKUP_S3_SECRET_KEY",
  "BACKUP_S3_BUCKET",
];
for (const key of required) if (!process.env[key]?.trim()) fail(`Missing ${key}`);

const prefix = (process.env.BACKUP_S3_PREFIX ?? "private/backups/postgres")
  .replace(/^\/+|\/+$/g, "");
const client = new S3Client({
  endpoint: process.env.BACKUP_S3_ENDPOINT,
  forcePathStyle: process.env.BACKUP_S3_FORCE_PATH_STYLE !== "false",
  region: process.env.BACKUP_S3_REGION ?? "ru-central1",
  credentials: {
    accessKeyId: process.env.BACKUP_S3_ACCESS_KEY,
    secretAccessKey: process.env.BACKUP_S3_SECRET_KEY,
  },
});

async function upload(filePath) {
  const file = await stat(filePath);
  if (!file.isFile() || file.size < 1) fail(`Invalid backup file: ${basename(filePath)}`);
  const key = `${prefix}/${basename(filePath)}`;
  await client.send(new PutObjectCommand({
    Bucket: process.env.BACKUP_S3_BUCKET,
    Key: key,
    Body: createReadStream(filePath),
    ContentLength: file.size,
    ContentType: "application/octet-stream",
  }));
  const stored = await client.send(new HeadObjectCommand({
    Bucket: process.env.BACKUP_S3_BUCKET,
    Key: key,
  }));
  if (Number(stored.ContentLength) !== file.size) fail(`External backup verification failed: ${basename(filePath)}`);
  return key;
}

Promise.all([upload(dumpPath), upload(checksumPath)])
  .then(() => process.stdout.write("External PostgreSQL backup verified.\n"))
  .catch((error) => fail(`External backup failed: ${error.name}`));

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
