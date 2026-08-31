import { ConflictException } from "@nestjs/common";
import { DealStatus } from "@prisma/client";

import { DealStateMachineService } from "./deal-state-machine.service";

const mainFlow: readonly DealStatus[] = [
  DealStatus.DRAFT,
  DealStatus.COLLECTING_DATA,
  DealStatus.INVITATION_READY,
  DealStatus.INVITED,
  DealStatus.COUNTERPARTY_JOINED,
  DealStatus.DOCUMENTS_PENDING,
  DealStatus.DOCUMENTS_REVIEW,
  DealStatus.CONTRACT_DRAFT,
  DealStatus.TERMS_REVIEW,
  DealStatus.READY_TO_SIGN,
  DealStatus.SIGNED_BY_ONE,
  DealStatus.SIGNED,
  DealStatus.COMPLETED,
];

describe("DealStateMachineService", () => {
  const stateMachine = new DealStateMachineService();

  it("allows the complete successful deal flow", () => {
    for (let index = 0; index < mainFlow.length - 1; index += 1) {
      const from = mainFlow[index]!;
      const to = mainFlow[index + 1]!;

      expect(stateMachine.transition(from, to)).toBe(to);
    }
  });

  it("allows explicit correction loops before signing", () => {
    expect(
      stateMachine.canTransition(
        DealStatus.INVITATION_READY,
        DealStatus.COLLECTING_DATA,
      ),
    ).toBe(true);
    expect(
      stateMachine.canTransition(
        DealStatus.DOCUMENTS_REVIEW,
        DealStatus.DOCUMENTS_PENDING,
      ),
    ).toBe(true);
    expect(
      stateMachine.canTransition(
        DealStatus.TERMS_REVIEW,
        DealStatus.CONTRACT_DRAFT,
      ),
    ).toBe(true);
    expect(
      stateMachine.canTransition(
        DealStatus.READY_TO_SIGN,
        DealStatus.TERMS_REVIEW,
      ),
    ).toBe(true);
  });

  it("allows cancellation only before both parties have signed", () => {
    const cancellable = Object.values(DealStatus).filter(
      (status) =>
        status !== DealStatus.SIGNED &&
        status !== DealStatus.COMPLETED &&
        status !== DealStatus.CANCELED,
    );

    for (const status of cancellable) {
      expect(stateMachine.canTransition(status, DealStatus.CANCELED)).toBe(true);
    }
    expect(stateMachine.canTransition(DealStatus.SIGNED, DealStatus.CANCELED)).toBe(false);
    expect(stateMachine.canTransition(DealStatus.COMPLETED, DealStatus.CANCELED)).toBe(false);
  });

  it("rejects every transition that is absent from the explicit graph", () => {
    for (const from of Object.values(DealStatus)) {
      const allowed = new Set(stateMachine.allowedTransitions(from));

      for (const to of Object.values(DealStatus)) {
        if (allowed.has(to)) continue;

        expect(() => stateMachine.transition(from, to)).toThrow(
          ConflictException,
        );
      }
    }
  });

  it("returns a defensive copy of allowed targets", () => {
    const transitions = stateMachine.allowedTransitions(DealStatus.DRAFT) as DealStatus[];
    transitions.push(DealStatus.COMPLETED);

    expect(stateMachine.canTransition(DealStatus.DRAFT, DealStatus.COMPLETED)).toBe(false);
  });

  it("returns a stable domain error for forbidden transitions", () => {
    expect.assertions(1);

    try {
      stateMachine.assertTransition(DealStatus.DRAFT, DealStatus.SIGNED);
    } catch (error) {
      expect((error as ConflictException).getResponse()).toEqual({
        code: "DEAL_TRANSITION_NOT_ALLOWED",
        details: { from: DealStatus.DRAFT, to: DealStatus.SIGNED },
        message: "Недопустимый переход состояния сделки",
      });
    }
  });
});
