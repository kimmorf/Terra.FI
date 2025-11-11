'use client';

import { motion } from 'framer-motion';
import { Mountain, Hammer, DollarSign, Lock, ArrowRight, TrendingUp, AlertCircle, FileText, X, Download, Info } from 'lucide-react';
import { useState, useEffect } from 'react';

interface ProjectFile {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  description?: string;
  createdAt: string;
}

interface InvestmentProject {
  id: string;
  name: string;
  type: string;
  purpose: string;
  description?: string;
  example?: string;
  minAmount: number;
  maxAmount?: number;
  totalAmount: number;
  targetAmount: number;
  status: string;
  files?: ProjectFile[];
  _count?: {
    files?: number;
  };
}

interface InvestmentCardProps {
  project: InvestmentProject;
  onInvest: (projectId: string, amount: number) => Promise<void>;
  isMocked?: boolean; // Indica se o investimento está mockado (valores hardcoded)
}

const typeIcons = {
  LAND: Mountain,
  BUILD: Hammer,
  REV: DollarSign,
  COL: Lock,
};

const typeColors = {
  LAND: 'from-green-400 to-green-600 dark:from-green-500 dark:to-green-700',
  BUILD: 'from-orange-400 to-orange-600 dark:from-orange-500 dark:to-orange-700',
  REV: 'from-yellow-400 to-yellow-600 dark:from-yellow-500 dark:to-yellow-700',
  COL: 'from-purple-400 to-purple-600 dark:from-purple-500 dark:to-purple-700',
};

export function InvestmentCard({ project, onInvest, isMocked = false }: InvestmentCardProps) {
  const [amount, setAmount] = useState(project.minAmount.toString());
  const [isInvesting, setIsInvesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  const Icon = typeIcons[project.type as keyof typeof typeIcons] || TrendingUp;
  const colorClass = typeColors[project.type as keyof typeof typeColors] || 'from-blue-400 to-blue-600';

  const progress = (project.totalAmount / project.targetAmount) * 100;
  const remaining = project.targetAmount - project.totalAmount;

  const loadFiles = async () => {
    setLoadingFiles(true);
    try {
      const response = await fetch(`/api/admin/projects/files?projectId=${project.id}`);
      if (response.ok) {
        const data = await response.json();
        setFiles(data);
      }
    } catch (error) {
      console.error('Erro ao carregar arquivos:', error);
    } finally {
      setLoadingFiles(false);
    }
  };

  const handleDownload = (fileId: string, fileName: string) => {
    window.open(`/api/projects/files/${fileId}`, '_blank');
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getFileIcon = (fileType: string) => {
    if (fileType.includes('pdf')) return '📄';
    if (fileType.includes('word') || fileType.includes('document')) return '📝';
    if (fileType.includes('excel') || fileType.includes('spreadsheet')) return '📊';
    if (fileType.includes('powerpoint') || fileType.includes('presentation')) return '📽️';
    if (fileType.includes('zip') || fileType.includes('rar')) return '📦';
    if (fileType.includes('image')) return '🖼️';
    if (fileType.includes('kml') || fileType.includes('kmz')) return '🗺️';
    return '📎';
  };

  // Carregar arquivos quando abrir o modal
  useEffect(() => {
    if (showDetails) {
      loadFiles();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDetails]);

  const handleInvest = async () => {
    setError(null);
    const investAmount = parseFloat(amount);

    if (isNaN(investAmount) || investAmount <= 0) {
      setError('Valor inválido');
      return;
    }

    if (investAmount < project.minAmount) {
      setError(`Valor mínimo é R$ ${project.minAmount.toFixed(2)}`);
      return;
    }

    if (project.maxAmount && investAmount > project.maxAmount) {
      setError(`Valor máximo é R$ ${project.maxAmount.toFixed(2)}`);
      return;
    }

    if (investAmount > remaining) {
      setError(`Valor máximo disponível é R$ ${remaining.toFixed(2)}`);
      return;
    }

    setIsInvesting(true);
    try {
      await onInvest(project.id, investAmount);
      setAmount(project.minAmount.toString());
    } catch (err) {
      setError('Erro ao realizar investimento');
    } finally {
      setIsInvesting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02, y: -5 }}
      className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 border border-gray-200 dark:border-gray-700 hover:shadow-2xl transition-all duration-300"
    >
      <div className="flex items-start gap-4 mb-4">
        <div className={`p-3 bg-gradient-to-br ${colorClass} rounded-xl`}>
          <Icon className="w-8 h-8 text-white" />
        </div>
        <div className="flex-1">
          <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-1">
            {project.name}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {project.purpose}
          </p>
        </div>
      </div>

      <div className="space-y-3 mb-6">
        <div>
          <p className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-1">
            Propósito:
          </p>
          <p className="text-gray-700 dark:text-gray-200">
            {project.purpose}
          </p>
        </div>
        {project.example && (
          <div>
            <p className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-1">
              Exemplo:
            </p>
            <p className="text-gray-700 dark:text-gray-200">
              {project.example}
            </p>
          </div>
        )}

        {/* Progress Bar */}
        <div className="mt-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-600 dark:text-gray-300">
              Arrecadado: R$ {project.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
            <span className="text-gray-600 dark:text-gray-300">
              Meta: R$ {project.targetAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(progress, 100)}%` }}
              transition={{ duration: 0.5 }}
              className="bg-gradient-to-r from-blue-500 to-purple-500 h-2.5 rounded-full"
            />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {progress.toFixed(1)}% concluído
          </p>
        </div>

        {/* Investment Input */}
        <div className="mt-4 space-y-2">
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
            Valor do Investimento:
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              min={project.minAmount}
              max={project.maxAmount || remaining}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder={`Mín: R$ ${project.minAmount.toFixed(2)}`}
            />
            <span className="text-sm text-gray-500 dark:text-gray-400 self-center">
              R$
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Mín: R$ {project.minAmount.toFixed(2)}
            {project.maxAmount && ` | Máx: R$ ${project.maxAmount.toFixed(2)}`}
          </p>
          {error && (
            <p className="text-xs text-red-500 dark:text-red-400">{error}</p>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowDetails(true)}
          className="flex-1 px-4 py-3 bg-gray-500 hover:bg-gray-600 dark:bg-gray-600 dark:hover:bg-gray-700 text-white rounded-xl font-semibold transition-all duration-300 flex items-center justify-center gap-2 shadow-md hover:shadow-lg"
        >
          <Info className="w-5 h-5" />
          Detalhes
          {project._count?.files && project._count.files > 0 && (
            <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs">
              {project._count.files}
            </span>
          )}
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleInvest}
          disabled={isInvesting || remaining <= 0}
          className="flex-1 px-4 py-3 bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white rounded-xl font-semibold transition-all duration-300 flex items-center justify-center gap-2 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isInvesting ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Investindo...
            </>
          ) : remaining <= 0 ? (
            'Meta Atingida'
          ) : (
            <>
              Investir
              <ArrowRight className="w-5 h-5" />
            </>
          )}
        </motion.button>
      </div>

      {/* Modal de Detalhes */}
      {showDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className={`p-2 bg-gradient-to-br ${colorClass} rounded-lg`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-800 dark:text-white">
                    {project.name}
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {project.purpose}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowDetails(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-2">
                  Descrição:
                </h3>
                <p className="text-gray-700 dark:text-gray-200">
                  {project.description || project.purpose}
                </p>
              </div>

              {project.example && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-2">
                    Exemplo:
                  </h3>
                  <p className="text-gray-700 dark:text-gray-200">
                    {project.example}
                  </p>
                </div>
              )}

              {/* Arquivos */}
              <div>
                <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-3">
                  Arquivos Disponíveis:
                </h3>
                {loadingFiles ? (
                  <div className="text-center py-8">
                    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">Carregando arquivos...</p>
                  </div>
                ) : files.length === 0 ? (
                  <div className="text-center py-8 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    <FileText className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Nenhum arquivo disponível
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {files.map((file) => (
                      <motion.div
                        key={file.id}
                        whileHover={{ scale: 1.02 }}
                        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <span className="text-2xl">{getFileIcon(file.fileType)}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 dark:text-white truncate">
                              {file.fileName}
                            </p>
                            {file.description && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                {file.description}
                              </p>
                            )}
                            <p className="text-xs text-gray-400 dark:text-gray-500">
                              {formatFileSize(file.fileSize)} • {new Date(file.createdAt).toLocaleDateString('pt-BR')}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDownload(file.id, file.fileName)}
                          className="ml-3 p-2 bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white rounded-lg transition-colors"
                          title="Baixar arquivo"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}

