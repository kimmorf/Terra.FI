'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Mountain, Hammer, DollarSign, Lock, ArrowRight, TrendingUp, AlertCircle, FileText, X, Download, Info, CheckCircle2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

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
      className="group relative bg-white dark:bg-gray-800/90 rounded-3xl shadow-lg p-6 border border-gray-200 dark:border-gray-700 hover:shadow-2xl hover:border-blue-300 dark:hover:border-blue-600 transition-all duration-300 overflow-hidden backdrop-blur-sm"
    >
      {/* Background gradient effect */}
      <div className={`absolute inset-0 bg-gradient-to-br ${colorClass} opacity-0 group-hover:opacity-5 transition-opacity duration-300`} />
      
      <div className="relative">
        <div className="flex items-start gap-4 mb-5">
          <motion.div 
            whileHover={{ rotate: 5, scale: 1.1 }}
            className={`p-4 bg-gradient-to-br ${colorClass} rounded-2xl shadow-lg`}
          >
            <Icon className="w-8 h-8 text-white" />
          </motion.div>
          <div className="flex-1 min-w-0">
            <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-1 line-clamp-1">
              {project.name}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
              {project.purpose}
            </p>
          </div>
        </div>

        <div className="space-y-4 mb-6">
          {project.example && (
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 p-3 rounded-xl border border-blue-100 dark:border-blue-800">
              <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1 uppercase tracking-wide">
                Exemplo
              </p>
              <p className="text-sm text-gray-700 dark:text-gray-200 font-medium">
                {project.example}
              </p>
            </div>
          )}

          {/* Progress Bar - Melhorado */}
          <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-center mb-3">
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  Arrecadado
                </p>
                <p className="text-lg font-bold text-gray-800 dark:text-white">
                  R$ {project.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  Meta
                </p>
                <p className="text-lg font-bold text-gray-800 dark:text-white">
                  R$ {project.targetAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(progress, 100)}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className={`bg-gradient-to-r ${colorClass} h-3 rounded-full shadow-sm relative overflow-hidden`}
              >
                <motion.div
                  animate={{ x: ['-100%', '100%'] }}
                  transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                />
              </motion.div>
            </div>
            <div className="flex justify-between items-center mt-2">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                {progress.toFixed(1)}% concluído
              </p>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                Restante: R$ {remaining.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>

          {/* Investment Input - Melhorado */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
              Valor do Investimento
            </label>
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 font-semibold">
                R$
              </div>
              <input
                type="number"
                min={project.minAmount}
                max={project.maxAmount || remaining}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full pl-12 pr-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:border-blue-500 transition-all duration-200 font-semibold"
                placeholder={`${project.minAmount.toFixed(2)}`}
              />
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                <span className="font-semibold">Mín:</span> R$ {project.minAmount.toFixed(2)}
                {project.maxAmount && (
                  <>
                    {' • '}
                    <span className="font-semibold">Máx:</span> R$ {project.maxAmount.toFixed(2)}
                  </>
                )}
              </p>
            </div>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded-lg"
              >
                <AlertCircle className="w-4 h-4" />
                {error}
              </motion.div>
            )}
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowDetails(true)}
            className="flex-1 px-4 py-3 bg-gradient-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 dark:from-gray-600 dark:to-gray-700 dark:hover:from-gray-700 dark:hover:to-gray-800 text-white rounded-xl font-semibold transition-all duration-300 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl"
          >
            <Info className="w-5 h-5" />
            Detalhes
            {project._count?.files && project._count.files > 0 && (
              <span className="bg-white/30 backdrop-blur-sm px-2 py-0.5 rounded-full text-xs font-bold">
                {project._count.files}
              </span>
            )}
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleInvest}
            disabled={isInvesting || remaining <= 0}
            className={`flex-1 px-4 py-3 bg-gradient-to-r ${colorClass} hover:opacity-90 text-white rounded-xl font-semibold transition-all duration-300 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100`}
          >
            {isInvesting ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Investindo...
              </>
            ) : remaining <= 0 ? (
              <>
                <CheckCircle2 className="w-5 h-5" />
                Meta Atingida
              </>
            ) : (
              <>
                Investir
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </motion.button>
        </div>
      </div>

      {/* Modal de Detalhes - Flutuante e Independente */}
      {showDetails && typeof window !== 'undefined' && createPortal(
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowDetails(false)}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-lg"
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 9999,
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col backdrop-blur-xl border-2 border-gray-300 dark:border-gray-600"
              style={{ position: 'relative', zIndex: 10000 }}
            >
            {/* Header - Melhorado */}
            <div className={`relative bg-gradient-to-r ${colorClass} p-6`}>
              <div className="absolute inset-0 bg-black/10" />
              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-white/20 backdrop-blur-sm rounded-xl">
                    <Icon className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-1">
                      {project.name}
                    </h2>
                    <p className="text-sm text-white/90">
                      {project.purpose}
                    </p>
                  </div>
                </div>
                <motion.button
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setShowDetails(false)}
                  className="p-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-xl transition-colors"
                >
                  <X className="w-6 h-6 text-white" />
                </motion.button>
              </div>
            </div>

            {/* Content - Melhorado */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {project.description && (
                <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                  <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-2 uppercase tracking-wide">
                    Descrição
                  </h3>
                  <p className="text-gray-700 dark:text-gray-200 leading-relaxed">
                    {project.description}
                  </p>
                </div>
              )}

              {project.example && (
                <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800">
                  <h3 className="text-sm font-semibold text-blue-600 dark:text-blue-400 mb-2 uppercase tracking-wide">
                    Exemplo de Uso
                  </h3>
                  <p className="text-gray-700 dark:text-gray-200 font-medium">
                    {project.example}
                  </p>
                </div>
              )}

              {/* Arquivos - Melhorado */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  <h3 className="text-lg font-bold text-gray-800 dark:text-white">
                    Arquivos Disponíveis
                  </h3>
                  {files.length > 0 && (
                    <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full text-xs font-semibold">
                      {files.length}
                    </span>
                  )}
                </div>
                {loadingFiles ? (
                  <div className="text-center py-12">
                    <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">Carregando arquivos...</p>
                  </div>
                ) : files.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center py-12 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900/50 dark:to-gray-800/50 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-700"
                  >
                    <div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                      <FileText className="w-8 h-8 text-gray-400 dark:text-gray-500" />
                    </div>
                    <p className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-1">
                      Nenhum arquivo disponível
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-500">
                      Os documentos serão adicionados em breve
                    </p>
                  </motion.div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {files.map((file, index) => (
                      <motion.div
                        key={file.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        whileHover={{ scale: 1.02, x: 4 }}
                        className="flex items-center justify-between p-4 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-900/50 dark:to-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 transition-all duration-200"
                      >
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <div className="text-3xl flex-shrink-0">{getFileIcon(file.fileType)}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-gray-800 dark:text-white break-words mb-1">
                              {file.fileName}
                            </p>
                            {file.description && (
                              <p className="text-xs text-gray-600 dark:text-gray-400 break-words mb-1">
                                {file.description}
                              </p>
                            )}
                            <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-500">
                              <span>{formatFileSize(file.fileSize)}</span>
                              <span>•</span>
                              <span>{new Date(file.createdAt).toLocaleDateString('pt-BR')}</span>
                            </div>
                          </div>
                        </div>
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => handleDownload(file.id, file.fileName)}
                          className="ml-4 p-3 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl flex-shrink-0"
                          title="Baixar arquivo"
                        >
                          <Download className="w-5 h-5" />
                        </motion.button>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            </motion.div>
          </motion.div>
        </AnimatePresence>,
        document.body
      )}
    </motion.div>
  );
}

