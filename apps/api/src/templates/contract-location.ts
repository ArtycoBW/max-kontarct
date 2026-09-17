const WORD = "[а-яa-z][а-яa-z-]*";
const STREET = /(?:^|[\s,;])(?:улица|улице|улицы|ул\.?|проспект|проспекте|пр-т|переулок|пер\.?|шоссе|набережная|наб\.?|бульвар|бул\.?|площадь|пл\.?|микрорайон|мкр\.?|квартал)\s+/u;
const HOUSE = /(?:дом|д\.)\s*\d+[а-яa-z]?(?:[/-]\d+)?|\s\d+[а-яa-z]?(?:[/-]\d+)?(?:\s*(?:,|$|корп|к\.|стр|кв|квартир|офис))/u;
const SETTLEMENT = /(?:^|[\s,;])(?:г\.|город|село|с\.|деревня|дер\.|поселок|посёлок|пос\.|п\.|пгт|станица|ст-ца)\s*[а-яa-z-]{2,}/u;
const REMOTE = /(онлайн|online|дистанционно|удаленно|по видеосвязи|доставк.*(пункт|курьер)|пункт.*выдачи)/u;
const VAGUE = /^(не знаю|потом|позже|нет|да|неважно|как обычно|по договоренности|по согласованию|уточним)[.! ]*$/u;
const NOT_ADDRESS = /(рубл|стоимост|оплат|ремонт|подготов|предоплат|паспорт|регистраци|проживани|комнат|мебел|ноутбук|модель)/u;

export const LOCATION_EXAMPLE = "Например: «г. Казань, ул. Примерная, д. 10, кв. 2». Если помещения нет, квартиру или офис указывать не нужно.";

/** Syntax/completeness only: this is not a registry check or proof that an address exists. */
export function contractLocationIssue(value: string, allowRemote = true, allowShorthand = true): string | null {
  const text = value.toLocaleLowerCase("ru-RU").replaceAll("ё", "е").replace(/\s+/g, " ").trim();
  if (!text || VAGUE.test(text)) return "Пока нет конкретного места исполнения. Напишите адрес или способ удалённой работы.";
  const remoteText = text.replace(/не\s+(?:онлайн|дистанционно|удаленно|по видеосвязи)/gu, " ");
  if (REMOTE.test(remoteText)) return allowRemote ? null : "Для помещения нужен его адрес, а не способ связи сторон.";
  const street = [...text.matchAll(new RegExp(STREET, "gu"))].find(match =>
    !/^\d+\s*(?:кв\.|м(?:етр)?(?:\s|$))/u.test(text.slice(match.index + match[0].length)));
  const hasHouse = HOUSE.test(text);
  if (street) {
    const prefix = text.slice(0, street.index).split(/(?:\.\s+|;\s*)/u).at(-1)!.replace(/[\s,;]+$/u, "").split(",").at(-1)!.trim();
    const hasCity = SETTLEMENT.test(text) || (/[а-яa-z]{2,}/u.test(prefix) && !NOT_ADDRESS.test(prefix) && !/^(на|по адресу|адрес|работы)$/u.test(prefix));
    if (!hasCity) return "Не указан населённый пункт. Добавьте город, посёлок или село перед улицей.";
    if (!hasHouse) return "Не найден номер дома. Допишите его после улицы; корпус и помещение — если они есть.";
    return null;
  }
  // Common shorthand without «г.»/«ул.»: «Казань Примерная 10» or «Казань, Примерная, 10».
  const bareAddress = new RegExp(`^(?:г\\.\\s*)?${WORD}(?:\\s*,\\s*|\\s+)${WORD}(?:[\\s,]+${WORD}){0,3}\\s*,?\\s+\\d+[а-яa-z]?(?:[/-]\\d+)?(?:\\s|,|$)`, "u");
  if (allowShorthand && !NOT_ADDRESS.test(text) && hasHouse && bareAddress.test(text)) return null;
  // Settlements where the house is addressed directly, without a named street.
  if (SETTLEMENT.test(text) && /(?:дом|д\.)\s*\d/u.test(text)) return null;
  if (!hasHouse) return "В адресе не удалось выделить улицу и номер дома. Укажите их после населённого пункта.";
  return "Не удалось выделить населённый пункт и улицу. Разделите части адреса запятыми и добавьте «г.», «ул.» и «д.».";
}
