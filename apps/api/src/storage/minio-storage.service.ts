import {
  CreateBucketCommand,
  HeadBucketCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { StorageService } from "./storage.service";

type S3Error = Error & {
  $metadata?: { httpStatusCode?: number };
};

function isMissingBucket(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const s3Error = error as S3Error;
  return (
    s3Error.$metadata?.httpStatusCode === 404 ||
    s3Error.name === "NotFound" ||
    s3Error.name === "NoSuchBucket"
  );
}

@Injectable()
export class MinioStorageService implements StorageService, OnModuleInit {
  private readonly autoCreateBucket: boolean;
  private readonly bucket: string;
  private readonly client: S3Client;
  private readonly logger = new Logger(MinioStorageService.name);

  constructor(config: ConfigService) {
    this.autoCreateBucket = config.getOrThrow<boolean>(
      "MINIO_AUTO_CREATE_BUCKET",
    );
    this.bucket = config.getOrThrow<string>("MINIO_BUCKET");
    this.client = new S3Client({
      credentials: {
        accessKeyId: config.getOrThrow<string>("MINIO_ACCESS_KEY"),
        secretAccessKey: config.getOrThrow<string>("MINIO_SECRET_KEY"),
      },
      endpoint: config.getOrThrow<string>("MINIO_ENDPOINT"),
      forcePathStyle: true,
      region: config.getOrThrow<string>("MINIO_REGION"),
    });
  }

  async onModuleInit(): Promise<void> {
    if (!this.autoCreateBucket) {
      return;
    }

    try {
      await this.ensureBucket();
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      this.logger.warn(`MinIO is not ready during startup: ${message}`);
    }
  }

  async ensureBucket(): Promise<void> {
    try {
      await this.headBucket();
    } catch (error) {
      if (!isMissingBucket(error)) {
        throw error;
      }

      await this.client.send(
        new CreateBucketCommand({ Bucket: this.bucket }),
        { abortSignal: AbortSignal.timeout(2_500) },
      );
    }
  }

  async checkHealth(): Promise<void> {
    if (this.autoCreateBucket) {
      await this.ensureBucket();
      return;
    }

    await this.headBucket();
  }

  private async headBucket(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }), {
      abortSignal: AbortSignal.timeout(2_500),
    });
  }
}
