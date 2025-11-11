'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from '@/lib/auth-client';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { InvestmentCard } from '@/components/InvestmentCard';
import { TrendingUp, Wallet, ArrowRight, Calendar, DollarSign } from 'lucide-react';
import { BackgroundParticles } from '@/components/BackgroundParticles';
import { ThemeToggle } from '@/components/ThemeToggle';

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

interface MyInvestment {
  id: string;
  amount: number;
  createdAt: string;
  project: {
    id: string;
    name: string;
    type: string;
    purpose: string;
    example?: string;
  };
}

export default function DashboardPage() {
  const { data: session, isPending } = useSession();
  const [activeTab, setActiveTab] = useState<'investments' | 'my-investments'>('investments');
  const [projects, setProjects] = useState<InvestmentProject[]>([]);
  const [myInvestments, setMyInvestments] = useState<MyInvestment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMyInvestments, setLoadingMyInvestments] = useState(false);

  useEffect(() => {
    if (session) {
      fetchProjects();
      if (activeTab === 'my-investments') {
        fetchMyInvestments();
      }
    }
  }, [session, activeTab]);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/investments');
      if (response.ok) {
        const data = await response.json();
        setProjects(data);
      }
    } catch (error) {
      console.error('Erro ao buscar projetos:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMyInvestments = async () => {
    try {
      setLoadingMyInvestments(true);
      const response = await fetch('/api/investments/my-investments');
      if (response.ok) {
        const data = await response.json();
        setMyInvestments(data);
      }
    } catch (error) {
      console.error('Erro ao buscar meus investimentos:', error);
    } finally {
      setLoadingMyInvestments(false);
    }
  };

  const handleInvest = async (projectId: string, amount: number) => {
    try {
      const response = await fetch('/api/investments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ projectId, amount }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao investir');
      }

      // Atualizar lista de projetos
      await fetchProjects();
      
      // Se estiver na aba de meus investimentos, atualizar também
      if (activeTab === 'my-investments') {
        await fetchMyInvestments();
      }

      // Mostrar mensagem de sucesso (você pode adicionar um toast aqui)
      alert('Investimento realizado com sucesso!');
    } catch (error: any) {
      throw error;
    }
  };

  if (isPending) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-300">Carregando...</p>
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Não autenticado</h1>
          <Link
            href="/auth/signin"
            className="text-blue-600 hover:text-blue-500 dark:text-blue-400"
          >
            Fazer login
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 transition-colors duration-300 relative overflow-hidden">
      <BackgroundParticles />
      <ThemeToggle />
      
      <div className="container mx-auto px-4 py-8 md:py-12">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4"
        >
          <div>
            <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">
              Dashboard
            </h1>
            <p className="text-gray-600 dark:text-gray-300 mt-1">
              Olá, {session.user.name || session.user.email}
            </p>
          </div>
          <button
            onClick={() => signOut()}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
          >
            Sair
          </button>
        </motion.div>

        {/* Tabs */}
        <div className="flex gap-4 mb-8">
          <button
            onClick={() => setActiveTab('investments')}
            className={`px-6 py-3 rounded-xl font-semibold transition-all duration-300 transform hover:scale-105 ${
              activeTab === 'investments'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/50 dark:bg-blue-500 dark:shadow-blue-400/50'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 shadow-md hover:shadow-lg'
            }`}
          >
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Investimentos
            </div>
          </button>
          <button
            onClick={() => {
              setActiveTab('my-investments');
              fetchMyInvestments();
            }}
            className={`px-6 py-3 rounded-xl font-semibold transition-all duration-300 transform hover:scale-105 ${
              activeTab === 'my-investments'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/50 dark:bg-blue-500 dark:shadow-blue-400/50'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 shadow-md hover:shadow-lg'
            }`}
          >
            <div className="flex items-center gap-2">
              <Wallet className="w-5 h-5" />
              Meus Investimentos
            </div>
          </button>
        </div>

        {/* Content */}
        {activeTab === 'investments' && (
          <div>
            {loading ? (
              <div className="text-center py-12">
                <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-gray-600 dark:text-gray-300">Carregando projetos...</p>
              </div>
            ) : projects.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-12 text-center">
                <p className="text-gray-600 dark:text-gray-300 text-lg">
                  Nenhum projeto de investimento disponível no momento.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {projects.map((project) => (
                  <InvestmentCard
                    key={project.id}
                    project={project}
                    onInvest={handleInvest}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'my-investments' && (
          <div>
            {loadingMyInvestments ? (
              <div className="text-center py-12">
                <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-gray-600 dark:text-gray-300">Carregando investimentos...</p>
              </div>
            ) : myInvestments.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-12 text-center">
                <Wallet className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 dark:text-gray-300 text-lg mb-4">
                  Você ainda não realizou nenhum investimento.
                </p>
                <button
                  onClick={() => setActiveTab('investments')}
                  className="px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition flex items-center gap-2 mx-auto"
                >
                  Ver Investimentos Disponíveis
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {myInvestments.map((investment) => (
                  <motion.div
                    key={investment.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 border border-gray-200 dark:border-gray-700"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-1">
                          {investment.project.name}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {investment.project.purpose}
                        </p>
                      </div>
                      <div className="p-3 bg-gradient-to-br from-blue-400 to-blue-600 rounded-xl">
                        <DollarSign className="w-6 h-6 text-white" />
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                        <DollarSign className="w-5 h-5" />
                        <span className="font-semibold">
                          Valor: R$ {investment.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                        <Calendar className="w-5 h-5" />
                        <span>
                          {new Date(investment.createdAt).toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

