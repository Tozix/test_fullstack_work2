# URL Checker

Пакетная проверка доступности URL. Пользователь отправляет список адресов (до 500 за раз),
бэкенд асинхронно пробует каждый URL HEAD-запросом и отслеживает статус джобы и каждого
адреса, фронтенд показывает прогресс в реальном времени. Поддерживается отмена джобы.

Монорепозиторий из двух сервисов:

- **`backend/`** — NestJS 11 + TypeScript + Zod 4, рантайм Bun, порт **3001**.
- **`frontend/`** — Vite 8 + React 19 + Ant Design 6 + Zustand 5, порт **3000**.

Хранилище in-memory (`Map`), сбрасывается при перезапуске — это демонстрационный проект.

## Технологии

| Слой | Выбор |
| --- | --- |
| Рантайм и пакетный менеджер | Bun (≥ 1.1) |
| Бэкенд | NestJS 11 |
| Валидация | Zod 4, собственный `ZodValidationPipe` |
| Конкурентность | FIFO `Semaphore` на стандартной библиотеке, без `p-limit` |
| Фронтенд | React 19 + Vite 8 |
| UI-кит | Ant Design 6 |
| Состояние | Zustand 5 |
| HTTP | Axios |
| Тесты | Vitest 4 (unit + e2e на бэкенде, unit на фронтенде) |
| Контейнеры | Docker (`oven/bun:1` + `nginx:alpine`) |

## Структура репозитория

```
.
├── backend/                  # NestJS API
│   ├── src/
│   │   ├── main.ts           # bootstrap, CORS, префикс /api, глобальный ZodValidationPipe
│   │   ├── app.module.ts
│   │   └── jobs/             # единственный feature-модуль
│   │       ├── jobs.controller.ts
│   │       ├── jobs.service.ts
│   │       ├── jobs.service.spec.ts
│   │       ├── schema.ts     # Zod-схемы (create-job, pagination, id-param)
│   │       ├── types.ts      # Job, UrlItem, статус-машины
│   │       ├── pipes/zod-validation.pipe.ts
│   │       └── utils/semaphore.ts
│   ├── test/e2e/             # supertest + in-process Nest-приложение
│   ├── Dockerfile            # oven/bun:1
│   └── package.json
├── frontend/                 # React UI
│   ├── src/
│   │   ├── App.tsx
│   │   ├── api/client.ts     # axios-инстанс + CRUD
│   │   ├── store/useJobStore.ts
│   │   ├── components/       # JobCreateForm, JobList, JobDetail
│   │   └── types.ts
│   ├── nginx.conf            # SPA + прокси /api/ → backend:3001
│   ├── Dockerfile            # сборка → nginx:alpine
│   └── package.json
├── docker-compose.yml
└── README.md
```

## Требования

- **Bun ≥ 1.1**. Установка зависит от ОС (см. [официальную инструкцию](https://bun.sh/docs/install)):

  | ОС | Команда установки |
  | --- | --- |
  | macOS / Linux | `curl -fsSL https://bun.sh/install \| bash` |
  | Windows (PowerShell) | `powershell -c "irm bun.sh/install.ps1 \| iex"` |
  | macOS (Homebrew) | `brew install bun` |

- Для запуска через Docker — **Docker** с поддержкой Compose v2.

## Локальный запуск (dev)

Понадобятся два терминала. Команды выполняются из соответствующей директории сервиса.

### 1. Бэкенд

```bash
cd backend
bun install
bun run start:dev        # file-watcher через Bun
```

API поднимется на http://localhost:3001/api/jobs

### 2. Фронтенд

```bash
cd frontend
bun install
bun run dev              # Vite, прокси /api → :3001
```

UI откроется на http://localhost:3000

Dev-сервер Vite проксирует `/api/*` на бэкенд, поэтому отдельная настройка CORS для браузера
не требуется. `app.enableCors()` в `backend/src/main.ts` включён для не-браузерных клиентов.

## Запуск через Docker Compose

Из корня репозитория:

```bash
docker compose up --build
```

- Фронтенд → http://localhost:3000 (nginx отдаёт статику и проксирует `/api/*` в контейнер `backend` на порт 3001).
- Бэкенд → http://localhost:3001 (доступен напрямую; UI ходит к нему через nginx).

Остановить и удалить контейнеры:

```bash
docker compose down
```

## Тесты и линт

```bash
# Бэкенд: unit-тесты (Vitest, fetch замокан)
cd backend && bun run test

# Бэкенд: e2e-тесты (Vitest + supertest, in-process Nest)
cd backend && bun run test:e2e

# Фронтенд: unit-тесты (Vitest + jsdom)
cd frontend && bun run test

# Фронтенд: линт (oxlint)
cd frontend && bun run lint
```

Watch-режим — `bun run test:watch` в соответствующей директории.

## API

Все эндпоинты под префиксом `/api`.

| Метод | Путь             | Тело / Параметры                                                                                                            | Ответ                                                                     |
| ----- | ---------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| POST  | `/api/jobs`      | `{ "urls": string[] }` (1–500 адресов, каждый валидный URL)                                                                 | `201 { "jobId": "<uuid>" }`                                               |
| GET   | `/api/jobs`      | `?page=1&limit=20&sortBy=createdAt&sortOrder=desc` (`limit` 1–100)                                                          | `200 { "data": JobSummary[], "meta": { page, limit, total } }`            |
| GET   | `/api/jobs/:id`  | —                                                                                                                           | `200 Job` (с `items[]`) или `404`                                         |
| DELETE | `/api/jobs/:id`  | —                                                                                                                           | `200 Job` (статус `cancelled`) или `404` если не найдена                  |

### Статус-машина джобы

```
pending  →  in_progress  →  completed   (хотя бы один URL успешен)
                          →  failed      (все URL завершились с ошибкой)
                          →  cancelled   (вызван DELETE /api/jobs/:id)
```

### Статус каждого URL

```
pending → in_progress → success | error | cancelled
```

## Поведение

- **Конкурентность**: не более 5 URL обрабатываются параллельно в рамках джобы (`Semaphore(5)`).
- **Таймаут на URL**: 10 с (`AbortController` + `setTimeout`). По таймауту URL получает статус `error`
  (или `cancelled`, если отменена вся джоба).
- **Редиректы**: проба делается методом `HEAD` с `redirect: 'manual'`, до 5 переходов;
  на шестом бросается `Too many redirects`.
- **Задержка после ответа**: каждый успешный URL дополнительно «спит» 0–10 с перед сохранением
  результата — чтобы прогресс в UI был наглядным.
- **Отмена**: `DELETE /api/jobs/:id` вызывает `abort()` у `AbortController` джобы; in-flight
  запросы получают сигнал, pending/in_progress адреса переходят в `cancelled`.
- **TLS-ошибки**: классифицируются отдельно — сообщение начинается с префикса `TLS:` и содержит
  понятную причину (истёкший сертификат, несовпадение имени хоста, самоподписанный сертификат и т. п.).
- **Хранилище**: in-memory `Map<string, Job>`, сбрасывается при перезапуске.

## Лицензия

UNLICENSED — внутреннее демо.
