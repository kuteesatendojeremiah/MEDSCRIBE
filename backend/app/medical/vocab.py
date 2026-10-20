"""Medical vocabulary for the local speech model and the misheard-term check.

A closed, hand-written list (generic drug names, cardiology and common conditions, signs, tests). It
BIASES recognition (hotwords) and SUGGESTS corrections for a clinician to accept; it never edits a
transcript by itself and never supplies a dose, route or frequency (Blueprint §7.3). It is not a
formulary and makes no claim of completeness: extend it, and re-run `scripts/stt_term_check.py`.
"""

DRUGS = """
amlodipine bisoprolol atenolol metoprolol carvedilol propranolol nebivolol labetalol
ramipril lisinopril enalapril perindopril captopril losartan valsartan candesartan telmisartan irbesartan
sacubitril-valsartan hydrochlorothiazide indapamide chlorthalidone furosemide bumetanide torsemide
spironolactone eplerenone amiloride nifedipine diltiazem verapamil felodipine
digoxin amiodarone flecainide sotalol dronedarone adenosine
aspirin clopidogrel ticagrelor prasugrel warfarin apixaban rivaroxaban dabigatran edoxaban heparin enoxaparin
atorvastatin simvastatin rosuvastatin pravastatin ezetimibe fenofibrate gemfibrozil
glyceryl-trinitrate isosorbide-mononitrate isosorbide-dinitrate nicorandil ranolazine ivabradine hydralazine
methyldopa clonidine doxazosin prazosin dapagliflozin empagliflozin
metformin gliclazide glibenclamide insulin sitagliptin pioglitazone
paracetamol ibuprofen diclofenac morphine tramadol omeprazole lansoprazole
amoxicillin ciprofloxacin azithromycin doxycycline ceftriaxone gentamicin penicillin
salbutamol prednisolone dexamethasone levothyroxine allopurinol colchicine potassium-chloride
""".split()

CONDITIONS = """
atrial-fibrillation atrial-flutter supraventricular-tachycardia ventricular-tachycardia ventricular-fibrillation
heart-failure cardiomyopathy myocarditis pericarditis pericardial-effusion endocarditis rheumatic-heart-disease
mitral-regurgitation mitral-stenosis aortic-stenosis aortic-regurgitation tricuspid-regurgitation valvular-heart-disease
angina myocardial-infarction coronary-artery-disease hypertension hypotension pulmonary-hypertension
pulmonary-embolism deep-vein-thrombosis stroke transient-ischaemic-attack peripheral-arterial-disease
diabetes-mellitus hyperlipidaemia chronic-kidney-disease anaemia pneumonia tuberculosis HIV hypothyroidism hyperthyroidism
cardiac-tamponade congenital-heart-disease patent-ductus-arteriosus
""".split()

SIGNS_AND_SYMPTOMS = """
dyspnoea orthopnoea paroxysmal-nocturnal-dyspnoea palpitations syncope presyncope dizziness claudication
oedema pitting-oedema ascites hepatomegaly cyanosis clubbing jaundice
tachycardia bradycardia arrhythmia murmur gallop crackles wheeze
jugular-venous-pressure raised-jugular-venous-pressure cardiomegaly pleural-effusion
haemoptysis orthostatic-hypotension chest-tightness angina-pectoris
""".split()

TESTS_AND_PROCEDURES = """
electrocardiogram echocardiogram ejection-fraction troponin creatinine urea electrolytes haemoglobin HbA1c
lipid-profile chest-x-ray holter-monitor stress-test coronary-angiography cardiac-catheterisation
cardiac-MRI CT-pulmonary-angiogram D-dimer BNP NT-proBNP INR thyroid-function-tests renal-function-tests
pacemaker defibrillator cardioversion ablation angioplasty stent bypass-grafting valve-replacement
""".split()


def pretty(term: str) -> str:
    return term.replace("-", " ")


ALL_TERMS: list[str] = [
    pretty(t) for t in DRUGS + CONDITIONS + SIGNS_AND_SYMPTOMS + TESTS_AND_PROCEDURES
]

# A short list handed to the speech model as hotwords. Whisper only reads about 220 tokens of context,
# so this is the cardiology core (the full list above is used by the misheard-term check).
HOTWORDS = ", ".join(
    pretty(t)
    for t in (
        "amlodipine bisoprolol furosemide spironolactone ramipril apixaban rivaroxaban warfarin clopidogrel "
        "atorvastatin carvedilol digoxin amiodarone atrial-fibrillation heart-failure myocardial-infarction "
        "echocardiogram electrocardiogram troponin creatinine ejection-fraction mitral-regurgitation "
        "dyspnoea orthopnoea paroxysmal-nocturnal-dyspnoea oedema jugular-venous-pressure palpitations"
    ).split()
)
