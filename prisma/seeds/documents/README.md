# Documentos para Seed

Coloque os documentos de cada tipo de projeto nas pastas correspondentes:

## Estrutura de Pastas

- `LAND/` - Documentos para **Viverde Residences** (Tokenização de terrenos)
- `BUILD/` - Documentos para **Alzira Brandao** (Financiamento de construção)
- `REV/` - Documentos para **Ribus Share** (Receitas)

## Tipos de Arquivo Suportados

- PDF (`.pdf`)
- Documentos Word (`.doc`, `.docx`)
- Planilhas Excel (`.xls`, `.xlsx`)
- Apresentações PowerPoint (`.ppt`, `.pptx`)
- Arquivos compactados (`.zip`, `.rar`)
- Imagens (`.jpg`, `.jpeg`, `.png`, `.gif`)
- Texto (`.txt`, `.csv`)
- Dados (`.json`, `.xml`)
- Arquivos KML/KMZ (`.kml`, `.kmz`)

## Como Usar

1. Coloque os arquivos nas pastas correspondentes ao tipo de projeto
2. Execute o seed: `npm run seed`
3. Os documentos serão automaticamente associados aos projetos criados

## Exemplo

Para adicionar documentos ao projeto "Viverde Residences" (tipo LAND):
- Coloque os arquivos em: `prisma/seeds/documents/LAND/`
- Execute: `npm run seed`

Os arquivos serão copiados para `uploads/projects/[projectId]/` e registrados no banco de dados.

## Projetos Criados

1. **Viverde Residences** (LAND) - Empreendimento residencial sustentável
2. **Alzira Brandao** (BUILD) - Projeto de construção e desenvolvimento imobiliário
3. **Ribus Share** (REV) - Participação em receitas de empreendimento comercial

