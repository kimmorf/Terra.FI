'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface Particle {
  id: number;
  width: number;
  height: number;
  left: number;
  top: number;
  x: number;
  duration: number;
  delay: number;
}

// Função para gerar um número pseudo-aleatório baseado em um seed
function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export function BackgroundParticles() {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Só gera as partículas no cliente após a montagem
    setMounted(true);
    const particleCount = 20;
    const newParticles: Particle[] = Array.from({ length: particleCount }, (_, i) => {
      const seed = i * 1000 + Date.now();
      return {
        id: i,
        width: seededRandom(seed) * 100 + 50,
        height: seededRandom(seed + 1) * 100 + 50,
        left: seededRandom(seed + 2) * 100,
        top: seededRandom(seed + 3) * 100,
        x: seededRandom(seed + 4) * 20 - 10,
        duration: seededRandom(seed + 5) * 3 + 2,
        delay: seededRandom(seed + 6) * 2,
      };
    });
    setParticles(newParticles);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          className="absolute rounded-full bg-blue-400/20 dark:bg-blue-500/20"
          style={{
            width: particle.width,
            height: particle.height,
            left: `${particle.left}%`,
            top: `${particle.top}%`,
          }}
          animate={{
            y: [0, -30, 0],
            x: [0, particle.x, 0],
            opacity: [0.2, 0.5, 0.2],
          }}
          transition={{
            duration: particle.duration,
            repeat: Infinity,
            delay: particle.delay,
          }}
        />
      ))}
    </div>
  );
}

