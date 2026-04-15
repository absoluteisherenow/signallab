// Brutalist motion presets for Signal Lab OS
// Sharp easing, short durations, no bounce — matches the aesthetic

export const BRUTALIST_EASE = [0.16, 1, 0.3, 1] as const

export const transition = {
  fast: { duration: 0.12, ease: BRUTALIST_EASE },
  default: { duration: 0.2, ease: BRUTALIST_EASE },
  slow: { duration: 0.3, ease: BRUTALIST_EASE },
  stagger: { staggerChildren: 0.04, delayChildren: 0.02 },
  layout: { type: 'spring' as const, stiffness: 400, damping: 35, mass: 0.8 },
}

export const fadeUp = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: transition.default },
  exit: { opacity: 0, y: -4, transition: transition.fast },
}

export const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: transition.default },
  exit: { opacity: 0, transition: transition.fast },
}

export const slideUp = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: transition.slow },
  exit: { opacity: 0, y: 8, transition: transition.default },
}

export const scaleIn = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: transition.default },
  exit: { opacity: 0, scale: 0.98, transition: transition.fast },
}

export const staggerContainer = {
  hidden: {},
  visible: { transition: transition.stagger },
}

export const staggerItem = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: transition.default },
}

export const expandCollapse = {
  hidden: { opacity: 0, height: 0 },
  visible: { opacity: 1, height: 'auto', transition: { ...transition.default, height: { duration: 0.25, ease: BRUTALIST_EASE } } },
  exit: { opacity: 0, height: 0, transition: { ...transition.fast, height: { duration: 0.15, ease: BRUTALIST_EASE } } },
}
