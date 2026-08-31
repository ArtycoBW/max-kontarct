import type {
  ContractStructuredDraft,
  CreateDealDraftRequest,
  DealDraftData,
  DealDraftResponse,
  DealInitiatorSnapshot,
  DealListResponse,
  UpdateDealDraftRequest,
} from "@max-contract/contracts";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DealStatus, Prisma } from "@prisma/client";

import type { DealDraftRecord } from "./deals.repository";
import { DealsRepository } from "./deals.repository";

const MAX_ANSWERS_BYTES = 64 * 1024;

@Injectable()
export class DealsService {
  constructor(private readonly deals: DealsRepository) {}

  async createDraft(
    userId: string,
    input: CreateDealDraftRequest,
  ): Promise<DealDraftResponse> {
    const [templateVersion, initiator] = await Promise.all([
      this.deals.findPublishedTemplateVersion(input.templateVersionId),
      this.deals.findInitiator(userId),
    ]);
    if (!templateVersion) {
      throw new NotFoundException({
        code: "DEAL_TEMPLATE_VERSION_NOT_FOUND",
        message: "Опубликованная версия шаблона не найдена",
      });
    }
    const initiatorSnapshot = toInitiatorSnapshot(initiator);
    const title = normalizeTitle(input.title);
    const draft: DealDraftData = {
      answers: {},
      clarificationSessionId: null,
      creationPath: input.creationPath,
      currentStep: "DESCRIPTION",
      description: input.description.trim(),
      initiator: initiatorSnapshot,
    };
    const record = await this.deals.createDraft({
      initiatorUserId: userId,
      templateVersionId: templateVersion.id,
      terms: toPrismaObject(draft),
      title,
    });
    return toResponse(record);
  }

  async getDraft(userId: string, dealId: string): Promise<DealDraftResponse> {
    const record = await this.deals.findOwnedDraft(dealId, userId);
    if (!record) throw dealNotFound();
    return toResponse(record);
  }

  async list(userId: string): Promise<DealListResponse> {
    const records = await this.deals.listOwned(userId);
    return {
      items: records.map((record) => ({
        id: record.id,
        status: record.status,
        templateTitle: record.templateVersion.template.title,
        title: record.title,
        updatedAt: record.updatedAt.toISOString(),
      })),
      total: records.length,
    };
  }

  async updateDraft(
    userId: string,
    dealId: string,
    input: UpdateDealDraftRequest,
  ): Promise<DealDraftResponse> {
    const record = await this.deals.findOwnedDraft(dealId, userId);
    if (!record) throw dealNotFound();
    if (record.initiatorUserId !== userId) {
      throw new ForbiddenException({
        code: "DEAL_DRAFT_EDIT_FORBIDDEN",
        message: "Изменять черновик может только инициатор сделки",
      });
    }
    if (record.status !== DealStatus.DRAFT) {
      throw new ConflictException({
        code: "DEAL_DRAFT_ALREADY_STARTED",
        message: "Условия сделки уже переданы на согласование",
      });
    }
    const version = requireVersion(record);
    const current = parseDraft(version.terms);
    const draft: DealDraftData = {
      answers: input.answers ?? current.answers,
      clarificationSessionId:
        input.clarificationSessionId !== undefined
          ? input.clarificationSessionId
          : current.clarificationSessionId,
      creationPath: input.creationPath ?? current.creationPath,
      currentStep: input.currentStep ?? current.currentStep,
      description:
        input.description !== undefined
          ? input.description.trim()
          : current.description,
      initiator: current.initiator,
    };
    assertAnswersSize(draft.answers);

    let contractDraft: Prisma.InputJsonValue | typeof Prisma.DbNull | undefined;
    if (input.sourceGenerationId) {
      const generation = await this.deals.findCompletedGeneration({
        id: input.sourceGenerationId,
        templateVersionId: record.templateVersion.id,
        userId,
      });
      if (!generation?.structuredDraft) {
        throw new ConflictException({
          code: "DEAL_GENERATION_NOT_READY",
          message: "Подготовленный проект договора ещё недоступен",
        });
      }
      contractDraft = generation.structuredDraft;
    } else if (input.sourceGenerationId === null) {
      contractDraft = Prisma.DbNull;
    }

    const updated = await this.deals.updateDraft({
      ...(contractDraft !== undefined ? { contractDraft } : {}),
      dealId,
      expectedUpdatedAt: new Date(input.expectedUpdatedAt),
      ...(input.sourceGenerationId !== undefined
        ? { sourceGenerationId: input.sourceGenerationId }
        : {}),
      terms: toPrismaObject(draft),
      title:
        input.title !== undefined ? normalizeTitle(input.title) : record.title,
      userId,
      versionId: version.id,
    });
    if (!updated) {
      throw new ConflictException({
        code: "DEAL_DRAFT_VERSION_CONFLICT",
        message: "Черновик изменился в другой вкладке. Обновите данные",
      });
    }
    return toResponse(updated);
  }
}

function normalizeTitle(value: string): string {
  const title = value.trim();
  if (!title) {
    throw new BadRequestException({
      code: "DEAL_TITLE_REQUIRED",
      message: "Укажите название сделки",
    });
  }
  return title;
}

function assertAnswersSize(answers: Record<string, unknown>): void {
  let serialized: string;
  try {
    serialized = JSON.stringify(answers);
  } catch {
    throw invalidAnswers();
  }
  if (serialized.length > MAX_ANSWERS_BYTES) {
    throw new BadRequestException({
      code: "DEAL_DRAFT_TOO_LARGE",
      message: "В анкете слишком много данных",
    });
  }
}

function toInitiatorSnapshot(
  user:
    | {
        maxAccount: { firstName: string | null; lastName: string | null } | null;
        phones: Array<{ e164: string }>;
        profile: {
          email: string | null;
          firstName: string;
          lastName: string;
          middleName: string | null;
        } | null;
      }
    | null,
): DealInitiatorSnapshot {
  const phone = user?.phones[0]?.e164;
  const firstName = user?.profile?.firstName ?? user?.maxAccount?.firstName ?? "";
  const lastName = user?.profile?.lastName ?? user?.maxAccount?.lastName ?? "";
  if (!user || !phone || !firstName.trim() || !lastName.trim()) {
    throw new ConflictException({
      code: "DEAL_INITIATOR_PROFILE_INCOMPLETE",
      message: "Сначала заполните профиль и подтвердите номер телефона",
    });
  }
  return {
    email: user.profile?.email ?? null,
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    middleName: user.profile?.middleName?.trim() || null,
    phone,
  };
}

function toResponse(record: DealDraftRecord): DealDraftResponse {
  const version = requireVersion(record);
  return {
    contractDraft: version.contractDraft
      ? (version.contractDraft as unknown as ContractStructuredDraft)
      : null,
    createdAt: record.createdAt.toISOString(),
    draft: parseDraft(version.terms),
    id: record.id,
    sourceGenerationId: version.sourceGenerationId,
    status: record.status,
    template: {
      slug: record.templateVersion.template.slug,
      title: record.templateVersion.template.title,
      versionId: record.templateVersion.id,
      versionNumber: record.templateVersion.versionNumber,
    },
    title: record.title,
    updatedAt: record.updatedAt.toISOString(),
    versionId: version.id,
    versionNumber: version.versionNumber,
  };
}

function requireVersion(record: DealDraftRecord) {
  const version = record.versions[0];
  if (!version) {
    throw new ConflictException({
      code: "DEAL_VERSION_NOT_FOUND",
      message: "Версия условий сделки не найдена",
    });
  }
  return version;
}

function parseDraft(value: Prisma.JsonValue): DealDraftData {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalidAnswers();
  }
  const draft = value as unknown as Partial<DealDraftData>;
  if (
    typeof draft.description !== "string" ||
    typeof draft.answers !== "object" ||
    draft.answers === null ||
    Array.isArray(draft.answers) ||
    !draft.creationPath ||
    !draft.currentStep
  ) {
    throw invalidAnswers();
  }
  return draft as DealDraftData;
}

function toPrismaObject(value: DealDraftData): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}

function invalidAnswers(): ConflictException {
  return new ConflictException({
    code: "DEAL_DRAFT_DATA_INVALID",
    message: "Данные черновика повреждены",
  });
}

function dealNotFound(): NotFoundException {
  return new NotFoundException({
    code: "DEAL_NOT_FOUND",
    message: "Сделка не найдена",
  });
}
