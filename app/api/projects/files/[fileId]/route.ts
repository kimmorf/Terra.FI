import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/prisma';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export const dynamic = 'force-dynamic';

// GET - Download de arquivo
export async function GET(
  request: NextRequest,
  { params }: { params: { fileId: string } }
) {
  try {
    const prisma = getPrismaClient();
    if (!prisma) {
      return NextResponse.json(
        { error: 'DATABASE_URL não configurada. Banco de dados indisponível.' },
        { status: 503 },
      );
    }

    const fileId = params.fileId;

    // Buscar arquivo no banco de dados
    const projectFile = await prisma.projectFile.findUnique({
      where: { id: fileId },
      include: { project: true },
    });

    if (!projectFile) {
      return NextResponse.json(
        { error: 'Arquivo não encontrado' },
        { status: 404 }
      );
    }

    // Verificar se o arquivo existe no sistema de arquivos
    const filePath = join(process.cwd(), projectFile.filePath);
    if (!existsSync(filePath)) {
      return NextResponse.json(
        { error: 'Arquivo não encontrado no servidor' },
        { status: 404 }
      );
    }

    // Ler arquivo
    const fileBuffer = await readFile(filePath);

    // Retornar arquivo
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': projectFile.fileType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(projectFile.fileName)}"`,
        'Content-Length': projectFile.fileSize.toString(),
      },
    });
  } catch (error) {
    console.error('Erro ao fazer download de arquivo:', error);
    return NextResponse.json(
      { error: 'Erro ao fazer download de arquivo' },
      { status: 500 }
    );
  }
}

// DELETE - Deletar arquivo
export async function DELETE(
  request: NextRequest,
  { params }: { params: { fileId: string } }
) {
  try {
    const prisma = getPrismaClient();
    if (!prisma) {
      return NextResponse.json(
        { error: 'DATABASE_URL não configurada. Banco de dados indisponível.' },
        { status: 503 },
      );
    }

    const fileId = params.fileId;

    // Buscar arquivo no banco de dados
    const projectFile = await prisma.projectFile.findUnique({
      where: { id: fileId },
    });

    if (!projectFile) {
      return NextResponse.json(
        { error: 'Arquivo não encontrado' },
        { status: 404 }
      );
    }

    // Deletar arquivo do sistema de arquivos
    const filePath = join(process.cwd(), projectFile.filePath);
    if (existsSync(filePath)) {
      const { unlink } = await import('fs/promises');
      await unlink(filePath);
    }

    // Deletar registro do banco de dados
    await prisma.projectFile.delete({
      where: { id: fileId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao deletar arquivo:', error);
    return NextResponse.json(
      { error: 'Erro ao deletar arquivo' },
      { status: 500 }
    );
  }
}

