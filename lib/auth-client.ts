'use client';

import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
});

export const { signIn, signUp, signOut, useSession } = authClient;

// Função para fazer login com endereço da carteira (Crossmark)
export async function signInWithWallet(address: string, network?: string, publicKey?: string) {
  try {
    const response = await fetch('/api/auth/wallet', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // Importante para enviar e receber cookies
      body: JSON.stringify({
        address,
        network,
        publicKey,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Erro ao fazer login com carteira');
    }

    const data = await response.json();

    // Aguarda um pouco para garantir que o cookie foi definido
    if (typeof window !== 'undefined') {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Não fazemos reload aqui - o componente React vai atualizar o estado
    // O reload causava problemas de 404 quando a URL continha parâmetros

    return data;
  } catch (error) {
    console.error('Erro ao fazer login com carteira:', error);
    throw error;
  }
}

