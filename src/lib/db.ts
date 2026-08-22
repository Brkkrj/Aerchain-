import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { __aeraPrisma?: PrismaClient };

export const prisma = globalForPrisma.__aeraPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.__aeraPrisma = prisma;
