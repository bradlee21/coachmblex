# MBLEx 2023 Blueprint Taxonomy

This project treats the MBLEx 2023 content blueprint as canonical for tagging, drill topic selection, and readiness rollups.

Canonical source in app code:

- `src/content/mblexBlueprint.js`

## Sections (1..7)

1. Anatomy & Physiology
2. Kinesiology
3. Pathology, Contraindications, Areas of Caution, Special Populations
4. Benefits and Effects of Soft Tissue Manipulation
5. Client Assessment, Reassessment & Treatment Planning
6. Ethics, Boundaries, Laws, Regulations
7. Guidelines for Professional Practice

## Full coded taxonomy

### 1 Anatomy & Physiology
- 1.A System structure
- 1.A.1 Cardiovascular
- 1.A.2 Digestive
- 1.A.3 Endocrine
- 1.A.4 Integumentary
- 1.A.5 Lymphatic & Immune
- 1.A.6 Musculoskeletal
- 1.A.7 Nervous
- 1.A.8 Reproduction
- 1.A.9 Respiratory
- 1.A.10 Sensory
- 1.A.11 Urinary
- 1.B System function
- 1.B.1 Cardiovascular
- 1.B.2 Digestion
- 1.B.3 Endocrine
- 1.B.4 Integumentary
- 1.B.5 Lymphatic & Immune
- 1.B.6 Musculoskeletal
- 1.B.7 Nervous
- 1.B.8 Reproduction
- 1.B.9 Respiratory
- 1.B.10 Sensory
- 1.B.11 Urinary
- 1.C Tissue injury and repair
- 1.D Concepts of energetic anatomy

### 2 Kinesiology
- 2.A Skeletal muscle components & characteristics
- 2.B Concepts of skeletal muscle contractions
- 2.C Proprioceptors
- 2.D Skeletal muscle locations, attachments (origins, insertions), & actions
- 2.E Joint structure and function
- 2.F Range of motion
- 2.F.1 Active
- 2.F.2 Passive
- 2.F.3 Resisted

### 3 Pathology, Contraindications, Areas of Caution, Special Populations
- 3.A Overview of Pathologies
- 3.B Contraindications
- 3.B.1 Site specific
- 3.B.2 Pathology related
- 3.B.3 Special populations
- 3.B.4 Tools
- 3.B.5 Special applications
- 3.C Areas of caution
- 3.D Special populations
- 3.E Classes of medications

### 4 Benefits and Effects of Soft Tissue Manipulation
- 4.A Physiological effects of soft tissue manipulation
- 4.B Psychological effects of soft tissue manipulation
- 4.C Effects of soft tissue manipulation for specific client populations
- 4.D Soft tissue techniques
- 4.D.1 Types of strokes
- 4.D.2 Sequence of application
- 4.E Hot/cold applications
- 4.F Overview of massage/bodywork modalities

### 5 Client Assessment, Reassessment & Treatment Planning
- 5.A Organization of a massage/bodywork session
- 5.B Client consultation and evaluation
- 5.B.1 Verbal intake
- 5.B.2 Health history form
- 5.C Written data collection
- 5.D Visual assessment
- 5.D.1 General
- 5.D.2 Postural
- 5.D.3 Gait
- 5.E Palpation assessment
- 5.F Range of motion assessment
- 5.G Clinical reasoning
- 5.G.1 Ability to rule out contraindications
- 5.G.2 Client treatment goal setting
- 5.G.3 Evaluation of response to previous treatment
- 5.G.4 Formulation of treatment strategy

### 6 Ethics, Boundaries, Laws, Regulations
- 6.A Ethical behavior
- 6.B Professional boundaries
- 6.C Code of ethics violations
- 6.D The therapeutic relationship
- 6.E Dual relationships
- 6.F Sexual misconduct
- 6.G Massage/bodywork-related laws and regulations
- 6.H Scope of practice
- 6.I Professional communication
- 6.J Confidentiality
- 6.K Principles

### 7 Guidelines for Professional Practice
- 7.A Proper and safe use of equipment and supplies
- 7.B Practitioner hygiene
- 7.C Sanitation and cleanliness
- 7.D Safety practices
- 7.D.1 Facilities
- 7.D.2 Practitioner safety
- 7.D.3 Client safety
- 7.E Practitioner care
- 7.E.1 Body mechanics
- 7.E.2 Personal protective equipment (PPE)
- 7.E.3 Self-care
- 7.E.4 Injury prevention
- 7.F Draping
- 7.F.1 Safe and appropriate
- 7.F.2 Communication
- 7.G Business Practices
- 7.G.1 Business planning
- 7.G.2 Strategic planning
- 7.G.3 Office management
- 7.G.4 Marketing
- 7.G.5 Hiring/Interviewing
- 7.G.6 Documentation & Records
- 7.G.6.a Client records
- 7.G.6.b Business records
- 7.H Healthcare and business terminology

## Tagging requirement for future items

Every question/diagram item must include:

- `blueprintCode: string` (example: `"2.D"`)
- Display domain path derived from the blueprint tree (for example: `2 Kinesiology > 2.D Skeletal muscle locations...`)
