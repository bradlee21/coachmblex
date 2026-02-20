export const studyNightCategories = [
  { key: '1', label: 'Anatomy & Physiology', prefix: '1.' },
  { key: '2', label: 'Kinesiology', prefix: '2.' },
  { key: '3', label: 'Pathology & Contraindications', prefix: '3.' },
  { key: '4', label: 'Benefits & Effects', prefix: '4.' },
  { key: '5', label: 'Assessment & Planning', prefix: '5.' },
  { key: '6', label: 'Ethics & Laws', prefix: '6.' },
  { key: '7', label: 'Professional Practice', prefix: '7.' },
];

export const studyNightCategoryByKey = Object.fromEntries(
  studyNightCategories.map((category) => [category.key, category])
);
