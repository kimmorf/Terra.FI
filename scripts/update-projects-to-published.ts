import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Atualizando projetos para status "published"...');

  try {
    // Atualiza todos os projetos com status "active" para "published"
    const result = await prisma.investmentProject.updateMany({
      where: {
        status: 'active',
      },
      data: {
        status: 'published',
      },
    });

    console.log(`✅ ${result.count} projeto(s) atualizado(s) para "published"`);

    // Lista os projetos atualizados
    const projects = await prisma.investmentProject.findMany({
      where: {
        status: 'published',
      },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
      },
    });

    console.log('\n📋 Projetos publicados:');
    projects.forEach((project) => {
      console.log(`  - ${project.name} (${project.type}): ${project.status}`);
    });
  } catch (error) {
    console.error('❌ Erro ao atualizar projetos:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    console.log('\n🎉 Atualização concluída!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });

