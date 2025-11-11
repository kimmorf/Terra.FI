'use client';

import { motion } from 'framer-motion';
import { Mountain, Hammer, DollarSign, Lock, ArrowRight, TrendingUp, AlertCircle } from 'lucide-react';
import { useState } from 'react';

interface InvestmentProject {
  id: string;
  name: string;
  type: string;
  purpose: string;
  example?: string;
  minAmount: number;
  maxAmount?: number;
  totalAmount: number;
  targetAmount: number;
  status: string;
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

  const Icon = typeIcons[project.type as keyof typeof typeIcons] || TrendingUp;
  const colorClass = typeColors[project.type as keyof typeof typeColors] || 'from-blue-400 to-blue-600';

  const progress = (project.totalAmount / project.targetAmount) * 100;
  const remaining = project.targetAmount - project.totalAmount;

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

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={handleInvest}
        disabled={isInvesting || remaining <= 0}
        className="w-full px-4 py-3 bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white rounded-xl font-semibold transition-all duration-300 flex items-center justify-center gap-2 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
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
    </motion.div>
  );
}

