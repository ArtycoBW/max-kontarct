import { CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor } from "@nestjs/common";
import { defer, finalize } from "rxjs";

/** Bound memory used by the multipart parser, including concurrent users. */
@Injectable()
export class FileUploadCapacityInterceptor implements NestInterceptor {
  private active = 0;

  intercept(_context: ExecutionContext, next: CallHandler) {
    return defer(() => {
      if (this.active >= 2) throw new HttpException({ code: "UPLOAD_BUSY", message: "Сейчас загружаются другие файлы. Повторите попытку немного позже." }, 429);
      this.active++;
      return defer(() => next.handle()).pipe(finalize(() => { this.active--; }));
    });
  }
}
