# Physio/Path Syllabus Outline (Draft)

Draft content-pack outline aligned to the "Schedule of Activities" table in the Physiology and Pathology FT Day syllabus.

- Draft pack file: `src/content/packs/drafts/physio-path-syllabus-outline-v1.json`
- Purpose: create syllabus-scoped placeholders that can be filled into real CoachMBLEx questions later
- Important: importer supports legacy shapes, but new authored content should follow the canonical question model in `docs/question-model.md` when generating finished packs

## Week Mapping

### Week 1
- Body & Chemistry Foundations: 10 outline topics
  Examples: Introduction to the body, Body systems overview, Body regions terminology, Abdominal regions, ...

### Week 2
- Cells & Tissues: 12 outline topics
  Examples: Cell structure and organelles, Movement through the cell membrane, Cell cycle, Mitosis, ...

### Week 3
- Integumentary System: 10 outline topics
  Examples: Structure of the skin, Skin color and abnormal skin-color changes, Functions of the skin, Appendages of the skin, ...

### Week 4
- Skeletal System (Bones + Joints): 18 outline topics
  Examples: Functions of bone, Classification of bones, Parts of a long bone, Bone tissue, ...

### Week 5
- Muscular System: 12 outline topics
  Examples: Types of muscle tissue, Skeletal muscle structure, Muscle contraction and relaxation, Disorders at the neuromuscular junction, ...

### Week 6
- Nervous System: 12 outline topics
  Examples: Overview of the nervous system, Divisions of the nervous system, Nervous system cells and blood-brain barrier, Neurons: structure and function, ...
- Sense Organs: 9 outline topics
  Examples: Sensory receptors, General senses, Special senses overview, Taste (gustation), ...

### Week 7
- Midterm Review & Exam Prep: 2 outline topics
  Examples: Midterm exam review worksheets, Physiology jeopardy / review game stations / flashcards

### Week 8
- Endocrine System: 12 outline topics
  Examples: Overview of the endocrine system, Hormones, Pituitary gland and hypothalamus, Adrenal glands, ...

### Week 9
- Cardiovascular System (Blood + Heart + Vessels): 19 outline topics
  Examples: Components of blood, Blood cell formation (hematopoiesis), Red blood cells, White blood cells, ...

### Week 10
- Lymphatic & Immune Systems: 11 outline topics
  Examples: Overview of the lymphatic system, Lymph vessels, Lymphatic tissues, Lymphatic organs (thymus, lymph nodes, spleen), ...

### Week 11
- Respiratory System: 12 outline topics
  Examples: Overview of the respiratory system, Upper respiratory tract, Lower respiratory tract, Gas exchange, ...

### Week 12
- Urinary System: 11 outline topics
  Examples: Overview of the urinary system, Functions of the urinary system, Kidneys, Nephrons, ...

### Week 13
- Digestive System + Nutrition & Metabolism: 18 outline topics
  Examples: Overview of the digestive system, Peritoneum, Mouth, Pharynx, ...

### Week 14
- Final Review & Exam Prep: 2 outline topics
  Examples: Final exam review worksheets, Physiology jeopardy II / review game stations / flashcards

## Tag Conventions

Each placeholder row includes tags to make later filtering and replacement easier:

- `syllabus-outline`: marks draft rows from this outline pack
- `week-<n>`: syllabus week (for example `week-6`)
- `<subject>`: system subject tag (for example `nervous`, `endocrine`, `cardiovascular`)
- `<subject-title-slug>`: subject title slug (for mixed blocks like `digestive-system-nutrition-and-metabolism`)
- `<subtopic-slug>`: normalized topic slug (for example `blood-pressure-and-hormonal-regulation-of-blood-pressure`)
- `<topic-kind>`: one of `anatomy-structure`, `physiology-function`, `pathology-disorder`, `massage-effects`, `study-review`

## How To Fill The TODOs

1. Replace `prompt` with a real `mcq`, `reverse`, or `fill` question stem.
2. Replace `correct_text` (or convert row to `choices` + `correct_choice` for `mcq`/`reverse`).
3. Replace `explanation.answer/why/trap/hook` with actual content from class notes/textbook.
4. Keep the week + subject + subtopic tags so drill/pack filtering stays traceable to the syllabus.
5. Optionally split one outline row into multiple final questions if a subtopic needs more coverage.

## Import (When Ready)

Do not import this draft until TODO placeholders are replaced with real content.

```bash
npm run import:pack -- src/content/packs/drafts/physio-path-syllabus-outline-v1.json
```

## Quick Verification (No Import)

```bash
node -e "const p=require('./src/content/packs/drafts/physio-path-syllabus-outline-v1.json'); console.log(p.packId, p.questions.length)"
```
