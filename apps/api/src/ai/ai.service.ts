import { Inject, Injectable } from "@nestjs/common";

import {
  AI_PROVIDER,
  type AiJsonObject,
  type AiProvider,
  type AiStructuredRequest,
  type AiStructuredResult,
} from "./ai-provider";

@Injectable()
export class AiService {
  constructor(@Inject(AI_PROVIDER) private readonly provider: AiProvider) {}

  generateStructured<T extends AiJsonObject = AiJsonObject>(
    request: AiStructuredRequest,
  ): Promise<AiStructuredResult<T>> {
    return this.provider.generateStructured<T>(request);
  }
}
