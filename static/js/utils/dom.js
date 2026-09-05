// DOM utility helpers for modular components

export const $ = (selector, context = document) => {
  return context.querySelector(selector);
};

export const $$ = (selector, context = document) => {
  return Array.from(context.querySelectorAll(selector));
};

export const createElement = (tag, className = '', innerHTML = '') => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (innerHTML) el.innerHTML = innerHTML;
  return el;
};
