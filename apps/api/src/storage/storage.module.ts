import { Global, Module } from "@nestjs/common";

import { MinioStorageService } from "./minio-storage.service";
import { STORAGE_SERVICE } from "./storage.service";

@Global()
@Module({
  exports: [STORAGE_SERVICE],
  providers: [
    {
      provide: STORAGE_SERVICE,
      useClass: MinioStorageService,
    },
  ],
})
export class StorageModule {}
