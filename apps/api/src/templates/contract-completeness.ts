import type { AiClarificationQuestion } from "@max-contract/contracts";

export const COMPLETENESS_VERSION = "1.0.0";
type Answers = Record<string, unknown>;
type Rule = {
  id: string;
  label: string;
  description: string;
  keys: string[];
  valid: (text: string) => boolean;
};
const meaningful = (text: string) =>
  text.length >= 5 &&
  !/^(не знаю|потом|позже|нет|да|неважно|как обычно|по договоренности|по согласованию|уточним)[.! ]*$/u.test(
    text,
  );
export function normalizeTerm(value: string): string {
  return value
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    .replace(/\s+/g, " ")
    .trim();
}
function location(text: string, remote = true): boolean {
  if (!meaningful(text)) return false;
  if (
    remote &&
    /(онлайн|online|дистанционно|удаленно|по видеосвязи|доставк.*(пункт|курьер)|пункт.*выдачи)/u.test(
      text,
    )
  )
    return true;
  return (
    /[а-яa-z]{3}/u.test(text) &&
    /\d/u.test(text) &&
    (/(улиц|ул\.|проспект|пр-т|переул|шоссе|набереж|площадь\s+[а-я-]{3,}\s*\d|дом\s*\d|д\.\s*\d)/u.test(
      text,
    ) ||
      /(?:москва|санкт-петербург|ростов-на-дону|г\.\s*[а-я-]+)[, ]+[а-я -]{3,}\s+\d/u.test(
        text,
      ))
  );
}
function payment(text: string): boolean {
  if (
    !meaningful(text) ||
    !/(оплат|платеж|расчет|предоплат|аванс|стоимост)/u.test(text)
  )
    return false;
  if (/(предоплат|аванс)/u.test(text)) {
    return (
      /100\s*%|полная предоплата|полностью.*(до|перед)/u.test(text) ||
      (/\d/u.test(text) &&
        /(остат|остальн|окончательн)/u.test(text) &&
        /(после|при |в течение|до \d)/u.test(text))
    );
  }
  return /(после|при передач|при получ|при подпис|до \d|кажд.*\d|в течение.*\d|ежедневно.*(утр|вечер))/u.test(
    text,
  );
}
const acceptance = (text: string) =>
  meaningful(text) &&
  /(по акту|актом|подпис.*акт|акт.*подпис|осмотр.*акт|приемк.*(осмотр|провер)|подтвержд.*(письм|email|почт|сообщен)|провер.*результат.*\d)/u.test(
    text,
  );
const rule = (
  id: string,
  label: string,
  description: string,
  keys: string[],
  valid: Rule["valid"],
): Rule => ({ id, label, description, keys, valid });
const place = rule(
  "termsLocation",
  "Где именно выполняется сделка?",
  "Укажите конкретное место: город, улицу, дом и помещение. Для удалённого исполнения можно написать «онлайн» и способ передачи результата.",
  [
    "workLocation",
    "serviceLocation",
    "transferLocation",
    "propertyAddress",
    "address",
    "location",
  ],
  location,
);
const pay = rule(
  "termsPayment",
  "Когда и в каком порядке производится оплата?",
  "Укажите срок оплаты. Если есть аванс — его размер и когда оплачивается остаток. Сумму, уже указанную в анкете, повторять не нужно.",
  ["paymentProcedure", "paymentTerms", "paymentSchedule", "paymentOrder"],
  payment,
);
const accept = rule(
  "termsAcceptance",
  "Как стороны передают и принимают результат?",
  "Опишите способ проверки и подтверждения приёмки: например, совместный осмотр и акт либо письменное подтверждение результата.",
  [
    "acceptanceProcedure",
    "acceptanceTerms",
    "handoverProcedure",
    "handoverTerms",
  ],
  acceptance,
);

function rulesFor(slug: string, input: Answers): Rule[] {
  switch (slug) {
    case "work-contract":
      return [
        { ...place, label: "Где именно будут выполняться работы?" },
        pay,
        accept,
        ...(input.materialsIncluded === false
          ? [
              rule(
                "termsMaterials",
                "Кто предоставляет и оплачивает материалы?",
                "Укажите, кто закупает материалы и как согласуются и возмещаются отдельные расходы.",
                ["materialsTerms", "materialsPayment"],
                (text) =>
                  meaningful(text) &&
                  /(материал|расходник)/u.test(text) &&
                  /(заказчик|исполнитель|собственник)/u.test(text),
              ),
            ]
          : []),
      ];
    case "paid-services":
      return [
        { ...place, label: "Где или каким способом оказывается услуга?" },
        pay,
        accept,
      ];
    case "property-rental":
      return [
        rule(
          "termsProperty",
          "Уточните имущество или его местонахождение",
          "Для помещения укажите адрес. Для автомобиля или другой вещи — модель и идентификатор либо отличительные характеристики.",
          ["propertyDescription", "propertyIdentifier", "propertyAddress"],
          (text) =>
            location(text, false) ||
            (meaningful(text) &&
              /(vin|серийн|госномер|регистрационн.*номер|модель|инвентарн|идентификатор)/u.test(
                text,
              ) &&
              /\d/u.test(text)),
        ),
        pay,
        { ...accept, label: "Как передаётся и возвращается имущество?" },
        ...(input.utilitiesIncluded === false
          ? [
              rule(
                "termsUtilities",
                "Как оплачиваются коммунальные расходы?",
                "Укажите плательщика и порядок расчёта: например, арендатор по счетам или показаниям счётчиков.",
                ["utilitiesTerms", "utilitiesPayer"],
                (text) =>
                  meaningful(text) &&
                  /(коммун|счет|счетчик)/u.test(text) &&
                  /(арендатор|арендодатель|наниматель|поровну|tenant|landlord)/u.test(
                    text,
                  ),
              ),
            ]
          : []),
        ...(typeof input.depositAmount === "number" && input.depositAmount > 0
          ? [
              rule(
                "termsDeposit",
                "Когда возвращается обеспечительный платёж?",
                "Укажите срок возврата после окончания аренды и условия возможных удержаний.",
                ["depositReturn", "depositTerms"],
                (text) =>
                  meaningful(text) &&
                  /(возврат|возвращ|верну)/u.test(text) &&
                  /(после|при |в течение|дн|день)/u.test(text) &&
                  /(удерж|ущерб|долг|без удерж)/u.test(text),
              ),
            ]
          : []),
      ];
    case "movable-property-sale":
      return [
        { ...place, label: "Где или каким способом передаётся имущество?" },
        pay,
        { ...accept, label: "Как покупатель проверяет и принимает имущество?" },
        ...(input.paymentMethod === "Иной согласованный способ"
          ? [
              rule(
                "termsPaymentMethod",
                "Какой именно способ оплаты выбран?",
                "Опишите конкретный способ расчёта, не указывая банковские реквизиты или номер карты.",
                ["paymentMethodDetails"],
                (text) =>
                  /(сбп|кошелек|перевод|наличн|взаимозачет|бартер|аккредитив|эскроу)/u.test(text),
              ),
            ]
          : []),
      ];
    case "personal-loan":
      return [
        rule(
          "termsLoanTransfer",
          "Когда и как передаются деньги по займу?",
          "Укажите дату или срок передачи и способ: банковский перевод либо наличные. Если деньги уже переданы, укажите когда и как.",
          ["loanTransfer", "transferTerms"],
          (text) =>
            meaningful(text) &&
            /(перевод|наличн|банк)/u.test(text) &&
            /(\d{4}-\d{2}-\d{2}|\d{1,2}[./]\d{1,2}[./]\d{4}|\d{1,2} (январ|феврал|март|апрел|мая|июн|июл|август|сентябр|октябр|ноябр|декабр)|при подпис|в день подпис|в течение \d+ дн)/u.test(
              text,
            ),
        ),
        rule(
          "termsLoanRepayment",
          "Как возвращается заём?",
          "Одним платежом в указанную дату или частями? Для возврата частями укажите суммы и сроки платежей.",
          ["repaymentProcedure", "repaymentSchedule"],
          (text) =>
            meaningful(text) &&
            (/одним платежом|единовременно|полностью.*(срок|дат)/u.test(text) ||
              (/\d/u.test(text) && /(ежемесяч|график|платеж)/u.test(text))),
        ),
        ...(input.interestType === "С процентами" &&
        Number(input.interestRate) > 0
          ? [
              rule(
                "termsInterest",
                "Когда уплачиваются проценты?",
                "Ставка уже указана. Уточните сроки уплаты процентов: вместе с возвратом займа или отдельными платежами.",
                ["interestPayment", "interestSchedule"],
                (text) =>
                  meaningful(text) &&
                  /(процент)/u.test(text) &&
                  /(вместе|возврат|ежемесяч|\d)/u.test(text),
              ),
            ]
          : []),
      ];
    default:
      return [];
  }
}

function answerText(value: unknown): string {
  return typeof value === "string" ? normalizeTerm(value) : "";
}
/** Facts may already be in the free-form questionnaire: never infer absence from key names alone. */
export function missingContractTerms(
  slug: string,
  input: Answers,
  answers: Answers = {},
  history: AiClarificationQuestion[] = [],
): AiClarificationQuestion[] {
  const all = { ...input, ...answers };
  const texts = Object.values(all).map(answerText).filter(Boolean);
  return rulesFor(slug, input)
    .filter((item) => {
      const direct = answerText(answers[item.id]);
      if (
        direct &&
        item.valid((item.id === "termsPayment" ? "оплата " : "") + direct)
      )
        return false;
      if (
        item.keys.some((key) =>
          item.valid(
            (item.id === "termsPayment" ? "оплата " : "") +
              answerText(all[key]),
          ),
        )
      )
        return false;
      if (texts.some((text) => item.valid(text))) return false;
      // Resolve select option values to their human-readable label before checking.
      return !history.some((question) => {
        const value = answers[question.id];
        const label = question.options.find(
          (option) => option.value === value,
        )?.label;
        return label ? item.valid(normalizeTerm(label)) : false;
      });
    })
    .map(({ id, label, description }) => ({
      id,
      label,
      description,
      options: [],
      required: true,
      type: "short_text",
    }));
}

export function invalidRequiredTermAnswers(
  slug: string,
  input: Answers,
  answers: Answers,
): Array<{ path: string; message: string }> {
  return rulesFor(slug, input)
    .filter(
      (item) =>
        item.id in answers &&
        !item.valid(
          (item.id === "termsPayment" ? "оплата " : "") +
            answerText(answers[item.id]),
        ),
    )
    .map((item) => ({ path: item.id, message: item.description }));
}

export function knownContractTerms(
  slug: string,
  input: Answers,
  answers: Answers = {},
  history: AiClarificationQuestion[] = [],
): AiClarificationQuestion[] {
  const missing = new Set(
    missingContractTerms(slug, input, answers, history).map((item) => item.id),
  );
  return rulesFor(slug, input)
    .filter((item) => !missing.has(item.id))
    .map(({ id, label, description }) => ({
      id,
      label,
      description,
      options: [],
      required: true,
      type: "short_text",
    }));
}

export function isCompletenessSession(metadata: unknown): boolean {
  return Boolean(
    metadata &&
      typeof metadata === "object" &&
      "completenessVersion" in metadata,
  );
}
