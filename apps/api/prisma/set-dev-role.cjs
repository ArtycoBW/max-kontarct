const { PrismaClient, UserRole } = require("@prisma/client");

const { ensureDatabaseUrl } = require("./load-database-env.cjs");

ensureDatabaseUrl();

const requestedRole = String(process.argv[2] ?? "").toUpperCase();
const allowedRoles = new Set(Object.values(UserRole));

async function setDevelopmentRole() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Changing roles from the development helper is disabled in production");
  }
  if (!allowedRoles.has(requestedRole)) {
    throw new Error("Pass one of the roles: USER, ADMIN, SUPPORT");
  }

  const maxUserId = process.env.DEV_MAX_USER_ID ?? "1000000000001";
  const prisma = new PrismaClient();

  try {
    const account = await prisma.maxAccount.findUnique({
      select: { userId: true },
      where: { maxUserId },
    });
    if (!account) {
      throw new Error("Development user does not exist; open the Mini App once first");
    }

    await prisma.$transaction([
      prisma.user.update({
        data: { role: requestedRole },
        where: { id: account.userId },
      }),
      prisma.auditEvent.create({
        data: {
          actorUserId: account.userId,
          entityId: account.userId,
          entityType: "User",
          eventType: "DEV_USER_ROLE_CHANGED",
          metadata: { role: requestedRole },
          requestId: "dev-role-helper",
        },
      }),
    ]);

    console.log(`Development user role: ${requestedRole}`);
  } finally {
    await prisma.$disconnect();
  }
}

setDevelopmentRole().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
