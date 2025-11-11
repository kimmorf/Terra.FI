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

  // Criar projetos de investimento para admin (status: active)
  const adminProjects = [
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
  ];

  // Criar projetos de investimento disponíveis para investidores (status: published)
  const publishedProjects = [
    {
      name: 'Terra Verde Residencial',
      type: 'LAND',
      description: 'Desenvolvimento imobiliário sustentável',
      purpose: 'Aquisição de terreno para construção de condomínio residencial com infraestrutura completa',
      example: '1 token = R$ 100,00',
      minAmount: 100.0,
      maxAmount: 50000.0,
      totalAmount: 125000.0,
      targetAmount: 500000.0,
      status: 'published',
    },
    {
      name: 'Edifício Comercial Centro',
      type: 'BUILD',
      description: 'Construção de prédio comercial no centro da cidade',
      purpose: 'Financiamento da fase de construção de edifício corporativo com 12 andares',
      example: '1 token = R$ 500,00',
      minAmount: 500.0,
      maxAmount: 100000.0,
      totalAmount: 350000.0,
      targetAmount: 1000000.0,
      status: 'published',
    },
    {
      name: 'Shopping Boulevard',
      type: 'REV',
      description: 'Participação em receitas de shopping center',
      purpose: 'Direitos sobre receitas de aluguel de lojas e estacionamento',
      example: 'Dividendos mensais proporcionais',
      minAmount: 200.0,
      maxAmount: 30000.0,
      totalAmount: 180000.0,
      targetAmount: 750000.0,
      status: 'published',
    },
    {
      name: 'Garantia Imobiliária Premium',
      type: 'COL',
      description: 'Token lastreado em imóveis de alto padrão',
      purpose: 'Representação digital de garantias imobiliárias para operações de crédito',
      example: '1 token = R$ 1.000,00 em garantia',
      minAmount: 1000.0,
      maxAmount: 200000.0,
      totalAmount: 450000.0,
      targetAmount: 2000000.0,
      status: 'published',
    },
    {
      name: 'Loteamento Jardins do Vale',
      type: 'LAND',
      description: 'Loteamento residencial de médio padrão',
      purpose: 'Tokenização de lotes para venda fracionada',
      example: '1 token = 10 m²',
      minAmount: 150.0,
      maxAmount: 25000.0,
      totalAmount: 75000.0,
      targetAmount: 400000.0,
      status: 'published',
    },
  ];

  const projects = [...adminProjects, ...publishedProjects];

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

