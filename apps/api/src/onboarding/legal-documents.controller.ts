import { Controller, Get } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { pepAgreement } from "../signing/pep-agreement";

// Explanatory drafts only. Do not mark these texts approved by changing an env version.
@Controller("public/legal-documents")
export class LegalDocumentsController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  list() {
    const pep = pepAgreement(this.config.getOrThrow<string>("CONSENT_ELECTRONIC_SIGNATURE_VERSION"));
    return { items: [
      {
        type: "PERSONAL_DATA", title: "Обработка персональных данных",
        version: this.config.getOrThrow<string>("CONSENT_PERSONAL_DATA_VERSION"),
        paragraphs: [
          "Сервис использует сведения аккаунта MAX, подтверждённый телефон и данные, которые пользователь вводит в профиль и сделку, для подготовки, согласования и подписания документов.",
          "Документы сделки доступны в соответствии с правами участников. Не загружайте чужие персональные данные без законного основания. Для демонстрации используйте вымышленные сведения.",
          "Для окончательного текста заказчик должен указать оператора и его контакты, состав и цели обработки, получателей данных, сроки хранения, порядок отзыва согласия и реализации прав пользователя.",
        ],
      },
      {
        type: "TERMS_OF_USE", title: "Пользовательские условия / оферта",
        version: this.config.getOrThrow<string>("CONSENT_TERMS_VERSION"),
        paragraphs: [
          "Макс-Контракт помогает подготовить проект договора, пригласить вторую сторону, согласовать одну редакцию и подтвердить её одноразовым кодом.",
          "ИИ может допускать ошибки. До согласования проверьте условия, суммы, даты и сведения участников. Сервис не гарантирует исполнение обязательств другой стороной.",
          "Окончательная редакция должна определять владельца сервиса, порядок оказания услуг, стоимость и оплату, права и обязанности, ограничения ответственности и порядок рассмотрения обращений.",
        ],
      },
      { type: "ELECTRONIC_SIGNATURE", title: pep.title, version: pep.version, paragraphs: pep.paragraphs },
      {
        type: "STATUS_NOTIFICATIONS", title: "Согласие на сервисные уведомления",
        version: this.config.getOrThrow<string>("CONSENT_STATUS_NOTIFICATIONS_VERSION"),
        paragraphs: [
          "Уведомления сообщают об изменениях статуса сделки, присоединении участника, согласовании и готовности документов. Этот пункт не означает согласие на рекламу.",
          "Согласие на уведомления о статусах необязательно. Отказ не препятствует работе со сделками. Одноразовые коды запрашиваются отдельно в процессе подписания.",
          "В финальной редакции необходимо указать отправителя, каналы доставки и доступный пользователю порядок отключения уведомлений.",
        ],
      },
    ].map(item => ({ ...item, status: "DRAFT" as const })) };
  }
}
