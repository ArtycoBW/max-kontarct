import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { BadGatewayException, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type {
  StorageService,
  StoredObject,
  StoreObjectInput,
} from "./storage.service";

type S3Error = Error & { $metadata?: { httpStatusCode?: number } };

@Injectable()
export class S3StorageService implements StorageService, OnModuleInit {
  private readonly autoCreateBucket: boolean;
  private readonly bucket: string;
  private readonly client: S3Client;
  private readonly logger = new Logger(S3StorageService.name);

  constructor(config: ConfigService) {
    this.autoCreateBucket = config.getOrThrow<boolean>("S3_AUTO_CREATE_BUCKET");
    this.bucket = config.getOrThrow<string>("S3_BUCKET");
    this.client = new S3Client({
      credentials: {
        accessKeyId: config.getOrThrow<string>("S3_ACCESS_KEY"),
        secretAccessKey: config.getOrThrow<string>("S3_SECRET_KEY"),
      },
      endpoint: config.getOrThrow<string>("S3_ENDPOINT"),
      forcePathStyle: config.getOrThrow<boolean>("S3_FORCE_PATH_STYLE"),
      region: config.getOrThrow<string>("S3_REGION"),
    });
  }

  async onModuleInit(): Promise<void> {
    if (!this.autoCreateBucket) return;
    try {
      await this.ensureBucket();
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      this.logger.warn(`S3 storage is not ready during startup: ${message}`);
    }
  }

  async checkHealth(): Promise<void> {
    if (this.autoCreateBucket) await this.ensureBucket();
    else await this.headBucket();
  }

  async ensureBucket(): Promise<void> {
    try {
      await this.headBucket();
    } catch (error) {
      if (!isMissingBucket(error)) throw error;
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }), {
        abortSignal: AbortSignal.timeout(2_500),
      });
    }
  }

  async putObject(input: StoreObjectInput): Promise<void> {
    try {
      await this.client.send(new PutObjectCommand({
        Body: input.body,
        Bucket: this.bucket,
        ContentType: input.contentType,
        Key: input.key,
        Metadata: { sha256: input.sha256 },
      }), { abortSignal: AbortSignal.timeout(10_000) });
    } catch {
      throw storageUnavailable();
    }
  }

  async getObject(key: string): Promise<StoredObject> {
    try {
      const object = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
        { abortSignal: AbortSignal.timeout(10_000) },
      );
      if (!object.Body) throw storageUnavailable();
      const bytes = await object.Body.transformToByteArray();
      return {
        body: Buffer.from(bytes),
        contentType: object.ContentType ?? null,
      };
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      throw storageUnavailable();
    }
  }

  async deleteObject(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
        { abortSignal: AbortSignal.timeout(10_000) },
      );
    } catch {
      throw storageUnavailable();
    }
  }

  private async headBucket(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }), {
      abortSignal: AbortSignal.timeout(2_500),
    });
  }

}

function isMissingBucket(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const s3Error = error as S3Error;
  return s3Error.$metadata?.httpStatusCode === 404
    || s3Error.name === "NotFound"
    || s3Error.name === "NoSuchBucket";
}

function storageUnavailable(): BadGatewayException {
  return new BadGatewayException({
    code: "STORAGE_UNAVAILABLE",
    message: "Хранилище документов временно недоступно",
  });
}
