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
  // Valores muito baixos para teste (< 0.5 XRP = R$ 1,25)
  const adminProjects = [
    {
      name: 'LAND-MPT',
      type: 'LAND',
      description: 'Fractionalized land parcel',
      purpose: 'Tokenização de terrenos',
      example: '1 token = R$ 0,10',
      minAmount: 0.5,  // R$ 0,50 = ~0.2 XRP
      maxAmount: 1.0,  // R$ 1,00 = ~0.4 XRP
      totalAmount: 0,
      targetAmount: 10.0,  // R$ 10,00 = ~4 XRP
      status: 'active',
    },
    {
      name: 'BUILD-MPT',
      type: 'BUILD',
      description: 'Construction phase financing',
      purpose: 'Financiamento de construção',
      example: '1 token = R$ 0,50',
      minAmount: 0.5,  // R$ 0,50 = ~0.2 XRP
      maxAmount: 1.0,  // R$ 1,00 = ~0.4 XRP
      totalAmount: 0,
      targetAmount: 10.0,  // R$ 10,00 = ~4 XRP
      status: 'active',
    },
  ];

  // Criar projetos de investimento disponíveis para investidores (status: published)
  // Valores muito baixos para teste (< 0.5 XRP = R$ 1,25)
  const publishedProjects = [
    {
      name: 'Terra Verde Residencial',
      type: 'LAND',
      description: 'Desenvolvimento imobiliário sustentável',
      purpose: 'Aquisição de terreno para construção de condomínio residencial com infraestrutura completa',
      example: '1 token = R$ 0,10',
      minAmount: 0.5,  // R$ 0,50 = ~0.2 XRP
      maxAmount: 1.0,   // R$ 1,00 = ~0.4 XRP
      totalAmount: 0,
      targetAmount: 10.0,  // R$ 10,00 = ~4 XRP
      status: 'published',
    },
    {
      name: 'Edifício Comercial Centro',
      type: 'BUILD',
      description: 'Construção de prédio comercial no centro da cidade',
      purpose: 'Financiamento da fase de construção de edifício corporativo com 12 andares',
      example: '1 token = R$ 0,50',
      minAmount: 0.5,  // R$ 0,50 = ~0.2 XRP
      maxAmount: 1.0,  // R$ 1,00 = ~0.4 XRP
      totalAmount: 0,
      targetAmount: 10.0,  // R$ 10,00 = ~4 XRP
      status: 'published',
    },
    {
      name: 'Shopping Boulevard',
      type: 'REV',
      description: 'Participação em receitas de shopping center',
      purpose: 'Direitos sobre receitas de aluguel de lojas e estacionamento',
      example: '1 token = R$ 0,20',
      minAmount: 0.5,  // R$ 0,50 = ~0.2 XRP
      maxAmount: 1.0,  // R$ 1,00 = ~0.4 XRP
      totalAmount: 0,
      targetAmount: 10.0,  // R$ 10,00 = ~4 XRP
      status: 'published',
    },
    {
      name: 'Garantia Imobiliária Premium',
      type: 'COL',
      description: 'Token lastreado em imóveis de alto padrão',
      purpose: 'Representação digital de garantias imobiliárias para operações de crédito',
      example: '1 token = R$ 1,00 em garantia',
      minAmount: 0.5,  // R$ 0,50 = ~0.2 XRP
      maxAmount: 1.0,  // R$ 1,00 = ~0.4 XRP
      totalAmount: 0,
      targetAmount: 10.0,  // R$ 10,00 = ~4 XRP
      status: 'published',
    },
    {
      name: 'Loteamento Jardins do Vale',
      type: 'LAND',
      description: 'Loteamento residencial de médio padrão',
      purpose: 'Tokenização de lotes para venda fracionada',
      example: '1 token = R$ 0,15',
      minAmount: 0.5,  // R$ 0,50 = ~0.2 XRP
      maxAmount: 1.0,  // R$ 1,00 = ~0.4 XRP
      totalAmount: 0,
      targetAmount: 10.0,  // R$ 10,00 = ~4 XRP
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

