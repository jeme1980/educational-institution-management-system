# Educational Institution Management System

Angular frontend and TypeScript Express API for institution, student, staff,
exam, question, and result management.

## API commands

```bash
npm run build:api
npm run typecheck
npm run test:schemas
npm run test:tenant
```

The API uses Prisma Client with `apps/api/prisma/schema.prisma` as its database
schema source. Configure `DATABASE_URL` before running database commands.
