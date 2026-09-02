import { ConflictException, Injectable } from "@nestjs/common";
import { DealStatus } from "@prisma/client";

const transitionGraph: Readonly<Record<DealStatus, readonly DealStatus[]>> = {
  [DealStatus.DRAFT]: [DealStatus.COLLECTING_DATA, DealStatus.CANCELED],
  [DealStatus.COLLECTING_DATA]: [
    DealStatus.INVITATION_READY,
    DealStatus.CANCELED,
  ],
  [DealStatus.INVITATION_READY]: [
    DealStatus.COLLECTING_DATA,
    DealStatus.INVITED,
    DealStatus.CANCELED,
  ],
  [DealStatus.INVITED]: [
    DealStatus.INVITATION_READY,
    DealStatus.COUNTERPARTY_JOINED,
    DealStatus.CANCELED,
  ],
  [DealStatus.COUNTERPARTY_JOINED]: [
    DealStatus.DOCUMENTS_PENDING,
    DealStatus.TERMS_REVIEW,
    DealStatus.CANCELED,
  ],
  [DealStatus.DOCUMENTS_PENDING]: [
    DealStatus.DOCUMENTS_REVIEW,
    DealStatus.CANCELED,
  ],
  [DealStatus.DOCUMENTS_REVIEW]: [
    DealStatus.DOCUMENTS_PENDING,
    DealStatus.CONTRACT_DRAFT,
    DealStatus.CANCELED,
  ],
  [DealStatus.CONTRACT_DRAFT]: [
    DealStatus.DOCUMENTS_REVIEW,
    DealStatus.TERMS_REVIEW,
    DealStatus.CANCELED,
  ],
  [DealStatus.TERMS_REVIEW]: [
    DealStatus.CONTRACT_DRAFT,
    DealStatus.READY_TO_SIGN,
    DealStatus.CANCELED,
  ],
  [DealStatus.READY_TO_SIGN]: [
    DealStatus.TERMS_REVIEW,
    DealStatus.SIGNED_BY_ONE,
    DealStatus.CANCELED,
  ],
  [DealStatus.SIGNED_BY_ONE]: [DealStatus.SIGNED, DealStatus.CANCELED],
  [DealStatus.SIGNED]: [DealStatus.COMPLETED],
  [DealStatus.COMPLETED]: [],
  [DealStatus.CANCELED]: [],
};

@Injectable()
export class DealStateMachineService {
  canTransition(from: DealStatus, to: DealStatus): boolean {
    return transitionGraph[from].includes(to);
  }

  assertTransition(from: DealStatus, to: DealStatus): void {
    if (this.canTransition(from, to)) return;

    throw new ConflictException({
      code: "DEAL_TRANSITION_NOT_ALLOWED",
      details: { from, to },
      message: "Недопустимый переход состояния сделки",
    });
  }

  transition(from: DealStatus, to: DealStatus): DealStatus {
    this.assertTransition(from, to);
    return to;
  }

  allowedTransitions(from: DealStatus): readonly DealStatus[] {
    return [...transitionGraph[from]];
  }
}
