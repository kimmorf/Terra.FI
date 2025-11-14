import { PrismaClient } from '@prisma/client';
import { readdir, readFile, mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { Wallet } from 'xrpl';
import { encryptSecret } from './../lib/utils/crypto';

const prisma = new PrismaClient();

// Função para detectar o tipo MIME baseado na extensão
function getMimeType(fileName: string): string {
  const ext = fileName.toLowerCase().split('.').pop();
  const mimeTypes: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    zip: 'application/zip',
    rar: 'application/x-rar-compressed',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    txt: 'text/plain',
    csv: 'text/csv',
    json: 'application/json',
    xml: 'application/xml',
    kml: 'application/vnd.google-earth.kml+xml',
    kmz: 'application/vnd.google-earth.kmz',
  };
  return mimeTypes[ext || ''] || 'application/octet-stream';
}

// Função para fazer upload de arquivos de um projeto
async function uploadProjectFiles(projectId: string, projectType: string) {
  const documentsDir = join(process.cwd(), 'prisma', 'seeds', 'documents', projectType);
  
  // Verificar se a pasta existe e tem arquivos
  if (!existsSync(documentsDir)) {
    console.log(`⚠️  Pasta de documentos não encontrada: ${documentsDir}`);
    return;
  }

  try {
    const files = await readdir(documentsDir);
    const fileEntries = files.filter(file => {
      // Ignorar arquivos ocultos e pastas
      return !file.startsWith('.') && file !== 'README.md';
    });

    if (fileEntries.length === 0) {
      console.log(`⚠️  Nenhum documento encontrado em: ${documentsDir}`);
      return;
    }

    // Criar diretório de uploads se não existir
    const uploadsDir = join(process.cwd(), 'uploads', 'projects', projectId);
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true });
    }

    let uploadedCount = 0;
    for (const fileName of fileEntries) {
      try {
        const sourcePath = join(documentsDir, fileName);
        const fileBuffer = await readFile(sourcePath);
        
        // Gerar nome único para o arquivo
        const timestamp = Date.now();
        const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
        const uniqueFileName = `${timestamp}_${sanitizedFileName}`;
        const destPath = join(uploadsDir, uniqueFileName);

        // Copiar arquivo para a pasta de uploads
        await writeFile(destPath, fileBuffer);

        // Salvar referência no banco de dados
        const fileType = getMimeType(fileName);
        const fileSize = fileBuffer.length;

        await prisma.projectFile.create({
          data: {
            projectId,
            fileName: fileName,
            filePath: `uploads/projects/${projectId}/${uniqueFileName}`,
            fileType,
            fileSize,
            description: `Documento do projeto ${projectType}`,
            uploadedBy: null, // Seed não tem usuário
          },
        });

        uploadedCount++;
        console.log(`  📄 Arquivo adicionado: ${fileName}`);
      } catch (error) {
        console.error(`  ❌ Erro ao processar arquivo ${fileName}:`, error);
      }
    }

    if (uploadedCount > 0) {
      console.log(`  ✅ ${uploadedCount} documento(s) adicionado(s) ao projeto ${projectType}`);
    }
  } catch (error) {
    console.error(`❌ Erro ao ler pasta de documentos ${documentsDir}:`, error);
  }
}

async function createServiceWallets() {
  console.log('💼 Criando carteiras de serviço...');

  // Verificar se já existe uma carteira ISSUER ativa
  const existingIssuer = await prisma.serviceWallet.findFirst({
    where: {
      type: 'ISSUER',
      isActive: true,
      network: 'testnet',
    },
  });

  if (existingIssuer) {
    console.log(`✅ Carteira ISSUER já existe: ${existingIssuer.label} (${existingIssuer.address})`);
    return existingIssuer;
  }

  // Criar carteira ISSUER para testes
  const issuerWallet = Wallet.generate();
  const issuerEncryptedSeed = encryptSecret(issuerWallet.seed!);

  const issuer = await prisma.serviceWallet.create({
    data: {
      label: 'TerraFi Main Issuer (Seed)',
      type: 'ISSUER',
      network: 'testnet',
      address: issuerWallet.classicAddress,
      publicKey: issuerWallet.publicKey,
      seedEncrypted: issuerEncryptedSeed,
      isActive: true,
    },
  });

  console.log(`✅ Carteira ISSUER criada: ${issuer.label} (${issuer.address})`);
  console.log(`   ⚠️  IMPORTANTE: Esta carteira precisa ser financiada na testnet para funcionar`);
  console.log(`   💡 Use o faucet: https://xrpl.org/xrp-testnet-faucet.html`);

  return issuer;
}

async function main() {
  console.log('🌱 Iniciando seed do banco de dados...');

  // Criar carteiras de serviço primeiro (necessárias para MPT)
  const issuerWallet = await createServiceWallets();

  // Limpar todos os projetos existentes (e seus arquivos serão deletados em cascade)
  const existingProjects = await prisma.investmentProject.findMany();
  if (existingProjects.length > 0) {
    console.log(`🗑️  Removendo ${existingProjects.length} projeto(s) existente(s)...`);
    await prisma.investmentProject.deleteMany({});
    console.log('✅ Projetos antigos removidos');
  }

  // Criar apenas 1 projeto de cada tipo com status 'published'
  const projects = [
    {
      name: 'Viverde Residences',
      type: 'LAND',
      description: 'Empreendimento residencial sustentável com infraestrutura completa',
      purpose: 'Tokenização de unidades residenciais para investimento fracionado',
      example: '1 token = R$ 0,15',
      minAmount: 0.5,
      maxAmount: 1.0,
      totalAmount: 0,
      targetAmount: 10.0,
      status: 'published' as const,
    },
    {
      name: 'Alzira Brandao',
      type: 'BUILD',
      description: 'Projeto de construção e desenvolvimento imobiliário',
      purpose: 'Financiamento da fase de construção de empreendimento residencial',
      example: '1 token = R$ 0,50',
      minAmount: 0.5,
      maxAmount: 1.0,
      totalAmount: 0,
      targetAmount: 10.0,
      status: 'published' as const,
    },
    {
      name: 'Ribus Share',
      type: 'REV',
      description: 'Participação em receitas de empreendimento comercial',
      purpose: 'Direitos sobre receitas de aluguel e operações comerciais',
      example: '1 token = R$ 0,20',
      minAmount: 0.5,
      maxAmount: 1.0,
      totalAmount: 0,
      targetAmount: 10.0,
      status: 'published' as const,
    },
  ];

  for (const project of projects) {
    const created = await prisma.investmentProject.create({
      data: project,
    });
    console.log(`✅ Criado projeto: ${created.name} (${created.type})`);

    // Fazer upload dos documentos do projeto
    await uploadProjectFiles(created.id, created.type);
  }

  console.log('🎉 Seed concluído com sucesso!');
  console.log('');
  console.log('📁 Para adicionar documentos aos projetos, coloque os arquivos em:');
  console.log('   - prisma/seeds/documents/LAND/ → Viverde Residences');
  console.log('   - prisma/seeds/documents/BUILD/ → Alzira Brandao');
  console.log('   - prisma/seeds/documents/REV/ → Ribus Share');
  console.log('');
  console.log('   Depois execute: npm run seed');
}

main()
  .catch((e) => {
    console.error('❌ Erro ao executar seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
