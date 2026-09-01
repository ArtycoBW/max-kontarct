import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import type {
  ApproveDealVersionRequest,
  CreateDealInvitationRequest,
  DealApprovalResponse,
  DealDraftData,
  DealInvitationResponse,
  DealInvitationState,
  DealWorkspaceResponse,
  JoinDealInvitationRequest,
  PublicDealInvitationResponse,
  PublicInvitationTerm,
} from "@max-contract/contracts";
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  DealApprovalStatus,
  DealPartyRole,
  DealStatus,
  ConsentType,
  Prisma,
} from "@prisma/client";

import { PrismaService } from "../database/prisma.service";
import { MaxBotService } from "../max-bot/max-bot.service";
import { DealStateMachineService } from "./deal-state-machine.service";
import {
  createContractNumber,
  hashFrozenSnapshot,
  type FrozenDealSnapshot,
} from "./deal-version-freeze";

const invitationSelect = {
  acceptedAt: true,
  createdAt: true,
  expiresAt: true,
  id: true,
  publicCode: true,
  revokedAt: true,
} satisfies Prisma.DealInvitationSelect;

const workspaceSelect = {
  createdAt: true,
  id: true,
  initiatorUserId: true,
  invitations: {
    orderBy: { createdAt: "desc" as const },
    select: invitationSelect,
    take: 1,
  },
  parties: {
    select: {
      id: true,
      role: true,
      userId: true,
      user: {
        select: {
          maxAccount: { select: { firstName: true, lastName: true, maxUserId: true } },
          phones: {
            orderBy: [{ isPrimary: "desc" as const }, { verifiedAt: "desc" as const }],
            select: { e164: true, id: true },
            take: 1,
          },
          profile: {
            select: {
              addressValue: true,
              birthDate: true,
              email: true,
              firstName: true,
              lastName: true,
              middleName: true,
            },
          },
        },
      },
    },
  },
  status: true,
  templateVersion: {
    select: {
      id: true,
      template: { select: { slug: true, title: true } },
      versionNumber: true,
    },
  },
  title: true,
  updatedAt: true,
  versions: {
    orderBy: { versionNumber: "desc" as const },
    select: {
      approvals: { select: { approvedAt: true, id: true, partyId: true, status: true } },
      contractDraft: true,
      contractNumber: true,
      frozenAt: true,
      frozenSnapshot: true,
      id: true,
      snapshotHash: true,
      sourceGenerationId: true,
      terms: true,
      versionNumber: true,
    },
    take: 1,
  },
} satisfies Prisma.DealSelect;

type WorkspaceRecord = Prisma.DealGetPayload<{ select: typeof workspaceSelect }>;
type InvitationRecord = Prisma.DealInvitationGetPayload<{
  select: typeof invitationSelect;
}>;

@Injectable()
export class DealInvitationsService {
  private readonly invitationTtlMs: number;
  private readonly publicWebUrl: string;

  constructor(
    private readonly config: ConfigService,
    private readonly maxBot: MaxBotService,
    private readonly prisma: PrismaService,
    private readonly stateMachine: DealStateMachineService,
  ) {
    this.invitationTtlMs =
      this.config.getOrThrow<number>("DEAL_INVITATION_TTL_SECONDS") * 1_000;
    this.publicWebUrl = this.config.getOrThrow<string>("PUBLIC_WEB_URL");
  }

  async create(
    userId: string,
    dealId: string,
    input: CreateDealInvitationRequest,
  ): Promise<DealInvitationResponse> {
    const record = await this.findWorkspace(dealId, userId);
    assertInitiator(record, userId);
    if (
      record.status !== DealStatus.COLLECTING_DATA &&
      record.status !== DealStatus.INVITATION_READY &&
      record.status !== DealStatus.INVITED
    ) {
      throw new ConflictException({
        code: "DEAL_INVITATION_NOT_ALLOWED",
        message: "Приглашение нельзя создать на текущем этапе сделки",
      });
    }
    const version = requireWorkspaceVersion(record);
    if (version.id !== input.expectedVersionId) throw versionConflict();

    const rawToken = randomBytes(24).toString("base64url");
    const publicCode = randomBytes(9).toString("base64url");
    const tokenHash = hashToken(rawToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.invitationTtlMs);
    const payload = invitationPayload(publicCode, rawToken);
    const maxDeeplink = await this.maxBot.createMiniAppDeeplink(payload);

    let invitation: InvitationRecord;
    try {
      invitation = await this.prisma.$transaction(async (transaction) => {
      await transaction.dealInvitation.updateMany({
        data: { revokedAt: now },
        where: {
          acceptedAt: null,
          dealId,
          expiresAt: { lte: now },
          revokedAt: null,
        },
      });
      const active = await transaction.dealInvitation.findFirst({
        select: { id: true },
        where: { acceptedAt: null, dealId, revokedAt: null },
      });
      if (active && !input.replaceActive) {
        throw new ConflictException({
          code: "DEAL_INVITATION_ALREADY_ACTIVE",
          message: "Для сделки уже действует приглашение",
        });
      }
      if (active) {
        await transaction.dealInvitation.update({
          data: { revokedAt: now },
          where: { id: active.id },
        });
      }

      const nextStatus =
        record.status === DealStatus.COLLECTING_DATA
          ? this.stateMachine.transition(
              DealStatus.COLLECTING_DATA,
              DealStatus.INVITATION_READY,
            )
          : record.status === DealStatus.INVITED
            ? this.stateMachine.transition(
                DealStatus.INVITED,
                DealStatus.INVITATION_READY,
              )
            : record.status;
      const updated = await transaction.deal.updateMany({
        data: { status: nextStatus, updatedAt: now },
        where: {
          id: dealId,
          initiatorUserId: userId,
          status: record.status,
          updatedAt: new Date(input.expectedUpdatedAt),
          versions: { some: { id: input.expectedVersionId } },
        },
      });
      if (updated.count !== 1) throw versionConflict();

      const created = await transaction.dealInvitation.create({
        data: {
          createdByUserId: userId,
          dealId,
          expiresAt,
          publicCode,
          tokenHash,
        },
        select: invitationSelect,
      });
      await transaction.auditEvent.create({
        data: {
          actorUserId: userId,
          entityId: created.id,
          entityType: "DealInvitation",
          eventType: active
            ? "DEAL_INVITATION_REISSUED"
            : "DEAL_INVITATION_CREATED",
          metadata: { dealId, expiresAt: expiresAt.toISOString(), publicCode },
        },
      });
        return created;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException({
          code: "DEAL_INVITATION_ALREADY_ACTIVE",
          message: "Для сделки уже действует приглашение",
        });
      }
      throw error;
    }

    const shareUrl = `${this.publicWebUrl}/invite/${publicCode}#${rawToken}`;
    return {
      ...toInvitationResponse(invitation),
      maxDeeplink,
      shareText: `Вас приглашают согласовать условия сделки «${record.templateVersion.template.title}» в Макс-Контракт.`,
      shareUrl,
    };
  }

  async getCurrent(userId: string, dealId: string): Promise<DealInvitationResponse | null> {
    const record = await this.findWorkspace(dealId, userId);
    return record.invitations[0]
      ? toInvitationResponse(record.invitations[0])
      : null;
  }

  async markSent(
    userId: string,
    dealId: string,
    invitationId: string,
  ): Promise<DealInvitationResponse> {
    const record = await this.findWorkspace(dealId, userId);
    assertInitiator(record, userId);
    const invitation = record.invitations[0];
    assertActiveInvitation(invitation, invitationId);

    if (record.status === DealStatus.INVITATION_READY) {
      await this.prisma.$transaction([
        this.prisma.deal.update({
          data: {
            status: this.stateMachine.transition(
              DealStatus.INVITATION_READY,
              DealStatus.INVITED,
            ),
          },
          where: { id: dealId },
        }),
        this.prisma.auditEvent.create({
          data: {
            actorUserId: userId,
            entityId: invitation.id,
            entityType: "DealInvitation",
            eventType: "DEAL_INVITATION_SENT",
            metadata: { dealId, publicCode: invitation.publicCode },
          },
        }),
      ]);
    }
    return toInvitationResponse(invitation);
  }

  async revoke(
    userId: string,
    dealId: string,
    invitationId: string,
  ): Promise<DealInvitationResponse> {
    const record = await this.findWorkspace(dealId, userId);
    assertInitiator(record, userId);
    const invitation = record.invitations[0];
    assertActiveInvitation(invitation, invitationId);
    const now = new Date();

    const [revoked] = await this.prisma.$transaction([
      this.prisma.dealInvitation.update({
        data: { revokedAt: now },
        select: invitationSelect,
        where: { id: invitation.id },
      }),
      this.prisma.deal.update({
        data: {
          status:
            record.status === DealStatus.INVITED
              ? this.stateMachine.transition(
                  DealStatus.INVITED,
                  DealStatus.INVITATION_READY,
                )
              : record.status,
        },
        where: { id: dealId },
      }),
      this.prisma.auditEvent.create({
        data: {
          actorUserId: userId,
          entityId: invitation.id,
          entityType: "DealInvitation",
          eventType: "DEAL_INVITATION_REVOKED",
          metadata: { dealId, publicCode: invitation.publicCode },
        },
      }),
    ]);
    return toInvitationResponse(revoked);
  }

  async publicPreview(publicCode: string): Promise<PublicDealInvitationResponse> {
    const invitation = await this.prisma.dealInvitation.findUnique({
      select: {
        acceptedAt: true,
        acceptedByUserId: true,
        createdBy: {
          select: {
            maxAccount: { select: { firstName: true, lastName: true } },
            profile: { select: { firstName: true, lastName: true } },
          },
        },
        expiresAt: true,
        publicCode: true,
        revokedAt: true,
        deal: {
          select: {
            templateVersion: {
              select: {
                questionnaireSchema: true,
                template: { select: { slug: true, summary: true, title: true } },
              },
            },
            versions: {
              orderBy: { versionNumber: "desc" },
              select: { terms: true, versionNumber: true },
              take: 1,
            },
          },
        },
      },
      where: { publicCode },
    });
    if (!invitation) throw invitationNotFound();
    const version = invitation.deal.versions[0];
    if (!version) throw invitationNotFound();
    const draft = parseDealDraft(version.terms);
    const template = invitation.deal.templateVersion.template;
    const profile = invitation.createdBy.profile ?? invitation.createdBy.maxAccount;

    return {
      botUsername: await this.maxBot.getBotUsername(),
      expiresAt: invitation.expiresAt.toISOString(),
      initiatorMaskedName: maskName(profile?.firstName, profile?.lastName),
      publicCode: invitation.publicCode,
      state: invitationState(invitation),
      templateSummary: template.summary,
      templateTitle: template.title,
      terms: publicTerms(
        template.slug,
        draft.answers,
        invitation.deal.templateVersion.questionnaireSchema,
      ),
      versionNumber: version.versionNumber,
      whatItGives: [
        "Фиксирует согласованную редакцию условий",
        "Показывает изменения и согласование каждой стороны",
        "Готовит основу для документов и дальнейшего подписания",
      ],
    };
  }

  async join(
    userId: string,
    input: JoinDealInvitationRequest,
  ): Promise<DealWorkspaceResponse> {
    const invitation = await this.prisma.dealInvitation.findUnique({
      select: {
        acceptedAt: true,
        acceptedByUserId: true,
        createdByUserId: true,
        deal: { select: { id: true, initiatorUserId: true, status: true } },
        expiresAt: true,
        id: true,
        revokedAt: true,
        tokenHash: true,
      },
      where: { publicCode: input.publicCode },
    });
    if (!invitation || !matchesToken(input.token, invitation.tokenHash)) {
      throw invitationNotFound();
    }
    if (invitation.deal.initiatorUserId === userId) {
      throw new ForbiddenException({
        code: "DEAL_INVITATION_SELF_JOIN_FORBIDDEN",
        message: "Инициатор уже участвует в этой сделке",
      });
    }
    if (invitation.acceptedAt && invitation.acceptedByUserId === userId) {
      return this.workspace(userId, invitation.deal.id);
    }
    assertInvitationUsable(invitation);
    const user = await this.prisma.user.findUnique({
      select: {
        consents: {
          select: { documentVersion: true, granted: true, type: true },
          where: { granted: true },
        },
        maxAccount: { select: { maxUserId: true } },
        phones: { select: { id: true }, take: 1 },
      },
      where: { id: userId },
    });
    const requiredConsents = [
      [ConsentType.PERSONAL_DATA, this.config.getOrThrow<string>("CONSENT_PERSONAL_DATA_VERSION")],
      [ConsentType.TERMS_OF_USE, this.config.getOrThrow<string>("CONSENT_TERMS_VERSION")],
      [ConsentType.STATUS_NOTIFICATIONS, this.config.getOrThrow<string>("CONSENT_STATUS_NOTIFICATIONS_VERSION")],
    ] as const;
    const consentsCompleted = requiredConsents.every(([type, version]) =>
      user?.consents.some(
        (consent) => consent.type === type && consent.documentVersion === version,
      ),
    );
    if (!user?.phones[0] || !consentsCompleted) {
      throw new ConflictException({
        code: "DEAL_JOIN_ONBOARDING_REQUIRED",
        message: "Сначала подтвердите телефон и обязательные согласия",
      });
    }

    const now = new Date();
    await this.prisma.$transaction(async (transaction) => {
      const accepted = await transaction.dealInvitation.updateMany({
        data: { acceptedAt: now, acceptedByUserId: userId },
        where: {
          acceptedAt: null,
          expiresAt: { gt: now },
          id: invitation.id,
          revokedAt: null,
        },
      });
      if (accepted.count !== 1) throw invitationUnavailable();

      await transaction.dealParty.create({
        data: {
          dealId: invitation.deal.id,
          role: DealPartyRole.COUNTERPARTY,
          userId,
        },
      });
      if (
        invitation.deal.status !== DealStatus.INVITATION_READY &&
        invitation.deal.status !== DealStatus.INVITED
      ) {
        throw invitationUnavailable();
      }
      if (invitation.deal.status === DealStatus.INVITATION_READY) {
        this.stateMachine.transition(
          DealStatus.INVITATION_READY,
          DealStatus.INVITED,
        );
      }
      const nextStatus = this.stateMachine.transition(
        DealStatus.INVITED,
        DealStatus.COUNTERPARTY_JOINED,
      );
      const updated = await transaction.deal.updateMany({
        data: { status: nextStatus, updatedAt: now },
        where: {
          id: invitation.deal.id,
          status: invitation.deal.status,
        },
      });
      if (updated.count !== 1) throw invitationUnavailable();
      await transaction.auditEvent.create({
        data: {
          actorUserId: userId,
          entityId: invitation.deal.id,
          entityType: "Deal",
          eventType: "DEAL_COUNTERPARTY_JOINED",
          metadata: { invitationId: invitation.id, publicCode: input.publicCode },
        },
      });
    });

    const initiator = await this.prisma.maxAccount.findUnique({
      select: { maxUserId: true },
      where: { userId: invitation.deal.initiatorUserId },
    });
    if (initiator) {
      void this.maxBot.sendUserNotification(
        initiator.maxUserId,
        "Контрагент присоединился к сделке. Проверьте статус в Макс-Контракт.",
      );
    }
    return this.workspace(userId, invitation.deal.id);
  }

  async workspace(userId: string, dealId: string): Promise<DealWorkspaceResponse> {
    const record = await this.findWorkspace(dealId, userId);
    return toWorkspace(record, userId);
  }

  async approve(
    userId: string,
    dealId: string,
    versionId: string,
    input: ApproveDealVersionRequest,
  ): Promise<DealApprovalResponse> {
    const record = await this.findWorkspace(dealId, userId);
    const version = requireWorkspaceVersion(record);
    if (version.id !== versionId) throw versionConflict();
    if (
      record.status !== DealStatus.COUNTERPARTY_JOINED &&
      record.status !== DealStatus.TERMS_REVIEW
    ) {
      throw new ConflictException({
        code: "DEAL_APPROVAL_NOT_ALLOWED",
        message: "Согласование условий недоступно на текущем этапе",
      });
    }
    const party = record.parties.find(({ userId: id }) => id === userId);
    if (!party) throw dealNotFound();
    if (!party.user.profile || !party.user.phones[0]) {
      throw new ConflictException({
        code: "DEAL_APPROVAL_PROFILE_REQUIRED",
        message: "Сначала заполните профиль и подтвердите номер телефона",
      });
    }
    const existing = version.approvals.find(
      (approval) =>
        approval.partyId === party.id &&
        approval.status === DealApprovalStatus.APPROVED,
    );
    if (existing) {
      return this.approvalResponse(record, version.id, version.versionNumber, existing);
    }

    const now = new Date();
    const result = await this.prisma.$transaction(async (transaction) => {
      const currentApprovals = version.approvals.filter(
        ({ status }) => status === DealApprovalStatus.APPROVED,
      ).length;
      const totalApproved = currentApprovals + 1;
      const allApproved = totalApproved === record.parties.length;
      const nextStatus = allApproved
        ? record.status === DealStatus.COUNTERPARTY_JOINED
          ? this.stateMachine.transition(
              DealStatus.COUNTERPARTY_JOINED,
              DealStatus.DOCUMENTS_PENDING,
            )
          : this.stateMachine.transition(
              DealStatus.TERMS_REVIEW,
              DealStatus.READY_TO_SIGN,
            )
        : record.status;
      const freeze = nextStatus === DealStatus.READY_TO_SIGN
        ? createFreeze(record, version, now)
        : null;
      const updated = await transaction.deal.updateMany({
        data: { status: nextStatus, updatedAt: now },
        where: {
          id: dealId,
          status: record.status,
          updatedAt: new Date(input.expectedDealUpdatedAt),
        },
      });
      if (updated.count !== 1) throw versionConflict();
      const approval = await transaction.dealApproval.upsert({
        create: { dealId, dealVersionId: version.id, partyId: party.id },
        select: { approvedAt: true, id: true },
        update: {
          approvedAt: now,
          invalidatedAt: null,
          status: DealApprovalStatus.APPROVED,
        },
        where: {
          dealVersionId_partyId: {
            dealVersionId: version.id,
            partyId: party.id,
          },
        },
      });
      if (freeze) {
        const frozen = await transaction.dealVersion.updateMany({
          data: {
            contractNumber: freeze.snapshot.contract.number,
            frozenAt: now,
            frozenSnapshot: freeze.snapshot as unknown as Prisma.InputJsonObject,
            snapshotHash: freeze.hash,
          },
          where: { frozenAt: null, id: version.id },
        });
        if (frozen.count !== 1) throw versionConflict();
        await transaction.auditEvent.create({
          data: {
            actorUserId: userId,
            entityId: version.id,
            entityType: "DealVersion",
            eventType: "DEAL_VERSION_FROZEN",
            metadata: {
              contractNumber: freeze.snapshot.contract.number,
              dealId,
              frozenAt: now.toISOString(),
              snapshotHash: freeze.hash,
              versionNumber: version.versionNumber,
            },
          },
        });
      }
      await transaction.auditEvent.create({
        data: {
          actorUserId: userId,
          entityId: approval.id,
          entityType: "DealApproval",
          eventType: "DEAL_VERSION_APPROVED",
          metadata: {
            dealId,
            dealStatus: nextStatus,
            versionId: version.id,
            versionNumber: version.versionNumber,
          },
        },
      });
      return { approval, nextStatus, totalApproved };
    });

    for (const other of record.parties.filter(({ userId: id }) => id !== userId)) {
      void this.maxBot.sendUserNotification(
        other.user.maxAccount?.maxUserId ?? "",
        `Условия сделки согласованы второй стороной. Текущая версия: ${version.versionNumber}.`,
      );
    }
    return {
      approvalId: result.approval.id,
      approvedAt: result.approval.approvedAt.toISOString(),
      dealStatus: result.nextStatus,
      dealUpdatedAt: now.toISOString(),
      totalApproved: result.totalApproved,
      versionId: version.id,
      versionNumber: version.versionNumber,
    };
  }

  private approvalResponse(
    record: WorkspaceRecord,
    versionId: string,
    versionNumber: number,
    approval: { approvedAt: Date; id: string; partyId: string },
  ): DealApprovalResponse {
    const version = requireWorkspaceVersion(record);
    return {
      approvalId: approval.id,
      approvedAt: approval.approvedAt.toISOString(),
      dealStatus: record.status,
      dealUpdatedAt: record.updatedAt.toISOString(),
      totalApproved: version.approvals.filter(
        ({ status }) => status === DealApprovalStatus.APPROVED,
      ).length,
      versionId,
      versionNumber,
    };
  }

  private async findWorkspace(dealId: string, userId: string): Promise<WorkspaceRecord> {
    const record = await this.prisma.deal.findFirst({
      select: workspaceSelect,
      where: { id: dealId, parties: { some: { userId } } },
    });
    if (!record) throw dealNotFound();
    return record;
  }
}

function toWorkspace(record: WorkspaceRecord, userId: string): DealWorkspaceResponse {
  const version = requireWorkspaceVersion(record);
  const currentParty = record.parties.find((party) => party.userId === userId);
  if (!currentParty) throw dealNotFound();
  const counterparty = record.parties.find(
    ({ role }) => role === DealPartyRole.COUNTERPARTY,
  );
  const initiator = record.parties.find(
    ({ role }) => role === DealPartyRole.INITIATOR,
  );
  if (!initiator) throw dealNotFound();
  const approved = version.approvals.filter(
    ({ status }) => status === DealApprovalStatus.APPROVED,
  );
  const terms = parseDealDraft(version.terms);
  return {
    approvals: {
      currentUserApproved: approved.some(
        ({ partyId }) => partyId === currentParty.id,
      ),
      required: record.parties.length,
      totalApproved: approved.length,
    },
    contractDraft: version.contractDraft as DealWorkspaceResponse["contractDraft"],
    counterparty: counterparty
      ? {
          displayName: displayName(counterparty.user),
          profileCompleted: Boolean(counterparty.user.profile),
          role: counterparty.role,
        }
      : null,
    createdAt: record.createdAt.toISOString(),
    currentUserRole: currentParty.role,
    draft: terms,
    id: record.id,
    initiator: {
      displayName: displayName(initiator.user),
      profileCompleted: Boolean(initiator.user.profile),
      role: initiator.role,
    },
    invitation: record.invitations[0]
      ? toInvitationResponse(record.invitations[0])
      : null,
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

function displayName(user: WorkspaceRecord["parties"][number]["user"]): string {
  const profile = user.profile ?? user.maxAccount;
  return [profile?.lastName, profile?.firstName].filter(Boolean).join(" ") || "Участник сделки";
}

function createFreeze(
  record: WorkspaceRecord,
  version: WorkspaceRecord["versions"][number],
  frozenAt: Date,
): { hash: string; snapshot: FrozenDealSnapshot } {
  if (!version.contractDraft) throw versionConflict();
  const contractNumber = createContractNumber(record.id, version.versionNumber, frozenAt);
  const parties = [...record.parties]
    .sort((left, right) => left.role.localeCompare(right.role))
    .map((party) => {
      const phone = party.user.phones[0];
      const profile = party.user.profile;
      if (!phone || !profile) {
        throw new ConflictException({
          code: "DEAL_SIGNING_PROFILE_REQUIRED",
          message: "Перед подписанием обе стороны должны заполнить профиль и подтвердить телефон",
        });
      }
      return {
        maxUserIdRef: party.user.maxAccount?.maxUserId ?? null,
        partyId: party.id,
        profile: {
          address: profile.addressValue,
          birthDate: profile.birthDate?.toISOString().slice(0, 10) ?? null,
          email: profile.email,
          firstName: profile.firstName,
          lastName: profile.lastName,
          middleName: profile.middleName,
        },
        role: party.role,
        userId: party.userId,
        verifiedPhoneRef: phone.id,
      };
    });
  const snapshot: FrozenDealSnapshot = {
    contract: {
      draft: version.contractDraft,
      number: contractNumber,
    },
    deal: {
      id: record.id,
      templateSlug: record.templateVersion.template.slug,
      templateTitle: record.templateVersion.template.title,
      templateVersion: record.templateVersion.versionNumber,
      title: record.title,
      versionId: version.id,
      versionNumber: version.versionNumber,
    },
    frozenAt: frozenAt.toISOString(),
    parties,
    schemaVersion: "deal-signature-v1",
    terms: version.terms,
  };
  return { hash: hashFrozenSnapshot(snapshot), snapshot };
}

function toInvitationResponse(record: InvitationRecord): DealInvitationResponse {
  return {
    acceptedAt: record.acceptedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    expiresAt: record.expiresAt.toISOString(),
    id: record.id,
    maxDeeplink: null,
    publicCode: record.publicCode,
    shareText: null,
    shareUrl: null,
    state: invitationState(record),
  };
}

function invitationState(record: {
  acceptedAt: Date | null;
  expiresAt: Date;
  revokedAt: Date | null;
}): DealInvitationState {
  if (record.revokedAt) return "REVOKED";
  if (record.acceptedAt) return "ACCEPTED";
  if (record.expiresAt.getTime() <= Date.now()) return "EXPIRED";
  return "ACTIVE";
}

function assertActiveInvitation(
  invitation: InvitationRecord | undefined,
  invitationId: string,
): asserts invitation is InvitationRecord {
  if (!invitation || invitation.id !== invitationId) throw invitationNotFound();
  if (invitationState(invitation) !== "ACTIVE") throw invitationUnavailable();
}

function assertInvitationUsable(invitation: {
  acceptedAt: Date | null;
  expiresAt: Date;
  revokedAt: Date | null;
}): void {
  if (invitationState(invitation) !== "ACTIVE") throw invitationUnavailable();
}

function assertInitiator(record: WorkspaceRecord, userId: string): void {
  if (record.initiatorUserId === userId) return;
  throw new ForbiddenException({
    code: "DEAL_INVITATION_FORBIDDEN",
    message: "Управлять приглашением может только инициатор сделки",
  });
}

function requireWorkspaceVersion(record: WorkspaceRecord) {
  const version = record.versions[0];
  if (!version) throw versionConflict();
  return version;
}

function parseDealDraft(value: Prisma.JsonValue): DealDraftData {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw versionConflict();
  }
  const draft = value as unknown as Partial<DealDraftData>;
  if (
    typeof draft.answers !== "object" ||
    draft.answers === null ||
    Array.isArray(draft.answers) ||
    typeof draft.description !== "string" ||
    !draft.creationPath ||
    !draft.currentStep
  ) {
    throw versionConflict();
  }
  return draft as DealDraftData;
}

const SAFE_TERM_KEYS: Readonly<Record<string, readonly string[]>> = {
  "movable-property-sale": ["price", "transferDate", "paymentMethod"],
  "paid-services": ["completionDate", "paymentAmount", "paymentProcedure"],
  "personal-loan": [
    "loanAmount",
    "returnDate",
    "interestType",
    "interestRate",
    "earlyRepaymentAllowed",
  ],
  "property-rental": [
    "startDate",
    "endDate",
    "paymentAmount",
    "paymentFrequency",
    "depositAmount",
    "utilitiesIncluded",
  ],
  "work-contract": ["startDate", "endDate", "price", "materialsIncluded"],
};

const SAFE_SUBJECTS: Readonly<Record<string, string>> = {
  "movable-property-sale": "Движимое имущество",
  "paid-services": "Оказание согласованной услуги",
  "personal-loan": "Передача денежных средств",
  "property-rental": "Имущество во временное пользование",
  "work-contract": "Выполнение согласованных работ",
};

function publicTerms(
  slug: string,
  answers: Record<string, unknown>,
  schema: Prisma.JsonValue,
): PublicInvitationTerm[] {
  const properties =
    typeof schema === "object" && schema !== null && !Array.isArray(schema) &&
    "properties" in schema && typeof schema.properties === "object" &&
    schema.properties !== null && !Array.isArray(schema.properties)
      ? (schema.properties as Record<string, unknown>)
      : {};
  const subject = SAFE_SUBJECTS[slug];
  const terms: PublicInvitationTerm[] = subject
    ? [{ label: "Предмет сделки", value: subject }]
    : [];
  return terms.concat((SAFE_TERM_KEYS[slug] ?? []).flatMap((key) => {
    const value = answers[key];
    if (value === undefined || value === null || value === "") return [];
    const property = properties[key];
    const label =
      typeof property === "object" && property !== null && "title" in property &&
      typeof property.title === "string"
        ? property.title
        : "Условие";
    return [{ label, value: formatPublicValue(key, value) }];
  }));
}

function formatPublicValue(key: string, value: unknown): string {
  if (typeof value === "boolean") return value ? "Да" : "Нет";
  if (typeof value === "number") {
    const formatted = new Intl.NumberFormat("ru-RU").format(value);
    return /amount|price/i.test(key) ? `${formatted} ₽` : formatted;
  }
  if (typeof value === "string" && /date/i.test(key) && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC" }).format(
      new Date(`${value}T00:00:00Z`),
    );
  }
  return String(value).slice(0, 120);
}

function maskName(firstName?: string | null, lastName?: string | null): string {
  const mask = (value?: string | null) =>
    value?.trim() ? `${value.trim().slice(0, 1).toLocaleUpperCase("ru")}•••` : "";
  return [mask(firstName), mask(lastName)].filter(Boolean).join(" ") || "Участник MAX";
}

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function matchesToken(rawToken: string, storedHash: string): boolean {
  const actual = Buffer.from(hashToken(rawToken), "hex");
  const expected = Buffer.from(storedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function invitationPayload(publicCode: string, rawToken: string): string {
  return `invite_${publicCode}_${rawToken}`;
}

function invitationNotFound(): NotFoundException {
  return new NotFoundException({
    code: "DEAL_INVITATION_NOT_FOUND",
    message: "Приглашение не найдено",
  });
}

function invitationUnavailable(): ConflictException {
  return new ConflictException({
    code: "DEAL_INVITATION_UNAVAILABLE",
    message: "Ссылка уже использована, отозвана или истекла",
  });
}

function dealNotFound(): NotFoundException {
  return new NotFoundException({
    code: "DEAL_NOT_FOUND",
    message: "Сделка не найдена",
  });
}

function versionConflict(): ConflictException {
  return new ConflictException({
    code: "DEAL_VERSION_CONFLICT",
    message: "Условия сделки изменились. Обновите данные",
  });
}
