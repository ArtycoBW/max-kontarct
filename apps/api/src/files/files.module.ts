import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MulterModule } from "@nestjs/platform-express";
import { memoryStorage } from "multer";

import { AuthModule } from "../auth/auth.module";
import { FilesController } from "./files.controller";
import { FilesService } from "./files.service";

@Module({
  controllers: [FilesController],
  exports: [FilesService],
  imports: [
    AuthModule,
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        limits: { fileSize: config.getOrThrow<number>("FILE_UPLOAD_MAX_BYTES") },
        storage: memoryStorage(),
      }),
    }),
  ],
  providers: [FilesService],
})
export class FilesModule {}
