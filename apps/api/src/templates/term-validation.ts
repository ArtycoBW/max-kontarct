/** Deterministic completeness checks, not a legal opinion or a rewrite of user terms. */
const VAGUE = /^(?:не знаю|потом|позже|нет|да|неважно|как обычно|по договоренности|по согласованию|уточним)[.! ]*$/u;
const EVENT = "(?:приемк|передач|получени|подписани|завершени|окончани|оказани|выполнени|начал|выставлени|счет|акт|результат|доставк|отгрузк|заселени|возврат|сдач|согласовани|утверждени|готовност)[а-я]*";
const NUMBER = "(?:\\d+|одного|один|одной|одну|двух|два|две|трех|три|пяти|пять|семи|семь|десяти|десять)";
const UNIT = "(?:рабочих\\s+|календарных\\s+)?(?:дней|дня|день|суток|сутки|часов|часа|час|недель|недели|неделю|месяцев|месяца|месяц)";
const ADVANCE = /(?:предоплат|аванс)[а-я]*/u;
const NO_ADVANCE = /(?:без\s+(?:аванса|предоплаты|авансовых\s+платежей)|нет\s+(?:аванса|предоплаты)|не\s+(?:нуж[а-я]*|требуется|предусмотрен[а-я]*)\s+(?:аванс[а-я]*|предоплат[а-я]*)|(?:аванс[а-я]*|предоплат[а-я]*)\s*(?:—|–|-|:)?\s*(?:нет|отсутствует|не\s+(?:будет|нуж[а-я]*|требуется|предусмотрен[а-я]*|внос[а-я]*|оплачива[а-я]*|планируется))|(?:аванс|предоплата)\s*(?:—|–|-|:)?\s*0\s*(?:%|руб[а-я.]*))/gu;
const BALANCE = /(?:остаток|остатк[а-я]*|остальн[а-я]*\s+(?:сумм[а-я]*|част[а-я]*|\d+\s*%)|окончательн[а-я]*\s+расчет)/u;

export function hasPaymentTime(text: string): boolean {
  // A colloquial on-site settlement is an explicit event, not an inferred acceptance date.
  const conversational = text.replace(/не\s+(?:сразу\s+на\s+месте|на\s+месте\s+сразу|при\s+встрече)/gu, " ");
  const onSite = /(?:^|[\s,;.!])(?:сразу\s+на\s+месте|на\s+месте\s+сразу|при\s+встрече)(?=$|[\s,;.!])/u.test(conversational)
    && !/(?:может быть|возможно|наверное|если получится|не сразу)/u.test(text);
  text = text.replace(new RegExp(`не\\s+(?:после|перед|до|при|в день)\\s+(?:[а-я]+\\s+){0,2}${EVENT}`, "gu"), " ");
  return onSite || new RegExp(`(?:после|перед|до|при|в день|по факту|по|с момента)\\s+(?:[а-я]+\\s+){0,2}${EVENT}`, "u").test(text)
    || /(?:^|\D)(?:\d{4}-\d{2}-\d{2}|\d{1,2}[./]\d{1,2}[./]\d{4})(?:\D|$)/u.test(text)
    || /\d{1,2}\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)(?:\s+\d{4})?/u.test(text)
    || /(?:ежемесячно|каждый месяц|еженедельно|каждую неделю|ежедневно|каждый день|каждого месяца)/u.test(text)
    || new RegExp(`(?:в течение|через|не позднее)\\s+${NUMBER}\\s+${UNIT}\\s+(?:после|с момента|со дня)\\s+${EVENT}`, "u").test(text);
}

export function paymentIssue(text: string, direct = false): string | null {
  const value = text.trim();
  if (!value || VAGUE.test(value)) return "Не указан момент оплаты. Например: «В день приёмки, аванса нет».";
  for (const match of value.matchAll(/(?<!\d)(\d{1,2})[./](\d{1,2})[./](\d{4})(?!\d)|(\d{4})-(\d{2})-(\d{2})/gu)) {
    const day = Number(match[1] ?? match[6]), month = Number(match[2] ?? match[5]), year = Number(match[3] ?? match[4]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "В сроке оплаты указана несуществующая дата. Проверьте день, месяц и год.";
  }
  if (!direct && !/(оплат|платеж|расчет|предоплат|аванс|стоимост)/u.test(value)) return "Не найдено условие об оплате.";
  const withoutNegation = value.replace(NO_ADVANCE, " ");
  const noAdvance = withoutNegation !== value;
  const advance = ADVANCE.exec(withoutNegation);
  if (advance) {
    if (noAdvance) return "Условия противоречат друг другу: указаны и отсутствие аванса, и предоплата. Оставьте один согласованный вариант.";
    const leadingAmount = withoutNegation.slice(0, advance.index).match(/(?:\d[\d ]*(?:[.,]\d+)?\s*(?:%|руб[а-я.]*|₽)|половина|треть|четверть)\s*$/u)?.[0] ?? "";
    const advancePart = leadingAmount + withoutNegation.slice(advance.index);
    const balance = BALANCE.exec(advancePart);
    const upfront = balance ? advancePart.slice(0, balance.index) : advancePart;
    const full = /100\s*%|(?:полная|полностью|вся сумма)/u.test(upfront) || /полная\s+предоплата/u.test(withoutNegation);
    const percentages = [...advancePart.matchAll(/(\d+(?:[.,]\d+)?)\s*%/gu)].map(match => Number(match[1]!.replace(",", ".")));
    if (percentages.some(amount => amount <= 0 || amount > 100) || (percentages.length > 1 && Math.abs(percentages.reduce((a, b) => a + b, 0) - 100) > .01)) {
      return "Проверьте доли оплаты: аванс и остаток должны составлять 100%, каждая доля — больше 0 и не больше 100%.";
    }
    if (full && !balance) return null; // «Предоплата 100%» explicitly means payment before performance.
    if (!/\d+(?:[.,]\d+)?\s*(?:%|руб[а-я.]*|₽)|(?:половин[а-я]*|треть|четверть)/u.test(upfront)) {
      return "Указан аванс, но не его размер. Добавьте сумму или долю, например: «Аванс 30%, остаток после приёмки».";
    }
    if (!balance) return "Указан частичный аванс, но нет порядка оплаты остатка. Допишите, когда он оплачивается, например: «Остаток в день приёмки».";
    if (!hasPaymentTime(advancePart.slice(balance.index))) return "Не указан срок оплаты остатка. Например: «Остаток в течение 3 дней после приёмки».";
    return null;
  }
  if (!hasPaymentTime(withoutNegation)) {
    const known = noAdvance ? "Понятно, что аванса нет. " : "";
    if (/на месте|сразу|при встрече/u.test(withoutNegation)) return `${known}Уточните срок оплаты: при встрече, до начала работ или после приёмки? Например: «Без аванса, оплата при встрече». Укажите тот вариант, о котором договорились.`;
    return `${known}Не удалось определить срок оплаты. Укажите дату или событие: «В день приёмки» либо «В течение 3 дней после подписания акта». Способ перевода сам по себе не задаёт срок.`;
  }
  if (/частями|рассрочк|поэтапн/u.test(value) && !/\d+\s*(?:%|руб[а-я.]*|₽)|равными\s+(?:частями|платежами)/u.test(value)) return "Для оплаты частями укажите размер платежей или равные доли и их сроки.";
  return null;
}

export function acceptanceIssue(text: string): string | null {
  // Remove negated acts before searching; «без акта» must not mean «по акту».
  const positive = text.replace(/без\s+(?:подписания\s+)?акта|акт\s+не\s+(?:подписывается|составляется)|не\s+подпи[сш][а-я]*\s+акт|не\s+(?:подтвержд|принима|согласовыва)[а-я]*/gu, " ");
  const act = /по акту|актом|подпи[сш][а-я]*\s+(?:[а-я]+\s+){0,2}акт|акт[а-я]*\s+подпи[сш]/u.test(positive);
  const written = /(?:подтвержд|принима|согласовыва)[а-я]*.{0,65}(?:письм|email|почт|сообщен|чат|мессенджер)|(?:письм|email|почт|сообщен|чат|мессенджер).{0,65}(?:подтвержд|принима|согласовыва)/u.test(positive);
  if (!VAGUE.test(text) && (act || written)) return null;
  return "Не указан способ подтверждения приёмки. Отправка файла или осмотр — ещё не подтверждение. Например: «Заказчик проверяет результат и подтверждает приёмку сообщением в чате».";
}
