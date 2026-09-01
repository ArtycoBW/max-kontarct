import path from "node:path";
import { createRequire } from "node:module";

import type { ContractStructuredDraft } from "@max-contract/contracts";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";

import type { FrozenDealSnapshot } from "../deals/deal-version-freeze";

export interface PdfSignatureData {
  displayName: string;
  otpChannel: string;
  pepDocumentVersion: string;
  role: "INITIATOR" | "COUNTERPARTY";
  signedAt: Date;
}

export interface FinalContractPdfInput {
  signatureHash: string;
  signatures: PdfSignatureData[];
  snapshot: FrozenDealSnapshot;
  verifyUrl: string;
}

const moduleRequire = createRequire(__filename);
const fontRoot = path.join(path.dirname(moduleRequire.resolve("dejavu-fonts-ttf/package.json")), "ttf");

export async function renderFinalContractPdf(input: FinalContractPdfInput): Promise<Buffer> {
  const qr = await QRCode.toBuffer(input.verifyUrl, { errorCorrectionLevel: "M", margin: 1, width: 180 });
  const doc = new PDFDocument({ bufferPages: true, info: {
    Author: "Макс-Контракт",
    CreationDate: new Date(input.snapshot.frozenAt),
    Subject: `Итоговый договор ${input.snapshot.contract.number}`,
    Title: readDraft(input.snapshot).title,
  }, margins: { bottom: 64, left: 54, right: 54, top: 54 }, size: "A4" });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const completed = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.registerFont("PTSans", path.join(fontRoot, "DejaVuSans.ttf"));
  doc.registerFont("PTSans-Bold", path.join(fontRoot, "DejaVuSans-Bold.ttf"));
  const draft = readDraft(input.snapshot);

  doc.font("PTSans-Bold").fontSize(9).fillColor("#ff3b24").text("МАКС-КОНТРАКТ", { align: "center", characterSpacing: 1.3 });
  doc.moveDown(0.8).fontSize(17).fillColor("#35120d").text(draft.title, { align: "center" });
  doc.moveDown(0.35).font("PTSans").fontSize(9).fillColor("#75645f").text(`Договор № ${input.snapshot.contract.number}`, { align: "center" });
  doc.moveDown(1.5).fontSize(10).fillColor("#35120d").text(draft.preamble, { align: "justify", lineGap: 3 });

  for (const [index, section] of draft.sections.entries()) {
    ensureSpace(doc, 90);
    doc.moveDown(index === 0 ? 1.2 : 1).font("PTSans-Bold").fontSize(12).fillColor("#35120d").text(`${index + 1}. ${section.heading}`);
    doc.moveDown(0.45).font("PTSans").fontSize(10).fillColor("#35120d");
    section.clauses.forEach((clause, clauseIndex) => {
      doc.text(`${index + 1}.${clauseIndex + 1}. ${clause}`, { align: "justify", lineGap: 3 });
      doc.moveDown(0.45);
    });
  }

  ensureSpace(doc, 210);
  sectionTitle(doc, "Реквизиты сторон");
  for (const party of input.snapshot.parties) {
    const role = party.role === "INITIATOR" ? "Инициатор" : "Контрагент";
    doc.font("PTSans-Bold").fontSize(10).fillColor("#35120d").text(`${role}: ${fullName(party.profile)}`);
    doc.font("PTSans").fontSize(9).fillColor("#75645f");
    detail(doc, "Дата рождения", party.profile.birthDate ?? "не указана");
    detail(doc, "Адрес регистрации", party.profile.address ?? "не указан");
    detail(doc, "Электронная почта", party.profile.email ?? "не указана");
    detail(doc, "Подтверждённый номер", `реестр ${party.verifiedPhoneRef}`);
    doc.moveDown(0.8);
  }

  ensureSpace(doc, 235);
  sectionTitle(doc, "Подписание простой электронной подписью");
  doc.font("PTSans").fontSize(9).fillColor("#35120d").text(
    "Стороны подтвердили неизменяемую версию договора одноразовыми кодами. Записи подписей связаны с указанным SHA-256.",
    { lineGap: 3 },
  );
  doc.moveDown(0.7);
  for (const signature of input.signatures) {
    doc.font("PTSans-Bold").fontSize(9).text(signature.displayName);
    doc.font("PTSans").fillColor("#75645f").text(`${signature.role === "INITIATOR" ? "Инициатор" : "Контрагент"} · подписано ${formatDateTime(signature.signedAt)} · ПЭП ${signature.pepDocumentVersion} · канал ${signature.otpChannel}`);
    doc.moveDown(0.55);
  }
  doc.moveDown(0.5).font("PTSans-Bold").fillColor("#35120d").text("SHA-256 подписанной версии:");
  doc.font("PTSans").fontSize(8).fillColor("#75645f").text(input.signatureHash, { characterSpacing: 0.15 });

  ensureSpace(doc, 190);
  doc.moveDown(1.2);
  const qrTop = doc.y;
  const qrLeft = doc.x;
  const qrCopyLeft = qrLeft + 104;
  doc.image(qr, qrLeft, qrTop, { width: 86 });
  doc.font("PTSans-Bold").fontSize(10).fillColor("#35120d").text("Проверка документа", qrCopyLeft, qrTop + 6, { width: 330 });
  doc.font("PTSans").fontSize(8).fillColor("#75645f").text("QR-код ведёт на публичную страницу проверки номера, статуса, даты подписания и контрольной суммы без раскрытия персональных данных.", qrCopyLeft, qrTop + 25, { lineGap: 3, width: 330 });
  doc.fillColor("#ff3b24").text(input.verifyUrl, qrCopyLeft, qrTop + 76, { link: input.verifyUrl, underline: true, width: 330 });
  doc.y = qrTop + 105;

  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    doc.page.margins.bottom = 0;
    doc.font("PTSans").fontSize(8).fillColor("#9a8882").text(
      `${input.snapshot.contract.number} · страница ${index + 1} из ${range.count}`,
      54,
      doc.page.height - 39,
      { align: "center", lineBreak: false, width: doc.page.width - 108 },
    );
  }
  doc.end();
  return completed;
}

function readDraft(snapshot: FrozenDealSnapshot): ContractStructuredDraft {
  const value = snapshot.contract.draft as Partial<ContractStructuredDraft> | null;
  if (!value || typeof value.title !== "string" || typeof value.preamble !== "string" || !Array.isArray(value.sections)) {
    throw new Error("Frozen contract draft is invalid");
  }
  return value as ContractStructuredDraft;
}

function sectionTitle(doc: PDFKit.PDFDocument, value: string): void {
  doc.moveDown(1).font("PTSans-Bold").fontSize(12).fillColor("#35120d").text(value);
  doc.moveDown(0.6);
}

function detail(doc: PDFKit.PDFDocument, label: string, value: string): void {
  doc.text(`${label}: ${value}`, { lineGap: 2 });
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
  if (doc.y + needed > doc.page.height - 64) doc.addPage();
}

function fullName(profile: FrozenDealSnapshot["parties"][number]["profile"]): string {
  return [profile.lastName, profile.firstName, profile.middleName].filter(Boolean).join(" ");
}

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit", hour: "2-digit", minute: "2-digit", month: "long", timeZone: "Europe/Moscow", year: "numeric",
  }).format(value);
}
