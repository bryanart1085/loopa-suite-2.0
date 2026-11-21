export const DEMO_MODE =
  typeof import.meta.env.VITE_DEMO_MODE === 'undefined'
    ? false
    : import.meta.env.VITE_DEMO_MODE !== 'false';
