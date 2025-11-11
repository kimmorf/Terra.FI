import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed do banco de dados...');

  // Verificar se já existem projetos
  const existingProjects = await prisma.investmentProject.count();
  if (existingProjects > 0) {
    console.log('✅ Projetos já existem no banco. Pulando seed...');
    return;
  }

  // Criar projetos de investimento baseados nos cards do admin
  const projects = [
    {
      name: 'LAND-MPT',
      type: 'LAND',
      description: 'Fractionalized land parcel',
      purpose: 'Tokenização de terrenos',
      example: '1 token = 1 m²',
      minAmount: 100.0,
      maxAmount: 10000.0,
      totalAmount: 0,
      targetAmount: 500000.0,
      status: 'active',
    },
    {
      name: 'BUILD-MPT',
      type: 'BUILD',
      description: 'Construction phase financing',
      purpose: 'Financiamento de construção',
      example: 'CAPEX tranches',
      minAmount: 500.0,
      maxAmount: 50000.0,
      totalAmount: 0,
      targetAmount: 1000000.0,
      status: 'active',
    },
    {
      name: 'REV-MPT',
      type: 'REV',
      description: 'Revenue distribution rights',
      purpose: 'Direitos de receita',
      example: 'Rent or profit share',
      minAmount: 200.0,
      maxAmount: 20000.0,
      totalAmount: 0,
      targetAmount: 750000.0,
      status: 'active',
    },
    {
      name: 'COL-MPT',
      type: 'COL',
      description: 'Collateral representation',
      purpose: 'Representação de colateral',
      example: 'Locked LAND = Credit Power',
      minAmount: 1000.0,
      maxAmount: 100000.0,
      totalAmount: 0,
      targetAmount: 2000000.0,
      status: 'active',
    },
  ];

  for (const project of projects) {
    const created = await prisma.investmentProject.create({
      data: project,
    });
    console.log(`✅ Criado projeto: ${created.name}`);
  }

  console.log('🎉 Seed concluído com sucesso!');
}

main()
  .catch((e) => {
    console.error('❌ Erro ao executar seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

