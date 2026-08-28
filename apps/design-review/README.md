# Max‑Контракт - Design Review

Интерактивный high‑fidelity прототип четырёх дизайн‑концепций будущего Mini App. Проект предназначен для клиентского дизайн‑ревью: все данные локальные, backend и реальные интеграции отсутствуют.

## Запуск

Требуется Node.js 20.9+.

```bash
npm install
npm run dev
```

Откройте `http://localhost:3000`.

Проверка production-сборки:

```bash
npm run lint
npm run build
npm start
```

## Маршруты

- `/` - нейтральная презентация четырёх направлений.
- `/concept/[slug]` - описание концепции и reference viewer.
- `/concept/[slug]/prototype?screen=splash` - интерактивный экран в phone mockup.
- `/concept/[slug]/screens` - галерея 43 живых экранов.
- `/compare?screen=dashboard` - синхронное сравнение четырёх концепций.

Допустимые `slug`: `jeton`, `caldera`, `contractbook`, `auros`.

На desktop работают горячие клавиши: `←`/`→` - соседний экран, `G` - галерея, `C` - сравнение, `1`/`2`/`3`/`4` - смена концепции. В полях ввода клавиши не перехватываются.

## Четыре концепции

1. **Jeton / Editorial Fintech** - белый canvas, тёплый текст, сигнальный красно‑оранжевый и просторная редакционная композиция.
2. **Caldera / Bold Industrial** - минерально‑серый canvas, крупная condensed‑типографика, molten orange, pill CTA и halftone‑мотив.
3. **Mercury / Alpine Banking** - тёмный private-banking workspace, графитовые панели, отдельный floating dock и один cobalt‑акцент.
4. **Big Picture / Typographic Manifesto** - монохромная редакционная система с крупной типографикой и hairline‑структурой.

Темы задаются на верхнем wrapper через `data-concept` и CSS‑переменные в `app/globals.css`.

## Структура

```text
app/                         маршруты App Router
components/ui/               shadcn/ui primitives
components/review/           presentation shell, gallery, compare, references
components/prototype/        phone frame, экраны и semantic primitives
components/concepts/         theme provider
lib/concepts.ts              реестр концепций
lib/screens.ts               canonical registry 43 экранов
lib/flows.ts                 основной UX-flow и переходы
lib/mock-data.ts             единые моковые данные
public/references/           PNG/SVG moodboards для reference viewer
docs/design/                 текстовые style references
```

## Как добавить экран

1. Добавьте идентификатор в `ScreenId` в `lib/types.ts`.
2. Добавьте метаданные в `SCREENS` в `lib/screens.ts`.
3. При необходимости включите экран в `MAIN_FLOW` в `lib/flows.ts`.
4. Добавьте React‑представление в `components/prototype/prototype-screen.tsx` и подключите его в `renderScreen`.

Галерея, Screen Picker и compare автоматически используют canonical registry.

## Как заменить mock data

Измените значения в `lib/mock-data.ts`. Они общие для всех четырёх концепций, поэтому содержимое останется синхронным в compare. Не используйте реальные персональные данные.

## Референсы

PNG из `public/references/` отображаются только в presentation shell как moodboards. Экраны телефона построены из HTML/CSS/React-компонентов и не используют PNG вместо интерфейса.

## Деплой на Vercel

1. Импортируйте репозиторий в Vercel.
2. Framework Preset: **Next.js**.
3. Build Command: `npm run build`.
4. Output Directory оставьте стандартной (`.next`).
5. Переменные окружения не требуются.

Metadata содержит `robots: noindex, nofollow`, поскольку это клиентский review‑прототип.

## Ограничения

Это **design prototype, no backend**. Реальные MAX/SMS/YandexGPT API, загрузка файлов, авторизация и платежи заменены локальными демонстрационными сценариями.
