export function devLog(...args) {
  if (process.env.NODE_ENV !== 'production') {
    console.log(...args);
  }
}

export function devWarn(...args) {
  if (process.env.NODE_ENV !== 'production') {
    console.warn(...args);
  }
}
