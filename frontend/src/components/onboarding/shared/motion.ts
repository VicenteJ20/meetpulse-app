import type { Transition, Variants } from 'framer-motion';

// Movimientos comunes del onboarding. El flujo se envuelve en MotionConfig reducedMotion="user",
// así que quien prefiere menos movimiento solo ve fundidos.
export const easeOut: Transition = { duration: 0.35, ease: [0.16, 1, 0.3, 1] };

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: easeOut },
};

export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.12 } },
};

export const screenVariants: Variants = {
  enter: (direction: number) => ({ opacity: 0, x: direction * 28 }),
  center: { opacity: 1, x: 0, transition: easeOut },
  exit: (direction: number) => ({ opacity: 0, x: direction * -28, transition: { duration: 0.2 } }),
};

export const swapVariants: Variants = {
  hidden: { opacity: 0, scale: 0.85 },
  show: { opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 360, damping: 22 } },
  exit: { opacity: 0, scale: 0.85, transition: { duration: 0.12 } },
};
