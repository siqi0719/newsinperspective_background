import "../config/env.js";
import { prisma } from "../lib/prisma.js";

async function main() {
  const article = await prisma.article.findFirst({
    where: {
      entityMentions: {
        some: {},
      },
    },
    include: {
      _count: {
        select: { entityMentions: true },
      },
    },
  });

  if (!article) {
    console.log("NO_ARTICLE");
  } else {
    console.log(article.id);
  }

  await prisma.$disconnect();
}

main();
