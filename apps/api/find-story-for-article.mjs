import "./src/config/env.js";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  try {
    const articleId = "cmoh0qval0109vj00ujqfw2it";

    const cluster = await prisma.storyCluster.findFirst({
      where: {
        articles: {
          some: { id: articleId }
        }
      },
      select: {
        id: true,
        title: true
      }
    });

    if (cluster) {
      console.log(`Story ID: ${cluster.id}`);
      console.log(`Story Title: ${cluster.title}`);
      console.log(`\nYou can navigate to this story in the UI.`);
    } else {
      console.log("Story not found!");
    }

  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

main();
