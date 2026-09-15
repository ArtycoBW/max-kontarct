import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MulterModule } from "@nestjs/platform-express";
import { memoryStorage } from "multer";

import { AuthModule } from "../auth/auth.module";
import { FilesController } from "./files.controller";
import { FilesService } from "./files.service";
import { FileUploadCapacityInterceptor } from "./upload-capacity.interceptor";

@Module({
  controllers: [FilesController],
  exports: [FilesService],
  imports: [
    AuthModule,
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        limits: { fileSize: Math.max(config.getOrThrow<number>("FILE_UPLOAD_MAX_BYTES"), config.getOrThrow<number>("FILE_EVIDENCE_MAX_BYTES")), files: 1, fields: 2, parts: 4 },
        storage: memoryStorage(),
      }),
    }),
  ],
  providers: [FilesService, FileUploadCapacityInterceptor],
})
export class FilesModule {}
