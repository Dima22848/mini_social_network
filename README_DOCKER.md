# Docker запуск

В корне проекта достаточно выполнить одну команду:

```bash
docker compose up --build
```

Поднимутся:

- PostgreSQL на `localhost:5433`;
- Redis на `localhost:6379` с паролем `12345`;
- backend на `http://localhost:4000/api`;
- frontend на `http://localhost:3000`.

Backend при старте делает `prisma generate`, синхронизирует схему через `prisma db push` и запускает seed. Seed специально очищает базу и создаёт демо-данные заново, поэтому для демонстрационного режима это нормально.

Главный пользователь:

- email: `dima@example.com`
- password: `12345678`
